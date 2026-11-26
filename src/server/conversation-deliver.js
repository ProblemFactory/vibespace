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
const SR = require('../store-read.js');   // B-f276's remainder (lane bl-windows): the park's file under THE STORE READ
const HOLD = require('../store-read-hold.js');   // …and its hold: msg-stash.json under the law
const { capsOf, notificationDelivery } = require('../backend-caps.js');
const { wrapperCaps } = require('./wrapper-files.js');
const { vibespaceNoticeText, withoutNoticeHead } = require('../notification-senders.js'); // lane S3: every kind:'notification' delivery opens with the ONE head naming VibeSpace as the speaker
// verify r6 (lane channel-withdraw, 2026-09-27): THE ONE PREDICATE behind "which live session carries this conversation" —
// a pending fork carries its PARENT's id, and the raw lookups below (rung 1.5, the charged identity; the since-removed
// channel-socket rung 0 was the third) handed the parent's frame to the fork's wrapper and the parent's turn to the fork's credential slot
const { addressableId } = require('../claude-lock-capture.js');
const belt = require('../agent-output-belt.js'); // lane agent-output-sinks: the sink belt — a stashed message a recipient / the disk sees never carries a credential in the clear
const stashSummary = require('../stash-summary.js'); const { kindOf: stashKindOf } = stashSummary; // PURE: an entry's kind (a peer's by its sender's name, VibeSpace's own by its path)
const { owedOutcome, LIVE_FALLS, FALL_WHY, RESEND_HELPS } = require('../channel-groups.js');   // lane paced-wake-retry: a fall's cause and its words, from the ONE list
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
const RETRY_FRAME_PACED_HEADING = '### Messages VibeSpace held for the wake pace';   // lane paced-wake-retry: a frame that carries a wake the pace refused says so
const OWED_MIN_WAIT_MS = 1000;   // a pace that refuses again re-schedules by its own wait, never under a second (never a tight loop)
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
function create({ dataDir, peerMsg, getHosts, getConvIndex, serverSetting, activeSessions, emitPeerCard, authorizeSpend = null, noteSpend = null, releaseSpend = null, reservationState = null, waitingReservations = null, waitingOverCap = null, onStashChange = () => { }, log = () => { }, retryClock = null, renderBatch = null }) {   // renderBatch (verify r1 N1d): the hand-over's renderer (agent-routes renderMsgStash), injected — a batch of parked entries goes out as ONE frame in its shape
  const stashFile = path.join(dataDir, 'msg-stash.json');
  // B-f276 family (主开发 r3003 (a), lane hub-loop-stalls): THE STORE-READ LAW (src/store-read-hold.js). The release read ANY failure of
  // this file — a failed read, torn bytes — as an EMPTY stash, and the next write (the hub's own stop, any stash or drain) wrote it
  // over: every message, job result and receipt waiting for a conversation's next turn gone, said nowhere. HELD: nothing is written
  // over the file (r3720: an entry stashed meanwhile is TAKEN into memory, a ref'd one too — its producer is told «taken, not on disk»,
  // `{stored:false, taken:true, why}`), a road that DECIDES from the stash's SILENCE (stashPeek: a receipt's fate) is told «unknown» (the
  // hold's refusal: it decides nothing) — a road that needs only a HIT (a dedupe, a cap) peeks memory (`{memory:true}`: an entry
  // found is evidence; a miss stays unknown, r3919), the hand-over is refused by name and the conversation's strip says so (stash-handover), and the file is read
  // again off the loop. LIFTED: the entries read — each judged again by the stores that own their words (a clear made while held
  // reaches them), a hand-over stamp of an earlier process released — then what memory took meanwhile after them, written once.
  // TORN BYTES: kept aside once (msg-stash.json.corrupt-<mark>), then the stash starts from what memory holds; `__tornAt` (a
  // reserved key, like `__slots`) remembers the instant: a receipt stashed before it is «unknown» to the reconcile that reads the
  // stash's silence as «handed» (src/server/channels-outbound.js) — r3019's remover law, across restarts.
  const STASH_SHAPE = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const liftListeners = new Set();   // round wozyl97qk (e): who hears the hold's lift (onStashLift)
  // r3720 (主开发 — the side copy goes, the page ruled r3722): WHILE HELD, WHAT COMES IS KEPT IN MEMORY ONLY — no file of any kind beside the
  // list, the list never written over. Every producer is told «taken, not on disk: lost if the hub restarts before the list reads again» (a
  // receipt too: its card says it, and the reconcile reads a receipt it cannot find after a restart as UNKNOWN). Memory's entries are handed
  // out at a prompt while held — DELIVERY BEFORE ORDER: each frame carries its own time stamp, the order's witness; one handed out while held
  // may arrive before older ones still in the unread list. Only the CLAIM waits (it must read the list's own entries). THE LIFT: the list's
  // entries, then memory's (never twice — by the acceptance id `sid`, or by a producer's ref AND its text; one entry a slot), ONE write.
  const RUN_TAG = Math.random().toString(36).slice(2, 8);
  let sidSeq = 0, memOnly = 0, memOnlySaid = 0;
  const mintSid = () => `s-${Date.now().toString(36)}-${RUN_TAG}-${(++sidSeq).toString(36)}`;
  /** the id an entry is given when it is accepted (kept for its life: the merge never adds it twice) */
  const sidOf = (e) => (e && typeof e === 'object' ? (e.sid || (e.sid = mintSid())) : null);
  /** «a conversation's name»: EVERY loop over the stash's names asks it — a reserved key (`__slots`, `__tornAt`, any `__…`) is never
   *  counted, handed over, trimmed or drawn */
  const isConvName = (k) => typeof k === 'string' && k.length > 0 && !k.startsWith('__');
  /** the hold that stands now (the list's) — null when it reads */
  const heldHold = () => (stashHold.held() ? stashHold : null);
  const isHeld = () => !!heldHold();
  const tornActed = new Set();   // round wozyl97qk (d): the conversations whose next turn or hand-over came after a torn lift — their strip no longer says it
  let stash = {};
  const stashHold = HOLD.create({ file: stashFile, valid: STASH_SHAPE, code: 'msg_stash_unread', aside: (mark) => stashFile + '.corrupt-' + mark,
    words: (h) => `the messages waiting for the conversations' next turns could not be read (${h && h.code}) — VibeSpace reads them again by itself every few minutes. Nothing that waits was lost or changed: nothing is written over the file, and they go to their conversations once it reads`,
    log: (l) => log('[deliver] ' + l), onLift: (v, facts) => liftStash(v, facts) });
  { let read0; try { read0 = { text: fs.readFileSync(stashFile, 'utf-8') }; } catch (error) { read0 = { error }; }
    const a0 = SR.storeAnswer(read0, { valid: STASH_SHAPE });
    if (stashHold.start(a0) === 'data') stash = a0.value; }
  // lane queued-is-not-woke laws 2 + 3 (shape C): THE KEYED SLOTS' MEMORY — per (conversation, slot), the set its entry carried
  // when it was last HANDED — rides the stash file beside the queues under one reserved key (a release that reads this
  // file drops it: it keeps queues only)
  const takeReserved = (o) => {
    const sl = o && o.__slots && typeof o.__slots === 'object' && !Array.isArray(o.__slots) ? o.__slots : {};
    const ta = o && Number.isFinite(o.__tornAt) ? o.__tornAt : null;
    if (o) for (const k of Object.keys(o)) if (!isConvName(k)) delete o[k];   // every reserved name out — never a conversation
    return { sl, ta };
  };
  let slots = {}, tornAt = null;
  { const r = takeReserved(stash); slots = r.sl; tornAt = r.ta; }
  const stashBody = () => JSON.stringify(Object.keys(slots).length || tornAt != null ? { ...stash, ...(Object.keys(slots).length ? { __slots: slots } : {}), ...(tornAt != null ? { __tornAt: tornAt } : {}) } : stash);
  // A CLAIM THE PREVIOUS PROCESS DID NOT SETTLE (channel-jump verify r2, 2026-09-27): an entry stamped `ho:<id>` was
  // being handed over when the server stopped. The shutdown path WAITS for a hand-over in flight (server.js
  // `stashView.settle`), so a stamp here means the process died mid-post (SIGKILL / OOM) inside the socket
  // round-trip — whether the CLI took the frame is unknown. RELEASED (they wait again), by name in the log: a lost
  // notice is silent, a repeated one is visible and traceable by its hand-over id.
  const releasedAtBoot = [];
  const releaseClaims = (obj) => {
    const out = [];
    for (const [cid, q] of Object.entries(obj)) {
      if (!isConvName(cid) || !Array.isArray(q)) { delete obj[cid]; continue; }
      const ids = new Set();
      for (const e of q) if (e && e.ho) { ids.add(e.ho); delete e.ho; }
      if (ids.size) out.push({ cid, ids: [...ids], n: q.length });
    }
    return out;
  };
  releasedAtBoot.push(...releaseClaims(stash));
  let bootReleaseFailed = null;   // 主开发 r5164 (2): the release's write that failed — said by name below, its retry armed (was an empty catch)
  if (releasedAtBoot.length && stashHold.writable('the release of an earlier hand-over')) { try { fs.writeFileSync(stashFile + '.tmp', stashBody(), { mode: 0o600 }); fs.renameSync(stashFile + '.tmp', stashFile); } catch (e) { bootReleaseFailed = e; } }
  // lane report-mark-on-ack: a `carry` claim is an UNCONFIRMED ANSWER's (src/turn-carry.js) — it posts no frame, so its line
  // names no hand-over to look for; a hand-over's keeps its words; both on one conversation are named apart
  const claimedWords = (ids) => {
    const ho = ids.filter((x) => x !== 'carry'), carry = ho.length < ids.length, both = carry && ho.length > 0;
    const who = [carry ? 'an unconfirmed answer\'s claim (carry)' : '', ho.length ? `a hand-over (${ho.join(', ')})` : ''].filter(Boolean).join(' and ');
    const why = [carry ? 'an answer\'s claim posts no frame — the answer that told them may have reached the conversation, so the next one may tell them again' : '', ho.length ? `a duplicate is possible if the frame landed; check the conversation for "hand-over ${ho[0]}"` : ''].filter(Boolean).join('; ');
    return `${who} ${both ? 'were' : 'was'} in flight when the previous server stopped — ${both ? 'their' : 'its'} entries wait again (${why})`;
  };
  for (const r of releasedAtBoot) log(`[deliver] ${r.cid}: ${claimedWords(r.ids)}`);
  let stashTimer = null;
  // `true` when the file holds what memory holds; a failed write is logged AND answered (verify r4: a ref'd entry's
  // producer must hear the truth — see stashFor)
  // verify r5 (2026-09-27): the LAST failure is remembered (`stashHealth`) and a failed write is RETRIED on its own
  // clock — a transient refusal (a full disk cleared a minute later) heals without waiting for the next mutation
  // r3988 (A) THE STASH's OWN WORD THAT AN ENTRY IS IN THE FILE: the (conversation, ref) pairs the LAST write that LANDED held — read only
  // through stashOnDisk (THE ONE CLEARER of a receipt's «not on disk» asks it). A refused write (held) or a failed one changes nothing: the
  // last landed list still says what is on disk. `landListeners` hear a write that lands after a spell of none landing (held, or failing) —
  // the lift's write that lands, or its retry's: never a lift whose write failed
  const refsOf = (o) => { const m = new Map(); for (const c of Object.keys(o || {})) if (isConvName(c) && Array.isArray(o[c])) m.set(c, new Set(o[c].filter((e) => e && e.ref).map((e) => String(e.ref)))); return m; };
  let onDiskRefs = stashHold.held() ? new Map() : refsOf(stash);
  let landingOwed = !!stashHold.held();
  const landListeners = new Set();
  const stashOnDisk = (cid, ref) => { const s0 = onDiskRefs.get(String(cid)); return !!(s0 && s0.has(String(ref))); };
  // r4023 (D)(i) NOTHING IS JUDGED INSIDE A WRITE: the landing is told on the loop's NEXT turn (setImmediate) — after the act that caused the
  // write has said its own word (a drain's «drained», an eviction's «evicted» are emitted right after its write, in the same turn); the lift
  // tells its own listeners (afterLift), so a write that lands AT the lift owes no landing besides (one reconcile, one journal line)
  let liftingNow = false;
  const noteLanded = () => {
    onDiskRefs = refsOf(stash);
    if (!landingOwed) return;
    landingOwed = false;
    if (liftingNow) return;
    setImmediate(() => { for (const fn of landListeners) { try { fn(); } catch (err) { log('[deliver] a landing listener failed:', err && err.message); } } });
  };
  let lastWriteError = null, retryTimer = null;
  const STASH_RETRY_MS = 30 * 1000;
  const writeStashNow = () => {
    if (!stashHold.writable('a write of the messages waiting for conversations')) { landingOwed = true; return false; }   // HELD: never over a file that could not be read — what comes is kept in memory (r3720); the lift writes
    try { fs.writeFileSync(stashFile + '.tmp', stashBody(), { mode: 0o600 }); fs.renameSync(stashFile + '.tmp', stashFile); lastWriteError = null; noteLanded(); return true; }   // r3988 (A): what LANDED is the stash's word
    catch (e) {
      landingOwed = true;
      lastWriteError = { at: Date.now(), message: String(e && e.message || e), code: (e && e.code) || null };
      log('[deliver] stash persist failed:', e.message);
      if (!retryTimer) { retryTimer = setTimeout(() => { retryTimer = null; writeStashNow(); }, STASH_RETRY_MS); retryTimer.unref?.(); }   // an empty queue is written too: a stale file would re-deliver at boot
      return false;
    }
  };
  // r5164 (2), a silence of the release: the start's release of a dead process's claims that did not reach the disk was an EMPTY catch.
  // Said by name now, the stash's health says it, and its own 30 s retry writes it again (the next start would release the same claims
  // again with the same lines: nothing is lost, the entries wait again in memory)
  if (bootReleaseFailed) {
    lastWriteError = { at: Date.now(), message: String((bootReleaseFailed && bootReleaseFailed.message) || bootReleaseFailed), code: (bootReleaseFailed && bootReleaseFailed.code) || null };
    landingOwed = true;   // r5235 should: a landing after this spell tells the landing listeners, as writeStashNow's own catch does
    log(`[deliver] the release of the earlier hand-over claims of ${releasedAtBoot.length} conversation${releasedAtBoot.length === 1 ? '' : 's'} could not be saved to disk (${lastWriteError.code || 'an error'}) — the entries wait again in memory; the file still holds the claims, so the next start releases them again; written again in ${STASH_RETRY_MS / 1000} s`);
    if (!retryTimer) { retryTimer = setTimeout(() => { retryTimer = null; writeStashNow(); }, STASH_RETRY_MS); retryTimer.unref?.(); }
  }
  const persistStash = () => {
    if (stashTimer) return;
    stashTimer = setTimeout(() => { stashTimer = null; writeStashNow(); }, 500);
  };
  /** Is the file behind the queue current? `{durable, error}` — a producer's reply can say so. */
  // 主开发 r5164 (2), a silence of the release: the health read only the last write's ERROR — while the list is HELD (unread: every write
  // refused, what comes kept in memory) it answered «durable» over a file nothing is written to. A hold and an owed landing count now;
  // a failed write answers as before (durable false, its error), a healed one durable again
  const stashHealth = () => { const held = !!stashHold.held(), owed = !held && !lastWriteError && landingOwed; return { durable: !lastWriteError && !held && !landingOwed, error: lastWriteError ? lastWriteError.message : held ? 'the list of messages waiting for conversations could not be read — nothing is written over it until it reads' : owed ? 'a write is owed: it has not landed yet' : null, since: lastWriteError ? lastWriteError.at : null, ...(lastWriteError && lastWriteError.code ? { code: lastWriteError.code } : {}), ...(held ? { held: true } : {}), ...(owed ? { owed: true } : {}) }; };
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
  // B-f276 1a (主开发 r596): A KEPT ENTRY IS NEVER EVICTED BY THE CAP — a judge that could not judge it (`judgeOwed`) or a gate that
  // kept it ({keep}) holds it for a producer whose file is held; kept entries have their OWN bound, HELD_CAP a conversation: past it the
  // oldest kept entry falls, said on the same eviction road (its own `evicted` event and log line, in the held cap's words) — never a silent growth over a hold of days
  const HELD_CAP = 200;
  function capUnclaimed(q, cid = null) {
    // a keyed slot or words a lowered cap took back are never «kept» here: the cap never counts nor drops them (below), so the held
    // cap neither (the fresh read's nit: they were subtracted from `over` uncounted, and the held cap could drop them)
    const keptE = (e) => !!(e && !e.slot && !(e.held && e.held.capHeld === true) && (e.judgeOwed || (cid && isKept(cid, e))));
    // the cap counts the UNCLAIMED entries (when every slot is claimed, a newcomer is the only unclaimed one — a
    // cap over the whole store would evict exactly the entry that just arrived); the oldest unclaimed fall off.
    // A MAY-HAVE-LANDED COPY GIVES WAY FIRST (notify-retry verify r3, reproduced: a park entry claimed by a hand-over when
    // the previous server died fell into a FULL stash as may-have-landed and the cap dropped the OLDEST real entry to
    // make room for it — a certain miss displaced by a possible repeat). At the cap, the unclaimed entries whose frame
    // may already have reached the agent (`held.maybeDelivered`) fall before any other, oldest first; then the oldest
    // unclaimed as before. The same rule in the jobs engine's store (src/jobs.js capUnclaimedNotifs)
    const keptDrops = [];
    { let k = q.filter((e) => keptE(e) && !e.ho).length - HELD_CAP; for (let i = 0; i < q.length && k > 0;) { if (keptE(q[i]) && !q[i].ho) { keptDrops.push(...q.splice(i, 1)); k--; } else i++; } }
    keptDrops.heldCap = keptDrops.length;   // how many fell off the held cap (first in the list): stashFor says them in that cap's own words
    let over = q.filter((e) => !(e && e.ho) && !keptE(e)).length - STASH_CAP;
    over -= q.filter((e) => e && e.slot && !e.ho).length;   // a KEYED SLOT entry (lane queued-is-not-woke, shape C: the sender's one waiting entry) is never counted and never dropped
    const capHeld = (e) => !!(e && e.held && e.held.capHeld === true);   // B-0a33 (2): words a lowered cap took back out of a wrapper's queue — never dropped (bounded by queued-wakes' 50 per conversation)
    over -= q.filter((e) => capHeld(e) && !e.ho && !e.slot).length;
    const dropped = keptDrops;
    if (over <= 0) return dropped;
    for (const pass of [(e) => !!(e.held && e.held.maybeDelivered), () => true]) {
      for (let i = 0; i < q.length && over > 0;) {
        if (!q[i] || q[i].ho || q[i].slot || capHeld(q[i]) || keptE(q[i]) || !pass(q[i])) { i++; continue; }
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
    const entry = { source: envelope.source || 'agent', ...(kind ? { kind } : {}), ...(envelope.ref ? { ref: String(envelope.ref).slice(0, 200) } : {}), ...(about ? { about } : {}), ...(envelope.held && typeof envelope.held === 'object' && envelope.held.kind ? { held: { ...envelope.held } } : {}), fromName: envelope.fromName || null, text: kind ? String(envelope.text || '') : belt.maskForSink(String(envelope.text || ''), { dataDir, message: true }), ts: Number(envelope.ts) > 0 ? Number(envelope.ts) : Date.now() };   // `held` (lane notify-retry): why the producer could not deliver it — the hand-over's words read it
    // "Clear content…" (verify r4): the stores judge the entry BEFORE it is written — a frame handed back after the clear
    // (see judgeEntry) is held as the sentence, never as the words the clear already took
    sidOf(entry);   // r3326: the id it is given at acceptance (the merge never adds it twice)
    if (judgeEntry(entry)) log(`[deliver] ${cid}: a held entry named a cleared record — stored as the cleared sentence`);
    const before = q.slice();   // the take-back below restores the queue EXACTLY (the cap may drop from anywhere between claimed entries)
    q.push(entry);
    // THE CAP (channel-jump verify r4): the oldest UNCLAIMED entries fall off, a claimed (`ho`) one never does.
    // an eviction is SAID (channel-jump verify r6): the injection walks newest-first, so under sustained arrivals the
    // OLDEST entries are the ones held turn after turn — and the cap then drops exactly those, while the strip's count
    // stays at the cap. A loss the log can trace, never a silence — and (withdraw verify r2) an `evicted` event below.
    // B-f276 1a (the read's must 3): the cap's kept rule reads a FRESH verdict — whenever the cap would bite, the gate judges the whole
    // queue first (the newcomer too): a conversation nobody reads (not running) and the first arrival after a restart (the marks are
    // memory) never evict an entry the gate keeps
    if (q.filter((e) => e && !e.ho).length > STASH_CAP) gateQueue(cid, { write: false });
    const evicted = capUnclaimed(q, cid);
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
    // r3720: HELD, a ref'd entry is TAKEN into memory like the rest (its producer is told «not on disk»); only a failed write of a list that reads takes it back
    const stored = flush();
    if (!stored && entry.ref && !stashHold.held()) {
      q.splice(0, q.length, ...before);   // the take-back: the entry out, whatever the cap dropped back in its place
      if (!q.length) delete stash[cid];
      stashChanged(cid);
      throw new Error(`the stash could not be written to disk (${path.basename(stashFile)}) — the entry was not stored`);
    }
    // the journal names an evicted entry by its KIND, a peer by its sender's name — never by a label VibeSpace composed
    // from a record (`Background Work · <the job's name>`): every console line rides the server's ring into each incident
    // captured later, past a "Clear content…" of that job (lane-redact verify r8)
    // B-f276 1a: the held-entries cap's drops (capUnclaimed puts them first) are said in that cap's own words, never as the 30-entry cap's
    const keptOff = evicted.heldCap ? evicted.splice(0, evicted.heldCap) : [];
    if (keptOff.length) log(`[deliver] ${cid}: ${keptOff.length} oldest kept entr${keptOff.length === 1 ? 'y' : 'ies'} (it could not be judged now) fell off the held-entries cap of ${HELD_CAP} a conversation — never delivered`);
    if (evicted.length) log(`[deliver] ${cid}: ${evicted.length} oldest waiting entr${evicted.length === 1 ? 'y' : 'ies'} fell off the ${STASH_CAP}-entry cap (${evicted.map((e) => `${e.source}:${stashKindOf(e)}${stashKindOf(e) === 'peer' && e.fromName ? ` "${String(e.fromName).replace(/\s+/g, ' ').slice(0, 40)}"` : ''} ${new Date(Number(e.ts) || 0).toISOString()}${e.held && e.held.maybeDelivered ? ' — a may-have-landed copy, gave way first' : ''}`).join('; ')}) — never delivered`);
    emitStash('stashed', cid, [entry]);
    if (keptOff.length) emitStash('evicted', cid, keptOff, { held: q.length, heldCap: HELD_CAP });
    if (evicted.length) emitStash('evicted', cid, evicted, { held: q.length });
    stashChanged(cid);
    if (!stored) { const why = isHeld() ? 'taken, not on disk: the list of messages waiting for conversations could not be read — this one is lost if VibeSpace restarts before that list reads again (unless that conversation\'s next turn takes it first)' : `the queue could not be saved to disk (${(lastWriteError && lastWriteError.message) || 'write failed'}) — held in memory only: it is lost if VibeSpace restarts before that conversation's next turn`; const taken = isHeld(); if (taken) noteMemOnly(); emitStash('unwritten', cid, [entry], { why, ...(taken ? { taken: true } : {}) }); return { stored: false, why, ...(taken ? { taken: true } : {}) }; }   // r3919: `taken` = the list is held, the entry is in memory and goes at the next prompt (told, not failed)
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
  // B-f276 (主开发 r520): THE FOURTH VERDICT {keep} — an entry whose reach cannot be judged NOW (a channel file is held: unknown is
  // never an orphan) is neither delivered nor changed: it stays in its place, in its order, its stored bytes untouched (keep writes no
  // text), and every take (stashEntries, a full drain, the stash wake) passes over it; the next read judges it again and, once it
  // can, hands it over ONCE. The mark is memory only — one gate pass's answer, never written.
  const keptNow = new Map();   // cid → Set<entry> kept by the last gate pass
  const isKept = (cid, e) => { const k = keptNow.get(cid); return !!(k && k.has(e)); };
  function gateQueue(cid, { write = true } = {}) {
    const q = stash[cid];
    if (!q || !q.length || (!stashGates.size && !q.some((e) => e && e.judgeOwed))) { keptNow.delete(cid); return; }
    const kept = new Set();
    const dropped = [];
    let changed = false;
    const memo = new Map();   // ONE pass: a gate may remember what it looked up for this queue (verify r3: the cost)
    for (let i = 0; i < q.length;) {
      const e = q[i];
      // B-f276 A3: an entry whose words a judge could not judge (its store's file held) is judged AGAIN at every read — kept until it can,
      // then judged (a clear reaches it) and handed over once; never delivered with words nobody judged
      if (e && typeof e === 'object' && e.judgeOwed && !judges.length) { kept.add(e); i++; continue; }   // B-f276 1a: no judge registered yet (the boot) — still owed, never handed unjudged
      if (e && typeof e === 'object' && e.judgeOwed) { delete e.judgeOwed; const hit = judgeEntry(e, { owed: true }); if (e.judgeOwed) { if (hit) changed = true; kept.add(e); i++; continue; } changed = true; }   // still owed ⇒ no write
      if (!e || typeof e !== 'object' || !e.about) { i++; continue; }
      let v = null;
      for (const fn of stashGates) {
        try { v = fn(cid, e, memo) || null; } catch (err) { log('[deliver] a stash gate threw — the entry is withheld:', err && err.message); v = { drop: true }; }
        if (v) break;
      }
      if (!v) { i++; continue; }
      if (v.keep) { kept.add(e); i++; continue; }   // B-f276: unknown now — neither delivered nor changed
      changed = true;
      if (v.drop && !e.ref && !e.ho) { dropped.push(...q.splice(i, 1)); continue; }
      e.text = typeof v.text === 'string' && v.text ? v.text : WITHHELD_TEXT;
      if (v.fromName !== undefined) e.fromName = v.fromName;
      e.withheld = true;
      delete e.about;
      i++;
    }
    if (kept.size) keptNow.set(cid, kept); else keptNow.delete(cid);
    if (!changed) return;
    if (!q.length) delete stash[cid];
    if (dropped.length) log(`[deliver] ${cid}: ${dropped.length} waiting entr${dropped.length === 1 ? 'y was' : 'ies were'} withheld (${dropped.map((e) => `${e.source}${e.fromName ? ` "${String(e.fromName).replace(/\s+/g, ' ').slice(0, 40)}"` : ''}`).join('; ')}) — the producer says where the words came from no longer reaches that conversation`);
    if (!write) return;   // stashFor's own ONE flush and change signal carry it (B-f276 1a: a take-back after a failed flush leaves nothing of it on disk)
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
  function claimStash(cid, entries, id = null) { if (tornAt != null) tornActed.add(cid);   // (d): this conversation's next turn or hand-over — the torn line has been seen

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
  function drainStash(cid, only = null) { if (tornAt != null) tornActed.add(cid);   // (d): this conversation's next turn or hand-over — the torn line has been seen

    if (!(only instanceof Set)) gateQueue(cid);   // B-f276: a full drain judges first — a kept entry stays
    const q = stash[cid] || [];
    if (!q.length) return q;
    const byId = only instanceof Set;
    if (byId || q.some((e) => e && (e.ho || isKept(cid, e)))) {
      const mine = byId ? (e) => only.has(e) : (e) => !(e && e.ho) && !isKept(cid, e);   // B-f276 1a (the read's must 4): by id = exactly what went out, kept since or not
      const took = q.filter(mine);
      const keep = q.filter((e) => !mine(e));
      if (keep.length) stash[cid] = keep; else delete stash[cid];
      for (const e of took) if (e && e.ho) delete e.ho;   // what went out carries no claim into a restore
      noteSlotsHanded(cid, took);
      if (took.length) { writeStashNow(); stashChanged(cid); emitStash('drained', cid, took); }   // `drained` names what was TAKEN, never the whole queue (withdraw r4 + the .195 merge)
      return took;
    }
    noteSlotsHanded(cid, q);
    delete stash[cid]; writeStashNow(); stashChanged(cid);
    emitStash('drained', cid, q);
    return q;
  }
  /** the conversations holding an entry in `slot`, or a set it handed (the watch asks them when their set empties) */
  const slotHolders = (slot) => [...new Set([...Object.keys(stash).filter((cid) => isConvName(cid) && Array.isArray(stash[cid]) && stash[cid].some((e) => e && e.slot === slot)), ...Object.keys(slots).filter((cid) => slots[cid] && slots[cid][slot])])];
  /** a keyed slot's entry that went out: its set is the one it HANDED (written with the drain's own stash write) */
  function noteSlotsHanded(cid, took) {
    for (const e of took || []) if (e && e.slot) (slots[cid] || (slots[cid] = {}))[e.slot] = { handed: e.setKey || '[]', at: Date.now() };
  }
  /** ONE ENTRY PER (conversation, slot), REPLACED IN PLACE (lane queued-is-not-woke laws 2 + 3, shape C — the sender's one
   *  waiting entry, 主开发 13:35Z / 13:42Z a). Never counted against STASH_CAP, never evicted, so it never evicts; rendered
   *  whole (`whole`). It is filed again ONLY when its `set` differs from the entry standing there, or — with none there —
   *  from the set it last HANDED (never the same set twice). `envelope` null: the slot's entry leaves (nothing left to say).
   *  A slot entry claimed by a hand-over in flight is left alone (the next call decides). `forget` with a null envelope: the
   *  set it handed is forgotten too (the set emptied — the same member waiting again is a new wait). → {filed, removed} */
  function stashSlot(cid, slot, envelope, { set = [], forget = false } = {}) {
    if (!cid || !slot) return { filed: false, removed: false };
    const setKey = JSON.stringify([...new Set((set || []).map(String))].sort());
    const q = stash[cid] || [];
    if (q.some((e) => e && e.slot === slot && e.ho)) return { filed: false, removed: false };
    const i = q.findIndex((e) => e && e.slot === slot);
    if (!envelope) {
      const forgot = !!(forget && slots[cid] && slots[cid][slot]);
      if (forgot) { delete slots[cid][slot]; if (!Object.keys(slots[cid]).length) delete slots[cid]; }
      if (i < 0) { if (forgot) writeStashNow(); return { filed: false, removed: false, forgot }; }
      q.splice(i, 1); if (!q.length) delete stash[cid];
      writeStashNow(); stashChanged(cid);
      return { filed: false, removed: true, forgot };
    }
    const handed = ((slots[cid] || {})[slot] || {}).handed;
    if (i >= 0 ? q[i].setKey === setKey : handed === setKey) return { filed: false, removed: false };
    const entry = { source: envelope.source || 'agent', kind: 'notification', fromName: 'VibeSpace', text: String(envelope.text == null ? '' : envelope.text), ts: Date.now(), whole: true, slot: String(slot), setKey };
    if (i >= 0) q[i] = entry; else (stash[cid] = q).push(entry);
    writeStashNow(); stashChanged(cid);
    return { filed: true, removed: false };
  }
  /** Put drained entries BACK, each as itself (the hand-over's frame came back undelivered — verify r2: the codex
   *  wrapper's `peer_message_result ok:false` used to re-stash the ONE combined text as ONE notice; 5 became 1 and the
   *  job results left their own store for good). Order by ts, NO cap (verify r4, below), one change signal. */
  function restoreStash(cid, entries) {
    const mine = (Array.isArray(entries) ? entries : []).filter((e) => e && typeof e === 'object');
    if (!cid || !mine.length) return 0;
    const q = stash[cid] || (stash[cid] = []);
    for (const e of mine) {
      delete e.ho; sidOf(e); judgeEntry(e);
      if (e.slot) { const mem = (slots[cid] || {})[e.slot]; if (mem && mem.handed === e.setKey) delete slots[cid][e.slot]; if (q.some((x) => x !== e && x && x.slot === e.slot)) continue; }   // shape C: it was not handed; a newer slot entry wins
      if (!q.includes(e)) q.push(e);
    }   // judged at the write like every entry (verify r4)
    q.sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
    // NO cap here (verify r4): the restored entries are the OLDEST, so trimming would evict exactly what came back
    // while answering "restored". They wait as if the hand-over had never happened; the next arrival's cap applies.
    if (q.length > STASH_CAP) log(`[deliver] ${cid}: ${q.length} entries wait after a restore (cap ${STASH_CAP}) — the oldest fall off with the next arrivals`);
    const stored = writeStashNow();   // a restore is a delivery's bookkeeping: on disk at once, like a drain
    stashChanged(cid);
    // a ref'd entry back in the queue is WAITING again (the .195 merge, withdraw's checklist ⑤): without `stashed` its
    // producer's card kept "handed" over a receipt the agent never got; no `evicted` — a restore never trims (jump r4)
    emitStash('stashed', cid, mine);
    if (!stored) { const taken = isHeld(); if (taken) for (let i = 0; i < mine.length; i++) noteMemOnly(); emitStash('unwritten', cid, mine, { why: taken ? 'taken, not on disk: the list of messages waiting for conversations could not be read — lost if VibeSpace restarts before that list reads again (unless that conversation\'s next turn takes them first)' : `the queue could not be saved to disk (${(lastWriteError && lastWriteError.message) || 'write failed'}) — held in memory only: it is lost if VibeSpace restarts before that conversation's next turn`, ...(taken ? { taken: true } : {}) }); }   // r3919 (should): while held, the hold's own words and count
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
  /** B-f276 1a: how many of a conversation's entries the last gate pass KEPT (the wake's claim: every entry kept ⇒ it waits, never ends) */
  function stashKeptCount(cid) { gateQueue(cid); return (stash[cid] || []).filter((e) => isKept(cid, e)).length; }
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
      if (!isConvName(cid) || !Array.isArray(q)) continue;
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
    // THE PARK'S HANDING COPY TOO (the census cure's hunt, finding 9 — 主开发 19:44Z: the clear reaches the parked copy too): an entry
    // that left the park for the jobs store is still WRITTEN into msg-retry.json until its taker's store lands (`handing`) — the same
    // matcher rewrites it, so a kill before that landing never brings the cleared words back from the file at the next boot
    for (const e of handing) {
      let r = null;
      try { r = match(e); } catch { r = null; }
      if (!r || typeof r !== 'object') continue;
      if (typeof r.text === 'string') { e.text = e.kind === 'notification' ? vibespaceNoticeText(r.text) : r.text; e.cardText = null; }
      if (typeof r.fromName === 'string') e.fromName = r.fromName;
      n++; parked++;
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
  const threwSaid = new WeakMap();   // B-f276 1a: owed entry → the judges whose throw over it was said (memory: a boot says it again, once)
  function registerStashJudge(fn) { if (typeof fn === 'function') judges.push(fn); }
  function judgeEntry(entry, { owed = false } = {}) {
    let hit = false;
    for (const fn of judges) {
      let r = null, threw = false;
      // B-f276 1b (主开发 r809 (3)) THE JUDGES' CONTRACT, worded: a judge's {keep} is its OWN, entry by entry (it answers keep only for an
      // entry of its store); ANY judge's THROW while an owed entry is judged again keeps it — fail closed, said once per (entry, judge)
      try { r = fn(entry); } catch (e) { threw = true; const said = owed ? threwSaid.get(entry) : null; if (!said || !said.has(fn)) log('[deliver] a stash judge threw:', e && e.message); if (owed) { if (said) said.add(fn); else threwSaid.set(entry, new Set([fn])); entry.judgeOwed = true; } r = null; }   // B-f276 1a: re-judging an owed entry, a throw keeps it (unknown is never delivered), said once per (entry, judge)
      if (owed && !threw) { const said = threwSaid.get(entry); if (said) said.delete(fn); }   // it answered: a later throw of it is said again
      if (!r || typeof r !== 'object') continue;
      if (r.keep === true) { entry.judgeOwed = true; continue; }   // B-f276 A3: the store that owns the words cannot judge now (its file is held) — kept until it can
      if (typeof r.text === 'string') entry.text = r.text;
      if (typeof r.fromName === 'string') entry.fromName = r.fromName;
      hit = true;
    }
    return hit;
  }
  /** A READ of one conversation's held entries (2026-09-27 verify: the
   *  channels engine's boot reconcile asks whether a receipt is still
   *  waiting). Copies; never drains, never re-orders. */
  // r3919 (the class): `{memory:true}` — a road that needs only a HIT (the hand-back's dedupe, the reaction digest's caps) reads what memory
  // holds while the list is held: an entry FOUND is evidence; a miss is not absence (the unread list may hold one) and decides nothing
  function stashPeek(cid, { memory = false } = {}) { const hh = heldHold(); if (hh && !memory) hh.refuse('reading the messages waiting for this conversation'); gateQueue(cid); return (stash[cid] || []).map((e) => ({ ...e })); }   // HELD: a road that DECIDES from the stash's silence is told «unknown» (r3104 (a))
  /** ONE ENTRY, ONCE (r3329 (2)): `incoming`'s entries after `base`'s — an entry whose acceptance id (`sid`) or producer `ref` the base
   *  already holds is never added again; a slot entry of `incoming` (not in a hand-over) replaces the base's entry of the same slot (round
   *  wozyl97qk (c): the agent never reads one notice twice). → the count added */
  function mergeQueues(base, incoming) {
    let n = 0;
    for (const cid of Object.keys(incoming)) {
      if (!isConvName(cid) || !Array.isArray(incoming[cid]) || !incoming[cid].length) continue;
      const q0 = Array.isArray(base[cid]) ? base[cid] : [];
      // r3663 (1): never by a producer's ref alone (one ref carries different messages: the refresh note's, a doc-edit note's for its file, an
      // app outcome's) — by the acceptance id, or by the ref AND its text together (the same receipt stashed again)
      const keyOf = (e) => JSON.stringify([e.ref, String(e.text == null ? '' : e.text)]);
      const sids = new Set(q0.map((e) => e && e.sid).filter(Boolean)), same = new Set(q0.filter((e) => e && e.ref).map(keyOf));
      const add = incoming[cid].filter((e) => e && typeof e === 'object' && !(e.sid && sids.has(e.sid)) && !(e.ref && same.has(keyOf(e))));
      const slotsIn = new Set(add.filter((e) => e.slot && !e.ho).map((e) => e.slot));
      const kept = q0.filter((e) => !(e && e.slot && !e.ho && slotsIn.has(e.slot)));
      if (add.length || kept.length !== q0.length) base[cid] = [...kept, ...add];
      n += add.length;
    }
    return n;
  }
  /** THE LIST's HOLD LIFTED (r3003 (a), r3720): the list's entries (null: torn bytes kept aside — none) — each judged again by the stores
   *  that own their words, an earlier process's hand-over stamps released — then MEMORY's after them (every entry accepted while held and
   *  not handed out; never twice), ONE write. The merge is that one write; the steps after it are each their own try (afterLift) */
  function liftStash(v, facts) {
    // r3919 (small): THE MERGE IN A TRY THAT KEEPS THE HOLD — computed beside memory (nothing of `stash` is replaced until it ends); a
    // throw takes the hold again (the helper read it as lifted): nothing is written over the list, memory stays as it was, the ladder reads again
    let read, r, released, took, kept = 0;
    try {
      read = STASH_SHAPE(v) ? v : {};
      r = takeReserved(read);
      released = releaseClaims(read);
      for (const q of Object.values(read)) for (const e of q) { try { judgeEntry(e); } catch { } }
      for (const q of Object.values(read)) kept += q.length;
      took = mergeQueues(read, stash);
    } catch (err) {
      log(`[deliver] the stash's lift could not merge the list with memory (${(err && err.message) || err}) — held again: nothing is written over the list; it is read again`);
      try { stashHold.start({ state: 'unreadable', error: { code: 'lift-merge-failed' } }); } catch (e2) { log('[deliver] the stash could not be held again:', e2 && e2.message); }
      return;
    }
    for (const x of released) { releasedAtBoot.push(x); log(`[deliver] ${x.cid}: ${claimedWords(x.ids)}`); }
    stash = read;
    slots = { ...r.sl, ...slots };
    tornAt = facts && facts.setAside ? Date.now() : (r.ta != null ? r.ta : tornAt);
    liftingNow = true;
    let ok = false;
    try { ok = writeStashNow(); } finally { liftingNow = false; }   // ONE write to the list — landed, its listeners are the lift's own (afterLift); failed, the landing stays owed
    log(`[deliver] the stash read again: ${facts && facts.setAside ? `torn bytes, kept aside as ${facts.setAside} — none of its entries could be read` : `${kept} entr${kept === 1 ? 'y' : 'ies'} back`}${took ? `, ${took} accepted meanwhile after them` : ''}${ok ? '' : ' — its write failed (retried on its own clock)'}`);
    afterLift();
  }
  /** after the list reads: every strip told once, the owed wakes the hold set aside due NOW (never at their next minute's ask) and the park
   *  armed, the lift's listeners (the receipt reconcile) — each step its own try: a throw in one never stops the next */
  function afterLift() {
    memOnly = 0; memOnlySaid = 0;
    const step = (name, fn) => { try { fn(); } catch (err) { log(`[deliver] the stash's lift — ${name} failed:`, err && err.message); } };
    step('the strips', () => { for (const cid of Object.keys(stash)) if (isConvName(cid)) stashChanged(cid); stashChanged(null); });
    step('the owed wakes', () => { const dueAt = clock.now(); for (const q of Object.values(retry)) for (const e of q) if (e && e.waitsHeld && (e.waitsHeld.stash || e.waitsHeld.by === 'stash-wake') && !e.inflight) e.nextAt = dueAt; scheduleRetry(); });
    for (const fn of liftListeners) step('a lift listener', fn);
  }
  /** r3329 (4) / r3720 (6): an entry kept in memory only while the list is held — the journal COUNTS every one, never names one (no
   *  conversation, no words): a line at the first, again at each doubling, the whole count at the stop or written at the lift */
  function noteMemOnly() {
    memOnly++;
    if (memOnly < Math.max(1, memOnlySaid * 2)) return;
    memOnlySaid = memOnly;
    log(`[deliver] the messages waiting for conversations could not be read — ${memOnly} entr${memOnly === 1 ? 'y' : 'ies'} taken into memory only this hold (a restart before the list reads loses what is still waiting): their producers were told`);
  }
  /** the hub's stop: the last write; what memory still holds UNHANDED while the list is unread is counted (r3728), never named */
  function flushAtStop() {
    const ok = flush();
    // r3728: what memory still holds UNHANDED at this moment — never the hold's acceptances (one handed out at a prompt is not lost)
    const unhanded = isHeld() ? Object.keys(stash).filter(isConvName).reduce((n, c) => n + (Array.isArray(stash[c]) ? stash[c].length : 0), 0) : 0;
    if (unhanded) log(`[deliver] the stop while the messages waiting for conversations are unread: ${unhanded} entr${unhanded === 1 ? 'y' : 'ies'} taken this hold and not handed out ${unhanded === 1 ? 'is' : 'are'} lost with this process (their producers were told)`);
    return ok;
  }
  /** one read again of the held list → true when it reads */
  async function stashReadAgain() { if (stashHold.held()) await stashHold.again(); return !isHeld(); }
  /** The entries waiting for a conversation (the SAME objects — `drainStash(cid, new Set(these))` takes them). Every
   *  read passes the stash gate first (verify r3): what a revoked reach no longer covers is never handed out. */
  function stashEntries(cid) { gateQueue(cid); return (stash[cid] || []).filter((e) => !isKept(cid, e)); }   // B-f276: a kept entry is not handed out

  // ── THE RETRY PARK (see the header constants) ──────────────────────────────
  const clock = retryClock || { now: () => Date.now(), setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t; }, clearTimeout: (t) => clearTimeout(t) };
  const retryFile = path.join(dataDir, 'msg-retry.json');
  let retry = {};
  // A TORN FILE IS SET ASIDE, NEVER SILENTLY EMPTY (verify r1 N5, reproduced: a torn msg-retry.json read as {} without a
  // word and the next park overwrote its bytes). The bytes move to `msg-retry.json.corrupt-<ts>` (never unlinked — the
  // channel store's rule) with ONE named log line; the park starts empty and the next write makes a fresh file.
  // B-f276's remainder (lane bl-windows, 主开发 r1702 / r2407 — «a parked wake dropped silently»): THE STORE READ (src/store-read.js).
  // The release read a FAILED read (EIO, EACCES, ETIMEDOUT…) as a fresh park: the next park wrote over the file, and every wake
  // the last run had parked — a billed send, a paced wake, a wake owed to an ended conversation — was gone, unsaid. Now a read
  // that failed is NO ANSWER: the park is HELD. Nothing is written over the file; the park works in memory (a miss is still
  // parked and attempted — said: not on disk until the file reads); the file is read again OFF the loop at the park's own roads
  // (a new park, a turn end), never sooner than the store read's own gap after the last read, never by a timer of its own; once it
  // reads, its entries are adopted exactly as the boot adopts them and join the live park. Torn bytes are set aside as before
  // (the read again's off the loop) — and a set-aside that fails leaves them HELD (their only copy), never written over.
  let retryHeld = null;   // { code, why, at, tries, readAt, saidWrite, lasting, asideFailed } while msg-retry.json could not be read
  const RETRY_VALID = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const retryWhy = (a) => (a.code === 'did not parse' ? String((a.error && a.error.message) || 'did not parse') : 'not an object');   // the release's words for torn bytes
  const retryAsideName = () => `${retryFile}.corrupt-${new Date(clock.now()).toISOString().replace(/[:.]/g, '-')}`;   // ONE name for torn bytes (the boot's set-aside and the read again's)
  const RETRY_LASTING = new Set(['EACCES', 'EPERM', 'EISDIR', 'ENOTDIR', 'ELOOP', 'not set aside']);
  /** one read → the store read's answer (an EMPTY file is a fresh park, as before) */
  function retryAnswer(read) {
    if (read && read.error == null && read.text != null && String(read.text).trim() === '') return { state: 'missing', writable: true };
    return SR.storeAnswer(read, { valid: RETRY_VALID });
  }
  function holdRetry(a) {
    const was = retryHeld, code = String(a.code || 'unreadable');
    retryHeld = { code, why: String(a.why || 'the read failed'), at: was ? was.at : clock.now(), tries: (was ? was.tries : 0) + 1, readAt: was ? was.readAt : clock.now(), saidWrite: !!(was && was.saidWrite), lasting: RETRY_LASTING.has(code), asideFailed: !!a.asideFailed || !!(was && was.asideFailed) };
    if (!was) log(`[deliver] data/msg-retry.json could not be read (${code}) — the retry park is HELD: the file is kept as it is and nothing is written over it; the park works in memory (a wake parked now is not on disk until the file reads) and the file is read again at the next park and the next turn end, never on a timer${retryHeld.lasting ? ' — a cause that does not pass by itself: check the file and its access' : ''}`);
  }
  {
    let read;
    try { read = { text: fs.readFileSync(retryFile, 'utf-8') }; } catch (e) { read = { error: e }; }   // the boot's own read (before the first loop turn)
    let a = retryAnswer(read);
    if (a.state === 'corrupt') {
      const aside = retryAsideName();
      let moved = false;
      try { fs.renameSync(retryFile, aside); moved = true; log(`[deliver] data/msg-retry.json could not be read (${retryWhy(a)}) — set aside as ${path.basename(aside)} (${String(read.text).length} bytes kept); the retry park starts empty`); }
      catch (e) { log(`[deliver] data/msg-retry.json could not be read (${retryWhy(a)}) and could not be set aside (${e && e.message}) — its bytes are its only copy: HELD, never written over`); }
      a = SR.afterSetAside(a, moved ? path.basename(aside) : null);
      if (a.state === 'unreadable') a = { ...a, asideFailed: true };
    }
    if (a.state === 'data') retry = a.value;
    else if (a.state === 'unreadable') holdRetry(a);
  }
  let retrySeq = 0;
  // B-54b7 (主开发 r734 (3)): A PARK ID IS UNIQUE BY CONSTRUCTION — this park's own token beside the clock and its count (a process that
  // restarted inside the same millisecond, or under a clock stepped back, minted the previous process's id: its count starts at 1 again)
  const retryRun = require('crypto').randomBytes(4).toString('hex');
  const retryListeners = new Set();
  const turnEndListeners = new Set();
  const lastPostAt = new Map();   // cid → the last SUCCESSFUL post's instant (the park's own floor)
  const floorDrops = new Map();   // cid → the instant its floor witness was last DROPPED for a backward clock (verify r4: the second within the hour re-bases)
  const floorRebaseSaidAt = new Map();   // cid → when the re-base was last said
  let parkTimer = null;
  // THE WAKE OWED (lane paced-wake-retry, 2026-11-07 — the owner: «目前 wake 的消息如果被节流排队了，节流时间到了会自动发出吗？… 那这样
  // 会不会导致我需要做自动化任务从此卡住了？»). A wake the wake PACE refused is parked HERE beside a transient miss, with
  // `held.why = 'paced'` and its own schedule: the first retry at the pace window's end, then the backoff and the 60-min /
  // attempt bounds. It differs from a transient entry in three ways, each because a transient entry's frame already left
  // once and an owed wake's never has:
  //   · IT HOLDS NO WORDS. The producer's own store keeps them (the group log, the stash) and `render` reads them as the
  //     frame leaves — so a clear reaches them, a later message rides along, and a turn that carried them is what cancels
  //     the retry (render ⇒ null ⇒ retryTake via 'prompt'). Being wordless it is listed to no drain and no hand-over.
  //   · THE PACE RE-JUDGES IT. `wakePacer(sender)(cid)` is asked at the attempt (a grant is the wake's slot; a post that
  //     did not land refunds it); a refusal re-schedules by its new wait. An owed entry riding a transient's frame asks nothing.
  //   · IT MAY LIVE ON ANY RUNG. A paced target may be a codex wrapper or another machine's, so with no local inbox the
  //     frame goes down the ladder itself, never to `not-running`.
  // The money is the park's: the first attempt authorizes (a paced wake authorized nothing when it was refused), the hold
  // stays on the entry across a transient miss, ONE charge at the landing.
  // THE OWNER'S RULE (the addendum, 2026-11-07): rate limiting is allowed, the ORIGINAL INTENTION is honoured — a request
  // made as a wake WAKES within a bound, never a silent downgrade to «a queue». So this entry has a HARD UPPER BOUND and a
  // WAKE at the end of it: past the 60 minutes (or the attempts) the pace is no longer asked — the frame goes, stamped. The
  // only earlier fulfilment is a better one (a turn the target started carried the words: cancelled). The only outright
  // refusal is the spend gate's, the owner's own dial: the guard files it in For you, the sender hears it on its next turn.
  // A frame that cannot land (a conversation gone, a CLI that never accepts) falls at the bound, said (`paced-out`).
  const isOwed = (e) => !!(e && e.held && e.held.why === 'paced');
  // THE WAKE OWED TO AN ENDED CONVERSATION (the manager design's piece 7, lane paced-wake-retry, 2026-11-17 — the owner: deliveries
  // resume an ended conversation by default). A job's result / a schedule's reminder to its owner, or a wake an agent sent to ONE
  // addressee, found the conversation ENDED: its words are stashed exactly as before (the producer's own store, durable) and the
  // conversation is owed ONE wake — this entry, ONE per conversation however many deliveries wait. It is a RUNG of this park,
  // never a second queue: it holds no words (the stashes do), asks no pace (THE ONE LINE and the spend guard are its pace), and its
  // attempt does not post — it is handed to the hub's resume line (`registerEndedWake`), whose start asks the account's limit and
  // the spend guard (a probe) BEFORE anything spawns, then claims the stashes, resumes, and hands everything over as ONE message.
  // ANY answer ends the entry (delivered, refused, failed — said to the sender, the journal and the row): no timer retries; the
  // next eligible delivery, a person's Resume or a granted resume asks again (the design: «No timer retries»).
  const isEnded = (e) => !!(e && e.held && e.held.why === 'ended');
  const owedProducers = new Map();   // producer → {render(cid, e) → words|null, fell?(cid, e, extra) → true, cancelled?(cid, e)}
  let wakePacer = null;              // (sender) → mayWake — the groups engine's persisted pacer, ONE ledger
  const parkBootAt = clock.now();    // the instant this process's park came up (`unready`'s own bound)
  /** a producer not registered yet (the boot's window before the groups engine exists) is skipped, never judged: the belt paces it */
  const unready = (e) => isOwed(e) && !owedProducers.has(e.producer);
  let retryClosed = false;           // shutdown: no new post leaves (closeRetries)
  const retryInFlight = new Set();   // the attempt promises in flight (settleRetries waits for them)
  // THE ENTRIES A PRODUCER TOOK INTO ITS OWN STORE whose store has not LANDED yet (lane lg-store-writes, the moved2 cure 2 — the
  // jobs store writes through the store writer): gone from the park in memory (no taker here sees them), STILL in its file until
  // the producer's landing — a kill first finds the park's copy, never neither (the step that cannot be undone rides the landing)
  const handing = new Set();
  let parkFailing = null, parkRetryTimer = null;   // r5164 (2): a failed park write, said once a spell; its own retry clock
  const writeRetryNow = () => {
    if (retryHeld) {   // B-f276's remainder: the file could not be read — NOTHING is written over it (said once a hold)
      if (!retryHeld.saidWrite) { retryHeld.saidWrite = true; log('[deliver] the retry park is not written: data/msg-retry.json is HELD (it could not be read) — nothing is written over it until it reads; what is parked now lives in memory'); }
      return false;
    }
    for (const [cid, q] of Object.entries(retry)) if (!Array.isArray(q) || !q.length) delete retry[cid];
    let out = retry;
    if (handing.size) { out = { ...retry }; for (const e of handing) out[e.cid] = [...(out[e.cid] || []), e]; }
    try {
      fs.writeFileSync(retryFile + '.tmp', JSON.stringify(out)); fs.renameSync(retryFile + '.tmp', retryFile);
      if (parkFailing) { log(`[deliver] the retry park is on disk again (${parkFailing.n} failed write${parkFailing.n === 1 ? '' : 's'} since ${new Date(parkFailing.at).toISOString()})`); parkFailing = null; }
      if (parkRetryTimer) { clock.clearTimeout(parkRetryTimer); parkRetryTimer = null; }   // healed by another write: no retry left behind
      return true;
    } catch (e) {
      // 主开发 r5164 (2), a silence of the release: the park's failed write was a log line at every call with NO retry clock (the stash has
      // its own 30 s one). Now said ONCE A SPELL with what it holds, and written again on its own clock — the stash's form
      if (!parkFailing) {
        parkFailing = { at: clock.now(), n: 0 };
        const n = Object.values(out).reduce((k, q) => k + (Array.isArray(q) ? q.length : 0), 0);
        log(`[deliver] the retry park could not be saved to disk (${(e && e.code) || 'an error'}) — its ${n} parked entr${n === 1 ? 'y is' : 'ies are'} held in memory only: ${retryClosed ? 'the stop\'s own write, so they are lost with this stop' : `lost if VibeSpace restarts before it is written; written again every ${STASH_RETRY_MS / 1000} s`} (counted at this first failure)`);
      }
      parkFailing.n++;
      if (!parkRetryTimer && !retryClosed) parkRetryTimer = clock.setTimeout(() => { parkRetryTimer = null; if (!retryClosed) writeRetryNow(); }, STASH_RETRY_MS);   // the park's own clock (unref'd); never after the stop
      return false;
    }
  };
  // THE MERGES ARE COALESCED (the manager design's piece 7, 主开发 12:46Z: a storm of thirty results did thirty whole-file writes
  // in a row on the main thread): a delivery that RIDES an owed wake is written once per 50 ms; the first park and the in-flight
  // stamp stay synchronous (durable before anything acts on them), and a stop flushes (closeRetries)
  let retryWriteTimer = null;
  const writeRetrySoon = () => { if (retryWriteTimer) return; retryWriteTimer = setTimeout(() => { retryWriteTimer = null; writeRetryNow(); }, 50); if (retryWriteTimer.unref) retryWriteTimer.unref(); };
  const flushRetryWrite = () => { if (!retryWriteTimer) return; clearTimeout(retryWriteTimer); retryWriteTimer = null; writeRetryNow(); };
  // BOOT: the previous process's holds are gone (the guard is in-memory) — every parked entry is re-judged at its
  // next attempt. An entry stamped `inflight` was being posted when that process stopped: its frame MAY HAVE LANDED
  // (a connect + write on a live socket completes in milliseconds; the stamp is cleared only after the post) — it is
  // NEVER posted again (verify r1 N2, reproduced: the boot re-posted a landed frame = the same notice twice, two billed
  // turns; the CLI's own dedup is "identical to the previous message from this sender", and a restarted hub is a new
  // sender). It falls to the producer's stash at the first sweep, typed not-reachable with `maybeDelivered`, so the
  // next prompt carries it for free. A graceful stop never leaves one: server.js waits for the posts in flight
  // (closeRetries / settleRetries, the hand-over's shape).
  /** THE BOOT's ADOPTION of a parked file's entries (the stamps of a process that stopped) — at the start, and at a HELD file's
   *  read again (B-f276's remainder): the same judgments either way. → {notes, waitedOut} */
  function adoptRetryDoc(doc) {
    const notes = [];
    let waitedOut = 0;
    for (const [cid, q] of Object.entries(doc)) {
      if (!Array.isArray(q)) { delete doc[cid]; continue; }
      for (const e of q.slice()) {   // a copy: a posting wake leaves `q` inside the loop
        if (!e || typeof e !== 'object') continue;
        if (e.charged) e.charged.hold = null;
        if (e.waitsLift) { delete e.waitsLift; e.nextAt = clock.now(); }   // B-ef83 unit 1: owed to an earlier process's lift — this start's own road asks it ONCE
        if (isOwed(e)) { delete e.paceRefusals; delete e.forceRefusedAt; waitedOut++; }   // its schedule starts again here (owedEnd)
        // A WAKE WHOSE FRAME WAS BEING POSTED (主开发 14:26Z — a hard kill between the post and the entry's end): its frame MAY have
        // landed — said, NEVER offered to the line again (a second resume and a second frame = two billed turns for one delivery);
        // the words the hand-over had claimed are released by the stash's own boot and ride the next turn (the park's own rule
        // for its in-flight entries)
        if (isEnded(e) && e.posting) { notes.push(`${cid}: ${e.id} (a wake owed to an ended conversation) was POSTING its hand-over when the previous server stopped — its frame may have landed: it is not offered again (the words left waiting ride the conversation's next turn)`); q.splice(q.indexOf(e), 1); continue; }
        if (e.inflight && isEnded(e)) { notes.push(`${cid}: ${e.id} (a wake owed to an ended conversation) was in the resume line when the previous server stopped — it posted nothing here (the hand-over is exactly-once by its own claim), so it is offered to the line again`); delete e.inflight; e.nextAt = 0; continue; }
        if (e.inflight) { notes.push(`${cid}: ${e.id} was being posted when the previous server stopped — its frame may have landed, so it is handed to the stash at the first sweep and never posted again`); delete e.inflight; e.maybeDelivered = true; e.nextAt = 0; }
        // A HAND-OVER'S CLAIM IS THE SAME STAMP (verify r2, reproduced): an entry stamped `ho:<id>` was riding a hand-over's
        // frame when the process died inside that post. The stash releases ITS claimed entries at boot (they wait again); a
        // park entry nobody released was invisible to every door — the timer, the turn end, the bound, the hand-over's view
        // all skip a claimed one — and sat in the file for ever, counted as "being retried". It joins its stash siblings:
        // handed to the stash at the first sweep as may-have-landed, never posted by the park again
        if (e.ho) { notes.push(`${cid}: ${e.id} was claimed by ${e.ho === 'carry' ? 'an unconfirmed answer (carry) when the previous server stopped — the answer that told it may have reached the conversation' : `hand-over ${e.ho} when the previous server stopped — its frame may have landed`}, so it is handed to the stash at the first sweep (its siblings wait there) and never posted again`); delete e.ho; e.maybeDelivered = true; e.nextAt = 0; }
      }
    }
    return { notes, waitedOut };
  }
  {
    const { notes, waitedOut } = adoptRetryDoc(retry);
    if (Object.keys(retry).length) writeRetryNow();
    for (const n of notes) log(`[deliver] ${n}`);
    if (waitedOut) log(`[deliver] ${waitedOut} paced wake${waitedOut === 1 ? '' : 's'} waited through the downtime — paced out from this boot, never dumped at once`);
    const n = Object.values(retry).reduce((a, q) => a + q.length, 0);
    if (n) log(`[deliver] ${n} parked deliver${n === 1 ? 'y waits' : 'ies wait'} for retry from the previous server`);
  }
  // B-f276's remainder: THE HELD PARK READ AGAIN — off the loop, one read at a time (past RETRY_REREAD_BOUND_MS a new read may start:
  // a read that never settles on a dead mount keeps none from reading for ever — never more than RETRY_REREADS_MAX at once, each
  // holds a thread every file read of the hub shares), never sooner than SR.retryDelay after the last one (30 s doubling to 5 min),
  // at the park's own roads (a new park, a turn end) — NO timer of its own
  let retryReading = null, retryReads = 0, retryReadAt = 0, retryAsiding = false;
  const endedSettledHeld = new Map();   // line 494's follow (r2695 (1)): cid → the outcome of its ended wake that SETTLED while the park was held — until the lift
  /** line 529's small (r2795): THE RECORD IS STICKY AND COMPLETE — once a wake for the conversation was delivered or is running while
   *  the file is held it says so until the lift, whatever outcome comes after, and by every road (the line's answer, its late road) */
  function noteSettledHeld(cid, outcome) {
    if (!retryHeld || !cid) return;
    const was = endedSettledHeld.get(cid);
    if (was === 'delivered' || was === 'running') return;   // sticky: a later failure never writes over a delivery
    endedSettledHeld.set(cid, outcome || 'ended');
  }
  const RETRY_REREAD_BOUND_MS = 30_000, RETRY_REREADS_MAX = 2;
  function rereadRetry() {
    const H = retryHeld;
    if (!H || retryClosed) return null;
    if (retryAsiding) return retryReading;   // a set-aside's rename is out: its own outcome settles the hold — no read starts meanwhile (r2550 (1)(2), carried)
    const now = clock.now();
    if (retryReading) { if (now - retryReadAt < RETRY_REREAD_BOUND_MS || retryReads >= RETRY_REREADS_MAX) return retryReading; }
    else if (now - Number(H.readAt || 0) < SR.retryDelay(H.tries)) return null;
    H.readAt = now; retryReadAt = now; retryReads++;
    const p = fs.promises.readFile(retryFile, 'utf-8').then((text) => ({ text }), (error) => ({ error }))
      .then((read) => { retryReads--; return retryHeld ? applyRetryRead(read) : null; })   // the first answer while held wins
      .catch((e) => log('[deliver] the held retry park\'s read again failed:', e && e.message))
      .finally(() => { if (retryReading === p) retryReading = null; });
    retryReading = p;
    return p;
  }
  /** a read again's answer: data → the file's entries join the park; not there → lifted (nothing of the last run); a failed read →
   *  still held; torn bytes → set aside OFF the loop (one at a time), then lifted — or HELD when the set-aside fails */
  function applyRetryRead(read) {
    if (retryAsiding) return null;   // line 494's follow (its round's smalls): a set-aside's rename is out — its own end settles the hold (never «not there» from a read that met the moved file)
    const a = retryAnswer(read);
    if (a.state === 'unreadable') { holdRetry(a); return null; }
    if (a.state === 'corrupt') {
      retryAsiding = true;
      const aside = retryAsideName();
      return fs.promises.rename(retryFile, aside).then(() => true, (e) => { log(`[deliver] data/msg-retry.json could not be read (${retryWhy(a)}) and could not be set aside (${e && e.message}) — still HELD, never written over`); return false; })
        .then((moved) => {
          retryAsiding = false;
          if (!retryHeld) return null;
          const b = SR.afterSetAside(a, moved ? path.basename(aside) : null);
          if (b.state === 'unreadable') { holdRetry({ ...b, asideFailed: true }); return null; }
          liftRetry(`did not parse — set aside as ${path.basename(aside)} (its bytes kept)`, null);
          return null;
        });
    }
    liftRetry(a.state === 'data' ? 'reads again' : 'is not there (nothing of the last run is parked)', a.state === 'data' ? a.value : null);
    return null;
  }
  function liftRetry(how, doc) {
    const H = retryHeld;
    if (!H) return;
    retryHeld = null;
    let n = 0;
    if (doc) {
      const { notes, waitedOut } = adoptRetryDoc(doc);
      const liftAt = clock.now();
      for (const [cid, q] of Object.entries(doc)) {
        if (!q.length) continue;
        if (readoptDone) for (const e of q) if (e && e.waitsReadopt) { delete e.waitsReadopt; e.nextAt = clock.now(); }   // the settle ran while the file was held: it runs now
        // r2695 (3): THE BOUND COUNTS FROM THE LIFT for what waited through the hold, as the boot's does from the boot (owedEnd)
        for (const e of q) if (e && typeof e === 'object') e.boundFrom = liftAt;
        // r2695 (1) THE MONEY: one wake per conversation across the lift — the file's ended wake folds into memory's in the resume
        // line, or into the one that settled while held (delivered / running: that resume carried every word waiting)
        const mem = retry[cid] || [];
        const live = mem.find((x) => isEnded(x) && x.inflight);
        const settled = endedSettledHeld.get(cid);
        const keep = [];
        for (const e of q) {
          if (isEnded(e) && (live || settled === 'delivered' || settled === 'running')) {
            if (live) { for (const x of e.senders || []) if (!live.senders.includes(x)) live.senders.push(x); live.producers = mergeProducers(live, e); live.metas = [...metasOf(e), ...metasOf(live)].slice(-ENDED_METAS); live.deliveries = (Number(live.deliveries) || 1) + (Number(e.deliveries) || 1); }
            log(`[deliver] ${cid}: the held file's wake owed to the ended conversation (${e.id}) folds into ${live ? `${live.id}, in the resume line now` : `the resume made while the file was held (${settled})`} — one wake per conversation, never a second resume for the same words`);
            if (!live) emitRetry('wake', cid, e, { outcome: settled, why: 'its words rode the resume made while the park\'s file was held (folded at the lift)', code: null, until: null, sessionId: null, attempts: Array.isArray(e.attempts) ? e.attempts.length : 0 });   // r2795 small: its producers keep an answer for the folded entry
            continue;
          }
          keep.push(e);
        }
        if (!keep.length) continue;
        retry[cid] = [...keep, ...mem];   // the file's (older) entries FIRST: a twin fold keeps the older entry's first miss
        n += keep.length;
        stashChanged(cid);
      }
      for (const x of notes) log(`[deliver] ${x}`);
      if (waitedOut) log(`[deliver] ${waitedOut} paced wake${waitedOut === 1 ? '' : 's'} of the held file waited through the hold — paced out from now, never dumped at once`);
    }
    endedSettledHeld.clear();
    log(`[deliver] data/msg-retry.json ${how} — the retry park's hold is lifted (held ${Math.round((clock.now() - H.at) / 1000)} s)${n ? `; ${n} parked deliver${n === 1 ? 'y' : 'ies'} of the last run join the park` : ''}`);
    writeRetryNow();
    scheduleRetry();
  }
  function onRetry(fn) { if (typeof fn !== 'function') return () => { }; retryListeners.add(fn); return () => retryListeners.delete(fn); }
  /** `fn(ev, cid, entry, extra)` — parked | attempt | delivered | fell; for `fell` a listener answering `true` TOOK
   *  the entry (the producer stashed it in its own store); nobody ⇒ this ladder's stash. Synchronous, never throws
   *  into the park. A taker whose store lands LATER answers `{taken: true, ride(step)}` (fell, and dropped by its judge
   *  with a held line): the park's copy stays in msg-retry.json until `ride` runs the step (the moved2 cure 2). */
  function emitRetry(ev, cid, entry, extra = {}, riders = null) {
    let taken = false;
    for (const fn of retryListeners) {
      try {
        const r = fn(ev, cid, entry, extra);
        if (r === true) taken = true;
        else if (r && typeof r === 'object' && r.taken) { taken = true; if (riders && typeof r.ride === 'function') riders.push(r.ride); }   // the moved2 cure 2: a store that lands later
      } catch (e) { log('[deliver] a retry listener threw:', e && e.message); }
    }
    return taken;
  }
  /** the park's copy of entries a producer took leaves the FILE once every taker's store landed (`riders` — each `ride(step)`
   *  runs step at its landing); none ⇒ now */
  function leaveParkWhenLanded(entries, riders) {
    if (!riders.length) { for (const e of entries) handing.delete(e); writeRetryNow(); return; }
    let left = riders.length;
    const one = () => { if (--left > 0) return; for (const e of entries) handing.delete(e); writeRetryNow(); };
    for (const r of riders) { try { r(one); } catch (err) { log('[deliver] a landing ride threw — the park\'s copy leaves now:', err && err.message); one(); } }
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
  // lane jobs-addressed-push r4 — A PRODUCER RE-ASKS BEFORE ITS PARKED COPY IS DELIVERED (the retry park's twin of the stash
  // gates above): every road that delivers a parked entry reads the park through `retryEntries` (the prompt drain's view, the
  // stash hand-over) or `attemptRetry` (the turn end, the backoff timer) — each asks the entry's PRODUCER's judge first.
  // `false` ⇒ the entry is DROPPED: no post, no wake, no stash (its held authorization given back), said in the log and to the
  // producer ('dropped'). A judge that throws withholds (fail closed, like a stash gate). A producer that registered no judge
  // is owed exactly as before; an in-flight or claimed entry is never judged (its post / hand-over tracks it).
  const retryJudges = new Map();   // producer → (cid, entry) => boolean
  function registerRetryJudge(producer, fn) { if (!producer || typeof fn !== 'function') return () => {}; retryJudges.set(producer, fn); return () => { if (retryJudges.get(producer) === fn) retryJudges.delete(producer); }; }
  function judgeRetries(cid) {
    const q = retry[cid];
    if (!q || !q.length || !retryJudges.size) return;
    const dropped = [];
    for (const e of q.slice()) {
      if (!e || e.inflight || e.ho || aside(e)) continue;   // B-f276 1a: a held wake is not judged (its producer's file is held)
      const fn = retryJudges.get(e.producer);
      if (!fn) continue;
      let owed = false, threw = false;
      try { owed = fn(cid, e) !== false; } catch (err) { log(`[deliver] ${cid}: the ${e.producer} retry judge threw — ${e.id} is withheld:`, err && err.message); owed = false; threw = true; }
      if (owed) continue;
      releaseHoldOf(e); removeRetry(e); handing.add(e); dropped.push(threw ? Object.assign(e, { _judgeThrew: true }) : e);
    }
    if (!dropped.length) return;
    log(`[deliver] ${cid}: ${dropped.length} parked entr${dropped.length === 1 ? 'y is' : 'ies are'} no longer owed (its producer's judge) — dropped: no post, no wake, no stash (${dropped.map((e) => `${e.producer} ${e.id}`).join('; ')})`);
    // the moved2 cure 2's hunt (3): a judge that HELD a copy as a line of its own store (the jobs store's `unknown`) — the park's
    // copy leaves the file only on that store's landing; the others leave now. B-54b7 (主开发 r576): EACH taken entry leaves at ITS OWN
    // taker's landing, as the fall road's one (a batch's one shared countdown kept every copy of it in the file until its last rider ran:
    // a cap's eviction freed nothing, and a boot during a hold grew the park); the untaken leave in one write
    // its re-read's should 2: a taken entry's leave writes the file ONCE for every entry of the batch that leaves in the same pass (a
    // landing runs its steps together: thirty whole-file writes in a row on the main thread was the cost) — a late leave keeps a copy the
    // jobs store already holds, never neither (its id is known on disk)
    const leaveNow = [];
    let writeOwed = false;
    const leaveOne = (e, riders) => {
      let left = riders.length;
      const one = () => { if (--left > 0) return; handing.delete(e); if (writeOwed) return; writeOwed = true; queueMicrotask(() => { writeOwed = false; writeRetryNow(); }); };
      for (const r of riders) { try { r(one); } catch (err) { log('[deliver] a landing ride threw — the park\'s copy leaves now:', err && err.message); one(); } }
    };
    for (const e of dropped) { const threw = !!e._judgeThrew; delete e._judgeThrew; const riders = []; emitRetry('dropped', cid, e, { attempts: e.attempts.length, ...(threw ? { threw: true } : {}) }, riders); if (riders.length) leaveOne(e, riders); else leaveNow.push(e); }   // r5: a judge that threw is said as such
    if (leaveNow.length) leaveParkWhenLanded(leaveNow, []);
    stashChanged(cid);
  }
  /** how many parked notices a conversation's next hand-over would carry — a COUNT, never judged (the ended row's fact reads it on a GET) */
  function retryWaitingCount(cid) { return (retry[cid] || []).filter((e) => e && !isEnded(e) && !e.inflight && !e.maybeDelivered && !isOwed(e) && !e.ho).length; }
  function retryEntries(cid) {
    judgeRetries(cid);
    return (retry[cid] || []).filter((e) => e && !isEnded(e) && !e.inflight && !e.maybeDelivered && !isOwed(e)).map((e) => ({ source: 'retry', kind: e.kind, fromName: e.fromName || null, text: e.text, ts: e.firstAt, held: { kind: 'retrying', nextAt: e.nextAt, attempts: e.attempts.length, phase: (e.attempts[e.attempts.length - 1] || {}).phase || null, busy: (e.attempts[e.attempts.length - 1] || {}).busy ?? null, producer: e.producer || null, meta: e.meta || null }, ho: e.ho || undefined, _retry: e }));
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
      if (!e.ho && !e.waitsReadopt && !e.waitsLift && Number(e.nextAt) < due) due = Number(e.nextAt);   // a wake waiting for the re-adoption arms no timer
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
    for (const [cid, q] of Object.entries(retry)) if (q.some((e) => e && !e.inflight && !e.ho && !e.waitsReadopt && !e.waitsLift && Number(e.nextAt) <= now)) due.push(cid);
    const dueOf = (cid) => (retry[cid] || []).filter((e) => e && !e.inflight && !e.ho && !e.waitsReadopt && !e.waitsLift && Number(e.nextAt) <= clock.now());
    for (const cid of due) {
      // B-f276 1a (the fourth read's must): a conversation whose due wakes are ALL held is asked by THE DOOR ALONE — never a whole attempt
      // dragging its other wakes in once a minute (their pace asked, rows, writes, events, a force come early); a wake the door lifts is
      // due at once and runs in this conversation's attempt, here
      const d = dueOf(cid);
      if (d.length && d.every(aside)) { asideHeld(cid); if (!dueOf(cid).some((e) => !aside(e))) continue; }
      await runAttempt(cid, 'timer');   // one frame per conversation: a due entry carries the not-yet-due ones along
    }
    // THE BELT (verify r1): an entry still due after its conversation's pass was not moved by anything above — it is
    // paced to the first step, never left to re-arm the timer at 0 ms (a hot loop is the one failure a park must not have)
    let belted = 0;
    for (const cid of due) for (const e of (retry[cid] || [])) if (e && !e.inflight && !e.ho && !e.waitsReadopt && !e.waitsLift && Number(e.nextAt) <= clock.now()) { e.nextAt = clock.now() + RETRY_STEPS_MS[0]; belted++; }
    if (belted) { writeRetryNow(); log(`[deliver] ${belted} parked entr${belted === 1 ? 'y was' : 'ies were'} still due after the sweep — paced to ${RETRY_STEPS_MS[0] / 1000} s (a sweep that moves nothing must not re-arm at once)`); }
    scheduleRetry();
  }
  /** `opts` = the ladder call's own (the relay of its caller's fromName / cardText / group / retry) */
  function parkRetry(cid, text, opts, { kind, spendReason, charged, attempt, waitsLift = null }) {
    const now = clock.now();
    rereadRetry();   // B-f276's remainder: a HELD park's file read again at the park's own road (no-op when it reads)
    const e = { id: `rt-${now.toString(36)}-${retryRun}-${++retrySeq}`, cid, text, fromName: opts.fromName || null, cardText: opts.cardText || null, kind, ...(opts.group ? { group: opts.group } : {}), spendReason, producer: (opts.retry && opts.retry.producer) || null, meta: (opts.retry && opts.retry.meta) || null,
      charged: charged ? { reason: charged.reason, identity: charged.identity ? { key: charged.identity.key, name: charged.identity.name || charged.identity.key } : null, hold: charged.hold || null, holdAt: now } : null,
      firstAt: now, attempts: [attempt], nextAt: now + RETRY_STEPS_MS[0], retries: 0, ...(waitsLift ? { waitsLift } : {}) };   // B-ef83 unit 1's cure: a held first try's mark rides the write that parks it
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
    if (waiting().length > RETRY_CAP) asideHeld(cid);   // B-f276 1a (the read's must 1): the door first — a held wake is never the cap's victim (fellRetry would fall it over its producer's held file)
    for (let victim; waiting().length > RETRY_CAP && (victim = waiting().find((x) => !x.waitsHeld));) {   // B-ef83 unit 1's cure (r4410 MUST 2): a wake waiting on the gate's lift is the cap's as at the release — only a producer-held wake (waitsHeld) is never its victim
      log(`[deliver] ${cid}: the retry park holds ${RETRY_CAP} waiting per conversation — ${victim.id} (the oldest waiting, parked ${Math.round((now - Number(victim.firstAt || now)) / 1000)} s ago${(retry[cid] || []).length - waiting().length ? `; ${(retry[cid] || []).length - waiting().length} more on the wire, claimed or leaving`: ''}) falls to the stash, evicted`);
      fellRetry(victim, 'not-reachable', `the retry park holds ${RETRY_CAP} per conversation — the oldest falls to the stash`, { evicted: true });
    }
    return e;
  }
  /** PARK A WAKE THE PACE REFUSED → {parked, id, retryAt, retryInMs, merged} | null (shutting down: nothing will retry it).
   *  ONE entry per (producer, key): a second paced wake moves the same entry — two paced wakes = ONE frame, one wake. */
  function parkOwedWake(cid, { producer, key, retryInMs, spendReason = 'peer-message', kind = 'peer', fromName = null, sender = null, reason = 'paced', text = 'A wake VibeSpace held for the pace', meta = null, merge = null } = {}) {
    if (!cid || !producer) return null;   // shutting down parks too: the file holds the debt, the next boot fires it (scheduleRetry arms nothing while closed)
    rereadRetry();   // B-f276's remainder: a HELD park's file read again at the park's own road (no-op when it reads)
    // THE ONE GATE, in the door every park goes through (acceptance r6, P22, measured: the receipt road parked with no gate, so a live agy drafter was promised «sends it in N s» and was then called «not running»): a wake that could not fire is never parked, and the answer says why
    const blocked = wakeBlock(cid);
    if (blocked) { log(`[deliver] ${cid}: a paced wake is not parked, it could not fire (${blocked.cause}): ${blocked.why}`); return { parked: false, blocked }; }
    const now = clock.now();
    const at = now + Math.max(OWED_MIN_WAIT_MS, Number(retryInMs) || 0);
    const same = (retry[cid] || []).find((x) => isOwed(x) && x.producer === producer && x.key === key && !x.inflight && !x.ho && !x.maybeDelivered);   // one on the wire already carries the older words: this wake is its own
    if (same) {
      same.meta = typeof merge === 'function' ? merge(same.meta, meta) : meta;
      if (sender && !same.senders.includes(sender)) same.senders.push(sender);
      same.nextAt = Math.min(Number(same.nextAt) || at, at);
      writeRetryNow();
      scheduleRetry();
      return { parked: true, id: same.id, retryAt: same.nextAt, retryInMs: Math.max(0, same.nextAt - now), merged: true };
    }
    const e = { id: `rt-${now.toString(36)}-${retryRun}-${++retrySeq}`, cid, text, fromName, cardText: null, kind, spendReason, producer, key, meta, senders: sender ? [sender] : [], held: { why: 'paced', reason: String(reason).slice(0, 200) }, charged: null, firstAt: now, attempts: [{ at: now, reason: String(reason).slice(0, 200), phase: 'pace', busy: null, late: 0, why: 'first' }], nextAt: at, retries: 0 };
    retryQueue(cid).push(e);
    writeRetryNow();
    scheduleRetry();
    stashChanged(cid);
    emitRetry('parked', cid, e, { nextAt: e.nextAt, phase: 'pace', busy: null, late: 0 });
    log(`[deliver] ${cid}: a wake the pace refused is parked for the window's end (${e.id}, sent in ${Math.ceil((at - now) / 1000)} s): ${String(reason).slice(0, 200)}`);
    const waiting = () => (retry[cid] || []).filter((x) => x && !x.inflight && !x.ho && !x.maybeDelivered);
    if (waiting().length > RETRY_CAP) asideHeld(cid);   // B-f276 1a: the door first — the oldest NOT held falls; held wakes are bounded by their own key (one per producer and key)
    for (let victim; waiting().length > RETRY_CAP && (victim = waiting().find((x) => !x.waitsHeld));) fellRetry(victim, 'not-reachable', `the retry park holds ${RETRY_CAP} per conversation — the oldest falls to the stash`, { evicted: true });
    return { parked: true, id: e.id, retryAt: e.nextAt, retryInMs: at - now, merged: false };
  }
  /** A FALL THE PRODUCER FOUND OUTSIDE THE PARK'S OWN ATTEMPT (a marker moved past a record no report carried, acceptance r6, P24): the same door, so the same words reach the sender.
   *  (B-f276 1a: it is the producer's own reading of its own store — a producer that says held never calls it; a held mark does not stop it) */
  function fellOwed(cid, e, reason, detail = {}) {
    if (e && !e.inflight && isOwed(e) && retry[cid] && retry[cid].includes(e)) { fellRetry(e, 'not-reachable', reason, detail); stashChanged(cid); scheduleRetry(); }
  }
  // B-f276 1a (主开发 r596): THE PRODUCER SAYS «HELD» — `hooks.held(cid, entry)` (optional, one hook at the registration): true = the
  // producer's own file is held, so whether the wake still reaches anyone cannot be judged. ONE DOOR asks it (shape B — the fresh read
  // of shape A found a check on each road missed three roads and broke the cap's loop): `asideHeld(cid)` runs FIRST in every attempt
  // and in both park caps, for every owed wake and every wake owed to an ENDED conversation (each producer it carries). A held wake is
  // SET ASIDE — one mark, `waitsHeld {since, why, by, kept}`, on disk — and every road passes over a marked entry (`aside`): no fall (not
  // running, no inbox, may have landed, the bound, the cap), no judge, no force, no render, no post, no resume. While held it is asked
  // again every HELD_STEP_MS by the door alone, in memory only (no write, no attempt row, no event); at the lift its bound clock is moved
  // by the hold (`liftHeld`) and it goes at once. A held() that throws is unknown = held. fellRetry is never asked to refuse:
  // what it is handed it falls (its callers' contract). What waits is bounded by its own key: one owed wake per (producer, key), one
  // ended wake per conversation (the parks merge them).
  const HELD_STEP_MS = 60_000;
  const aside = (x) => !!(x && (x.waitsHeld || x.waitsLift));   // B-ef83 unit 1: a wake owed to the gate's lift is passed over the same way
  // B-ef83 unit 1 (主开发 r4320 / r4323): A WAKE THE GATE COULD NOT JUDGE IS KEPT, never felled. A park entry (a parked frame, a paced wake,
  // an ended conversation's owed wake) — and a first try's wake for a caller that parks (`opts.retry`) — whose spend ask was refused ONLY
  // because the gate could not judge (src/spend-authorizer.js HELD_WHYS: the ledger's lock kept by another process — a restart's seconds —
  // or unwritable / unreadable, the ledger or the settings unread) is MARKED `waitsLift {why, since}` on disk and passed over by every road
  // (no attempt, no bound, no fall, no timer — as a wake waiting for the re-adoption). It is asked ONCE at the lift of the hold that
  // refused it (spend-guard onGateFree), through its OWN road: the pace and the caps as any attempt — a cap then refuses it AS A CAP (it
  // falls, never owed again); refused held again (another hold of the family stands) it is owed to that hold's lift. Its words stay where
  // they are; a turn that carries them ends the entry by the park's own roads (never a wake for words that rode a turn). A boot asks a
  // mark the last process left ONCE (adoptRetryDoc). A person's press never reaches this road (an attended verdict is never held).
  const SA = require('../spend-authorizer.js');
  function waitLift(entries, why, at = clock.now()) {
    const marked = (entries || []).filter((e) => e && retry[e.cid] && retry[e.cid].includes(e));
    if (!marked.length) return 0;
    for (const e of marked) { e.waitsLift = { why: String(why), since: at }; delete e.inflight; }
    writeRetryNow();
    return saidLift(marked, why, at);
  }
  /** the saying of a mark (law h) — its event, its journal line, the senders' notice — with NO write (the mark is already on disk) */
  function saidLift(marked, why, at = clock.now()) {
    if (!marked.length) return 0;
    // law (h): the senders of a kept owed wake are told the TRUTH at the refusal — not woken yet, held, asked again at the lift — where
    // today's words told them it fell (the fall's notice road: their own stash, read on their next turn)
    for (const e of marked) for (const to of (isOwed(e) && Array.isArray(e.senders) ? e.senders : []).filter((x) => x && localSessionFor(x))) {
      const name = (e.meta && (e.meta.name || e.meta.memberName)) || e.fromName || null;
      try { stashFor(to, { source: 'agent', kind: 'notification', fromName: FROM_NAME, text: `${name ? `Your wake of ${name}` : 'A wake you asked for'} is not sent yet: the spend gate could not judge just now (${why} — its record of turns nobody typed is held, a restart's seconds or another VibeSpace process). It is asked again once, by itself, when that hold lifts. The message is in the group and reaches them on their next turn (free).`, ts: at, held: { kind: 'spend-cap', why: String(why), lift: true } }); } catch (err) { log(`[deliver] the held notice could not reach ${String(to).slice(0, 8)}: ${err && err.message}`); }
    }
    for (const e of marked) emitRetry('held', e.cid, e, { why: String(why), lift: true, attempts: Array.isArray(e.attempts) ? e.attempts.length : 0 });
    log(`[deliver] ${marked[0].cid}: ${marked.map((e) => e.id).join(', ')} not woken yet — the spend gate could not judge (${why}); kept, asked again ONCE when that hold lifts`);
    stashChanged(marked[0].cid);
    scheduleRetry();
    return marked.length;
  }
  /** the lift of a hold of the family: every wake owed to THAT hold is due now, ONCE (its own road asks the gate again) */
  function gateLifted({ whys = [], at = clock.now() } = {}) {
    if (retryClosed) return 0;   // a closed park (a stopping hub) answers no lift: the next start's own road asks what it left
    let n = 0;
    for (const q of Object.values(retry)) for (const e of q) {
      if (!e || !e.waitsLift || !whys.includes(e.waitsLift.why)) continue;
      // the bound clock moved by the hold, as a producer's hold is (liftHeld): the time the gate could not judge never fells it at its lift
      const span = Math.max(0, at - Math.max(Number(e.waitsLift.since) || at, parkBootAt));
      e.firstAt = Math.max(Number(e.firstAt || at), parkBootAt) + span;
      if (Number(e.boundFrom) > 0) e.boundFrom = Number(e.boundFrom) + span;
      delete e.waitsLift; e.nextAt = clock.now(); n++;
    }
    if (!n) return 0;
    writeRetryNow();
    log(`[deliver] the spend gate's hold lifted (${whys.join(', ')}) — ${n} wake${n === 1 ? '' : 's'} owed to it asked again, each once, by its own road`);
    scheduleRetry();
    return n;
  }
  const offGateFree = require('./spend-guard.js').onGateFree(gateLifted);   // r4410 (g): its off handle, taken at the park's close
  const producersOf = (e) => (isEnded(e) ? (Array.isArray(e.producers) ? e.producers : [e.producer]) : isOwed(e) ? [e.producer] : []).filter(Boolean);
  /** → {why, by} (by = the producer that said held) | null */
  function heldWhy(e) {
    // round wozyl97qk MUST 1: THE STASH ITSELF HELD (its file could not be read) — a wake that meets it STAYS OWED (set aside, as a kept one is):
    // its hand-over would be refused (msg_stash_unread) and the wake ended «failed» for good; it goes at the lift (the lift arms the park)
    if (isEnded(e) && isHeld()) return { why: 'the messages waiting for conversations could not be read now (their file is held)', by: null, stash: true };   // r3326: ENDED wakes only (a live one posts to its inbox, no claim)
    const ps = producersOf(e);
    let first = null, every = ps.length > 0;
    for (const p of ps) {
      const h = owedProducers.get(p);
      let said = null;
      if (h && typeof h.held === 'function') {
        let v = false;
        try { v = h.held(e.cid, e); } catch { said = { why: `its producer «${p}» could not say whether it can judge it (its held() threw) — unknown is held`, by: p }; }
        // a held() is SYNC: `true` = held; a PROMISE (an async hook) answers nothing now — unknown is held, said by name (never «held for ever» unsaid)
        if (!said && v && typeof v.then === 'function') { try { v.then(null, () => { }); } catch { } said = { why: `its producer «${p}» answered held() with a promise (it must answer at once) — unknown is held`, by: p }; }
        else if (!said && v === true) said = { why: `its producer «${p}» cannot judge it now (its file is held)`, by: p };
      }
      if (said) { if (!first) first = said; } else every = false;
    }
    // B-f276 1b (主开发 r809 (1)): a wake owed to an ENDED conversation MERGES its producers — it waits only when EVERY one of them says
    // held: one producer's hold never stops another's delivery (B's job result resumes the conversation while A is held; A's kept
    // entries do not go out anyway, and A's words in its own store are read only when it can)
    if (first && (!isEnded(e) || every)) return first;
    // THE PACE'S OWN FILE (registerWakePacer's `held`): an owed wake is paced by it — while it cannot be read, no pace is asked, no force
    if (isOwed(e) && wakePacer && typeof wakePacer.held === 'function') {
      let v = false;
      try { v = !!wakePacer.held(e.cid, e); } catch { v = true; }
      if (v) return { why: 'its wake pace cannot be read now (its file is held)', by: null, pace: true };
    }
    // the line found nothing but KEPT entries for an ended wake (`kept`): it waits while the stash still keeps one
    if (e.waitsHeld && e.waitsHeld.kept && stashKeptCount(e.cid) > 0) return { why: e.waitsHeld.why, by: null };
    return null;
  }
  /** the deliverer's answer for one wake, asked by the resume line's start just before its claim (src/server/delivery-wake.js) */
  function heldWhyOf(e) { const h = e && typeof e === 'object' ? heldWhy(e) : null; return h ? h.why : null; }
  /** the ONE writer of the mark → true when it was set now (the caller writes the file once) */
  function setAside(e, why, at = clock.now(), extra = {}) {
    e.nextAt = at + HELD_STEP_MS;
    if (e.waitsHeld) return false;
    e.waitsHeld = { since: at, why: String(why || 'held').slice(0, 200), ...extra };
    return true;
  }
  /** the ONE lift: the bound clock (owedEnd counts from max(firstAt, the boot)) moves by the hold since max(since, the boot); an ENDED
   *  wake's hour counts from firstAt alone, so one lifted after a restart starts a fresh hour — it goes to the line at once anyway */
  function liftHeld(e, at = clock.now()) {
    e.firstAt = Math.max(Number(e.firstAt || at), parkBootAt) + Math.max(0, at - Math.max(Number(e.waitsHeld && e.waitsHeld.since) || at, parkBootAt));
    delete e.waitsHeld;
    e.nextAt = at;
  }
  function asideHeld(cid) {
    const q = retry[cid];
    if (!Array.isArray(q) || !q.length) return 0;
    const at = clock.now();
    const marked = [], lifted = [];
    for (const e of q) {
      if (!e || e.inflight || e.ho || !(isOwed(e) || isEnded(e))) continue;
      const h = heldWhy(e);
      if (h) { if (setAside(e, h.why, at, h.by ? { by: h.by } : h.pace ? { pace: true } : h.stash ? { stash: true } : {})) marked.push(e); continue; }
      if (!e.waitsHeld) continue;
      // the producer that said held is not registered yet (the boot's window): unknown is held — the mark stays until it registers
      // B-f276 1c (主开发 r809 (2)): a mark the PACE said (its file held) stays until the pacer registers — unknown is held, never a wake
      // posted unpaced in the boot's window (the same hour bound as a producer's)
      if ((e.waitsHeld.by && !owedProducers.has(e.waitsHeld.by)) || (e.waitsHeld.pace && typeof wakePacer !== 'function')) {
        if (at - parkBootAt <= RETRY_MAX_MS) { e.nextAt = at + HELD_STEP_MS; continue; }
        delete e.waitsHeld; e.nextAt = at; lifted.push(e); continue;   // past the boot's hour: the mark gives way, its bound clock not moved — the unready road says it
      }
      liftHeld(e, at);   // a hold across a restart: the boot rebased the bound already — only the hold since it is credited
      lifted.push(e);
    }
    if (!marked.length && !lifted.length) return 0;
    writeRetryNow();
    if (lifted.length) scheduleRetry();   // a lifted wake goes at once, whichever road asked the door
    if (marked.length) log(`[deliver] ${cid}: ${marked.length} wake${marked.length === 1 ? '' : 's'} set aside, held — ${marked[0].waitsHeld.why} (${marked.map((e) => e.id).join(', ')}): no fall, no post, asked again every ${HELD_STEP_MS / 1000} s`);
    if (lifted.length) log(`[deliver] ${cid}: ${lifted.length} held wake${lifted.length === 1 ? '' : 's'} can be judged again (${lifted.map((e) => e.id).join(', ')}) — on their way, the bound moved by the hold`);
    stashChanged(cid);
    return marked.length + lifted.length;
  }
  function registerOwedWake(producer, hooks) { if (producer && hooks && typeof hooks.render === 'function') { owedProducers.set(producer, hooks); scheduleRetry(); } }
  /** `fn.held(cid, entry)` (optional, B-f276 1a): true = the pace's own file is held — the ONE door sets every owed wake aside (no pace, no force) */
  function registerWakePacer(fn) { if (typeof fn === 'function') { wakePacer = fn; scheduleRetry(); } }
  // ── THE WAKE OWED TO AN ENDED CONVERSATION (piece 7; see isEnded) ──────────────────────────────────────────────────────
  let endedHook = null;   // (cid, entry) → Promise<{outcome: 'delivered' | 'refused' | 'failed', why?, code?, until?}> — the hub's resume line (server.js)
  /** The hub wires its ONE LINE here; an entry parked before it (the boot) waits for it. */
  function registerEndedWake(fn) { if (typeof fn === 'function') { endedHook = fn; scheduleRetry(); } }
  /** the stores chain's two roads (主开发 02:59Z): the boot's re-adoption of the machines' left-running conversations SETTLED (the wiring's
   *  adoptedRemote) — every wake that waited for it runs now, ONCE (a later refusal is that attempt's own answer) */
  let readoptDone = false;
  function readoptSettled() { readoptDone = true; let n = 0; for (const q of Object.values(retry)) for (const e of q) if (e && e.waitsReadopt) { delete e.waitsReadopt; e.nextAt = clock.now(); n++; } if (n) { log(`[deliver] the re-adoption settled — ${n} wake(s) that waited for it go now`); writeRetryNow(); scheduleRetry(); } return n; }
  /** The owed wakes of a conversation (COPIES): the row's «not resumed» line reads the last answer off the producers, not here. */
  function endedEntries(cid) { return (retry[cid] || []).filter(isEnded).map((e) => ({ ...e })); }
  /** A producer whose delivery found the conversation ENDED, after it stashed the words (they are durable before this): the
   *  conversation is owed ONE wake. The caller has asked the PURE src/delivery-wake.js `owesWake` (only an eligible delivery,
   *  never archived). A conversation that RUNS is never parked here (its own rungs carry the delivery). A second
   *  delivery while one is owed rides it (`deliveries` counts them; the hand-over carries every word waiting; `producers` names
   *  every producer that asked — a peer's wake keeps its words in the group log, so the hand-over may start the turn with no
   *  stash; `cardText` = the message that woke it, for that card). → {parked, id, merged?, live?} */
  function parkEndedWake(cid, { producer, spendReason, kind = 'notification', fromName = null, cardText = null, sender = null, reason = '', meta = null } = {}) {
    if (!cid || !producer || !spendReason) return { parked: false, why: 'no conversation, producer or reason' };
    rereadRetry();   // B-f276's remainder: a HELD park's file read again at the park's own road (no-op when it reads)
    if (hostsHeld() && !localSessionFor(cid) && ownerHostOf(cid)) return { parked: false, live: true, held: true };   // B-95fc U1: a held list makes only a REMOTE owner «unknown» — nothing parked for it (round w00h341sv: a conversation the index calls LOCAL is parked as before)
    if (liveForWake(cid)) return { parked: false, live: true };   // B-95fc U1: a remote conversation its machine said ended is not «live»
    const same = (retry[cid] || []).find(isEnded);
    // B-2566's remainder (r1277): a wake owed while its machine cannot be reached carries that on ITSELF (`away`, written with the
    // entry) — the hold stands from what is durable, read with the link's state, so a restart changes nothing
    const away = (() => { const u = unreachableOf(cid); return u ? { hostId: u.hostId, since: u.since, at: clock.now() } : null; })();
    if (same) {
      if (away && !same.away) same.away = away;
      if (sender && !same.senders.includes(sender)) same.senders.push(sender);
      same.producers = mergeProducers(same, { producer });
      if (meta) same.metas = [...metasOf(same), meta].slice(-ENDED_METAS);
      if (!same.cardText && cardText) { same.cardText = String(cardText).slice(0, 2000); same.fromName = fromName || same.fromName; }
      same.deliveries = (Number(same.deliveries) || 1) + 1;
      if (same.waitsHeld && same.waitsHeld.kept) { liftHeld(same); scheduleRetry(); }   // B-f276 1a: new words — the kept-only wait ends
      writeRetrySoon();
      log(`[deliver] ${cid}: another delivery for the ended conversation rides the wake it is already owed (${same.id}${same.inflight ? ', in the resume line' : ''})`);
      return { parked: true, id: same.id, merged: true, inLine: !!same.inflight };
    }
    const now = clock.now();
    const e = { id: `rt-${now.toString(36)}-${retryRun}-${++retrySeq}`, cid, text: null, fromName, cardText: cardText ? String(cardText).slice(0, 2000) : null, kind, spendReason, producer, producers: [producer], key: null, meta, metas: meta ? [meta] : [], senders: sender ? [sender] : [], held: { why: 'ended', reason: String(reason || '').slice(0, 200) }, charged: null, firstAt: now, nextAt: now, attempts: [], deliveries: 1 , ...(away ? { away } : {}) };
    retryQueue(cid).push(e);
    writeRetryNow();
    scheduleRetry();
    stashChanged(cid);
    emitRetry('wake-owed', cid, e, { producer, spendReason });
    log(`[deliver] ${cid}: ended — owed ONE wake (${e.id}, ${producer} under ${spendReason}): it goes to the resume line`);
    return { parked: true, id: e.id, merged: false };
  }
  /** every delivery's own facts an owed wake carries — each producer finds ITS deliveries in the answer (`wake`) whichever
   *  producer asked first (a job's result and a peer's wake ride one wake); the newest ENDED_METAS are kept */
  const ENDED_METAS = 50;
  const metasOf = (x) => (Array.isArray(x.metas) ? x.metas : x.meta ? [x.meta] : []);
  /** every producer an owed wake carries (an entry written before `producers` existed names its one `producer`) */
  function mergeProducers(a, b) { const out = Array.isArray(a.producers) ? [...a.producers] : a.producer ? [a.producer] : []; for (const p of (Array.isArray(b.producers) ? b.producers : [b.producer])) if (p && !out.includes(p)) out.push(p); return out; }
  /** The attempt's first rung: a conversation that runs again leaves its owed wake (the next turn carries the words); else the
   *  oldest owed entry goes to the line (twins merge into it — ONE wake per conversation), marked in flight while there. */
  function attemptEnded(cid) {
    const ends = (retry[cid] || []).filter((x) => isEnded(x) && !x.inflight && !x.ho && !x.waitsReadopt && !aside(x));   // a wake that waits for the re-adoption runs at its settle (readoptSettled); a held one (B-f276 1a) at the lift
    const waiting = (retry[cid] || []).filter((x) => isEnded(x) && !x.inflight && !x.ho && x.waitsReadopt && !aside(x));   // …unless it runs again first (a person resumed it): then that is its answer too
    if (!ends.length && !waiting.length) return;
    if (hostsHeld() && !localSessionFor(cid) && ownerHostOf(cid)) { for (const e of [...ends, ...waiting]) e.nextAt = clock.now() + 30e3; writeRetrySoon(); scheduleRetry(); return; }   // B-95fc U1: a held list ENDS NOTHING (bl-jobs: never «running» with nobody to carry it) — asked again after the read
    // B-2566's remainder — THE LAW (主开发 r1277): a wake held for a machine that did not reply ends «running» ONLY on that machine's
    // own word about THAT conversation (a delivery that landed there; its own answer: it runs ⇒ running, it ended ⇒ the resume line),
    // never on the link's word alone and never on the absence of a mark; the hold stands from the entry's own `away` (durable)
    const held = [...ends, ...waiting].filter((e) => e.away && e.away.hostId);
    if (held.length && !localSessionFor(cid)) { judgeAway(cid, held[0].away.hostId, [...ends, ...waiting]); return; }
    if (liveForWake(cid)) { for (const e of [...ends, ...waiting]) endEnded(e, { outcome: 'running', why: 'it runs again — its next turn carries the words' }); return; }
    if (!ends.length) return;
    if (!endedHook) return;   // the line is not wired yet (the boot): registerEndedWake schedules the attempt again
    const [e, ...twins] = ends;
    for (const t of twins) { for (const x of t.senders) if (!e.senders.includes(x)) e.senders.push(x); e.producers = mergeProducers(e, t); e.metas = [...metasOf(e), ...metasOf(t)].slice(-ENDED_METAS); if (!e.cardText && t.cardText) { e.cardText = t.cardText; e.fromName = t.fromName || e.fromName; } e.deliveries = (Number(e.deliveries) || 1) + (Number(t.deliveries) || 1); removeRetry(t); }
    e.inflight = clock.now();
    e.attempts.push({ at: e.inflight, reason: 'handed to the resume line', phase: 'line', busy: null, late: 0, why: 'ended' });
    writeRetryNow();
    let p;
    try { p = Promise.resolve(endedHook(cid, e)); } catch (err) { p = Promise.resolve({ outcome: 'failed', why: (err && err.message) || String(err) }); }
    const done = p.then((r) => r || { outcome: 'failed', why: 'the line gave no answer' }, (err) => ({ outcome: 'failed', why: (err && err.message) || String(err) }))
      .then((r) => {
        delete e.inflight;
        // LOOK AGAIN (主开发 12:46Z): the wake joined a resume already in the line (a key's) — its answer was no delivery's; the
        // next attempt finds it running (the words ride its next turn) or puts it on the line anew. Bounded: the third ends it.
        if (r && r.outcome === 'again' && (e.agains = (Number(e.agains) || 0) + 1) < 3) { e.nextAt = clock.now(); writeRetryNow(); scheduleRetry(); return; }
        // the stores chain's two roads (主开发 02:59Z): refused ONLY because the boot's re-adoption of the machines' left-running conversations has
        // not settled — the wake STAYS OWED (kept on disk, marked), runs ONCE at the settle (readoptSettled), never on a timer; the row says so
        // B-f276 1a: the line found NOTHING BUT KEPT entries (their reach cannot be judged now): the wake stays owed, set aside, and goes
        // when the stash keeps none (or a new delivery brings words) — never ended «nothing is waiting» over entries that wait
        if (r && r.outcome === 'held') { if (e.attempts.length && e.attempts[e.attempts.length - 1] && e.attempts[e.attempts.length - 1].phase === 'line') e.attempts.pop(); const hh = r.code === 'kept' ? null : heldWhy(e); setAside(e, r.why || 'every entry waiting for it is kept (its reach cannot be judged now)', clock.now(), r.code === 'kept' ? { kept: true } : hh && hh.by ? { by: hh.by } : hh && hh.stash ? { stash: true } : {}); endedAnswers.delete(e.cid); writeRetryNow();   /* no refusal: the row keeps «{n} notices are waiting for it» — true */ stashChanged(e.cid); scheduleRetry(); return; }
        if (r && r.outcome === 'refused' && r.code === 'spend' && SA.isHeldWhy(r.spendWhy)) { if (e.attempts.length && e.attempts[e.attempts.length - 1] && e.attempts[e.attempts.length - 1].phase === 'line') e.attempts.pop(); endedAnswers.set(e.cid, { outcome: 'waits', code: 'spend-held', why: r.why || null, until: null, at: clock.now() }); waitLift([e], r.spendWhy); return; }   // B-ef83 unit 1: kept, asked at the lift
        if (r && r.outcome === 'waits') { e.waitsReadopt = true; endedAnswers.set(e.cid, { outcome: 'waits', code: r.code || 'readopt-pending', why: r.why || null, until: null, at: clock.now() }); if (readoptDone) { delete e.waitsReadopt; e.nextAt = clock.now(); } writeRetryNow(); stashChanged(e.cid); scheduleRetry(); return; }
        endEnded(e, r && r.outcome === 'again' ? { outcome: 'failed', why: r.why } : r);
      });
    retryInFlight.add(done);
    done.finally(() => retryInFlight.delete(done));
  }
  /** ANY answer ends an owed wake (no timer retries — the design): said once in the log and to the producers (`wake`). */
  /** the LAST answer an owed wake got, per conversation, while it stays unresumed (the row's «— not resumed: {why}»; in memory:
   *  a boot forgets it, the next delivery asks again). A delivery or a running conversation clears it. */
  const endedAnswers = new Map();   // cid → {outcome, code, why, until, at}
  function endedAnswerOf(cid) { return endedAnswers.get(cid) || null; }
  /** THE POSTING MARK (主开发 14:26Z): the start is about to post the wake's hand-over — the entry is stamped durably, NOW, so a hard kill
   *  before its end leaves «maybe delivered» at the next boot, never a second resume. → true when the entry was marked. */
  function markEndedPosting(cid) {
    const e = (retry[cid] || []).find((x) => isEnded(x) && x.inflight);
    if (!e) return false;
    e.posting = clock.now();
    writeRetryNow();
    return true;
  }
  /** THE RECORD SAYS WHAT HAPPENED (piece 7, place-8 follow-up — 主开发 2026-11-20 04:50Z): a wake whose start answered AFTER the line's
   *  bound was ended here «failed»; its rest ran anyway and handed over or gave the claim back by name. Its own end is said once more on
   *  the same roads (the journal, the producers' `wake`, the ended row's answer): the last line a person reads is what happened.
   *  `e` = the owed entry the park handed to the line (its producers and metas). → true when said. */
  function noteLateWake(cid, e, r = {}) {
    if (!cid || !e || !r) return false;
    if (r.outcome === 'delivered' || r.outcome === 'running') noteSettledHeld(cid, r.outcome);   // line 529's small (r2795 (a)): a resume whose rest delivered AFTER the line's bound is a delivery for the record too
    if (r.outcome === 'refused' || r.outcome === 'failed') endedAnswers.set(cid, { outcome: r.outcome, code: r.code || null, why: r.why || null, until: r.until || null, at: clock.now() });
    else endedAnswers.delete(cid);
    log(`[deliver] ${cid}: the wake owed to the ended conversation (${e.id}) — its start answered after the line's bound, and then: ${r.outcome || 'ended'}${r.why ? ': ' + r.why : ''}`);
    emitRetry('wake', cid, e, { outcome: r.outcome || 'failed', why: r.why || null, code: r.code || null, until: r.until || null, sessionId: r.sessionId || null, attempts: Array.isArray(e.attempts) ? e.attempts.length : 0, late: true });
    stashChanged(cid);
    return true;
  }
  /** the conversation runs again (a turn started, a delivery landed): its last refusal is history — never an old one after a later end */
  function clearEndedAnswer(cid) { endedAnswers.delete(cid); }
  /** the conversations a stash entry waits for (the ladder's own stash) — the row's count reads these few, never every row */
  function stashCids() { return Object.keys(stash).filter((cid) => isConvName(cid) && Array.isArray(stash[cid]) && stash[cid].length > 0); }
  function endEnded(e, r = {}) {
    if (!retry[e.cid] || !retry[e.cid].includes(e)) return;
    noteSettledHeld(e.cid, r.outcome);   // line 494's follow (r2695 (1)) + line 529's small (r2795): the file's older wake for this conversation folds into this settle at the lift
    if (r.outcome === 'refused' || r.outcome === 'failed') endedAnswers.set(e.cid, { outcome: r.outcome, code: r.code || null, why: r.why || null, until: r.until || null, at: clock.now() });
    else endedAnswers.delete(e.cid);
    removeRetry(e);
    writeRetryNow();
    log(`[deliver] ${e.cid}: the wake owed to the ended conversation (${e.id}, ${Number(e.deliveries) || 1} deliver${(Number(e.deliveries) || 1) === 1 ? 'y' : 'ies'}) — ${r.outcome || 'ended'}${r.why ? ': ' + r.why : ''}`);
    emitRetry('wake', e.cid, e, { outcome: r.outcome || 'failed', why: r.why || null, code: r.code || null, until: r.until || null, sessionId: r.sessionId || null, attempts: e.attempts.length });
    stashChanged(e.cid);
    scheduleRetry();
  }
  /** the owed entries of a producer for a conversation (the SAME objects — `retryTake` takes them) */
  function owedEntries(cid, producer) { return (retry[cid] || []).filter((e) => isOwed(e) && e.producer === producer && !e.inflight); }
  /** THE HARD BOUND (the owner's rule): this entry's wake is due NOW, whatever the pace says */
  // …AND A BACKLOG THAT WAITED THROUGH DOWNTIME IS PACED OUT FROM THE BOOT (acceptance r2, P2, measured: a two-hour downtime made 11 owed wakes overdue at once, all forced in 5 ms, 11 stamps in a minute against the sender's 8; r3, P11, measured: rebasing only an hour that had ENDED left a cliff, a 59.5-min downtime still forced 3 within the minute): the hour counts from this boot, so after a restart the bound is never nearer than the pace needs
  const boundStart = (e) => Math.max(Number(e.firstAt || 0), parkBootAt, Number(e.boundFrom || 0));   // line 494's follow (r2695 (3)): an entry adopted at a held file's lift counts from the lift
  const owedEnd = (e) => boundStart(e) + RETRY_MAX_MS;
  const owedOverdue = (e) => clock.now() >= owedEnd(e) || (Number(e.paceRefusals) || 0) >= RETRY_MAX_ATTEMPTS;
  /** The pace, asked once per frame: the first sender it grants pays the frame's slot. Past the bound (`force`) it is not asked:
   *  the slot is stamped, so the ledger still counts the wake. → {ok, refund?} | {ok:false, retryInMs, reason} */
  function askOwedPace(cid, entries, { force = false } = {}) {
    if (typeof wakePacer !== 'function') return { ok: true };
    if (force) {
      for (const e of entries) for (const sender of Array.isArray(e.senders) ? e.senders : []) {
        try { const pacer = wakePacer(sender); if (pacer && typeof pacer.force === 'function') { const fr = pacer.force(cid); if (fr && typeof fr === 'object' && fr.ok === false) return { ok: false, forceRefused: true, retryInMs: Number(fr.retryInMs) > 0 ? Number(fr.retryInMs) : HELD_STEP_MS, reason: String(fr.why || fr.reason || 'no reason given') };   /* B-f276 1a (the read's must 2): a force the pacer REFUSES is no force */ return { ok: true, forced: true, refund: (o) => { try { if (pacer.refund) pacer.refund(cid, o); } catch { } } }; } }
        catch (err) { log('[deliver] the wake pace could not stamp a wake past its bound (it goes anyway):', err && err.message); }
      }
      return { ok: true, forced: true };
    }
    let wait = Infinity, reason = null, asked = 0;
    for (const e of entries) for (const sender of Array.isArray(e.senders) ? e.senders : []) {
      asked++;
      let pacer = null, v = null;
      try { pacer = wakePacer(sender); v = pacer ? pacer(cid) : true; }
      catch (err) { log('[deliver] the wake pace threw at a retry (held, the next attempt asks again):', err && err.message); v = { reason: `the wake pace failed (${(err && err.message) || err})`, retryInMs: RETRY_STEPS_MS[0] }; }
      if (v === true) return { ok: true, refund: (o) => { try { if (pacer && pacer.refund) pacer.refund(cid, o); } catch { } } };
      const w = Number(v && v.retryInMs);
      if (w > 0 && w < wait) wait = w;
      reason = (v && (v.rule || v.reason)) || reason;
    }
    if (!asked) return { ok: true };
    return { ok: false, retryInMs: Number.isFinite(wait) ? wait : RETRY_STEPS_MS[0], reason: reason || 'rate floor' };
  }
  const postAttempts = (e) => e.attempts.filter((a) => a && a.phase !== 'pace').length;
  /** an owed wake's next step on the backoff, never past its bound: the last attempt is AT the bound; 0 = the bound has passed */
  const owedStep = (e, st) => Math.min(st, Math.max(0, owedEnd(e) - clock.now()));
  const owedSpent = (e, st) => owedStep(e, st) <= 0 || postAttempts(e) >= RETRY_MAX_ATTEMPTS;
  /** ONE LINE PER SENDER (acceptance r4, P13, measured: 22 falls were 22 notices, and two real receipts fell off the sender's 30-entry stash cap: a stash is a person's attention, never a log sink). While a sender's notice waits unread, every later fall folds into it: the count, the reasons counted, the names. */
  // THE FOLD KEEPS EVERY FALL'S TRUTH CLASS (acceptance r5, P16, measured: «NOT sent … send again» about a frame that may have landed, the exact second billed turn P4 forbids): may-have-landed is its own count in its own words, and «send again» is said only when every folded fall is a sure miss
  const whoOf = (names, more) => names.join(', ') + (more ? ` +${more} more` : '');
  // …AND ONE FUNCTION WRITES EVERY LINE, the single fall and the fold (acceptance r6, P21, measured: a lone may-have-landed fall never reached the fold's words and still said «send again»): `fileOwedNotice` is the only caller, and a producer hands over facts, never a sentence
  const fallLabel = (c) => (LIVE_FALLS.includes(c) ? FALL_WHY[c] : c);
  function owedFallsText(f) {
    const may = Number(f.counts['may-have-landed']) || 0;
    const sure = f.n - may;
    const parts = [];
    const one = f.n === 1 ? f.one : null;
    if (one) {
      const who = one.name ? `Your wake of ${one.name}${one.where ? ` in ${one.where}` : ''}` : 'A wake you asked for';
      const said = one.said ? `: ${one.said}` : '';
      parts.push(may ? `${who} may have been woken already (${one.outcome})${said}. Waking them again may start a second turn.` : `${who} was NOT sent (${one.outcome})${said}.`);
      if (one.name) parts.push(`${one.reaches === false ? 'The message stays in the group, it will not reach them' : 'The message is in the group and reaches them on their next turn (free)'} — if a chain waits on them, check on it${may ? ' before you wake anyone again' : RESEND_HELPS.includes(one.outcome) ? ' or send again' : ''}.`);   // «send again» only where a second wake may land (r7 + r8's nits)
      return parts.join(' ');
    }
    if (sure) {
      const reasons = Object.entries(f.counts).filter(([c]) => c !== 'may-have-landed').map(([c, k]) => `${fallLabel(c)} ×${k}`).join(', ');
      const who = whoOf(f.names, f.more);
      parts.push(`${sure} of your wakes ${sure === 1 ? 'was' : 'were'} NOT sent (${reasons})${who ? `: ${who}` : ''}.`);
    }
    if (may) { const who = whoOf(f.mayNames, f.mayMore); parts.push(`${may} of your wakes may have been woken already (the server stopped while the wake was on its way)${who ? `: ${who}` : ''}. Waking them again may start a second turn.`); }
    if (f.newest) parts.push(f.commands.length > 1 ? `They came from ${f.commands.length} of your messages, the newest in ${f.newest}.` : `They came from your message in ${f.newest}.`);
    const fate = !f.noReach ? 'The messages are in their groups and reach them on their next turn (free)' : !f.reach ? 'The messages stay in their groups, they will not reach them' : `The messages are in their groups: ${f.reach} reach them on their next turn (free), ${f.noReach} will not reach them`;
    const helps = Object.keys(f.counts).filter((c) => c !== 'may-have-landed').some((c) => RESEND_HELPS.includes(c));
    parts.push(`${fate} — if a chain waits on them, check on it${may ? ' before you wake anyone again' : helps ? ' or send again' : ''}.`);
    return parts.join(' ');
  }
  function fileOwedNotice(to, n) {
    const open = (stash[to] || []).find((x) => x && !x.ho && x.held && x.held.owedFalls);
    const outcome = n.outcome || 'not-sent';
    const f = open ? open.held.owedFalls : { n: 0, counts: {}, names: [], more: 0, mayNames: [], mayMore: 0, commands: [], newest: null, reach: 0, noReach: 0, one: { name: n.name || null, where: n.where || null, said: n.said || null, outcome, reaches: n.reaches } };
    f.n++;
    f.counts[outcome] = (Number(f.counts[outcome]) || 0) + 1;
    const maybe = outcome === 'may-have-landed';
    const list = maybe ? f.mayNames : f.names;
    if (n.name && !list.includes(n.name)) { if (list.length < 5) list.push(n.name); else if (maybe) f.mayMore++; else f.more++; }
    if (n.reaches === false) f.noReach++; else f.reach++;
    if (n.command && !f.commands.includes(n.command)) { f.commands.push(n.command); if (f.commands.length > 32) f.commands.shift(); }
    if (n.where) f.newest = n.where;
    const text = owedFallsText(f);
    if (!open) {
      stashFor(to, { source: 'agent', kind: 'notification', fromName: FROM_NAME, text, ts: clock.now(), held: { kind: 'not-reachable', why: n.why || 'paced-out', owedFalls: f } });
      return;
    }
    open.held.why = 'paced-fell';
    open.text = text;
    writeStashNow();
    stashChanged(to);
  }
  /** ONE ENTRY PER (producer, key), ONE REPORT IN A FRAME (acceptance r3, P10, measured: a paced wake that arrived while its group's frame was on the wire made a second entry, as it must, the frame carries the older words; when that post missed, both survived and the next frame carried the same report twice). The older entry keeps its first miss, its hold and its attempts; the newer's record and senders fold into it. Runs at every attempt and after a frame that did not land. */
  function foldOwedTwins(cid) {
    const q = retry[cid];
    if (!Array.isArray(q)) return 0;
    const seen = new Map();
    let n = 0;
    for (const e of [...q]) {
      if (!isOwed(e) || unready(e) || e.inflight || e.ho || e.maybeDelivered || aside(e)) continue;
      const k = `${e.producer}|${e.key}`;
      const first = seen.get(k);
      if (!first) { seen.set(k, e); continue; }
      const h = owedProducers.get(e.producer);
      first.meta = h && typeof h.merge === 'function' ? h.merge(first.meta, e.meta) : e.meta;
      for (const s of Array.isArray(e.senders) ? e.senders : []) if (!first.senders.includes(s)) first.senders.push(s);
      first.nextAt = Math.min(Number(first.nextAt) || Infinity, Number(e.nextAt) || Infinity);
      releaseHoldOf(e);
      removeRetry(e);
      n++;
    }
    if (n) { writeRetryNow(); log(`[deliver] ${cid}: ${n} owed wake${n === 1 ? '' : 's'} folded into the entry of the same group (one entry, one report in a frame)`); }
    return n;
  }
  /** an owed wake that could not go this time (no inbox at this instant, its words unreadable, a hand-over carrying them): an attempt on the backoff, the last AT the bound, then a fall that is SAID — every owed entry is bounded, whatever stopped it */
  function owedMiss(entries, { reason, phase, why, kind = 'not-reachable' }) {
    const at = clock.now();
    const keep = [];
    let step = Infinity;
    for (const e of entries) {
      e.attempts.push({ at, reason: String(reason).slice(0, 200), phase, busy: null, late: 0, why });
      const st = RETRY_STEPS_MS[Math.min(Math.max(0, postAttempts(e) - 1), RETRY_STEPS_MS.length - 1)];
      if (owedSpent(e, st)) { fellRetry(e, kind, `${reason} (for ${Math.round((at - Number(e.firstAt || 0)) / 60000)} min)`, { expired: true }); continue; }
      step = Math.min(step, owedStep(e, st)); keep.push(e);
    }
    if (keep.length) rescheduleMany(keep, at + step, why);
  }
  /** THE CAUSE OF A FALL, read from the target's state AT the fall (acceptance r6, P23, measured: parked while reachable, its session then a terminal: every road kept `not-running` and the owner read «its conversation is not running» about a running one). fellRetry is the door of every road (park, attempt, peer miss), so this is the one place: a wake that fell for want of a lane is said as what the session is. A transient entry falls as it always did (law 4). */
  function fallCause(e, kind) { return isOwed(e) && kind === 'not-running' ? liveStateOf(e.cid) : null; }
  function fellRetry(e, kind, reason, detail = {}) {
    if (isEnded(e)) { endEnded(e, { outcome: 'dropped', why: reason, code: kind }); return; }   // piece 7: wordless — the stashes keep the words
    const state = fallCause(e, kind);
    if (state) { kind = state.cause; reason = state.why; }
    if (isOwed(e) && detail.expired) { reason = `paced-out — ${reason}`; detail = { ...detail, why: 'paced-out' }; }   // law 3: the schedule ran out on a wake the pace held
    releaseHoldOf(e);
    removeRetry(e); handing.add(e);   // the moved2 cure 2's hunt (2): its file copy leaves once its taker's store landed (below)
    const extra = { kind, reason, attempts: e.attempts.length, phase: (e.attempts[e.attempts.length - 1] || {}).phase || null, busy: (e.attempts[e.attempts.length - 1] || {}).busy ?? null, ...detail };
    log(`[deliver] ${e.cid}: ${e.id} falls to the stash after ${e.attempts.length} attempt${e.attempts.length === 1 ? '' : 's'} — ${kind}: ${reason}`);
    const riders = [];
    let taken = emitRetry('fell', e.cid, e, extra, riders);
    if (isOwed(e) && sayOwedFall(e, extra)) taken = true;
    if (!taken) { try { stashFor(e.cid, { source: 'agent', kind: e.kind, fromName: e.fromName || null, text: e.text, ts: e.firstAt, held: { kind: LIVE_FALLS.includes(kind) ? 'not-reachable' : kind, ...detail } }); } catch (err) { log('[deliver] the fallen entry could not be stashed:', err && err.message); } }
    leaveParkWhenLanded([e], riders);
    stashChanged(e.cid);
  }
  /** WHAT A FALL OF AN OWED WAKE SAYS, to whom (law 3): the producer's own store keeps the words (`taken`); each SENDER hears
   *  the fall on its next turn, free (this road's `not-reachable`, never a wake). One door for a whole fall (fellRetry) and
   *  for the part of an entry whose senders no frame carries (fellOwedPart). → taken */
  function sayOwedFall(e, extra) {
    let said = null;
    const h = owedProducers.get(e.producer);
    try { said = h && typeof h.fell === 'function' ? h.fell(e.cid, e, extra) : null; } catch (err) { log('[deliver] an owed wake\'s producer threw at its fall:', err && err.message); }
    // a producer that said nothing (none registered, or its `fell` threw): the park says it in its own words, to the live senders — law 3 is every owed entry's
    const outcome = owedOutcome(extra);
    const n = (said && said.notice) || (said ? null : { to: (Array.isArray(e.senders) ? e.senders : []).filter((s) => s && localSessionFor(s)), why: outcome === 'paced-out' ? outcome : `paced-${outcome}`, outcome, said: extra.reason });
    if (n) for (const to of Array.isArray(n.to) ? n.to : []) { try { fileOwedNotice(to, n); } catch (err) { log(`[deliver] the notice of a fallen wake could not reach ${String(to).slice(0, 8)}: ${err && err.message}`); } }
    return said === true || !!(said && said.taken === true);
  }
  /** THE SENDERS A FRAME WILL NOT CARRY (acceptance r8, F1, measured: one entry, two senders, the member's mode changed —
   *  the frame went for the other sender's @ and the plain line's sender, promised «sent in N s», heard nothing): their part
   *  of the entry falls, SAID, through the same door; the entry goes on for the rest. Their await rows are not this part's. */
  function fellOwedPart(cid, e, senders, reason, detail = {}) {
    const who = (Array.isArray(senders) ? senders : []).filter((s) => e && Array.isArray(e.senders) && e.senders.includes(s));
    if (!e || !isOwed(e) || !who.length || !(retry[cid] && retry[cid].includes(e))) return 0;
    e.senders = e.senders.filter((s) => !who.includes(s));
    writeRetryNow();
    const extra = { kind: 'not-reachable', reason, attempts: e.attempts.length, phase: 'render', busy: null, ...detail };
    log(`[deliver] ${cid}: ${e.id}: ${who.length} of its senders fall, the frame does not carry their messages — ${reason}`);
    sayOwedFall({ ...e, senders: who, meta: { ...(e.meta || {}), vids: [] } }, extra);
    return who.length;
  }
  /** THE FRAME of a batch: one entry goes out as its own original text (the SAME delivery); several go out as ONE
   *  frame in the hand-over's shape, bounded like a hand-over (`rest` stays parked for the next frame). */
  // THE OLDEST RIDE FIRST (verify r2, reproduced: 16 notices parked over an hour, the agent busy throughout — the frame
  // kept the NEWEST twelve under its 12 KiB and left the four oldest parked; 30 s later the next frame found the oldest
  // past the 60-min bound and dropped it to the stash: the one that waited longest was the one that never rode a
  // retry, and the agent read the newer first). The batch is in time order and the cut keeps its head; the rest follow
  // in the next frame after the floor, still in time order — never split, never dropped by the frame itself.
  function retryFrameOf(batch, wordsOf = (e) => e) {
    if (batch.length === 1) return { text: wordsOf(batch[0]).text, shown: batch, rest: [], body: null };
    const paced = batch.some(isOwed);
    const views = [...batch].sort((a, b) => (Number(a.firstAt) || 0) - (Number(b.firstAt) || 0)).map((e) => ({ source: 'agent', kind: wordsOf(e).kind, fromName: wordsOf(e).fromName || null, text: wordsOf(e).text, ts: e.firstAt, ...(isOwed(e) ? { whole: true } : {}), _retry: e }));   // an owed report is never cut to a line: its landing moves the markers (D1)
    let pm = null;
    if (typeof renderBatch === 'function') { try { pm = renderBatch(views, { maxEntries: RETRY_FRAME_MAX_ENTRIES, maxBytes: RETRY_FRAME_MAX_BYTES, keep: 'oldest', heading: paced ? RETRY_FRAME_PACED_HEADING : RETRY_FRAME_HEADING }); } catch (err) { log('[deliver] batch render failed (joining plainly):', err && err.message); pm = null; } }
    if (!pm || !Array.isArray(pm.shown) || !pm.shown.length) {
      const shownV = views.slice(0, RETRY_FRAME_MAX_ENTRIES);
      pm = { text: shownV.map((v) => `- ${v.fromName || 'VibeSpace'}: ${withoutNoticeHead(v.text)}`).join('\n'), shown: shownV, rest: views.slice(shownV.length) };
    }
    const shown = pm.shown.map((v) => v._retry);
    const rest = (pm.rest || []).map((v) => v._retry);
    const body = String(pm.text || '');
    if (paced) return { text: vibespaceNoticeText(`${shown.length} message(s) VibeSpace held for the wake pace:\n\n${body}`), shown, rest, body };
    return { text: vibespaceNoticeText(`${shown.length} notice(s) VibeSpace could not deliver earlier (the agent did not accept them at once):\n\n${body}`), shown, rest, body };
  }
  /** ONE attempt for a conversation: every parked entry of it (unclaimed, not in flight) in ONE frame. The pid first
   *  (gone ⇒ not-running at once), the floor, the money (an entry's held authorization still inside its TTL, else ONE
   *  fresh verdict for the frame — a refusal falls the frame's entries as a first attempt's would), then the post. */
  async function attemptRetry(cid, why) {
    if (retryClosed) return;   // shutting down: no new post leaves (the ones in flight are waited for)
    asideHeld(cid);   // B-f276 1a: THE DOOR, before any road — a held wake is set aside (every road below passes over it)
    judgeRetries(cid);   // lane jobs-addressed-push r4: the turn end's and the timer's attempt ask each entry's producer first
    attemptEnded(cid);   // piece 7: a wake owed to an ENDED conversation goes to the resume line (or leaves: it runs again)
    // a producer that never came up in a whole hour of this process: nothing here can send it — said, like every owed entry's end (D4)
    for (const e of (retry[cid] || []).filter((x) => x && !x.inflight && !x.ho && !aside(x) && unready(x) && clock.now() - boundStart(x) > RETRY_MAX_MS)) fellRetry(e, 'not-reachable', `nothing on this server can send it (its producer «${e.producer}» never came up)`, { expired: true });
    for (const e of (retry[cid] || []).filter((x) => x && x.maybeDelivered && !x.inflight && !x.ho && !aside(x) && !unready(x))) fellRetry(e, 'not-reachable', 'it was being posted when the previous server stopped — its frame may have landed, so it is not posted again', { maybeDelivered: true });
    // THE BOUND HOLDS AT EVERY ATTEMPT (verify r1 N5, reproduced: an entry two hours old at boot — a downtime — was posted and
    // billed): a parked entry past RETRY_MAX_MS from its first miss is not posted, at a boot, a late timer or a turn end
    // — but a wake WAITING for the re-adoption's settle (waitsReadopt) is outside the bound: it runs once at the settle, however long the store stays held
    repairClock();   // a future stamp never holds the bound off (verify r2)
    for (const e of (retry[cid] || []).filter((x) => x && !x.inflight && !x.ho && !aside(x) && !isOwed(x) && !x.waitsReadopt && clock.now() - Number(x.firstAt || 0) > RETRY_MAX_MS)) fellRetry(e, 'not-reachable', `the retry schedule's ${RETRY_MAX_MS / 60000} min bound passed ${Math.round((clock.now() - Number(e.firstAt || 0)) / 60000)} min after the first miss (${e.attempts.length} attempt${e.attempts.length === 1 ? '' : 's'})`, { expired: true });
    // the second judge: the attempts themselves (a turn end attempts regardless of the backoff; a clock that lies cannot run them for ever)
    for (const e of (retry[cid] || []).filter((x) => x && !x.inflight && !x.ho && !aside(x) && !isOwed(x) && x.attempts.length >= RETRY_MAX_ATTEMPTS)) fellRetry(e, 'not-reachable', `the agent did not accept the message in ${e.attempts.length} attempts (the schedule's ${RETRY_MAX_ATTEMPTS}-attempt bound) over ${Math.round((clock.now() - Number(e.firstAt || 0)) / 60000)} min`, { expired: true });
    foldOwedTwins(cid);
    let all = (retry[cid] || []).filter((e) => e && !isEnded(e) && !e.inflight && !e.ho && !aside(e) && !unready(e));
    if (!all.length) return;
    const now = clock.now();
    const peer = peerMsg.findPeer(cid);
    // an owed wake's target may live on another rung (a codex wrapper, another machine): the ladder itself carries that frame
    const ladderRoad = !peer && all.some(isOwed) && !!(findRpcPeer(cid) || ownerHostOf(cid));
    if (ladderRoad) { for (const e of all.filter((x) => !isOwed(x))) fellRetry(e, 'not-running', 'the conversation is no longer running (no live inbox on this machine)'); all = all.filter(isOwed); }
    else if (!peer) {
      // a LIVE session with no inbox at this instant (its CLI restarting) keeps an owed wake on the backoff, to the bound; a conversation that is gone, or whose harness takes no message mid-session, cannot be woken: said now
      const live = all.some(isOwed) ? liveWithoutLane(cid) : null;
      const stays = all.some(isOwed) && !live && !!localSessionFor(cid);
      for (const e of all) if (!(stays && isOwed(e))) fellRetry(e, 'not-running', (isOwed(e) && live) || 'the conversation is no longer running (no live inbox on this machine)');
      if (!stays) return;
      owedMiss(all.filter(isOwed), { reason: 'the conversation\'s session has no live inbox', phase: 'no-inbox', why, kind: 'not-running' });
      return;
    }
    const since = now - (lastPostAt.get(cid) || 0);
    if (since < RETRY_FLOOR_MS) { rescheduleMany(all, (lastPostAt.get(cid) || now) + RETRY_FLOOR_MS, 'floor'); return; }
    // THE WAKE OWED: its words are read NOW, from the producer's own store (null ⇒ nothing is owed any more: a turn's report
    // carried it — the retry is cancelled, no post, no charge); the producer's flight mark holds until this attempt settled
    const words = new Map();
    try {
      for (const e of all.filter(isOwed)) {
        let w = null, threw = null;
        try { w = owedProducers.get(e.producer).render(cid, e); } catch (err) { threw = err; log(`[deliver] ${cid}: ${e.id}: the words of an owed wake could not be read (${err && err.message}) — on the backoff, to its bound`); }
        if (threw) { owedMiss([e], { reason: `its words could not be read: ${threw.message || threw}`, phase: 'render', why }); continue; }
        if (!w) retryTake(cid, [e], { via: 'prompt' });
        else if (w.fall) fellRetry(e, 'not-reachable', w.fall, w.fallDetail || {});
        else if (w.wait) owedMiss([e], { reason: w.wait, phase: 'wait', why });   // B-f276 1a: a producer's HOLD is said by its held() hook alone (the door above), never by a render's answer
        else words.set(e, w);
      }
      all = all.filter((e) => !isOwed(e) || words.has(e));
      if (!all.length) return;
      const wordsOf = (e) => words.get(e) || e;
      // THE PACE RE-JUDGES A FRAME THAT WOULD OPEN A TURN ON THE OWED WAKES ALONE (a transient entry's frame is going anyway: they ride it, free)
      let grant = null;
      if (all.every(isOwed)) {
        const force = all.some(owedOverdue);
        const p = askOwedPace(cid, all, { force });
        if (!p.ok) {
          const at = clock.now();
          const wait = Math.max(OWED_MIN_WAIT_MS, Number(p.retryInMs) || 0);
          // B-f276 1a (the reads' must 2): A REFUSED FORCE IS NO FORCE, SAID ONCE — its first refusal is one attempt row, one write, one
          // event and one line; while the pacer keeps refusing (its own file held), the wake is asked again at the pacer's own time (never
          // past the longest step) in memory only: no row, no write, no event, no line, never clamped to the bound already passed, never a pace refusal
          if (p.forceRefused) {
            const first = all.filter((e) => !e.forceRefusedAt);
            const step = Math.min(wait, RETRY_STEPS_MS[RETRY_STEPS_MS.length - 1]);   // never past the longest step: repairClock pulls a later stamp back (a write and a «the clock went back» line each time)
            for (const e of all) e.nextAt = at + step;
            if (first.length) {
              for (const e of first) {
                e.forceRefusedAt = at;
                e.attempts.push({ at, reason: String(p.reason).slice(0, 200), phase: 'pace', busy: null, late: 0, why });
                if (e.attempts.length > RETRY_MAX_ATTEMPTS) { const i = e.attempts.findIndex((a, n) => n > 0 && a && a.phase === 'pace'); if (i > 0) e.attempts.splice(i, 1); }
              }
              writeRetryNow();
              stashChanged(cid);
              for (const e of first) emitRetry('attempt', e.cid, e, { why: 'paced', nextAt: e.nextAt, attempts: e.attempts.length });
              log(`[deliver] ${cid}: the frame of ${all.map((e) => e.id).join(', ')} (${all.filter(owedOverdue).length} past the hard bound) — the pacer refused the force (${String(p.reason).slice(0, 120)}): no post; asked again in ${Math.ceil(step / 1000)} s, said once`);
            }
            scheduleRetry();
            return;
          }
          let next = at + wait;
          for (const e of all) {
            e.attempts.push({ at, reason: String(p.reason).slice(0, 200), phase: 'pace', busy: null, late: 0, why });
            // the file stays bounded by trimming PACE rows only (acceptance r2, P6): `postAttempts` feeds the backoff and the post limit, so a trimmed post would reset the one and hold off the other
            if (e.attempts.length > RETRY_MAX_ATTEMPTS) { const i = e.attempts.findIndex((a, n) => n > 0 && a && a.phase === 'pace'); if (i > 0) e.attempts.splice(i, 1); }
            if (why === 'timer') e.paceRefusals = (Number(e.paceRefusals) || 0) + 1;   // a turn end's early look is no retry of the schedule
            next = Math.min(next, owedEnd(e));   // the last retry is AT the bound, and there the wake goes
          }
          rescheduleMany(all, next, 'paced');
          return;
        }
        for (const e of all) delete e.forceRefusedAt;   // B-f276 1a: a force granted ends the refusal's «said once»
        if (force) log(`[deliver] ${cid}: ${all.map((e) => e.id).join(', ')} reached the hard bound of a paced wake — it goes now, past the pace (the wake was asked for; only the spend gate may refuse it)`);
        grant = p;
      }
      const giveBack = (o) => { if (grant && grant.refund) { grant.refund(o); grant = null; } };
      const frame = retryFrameOf(all, wordsOf);
      // WHAT A FRAME DOES NOT CARRY IS FREE FOR THE TURN IT OPENS (acceptance r2, P1, measured: `rest` kept its producer's mark through the post, the woken turn's report found it marked and carried nothing — a second billed wake, 3 posts / 3 authorizations against 2 / 2): only what this frame carries sits out; the rest is released BEFORE the post, and a turn that carries it cancels its retry
      for (const e of frame.rest) { const w = words.get(e); if (w) { words.delete(e); try { if (typeof w.release === 'function') w.release(); } catch { } } }
    const shown = frame.shown;
    const settleOwed = async (lane) => { for (const e of shown) { const w = words.get(e); if (w && typeof w.landed === 'function') { try { await w.landed({ lane }); } catch (err) { log(`[deliver] ${cid}: ${e.id}: the producer could not book a landed wake: ${err && err.message}`); } } } };
    // THE LADDER'S ROAD: its own gate authorizes, its own rung posts + draws the card; a miss is an attempt on the backoff
    if (ladderRoad) {
      const one = shown.length === 1 ? wordsOf(shown[0]) : null;
      const ladderOpts = one ? { kind: one.kind, spendReason: shown[0].spendReason, fromName: one.fromName || null, cardText: one.cardText || null, ...(one.group ? { group: one.group } : {}), ...(one.channel ? { channel: one.channel } : {}) } : { kind: 'notification', spendReason: shown[0].spendReason, fromName: FROM_NAME, cardText: stashSummary.handoverCardText(shown.length, frame.body, { why: stashSummary.HELD_WHY.paced }) };
      for (const e of shown) e.inflight = now;
      writeRetryNow();
      let r;
      try { r = await deliverToConversation(cid, frame.text, ladderOpts); }
      catch (err) { r = { ok: false, reason: err.message }; }
      for (const e of shown) delete e.inflight;
      if (r && r.ok) {
        for (const e of shown) { e.retries = e.attempts.length; removeRetry(e); }
        writeRetryNow();
        log(`[deliver] ${cid}: ${shown.map((e) => e.id).join(', ')} delivered on retry (${why}, via the ladder's ${r.lane || 'lane'}; the wake the pace held)`);
        const at = clock.now();
        for (const e of shown) emitRetry('delivered', cid, e, { lane: r.lane || null, peerName: r.peerName || null, attempts: e.attempts.length + 1, why, deliveredAt: at, parkedFor: at - e.firstAt, via: 'message', ...(shown.length > 1 ? { frame: shown.length } : {}) });
        await settleOwed(r.lane || null);
        stashChanged(cid);
        scheduleRetry();
        return;
      }
      giveBack({ attempted: true });
      if (r && r.refused === 'spend' && SA.isHeldWhy(r.why)) { waitLift(shown, r.why); return; }   // B-ef83 unit 1: the gate could not judge — kept, asked at its lift
      if (r && r.refused === 'spend') { for (const e of shown) fellRetry(e, 'spend-cap', r.reason || 'spend budget', { why: r.why || undefined, identity: r.identity ? String(r.identity.name || r.identity.key) : undefined, cap: Number.isFinite(Number(r.cap)) && r.cap != null ? Number(r.cap) : undefined, retryAfter: Number(r.retryAfter) > 0 ? Number(r.retryAfter) : undefined, capUnset: r.capUnset === true ? true : undefined }); return; }   // B-0a33 (3)
      if (r && r.notRunning) { for (const e of shown) fellRetry(e, 'not-running', r.reason || 'the conversation is no longer running'); return; }
      const attempt = { at: now, reason: (r && r.reason) || 'unknown', phase: (r && r.phase) || null, busy: null, late: 0, why };
      let step = Infinity;
      const keep = frame.rest.filter((e) => retry[cid] && retry[cid].includes(e));   // a turn the post opened may have carried them already
      for (const e of shown) {
        e.attempts.push({ ...attempt });
        const st = RETRY_STEPS_MS[Math.min(Math.max(0, postAttempts(e) - 1), RETRY_STEPS_MS.length - 1)];
        if (owedSpent(e, st)) { fellRetry(e, 'not-reachable', `the agent did not accept the wake in ${postAttempts(e)} attempts over ${Math.round((clock.now() - e.firstAt) / 60000)} min`, { expired: true }); continue; }
        step = Math.min(step, owedStep(e, st)); keep.push(e);
      }
      foldOwedTwins(cid);
      if (keep.length) rescheduleMany(keep.filter((e) => retry[cid] && retry[cid].includes(e)), clock.now() + step, why);
      return;
    }
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
      catch (err) { log('[deliver] spend authorizer threw at a retry (refusing, the stash keeps the message):', err.message); giveBack({ attempted: true }); for (const e of shown) fellRetry(e, 'spend-cap', 'spend authorizer failed: ' + err.message); return; }   // FAIL CLOSED
      if (v && v.ok === false) {
        const cap = v.why === 'hour-cap' ? v.limits?.perIdentityHour : v.why === 'day-cap' ? v.limits?.perIdentityDay : v.why === 'instance-cap' ? v.limits?.perInstanceDay : null;
        giveBack({ attempted: true });
        if (SA.isHeldWhy(v.why)) { waitLift(shown, v.why); return; }   // B-ef83 unit 1: the gate could not judge — kept, asked at its lift
        for (const e of shown) fellRetry(e, 'spend-cap', `spend budget: ${v.detail || v.why}`, { why: v.why, identity: v.identity ? String(v.identity.name || v.identity.key) : undefined, cap: Number.isFinite(Number(cap)) ? Number(cap) : undefined, retryAfter: Number(v.retryAfter) > 0 ? Number(v.retryAfter) : undefined, capUnset: v.capUnset === true ? true : undefined });   // B-0a33 (3)
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
      if (shown.length === 1) { const one = wordsOf(shown[0]); try { emitPeerCard?.(cid, { fromName: one.fromName || null, text: one.cardText || one.text, recorded: frame.text, kind: one.kind, ...(one.group ? { group: one.group } : {}) }); } catch (err) { log('[deliver] card emit failed:', err.message); } }
      else {
        let body = frame.body;
        if (clearedMid.length) { try { body = retryFrameOf(shown, wordsOf).body; } catch { body = null; } }   // the same set, re-rendered from the words as they stand now
        const heldWhy = shown.some(isOwed) ? stashSummary.HELD_WHY.paced : stashSummary.HELD_WHY.retrying;
        try { emitPeerCard?.(cid, { fromName: FROM_NAME, text: stashSummary.handoverCardText(shown.length, body, { why: heldWhy }), recorded: frame.text, kind: 'notification' }); } catch (err) { log('[deliver] card emit failed:', err.message); }
      }
      if (clearedMid.length) log(`[deliver] ${cid}: ${clearedMid.map((e) => e.id).join(', ')} landed after a clear reached ${clearedMid.length === 1 ? 'it' : 'them'} mid-flight — the frame carried the words before the clear; the card draws the cleared sentence`);
      const ids = shown.map((e) => e.id).join(', ');
      log(`[deliver] ${cid}: ${ids} delivered on retry (${why}, ${shown.length === 1 ? `attempt ${shown[0].attempts.length + 1}` : `${shown.length} notices in ONE frame`}, phase ${r.phase || '?'}, ${Number(r.elapsedMs) || 0} ms, target mid-turn: ${busy === null ? 'unknown' : busy ? 'yes' : 'no'}${frame.rest.length ? `; ${frame.rest.length} more stay parked for the next frame` : ''})`);
      const at = clock.now();
      for (const e of shown) emitRetry('delivered', cid, e, { lane: 'message', peerName: peer.name || null, attempts: e.attempts.length + 1, why, deliveredAt: at, parkedFor: at - e.firstAt, via: 'message', ...(shown.length > 1 ? { frame: shown.length } : {}) });
      await settleOwed('message');
      stashChanged(cid);
      scheduleRetry();
      return;
    }
    undo();
    giveBack({ attempted: true });   // the wake did not go out: the pair's floor goes back, the attempt stays in the sender's minute (the pace's own rule)
    for (const e of shown) delete e.clearedInFlight;   // the frame did not land: the words before the clear reached nobody — the retry carries the sentence
    const attempt = { at: now, reason: (r && r.reason) || 'unknown', phase: (r && r.phase) || null, busy, late: Number(r && r.late) || 0, why };
    for (const e of shown) e.attempts.push({ ...attempt });
    log(`[deliver] ${cid}: ${shown.map((e) => e.id).join(', ')} retry (${why}${shown.length > 1 ? `, ${shown.length} in one frame` : ''}) failed: ${attempt.reason} (phase ${attempt.phase || '?'}, ${Number(r && r.elapsedMs) || 0} ms${attempt.late ? `, our loop was ${attempt.late} ms late` : ''}, target mid-turn: ${busy === null ? 'unknown' : busy ? 'yes' : 'no'})`);
    // an owed wake keeps its schedule while its session lives (a CLI restarting); a transient entry falls as it always did
    const gone = !(r && r.transient) || !peerMsg.findPeer(cid);
    const stays = gone && !!localSessionFor(cid) && !liveWithoutLane(cid);
    if (gone) { for (const e of shown) if (!(stays && isOwed(e))) fellRetry(e, 'not-running', attempt.reason); if (!stays || !shown.some(isOwed)) return; }
    // the bound is on the SCHEDULE: an entry whose next attempt would fall past RETRY_MAX_MS from its first miss is not
    // retried; the frame's survivors share ONE next instant (the most eager step among them — a failed frame costs nothing)
    let step = Infinity;
    const keep = frame.rest.filter((e) => retry[cid] && retry[cid].includes(e));   // the entries beyond the frame's bound wait with the frame: a failed frame moves EVERY entry, or the timer re-arms at 0 ms for ever (verify r1: reproduced as a hot loop); one a turn carried meanwhile is gone
    for (const e of shown) {
      if (gone && !isOwed(e)) continue;   // fell above
      const st0 = RETRY_STEPS_MS[Math.min(Math.max(0, postAttempts(e) - 1), RETRY_STEPS_MS.length - 1)];   // a pace refusal is no post: the backoff counts posts (a transient entry's attempts are all posts)
      const st = isOwed(e) ? owedStep(e, st0) : st0;   // an owed wake's last attempt is AT its bound
      if (isOwed(e) ? owedSpent(e, st0) : clock.now() + st - e.firstAt > RETRY_MAX_MS || e.attempts.length >= RETRY_MAX_ATTEMPTS) { fellRetry(e, 'not-reachable', `the agent did not accept the message in ${e.attempts.length} attempts over ${Math.round((clock.now() - e.firstAt) / 60000)} min${e.attempts.length >= RETRY_MAX_ATTEMPTS ? ` (the schedule's ${RETRY_MAX_ATTEMPTS}-attempt bound)` : ''}`, { expired: true }); continue; }
      step = Math.min(step, st); keep.push(e);
    }
    foldOwedTwins(cid);
    if (keep.length) rescheduleMany(keep.filter((e) => retry[cid] && retry[cid].includes(e)), clock.now() + step, why);
    } finally { for (const w of words.values()) { try { if (typeof w.release === 'function') w.release(); } catch { } } }
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
  function closeRetries() {
    retryClosed = true;
    try { offGateFree(); } catch { }   // B-ef83 unit 1's cure (r4410 (g)): a closed park hears no lift
    // line 494's follow (r2695 (2)): A STOP WHILE HELD — what was parked in memory is not written (the file is kept as it is): said, with its count
    if (retryHeld) { const n = Object.values(retry).reduce((a, q) => a + (Array.isArray(q) ? q.length : 0), 0); if (n) log(`[deliver] the retry park stops HELD (data/msg-retry.json could not be read): ${n} deliver${n === 1 ? 'y' : 'ies'} parked during the hold lived in memory only and ${n === 1 ? 'is' : 'are'} not written — the file is kept as it is`); }
    const flushedNow = !!retryWriteTimer, failedBefore = parkFailing ? parkFailing.n : 0;   // r5235 should: the stop's write is ONE write
    flushRetryWrite();
    // r5164 (2): a failing park's retry clock ends at the stop with ITS last write (closeRetries is reached after retryClosed: no timer after
    // it); a last write that fails is said by name — what memory alone held is lost with this stop
    if (parkRetryTimer) { clock.clearTimeout(parkRetryTimer); parkRetryTimer = null; }
    if (parkFailing && !retryHeld && (flushedNow ? parkFailing.n > failedBefore : !writeRetryNow())) { const n = Object.values(retry).reduce((a, q) => a + (Array.isArray(q) ? q.length : 0), 0); log(`[deliver] the retry park stops NOT on disk: its last write failed — ${n} parked entr${n === 1 ? 'y' : 'ies'} held in memory only ${n === 1 ? 'is' : 'are'} lost with this stop`); }
    if (parkTimer) { clock.clearTimeout(parkTimer); parkTimer = null; }
  }
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
    rereadRetry();   // B-f276's remainder: a HELD park's file read again at the park's own road (no-op when it reads)
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
    for (const e of mine) if (isOwed(e)) { const h = owedProducers.get(e.producer); try { if (h && typeof h.cancelled === 'function') h.cancelled(cid, e); } catch (err) { log('[deliver] an owed wake\'s producer threw at its cancel:', err && err.message); } }
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

  // THE REGISTRY'S VERDICT (lane peer-registry-identity): rung 1 asks for the record that passes the process-identity
  // check (src/peer-messaging.js lookupPeer) AND for why none did, so the journal can tell "stale registrations only" (a
  // pid reused after a reboot, a socket gone) from "not running". A stub with findPeer alone answers the plain lookup.
  function lookPeer(cid) {
    if (typeof peerMsg.lookupPeer === 'function') return peerMsg.lookupPeer(cid);
    return { peer: peerMsg.findPeer(cid), candidates: 0, stale: 0, why: '' };
  }
  const staleOnly = (look) => `stale registration(s) only — pid reused / socket absent (${look.why})`;

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

  // THE MISS SAYS WHICH (lane agy-peer-wake, 2026-10-24 — the owner's wake of a LIVE Antigravity conversation answered
  // «no live inbox … on any reachable machine», read everywhere as "not running"): a conversation that IS running here
  // with no live lane is said as running — its harness takes no message mid-session (a stash-only row), or its RUNNING
  // process predates the lane (a wrapper whose own sidecar adverts no peerMessage — an agy wrapper started before the
  // lane existed): only that one is cured by a restart. Off the caps row + the process's own advert, never a backend id;
  // a cli-inbox harness keeps the old words (no registration = its CLI is not there). null = say nothing new.
  // lane paced-wake-retry: the state and its cause, THE ONE READER (acceptance r6, P23): the gate and the fall both ask this
  function liveWithoutLane(cid) { const st = liveStateOf(cid); return st ? st.why : null; }
  function liveStateOf(cid) {
    const s = localSessionFor(cid);   // THE addressing predicate (verify r6) — this only asks how that session is reachable
    if (!s || s.host) return null;
    try {
      const lane = capsOf(s.backend).peerDelivery;
      if (lane === 'stash-only') return { cause: 'no-mid-session', why: "this conversation is running, but its agent takes no message mid-session" };
      if (lane !== 'rpc-queue' || !s.pty) return null;
      if (s.mode !== 'chat') return { cause: 'terminal', why: "this conversation is running in a terminal, where its agent takes no message mid-session" };
      let wid = null;
      for (const [w, x] of activeSessions) if (x === s) { wid = w; break; }
      const wc = wid ? wrapperCaps(path.join(dataDir, 'session-buffers'), wid, s.socketPath) : null;
      if (wc && wc.reason !== 'no-sidecar' && !wc.peerMessage) return { cause: 'predates', why: "this conversation is running, but its agent's process predates live messages — restart the session to receive them at once" };
    } catch { }
    return null;
  }

  // B-95fc U1 — A REMOTE CONVERSATION THAT ENDED, as its machine said (peer-state live:false): the park's «live» reads it, never
  // ownerHostOf's optimistic «reachable» alone. In memory, cid → {at, hostId}; an answer is good for REMOTE_ENDED_MS, a post that lands
  // there clears it. An OLDER agent (no peer-state in its hello) is never asked: its conversation keeps today's road (stashed, no wake)
  // and the person reads why (the ended answer «agent_older» — the row's «not resumed: its device agent is older: update it»)
  const REMOTE_ENDED_MS = 10 * 60e3;
  const remoteEnded = new Map();
  const isRemoteEnded = (cid) => { const e = remoteEnded.get(cid); if (!e) return false; if (clock.now() - e.at < REMOTE_ENDED_MS) return true; remoteEnded.delete(cid); return false; };
  // B-2566's remainder (主开发 r1147 / r1149) — A PAIRED MACHINE THAT CANNOT BE REACHED is not «live» either: the remote rung's
  // bounded connect got no handle (nothing was posted) AND the machines list's own classifier (hosts.linkState — never a probe)
  // calls it 'offline'. Fresh for the bound an ended reply has; a post that lands, or a link that comes back, clears it. A machine
  // the list knows nothing of ('unknown': an ssh host with no facts) is never marked — no evidence is not evidence. hid → {at: the
  // newest evidence, since: when it fell silent (the dial facts' lastDisconnectAt when the list kept one, else the first miss)}
  const unreachable = new Map();
  // a HELD machines list cannot say (its linkState answers 'offline' for the pool's dark-source defense): unknown here — a held list
  // marks nothing and keeps a mark only for its bound (the hold's own rule: a remote owner is «unknown», never ended)
  const linkOf = (hid) => { if (hostsHeld()) return 'unknown'; try { const h = getHosts?.(); return h && typeof h.linkState === 'function' ? h.linkState(hid) : 'unknown'; } catch { return 'unknown'; } };
  const silentSinceOf = (hid) => { const h = pairingOf(hid).host; const d = h && h.dial; const off = Number(d && d.lastDisconnectAt) || 0; return off > (Number(d && d.lastConnectAt) || 0) ? off : 0; };
  function markUnreachable(hid) {
    if (!hid || linkOf(hid) !== 'offline') return null;
    const now = clock.now(), was = unreachable.get(hid), off = silentSinceOf(hid);
    const e = { at: now, since: was ? Math.min(was.since, off || was.since) : (off || now) };   // r1397 (5): a flap never moves the outage's start
    unreachable.delete(hid); unreachable.set(hid, e);
    if (unreachable.size > 200) unreachable.delete(unreachable.keys().next().value);
    return e;
  }
  // the bound an ended reply has holds while the list can no longer say; while it still calls the machine offline the mark stands —
  // an owed wake held overnight is kept until the machine replies (never ended «running» ten minutes after the last miss)
  function hostUnreachable(hid) {
    const e = hid ? unreachable.get(hid) : null;
    if (!e) return null;
    const link = linkOf(hid);
    if (link === 'online') { unreachable.delete(hid); return null; }   // the link came back
    if (clock.now() - e.at < REMOTE_ENDED_MS || link === 'offline') return e;
    unreachable.delete(hid); return null;
  }
  /** the park's wakes owed while their machine could not be reached (their own durable `away`) */
  const awayHeldOf = (cid) => (retry[cid] || []).filter((e) => e && isEnded(e) && e.away && e.away.hostId);
  /** → {hostId, since} while this conversation's machine cannot be reached, else null — the park's «live» reads it. Fresh evidence
   *  (the rung's own miss), or what is DURABLE: a wake parked for it while it was away, read with the link's state (r1277: a restart
   *  changes nothing — the empty map of a new process is never «reachable») */
  function unreachableOf(cid) {
    if (!cid || localSessionFor(cid)) return null;
    const hid = ownerHostOf(cid), e = hostUnreachable(hid);
    if (e) return { hostId: hid, since: e.since };
    const h = awayHeldOf(cid)[0];
    return h && linkOf(h.away.hostId) !== 'online' ? { hostId: h.away.hostId, since: Number(h.away.since) || null } : null;
  }
  /** → {since: THIS outage's start, held: wakes still owed its word} while machine `hid` is away or has not yet answered for a
   *  conversation held for it, else null. `since` is the dial facts' disconnect when the list keeps one (r1277 (3): never an earlier
   *  outage's entry), else the rung's first miss, else the oldest held wake's */
  function machineAwayOf(hid) {
    if (!hid) return null;
    const m = hostUnreachable(hid);
    let held = 0, first = Infinity;
    for (const q of Object.values(retry)) for (const e of q || []) if (e && isEnded(e) && e.away && e.away.hostId === hid) { held++; first = Math.min(first, Number(e.away.since) || Infinity); }
    if (!m && !held) return null;
    // the held wakes end only on the machine's word, so the oldest of them starts THIS outage (r1397 (5): never the last flap's
    // disconnect); with none held, the dial facts' disconnect, else the rung's first miss
    return { since: Number.isFinite(first) ? first : (silentSinceOf(hid) || (m ? m.since : clock.now())), held };
  }
  /** a wake's `away` is over: the machine gave its word about this conversation (a delivery landed; its answer) — written (durable) */
  function clearAway(cid) { wordlessSince.delete(cid); let n = 0; for (const e of retry[cid] || []) if (e && e.away) { delete e.away; n++; } if (n) writeRetrySoon(); return n; }
  const AWAY_HOLD_MS = 60e3;
  const awayAsking = new Set();
  /** THE HOLD and THE ASK (r1277). Away (the link not online): held — its next look in a minute, moved in memory only (r1277 (1): the
   *  park's file is written when something durable changes, never once a minute for a machine in a drawer). The link back: the
   *  machine is ASKED about this conversation (peer-state, one ask at a time); its answer ends the hold — it runs ⇒ «running», it
   *  ended ⇒ the resume line; no answer ⇒ still held; an OLDER agent (no peer-state) gives no answer — a delivery that lands is its
   *  word. A machine no longer paired: the wake is refused by name (the words wait for the conversation to be opened). */
  function judgeAway(cid, hid, all) {
    if (pairingOf(hid).reply === 'gone') { for (const e of all) endEnded(e, { outcome: 'refused', code: 'unpaired', why: 'its machine is no longer paired — open the conversation to read what waits for it' }); return; }   // r1645: only the store's own «gone»; «cannot say» keeps the wake
    for (const e of all) e.nextAt = clock.now() + AWAY_HOLD_MS;
    scheduleRetry();
    if (hostsHeld()) return;   // r1730 (2): a HELD list ends NOTHING, on every road (an owner no one machine can be named for reaches here past attemptEnded's held return)
    const link = linkOf(hid);
    // THE LAW, COMPLETED (r1397 (1)): where a machine CANNOT say — no device link to ask ('unknown': an ssh-only machine), or an agent
    // with no such op (older) — the release's road stands for it: the link's word, once it has stood a bound; the row says why
    if (link === 'unknown') { const from = Math.max(...all.map((e) => Number(e.away && (e.away.at || e.away.since)) || Number(e.firstAt) || 0)); if (from && clock.now() - from >= REMOTE_ENDED_MS) releaseWordless(cid, all, 'no_link'); return; }
    if (link !== 'online') { wordlessSince.delete(cid); return; }
    const older = wordlessSince.get(cid);
    if (older != null) { if (clock.now() - older >= REMOTE_ENDED_MS) releaseWordless(cid, all, 'agent_older'); return; }
    if (awayAsking.has(cid)) return;
    awayAsking.add(cid);
    const p = (async () => {
      let st;
      try { const dm = await getHosts().deviceBounded(hid, 6000); st = await remoteStateOf(dm, cid, hid); }
      catch { st = undefined; markUnreachable(hid); }
      finally { awayAsking.delete(cid); }
      if (retryClosed) return;   // r1397 (4): an answer landing during a stop hands nothing to the resume line
      if (st === null) { if (!wordlessSince.has(cid)) { wordlessSince.set(cid, clock.now()); if (wordlessSince.size > 500) wordlessSince.delete(wordlessSince.keys().next().value); } return; }   // an older agent: it cannot say — the bound starts
      if (!st) return;   // no answer: still held — its next look in a minute
      if (st.live === false) { remoteEnded.delete(cid); remoteEnded.set(cid, { at: clock.now(), hostId: hid }); if (remoteEnded.size > 500) remoteEnded.delete(remoteEnded.keys().next().value); }
      log(`[deliver] ${cid}: its machine answered for it after being away — ${st.live === false ? 'it ended there: the resume line' : 'it runs there: its next turn and the hand-over carry the words'}`);
      clearAway(cid);
      attemptEnded(cid);
    })();
    retryInFlight.add(p); p.finally(() => retryInFlight.delete(p));
  }
  /** the conversations whose machine is online but whose OLDER agent cannot say (cid → since when) — the bound before the release's road */
  const wordlessSince = new Map();
  const WORDLESS_WHY = {
    no_link: 'whether it runs cannot be asked of its machine — the words wait for its next turn',
    agent_older: 'its device agent is older: update it — the words wait for its next turn',
  };
  /** the release's road for a machine that cannot give its word (r1397 (1)): the hold ends «running» as before this unit, and the
   *  row says WHY (its ended answer, read by the conversation's «not resumed» line) */
  function releaseWordless(cid, all, code) {
    wordlessSince.delete(cid);
    clearAway(cid);
    const why = WORDLESS_WHY[code];
    for (const e of all) endEnded(e, { outcome: 'running', code, why });
    endedAnswers.set(cid, { outcome: 'refused', code, why, until: null, at: clock.now() });
    log(`[deliver] ${cid}: its machine cannot say whether it runs (${code}) — the release's road after ${Math.round(REMOTE_ENDED_MS / 60e3)} min: ${why}`);
  }

  const saidOlder = new Set();
  // B-95fc follow-up (主开发 r491): a machine whose conversations' registry cannot be read is said ONCE a machine in the journal (unknown, by name)
  const saidUnread = new Set();
  const sayUnread = (hid, why) => { if (saidUnread.has(hid)) return; saidUnread.add(hid); if (saidUnread.size > 200) saidUnread.delete(saidUnread.values().next().value); log(`[deliver] ${hid}: its machine could not read its conversations' registry (${String(why || '').slice(0, 160)}) — what it runs there is unknown; the words wait (never «not running»)`); };
  async function remoteStateOf(dm, cid, hid) {
    if (!dm || typeof dm.peerState !== 'function') return null;
    let st;
    // U2: an owed wake is parked only for a machine that can ALSO wait for the resumed CLI's inbox (peer-post-wait) — else its
    // hand-over would post before that inbox opened; such an agent is an older one here (both ride the same agent update)
    const caps = typeof dm.helloInfo === 'function' ? (dm.helloInfo() || {}).capabilities : null;
    try { st = Array.isArray(caps) && !caps.includes('peer-post-wait') ? null : await dm.peerState(cid); } catch (e) { if (/could not be read/.test(String((e && e.message) || ''))) sayUnread(hid, String(e.message)); return undefined; }   // the link dropped or the op failed: unknown (today's road); a registry the machine cannot read is SAID (follow-up)
    if (st === null) {   // an older agent: never asked — said once per machine, and the person reads why
      if (!saidOlder.has(hid)) { saidOlder.add(hid); if (saidOlder.size > 200) saidOlder.delete(saidOlder.values().next().value); log(`[deliver] ${hid}: its device agent is older — it cannot say whether a conversation ended there; the words wait for its next turn (update the agent)`); }
      if (!endedAnswers.has(cid)) endedAnswers.set(cid, { outcome: 'refused', code: 'agent_older', why: 'its device agent is older: update it — the words wait for its next turn', until: null, at: clock.now() });
    }
    else if (st) { const a = endedAnswers.get(cid); if (a && a.code === 'agent_older') endedAnswers.delete(cid); }   // round w00h341sv: the agent was updated — its «older» word leaves
    return st;
  }
  /** a HELD machines list (hosts.json not read): who owns a remote conversation is unknown — nothing is parked, nothing is ended */
  const hostsHeld = () => { try { const h = getHosts?.(); return !!(h && typeof h.held === 'function' && h.held()); } catch { return false; } };
  /** the park's «live» for an owed wake: a session here, or a machine that may carry it — unless that machine said it ended there,
   *  or cannot be reached (B-2566's remainder: the rung found no handle and the machines list calls it offline) */
  const liveForWake = (cid) => !!localSessionFor(cid) || (peerReachable(cid) && !isRemoteEnded(cid) && !unreachableOf(cid));   // B-2566: nor one its machine cannot be reached

  // rung 2 helper: which registered machine owns this conversation? null =
  // local/unknown (the local rung already ran by the time this is asked).
  /** THE PAIRING READ (主开发 r1645) — ONE function, THREE replies, written against the store's own contract (src/hosts.js get: the
   *  machine's record; it THROWS code host_not_found for a machine the list READ gone; a HELD list throws hosts-unread):
   *  {reply: 'paired', host} · {reply: 'gone'} · {reply: 'unknown'} (cannot say: no list, a held list, a read that failed any other
   *  way). EVERY reader of a machine in this engine asks it — the owner's claim, a held wake's machine, the silence's start, the
   *  machine's name; none reads the store itself (test-peer-state ⑮'s census; test-hosts-held-census holds its one lookup) */
  function pairingOf(hid) {
    const UNKNOWN = { reply: 'unknown' };
    let hosts;
    try { hosts = getHosts?.(); } catch { return UNKNOWN; }
    if (!hid || !hosts || typeof hosts.get !== 'function') return UNKNOWN;
    try { if (typeof hosts.held === 'function' && hosts.held()) return UNKNOWN; } catch { return UNKNOWN; }
    try { const host = hosts.get(hid); return host ? { reply: 'paired', host } : UNKNOWN; }
    catch (e) { return e && e.code === 'host_not_found' ? { reply: 'gone' } : UNKNOWN; }   // the store's own CODE for a machine it READ gone (r1730 (1))
  }
  function ownerHostOf(cid) {
    try {
      const hosts = getHosts?.();
      const idx = getConvIndex?.();
      if (!hosts || !idx) return null;
      // the B-f276 remainder's cure (主开发 23:20Z): a HELD machines list answers «unknown», never «gone» — the claim stands, the
      // remote rung meets the hold by name and the stash keeps the message (it was told «not running» on the local rung's miss)
      const hid = idx.ownerHost(cid, (id) => pairingOf(id).reply !== 'gone');   // r1645: the one pairing read — only a machine the list READ gone drops the claim
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
  const unsettled = new Map();   // cid -> [{withheld, at, qid}]
  // THE QUEUED WAKE (lane queued-is-not-woke, law 1): a frame written to a wrapper whose conversation is IN A TURN waits in
  // that wrapper's queue — it is not «woke», not «read», not charged until a turn carries it (src/server/queued-wakes.js)
  // reservationState: the guard's word before any marked copy; stashHas: a handed-back frame's words still wait (round 4)
  const queued = require('./queued-wakes.js').create({ dataDir, noteSpend, releaseSpend, reservationState, waitingReservations, waitingOverCap, pull: (cid, item, holder) => pullQueued(cid, item, holder), stashHas: (cid, ref) => (stash[cid] || []).some((e) => e && e.ref === ref), log });
  // B-0a33 (2): a settings write that moved the caps re-judges the frames already waiting AT ONCE (src/routes/persistence.js)
  require('./spend-guard.js').onLimitsWritten(() => { try { queued.rejudge({ fresh: true }); } catch (e) { log('[deliver] re-judging the waiting frames failed:', e.message); } });
  /** B-0a33: TAKE A WAITING FRAME BACK OUT of its wrapper's queue — the wrapper's own `remove` verb (the person's queue edit);
   *  the wrapper hands the words back (a mode-less peer_message_result) and queued-wakes' hand-back road stashes them. Only the
   *  process that holds it, only a wrapper whose own advert serves `remove`. → true (asked) | 'no-remove' (the process that
   *  holds it is here and too old to serve `remove`) | false (not asked now: no process here, or another one). */
  function pullQueued(cid, item, holder) {
    const rpc = findRpcPeer(cid);
    if (!rpc || !item) return false;
    if (holder && rpc.wc && rpc.wc.pid && String(rpc.wc.pid) !== String(holder)) return false;   // another process: never its queue
    if (!(Array.isArray(rpc.wc.queueVerbs) && rpc.wc.queueVerbs.includes('remove'))) return 'no-remove';
    try { rpc.s.pty.write(JSON.stringify({ type: 'queue-op', op: 'remove', id: String(item) }) + '\n'); return true; }
    catch (e) { log('[deliver] taking a queued frame back out failed: ' + e.message); return false; }
  }
  /** Give a withheld frame's authorization hold back to the guard (r5). A
   *  stranded frame gets it too: the wrapper died holding our money open, and
   *  the guard's own TTL would give it back anyway — this just does it the
   *  moment we KNOW, instead of leaving it to a timeout. */
  function giveBack(entry) {
    const rec = entry && entry.withheld;
    if (!rec || !rec.hold || !releaseSpend) return;
    try { releaseSpend(rec); } catch (e) { log('[deliver] releasing the spend hold failed:', e.message); }
  }
  function noteFrameWritten(cid, withheld, qid = null) {
    if (!cid) return;
    const now = Date.now();
    const q = (unsettled.get(cid) || []).filter((e) => now - e.at < SETTLE_TTL_MS || (e.qid && (queued.unanswered(e.qid), false)));
    q.push({ withheld: withheld || null, at: now, ...(qid ? { qid } : {}) });
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
    while (q.length) { const c = q.shift(); if (now - c.at < SETTLE_TTL_MS) { e = c; break; } if (c.qid) queued.unanswered(c.qid); else giveBack(c); }
    if (!q.length) unsettled.delete(cid);
    if (!e) return null;
    if (e.qid) { const v = queued.answer(e.qid, { ok, mode }); return v === 'carried' ? 'charged' : v === 'queued' ? 'queued' : v === 'back' ? 'undelivered' : null; }
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
  // ── THE QUEUED WAKE MEETS THE TRUTH AGAIN (lane queued-is-not-woke round 2) ──
  /** The conversation's wrapper process is GONE (session-stdout's teardown; the boot sweep): every frame it held is handed
   *  back BY THE HUB to the next-turn road (the stash — delivered once, at the next turn) and its reservation returned. */
  /** the hub's own hand-back: the words to the stash WITH a ref (its drain names the frame — the row reads «read» only then) */
  const heldBackStash = (cid) => (e, w) => { stashFor(cid, { source: 'agent', kind: w.kind === 'notification' ? 'notification' : 'peer', fromName: w.fromName || null, text: w.text, ref: w.ref, ...(w.held && w.held.kind ? { held: w.held } : {}) }); };   // B-0a33 (2): `held` = taken back for a lowered cap
  /** WHO HOLDS IT: the wrapper process of the conversation's live session (its own sidecar's pid); null = no process;
   *  undefined = it cannot be told (nothing is judged). A frame the old process held is never «carried» by another. */
  function holderOf(cid) {
    const s = localSessionFor(cid);
    if (!s || !s.pty) return null;
    try {
      let wid = null;
      for (const [w, x] of activeSessions || []) if (x === s) { wid = w; break; }
      const wc = wid ? wrapperCaps(path.join(dataDir, 'session-buffers'), wid, s.socketPath) : null;
      return wc && wc.pid ? String(wc.pid) : undefined;
    } catch { return undefined; }
  }
  function checkHolder(cid) {
    const back = queued.noteHolder(cid, holderOf(cid), heldBackStash(cid));
    if (back.length) log(`[deliver] ${cid}: ${back.length} queued frame(s) handed back by the hub — the process that held them is gone or replaced; they ride the next turn`);
  }
  // a held-back frame's words were HANDED by the stash (its drain names the ref) ⇒ that record is read now
  onStash((ev, cid, entries) => {
    try {
      if (ev === 'drained') queued.noteStashDrained(cid, (entries || []).map((e) => e && e.ref));
      else if (ev === 'evicted') queued.noteStashEvicted(cid, (entries || []).map((e) => e && e.ref));   // round 3: an evicted hand-back leaves (said)
    } catch (e) { log('[deliver] queued stash note failed:', e.message); }
  });
  const turnStartListeners = new Set();
  /** Is a process alive? true / false / undefined (cannot be told) — a FACT about the holder's process, never «not attached yet». */
  const pidAlive = (pid) => { const n = Number(pid); if (!Number.isInteger(n) || n <= 0) return undefined; try { process.kill(n, 0); return true; } catch (e) { return e && e.code === 'ESRCH' ? false : e && e.code === 'EPERM' ? true : undefined; } };
  function noteProcessGone(cid, why = 'its process is gone') {
    if (!cid) return [];
    const back = queued.handBackGone(cid, heldBackStash(cid), why);
    if (back.length) log(`[deliver] ${cid}: ${back.length} queued frame(s) handed back by the hub (${why}) — they ride the next turn`);
    return back;
  }
  /** A session (re)attached — at boot or a reconnect: a wrapper that holds frames of ours is ASKED for its queue (the
   *  queue-resync verb its sidecar adverts), so an entry its turn carried while the hub was down settles from the answer. */
  function noteAttached(session) {
    try {
      const cid = addressableId(session);
      if (!cid || !session.pty || !queued.heldCids().includes(cid)) return false;
      let wid = null;
      for (const [w, x] of activeSessions || []) if (x === session) { wid = w; break; }
      const wc = wid ? wrapperCaps(path.join(dataDir, 'session-buffers'), wid, session.socketPath) : null;
      if (!wc || !wc.queueResync) return false;
      session.pty.write(JSON.stringify({ type: 'queue-resync' }) + '\n');
      return true;
    } catch (e) { log('[deliver] queue re-ask failed:', e.message); return false; }
  }
  /** At boot (after a grace for the restore) and on demand: each conversation holding frames — no live process ⇒ handed
   *  back by the hub; a live one ⇒ asked for its queue. */
  function sweepQueued() {
    for (const cid of queued.heldCids()) {
      const s = localSessionFor(cid);
      if (s && s.pty) { noteAttached(s); continue; }
      // round 3: no attached process is NOT «gone» (a pipe session joins late; a re-attach backoff nulls the pty) — the holder's
      // pid decides: alive ⇒ kept (asked at its attach); dead ⇒ the guard's word (converted = it ran), else unknown (counted)
      const r = queued.bootSettle(cid, { alive: pidAlive, converted: (id) => { try { return reservationState ? reservationState(id) : null; } catch { return null; } }, stash: heldBackStash(cid) });
      if (r.length) log(`[deliver] ${cid}: at boot ${r.length} held frame(s) settled (${r.join(', ')}) — their process ended while the hub was down`);
    }
  }
  if (queued.heldCids().length) { const t = clock.setTimeout(() => { try { sweepQueued(); } catch (e) { log('[deliver] queued sweep failed:', e.message); } }, 60 * 1000); t?.unref?.(); }
  // round 4: the age bound in a running hub — hourly, unref'd, on the REAL timer (never the retry clock: its tests read every
  // timer armed on it), so an entry kept at boot whose wrapper never attaches leaves too
  const ageTick = () => { try { queued.ageOut(); } catch (e) { log('[deliver] queued age check failed:', e.message); } const t = setTimeout(ageTick, 3600 * 1000); t?.unref?.(); };
  { const t = setTimeout(ageTick, 3600 * 1000); t?.unref?.(); }

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
        // B-ef83 unit 1 (iv): a first try's wake the gate could not judge, for a caller that PARKS (`opts.retry`): parked by the same road
        // as a transient miss and kept for the lift (waitLift) — never stashed and lost: a wake asked in a restart's seconds had no later turn
        if (SA.isHeldWhy(v.why) && opts.retry && typeof opts.retry === 'object') {
          // r4410 MUST 2: what waits on a lift for one conversation never passes the park's own cap — parked by parkRetry, whose cap
          // loop fells the OLDEST waiting past it (its words to the stash by the fall's own road), exactly as at the release. With no
          // room at all (every waiting entry a producer's held one, never the cap's victim) it is NOT parked: the release's answer
          // stands (the caller stashes, capped) — never «parked» for an entry that would fall at once (r4410 (e))
          const waitingNow = () => (retry[cid] || []).filter((x) => x && !x.inflight && !x.ho && !x.maybeDelivered);
          if (waitingNow().length < RETRY_CAP || waitingNow().some((x) => !x.waitsHeld)) {
            const at = clock.now();
            const e = parkRetry(cid, text, opts, { kind, spendReason, charged: null, attempt: { at, reason: `spend gate held: ${v.why}`, phase: 'spend', busy: null, late: 0, why: 'first' }, waitsLift: { why: String(v.why), since: at } });
            if (retry[cid] && retry[cid].includes(e)) {
              saidLift([e], v.why);   // the mark rode parkRetry's one write: said, nothing written again
              return { ok: false, lane: 'message', reason: `not woken yet — the spend gate could not judge (${v.why}); kept, asked again when it lifts`, parked: true, id: e.id, retryAt: null, phase: 'spend', busy: null, late: 0, waitsLift: true, refused: 'spend', why: v.why };
            }
            // B-ef83 unit 2 (a) (主开发 r4606): GONE after the park's own aside — parkRetry's asideHeld turned every other waiting entry
            // a producer's held one, so this entry was the cap's victim at once and its words went to the stash by the fall's own road
            // (its producer took them, or the park's stash): said so, `stashed`, never «parked» (r4410 (e)) and never a second stash
            return { ok: false, lane: 'message', reason: `fell at once — the retry park is full of held wakes; its words are in the stash (the spend gate could not judge: ${v.why})`, fell: true, stashed: true, id: e.id, retryAt: null, phase: 'spend', busy: null, late: 0, refused: 'spend', why: v.why };
          }
        }
        // B-ef83 unit 2's cure (主开发 r4668, law (b) on every road): a HELD verdict's words are code-only — its detail names another
        // process's id and host (spend-authorizer's ledger-held-elsewhere), and this reason reaches a sending agent and a job's notice
        return { ok: false, reason: `spend budget: ${SA.isHeldWhy(v.why) ? `the spend gate could not judge (${v.why})` : (v.detail || v.why)}`, refused: 'spend', why: v.why, retryAfter: v.retryAfter || 0, identity: v.identity ? { key: v.identity.key, name: v.identity.name || v.identity.key } : null, cap: Number.isFinite(Number(cap)) ? Number(cap) : null, ...(v.capUnset ? { capUnset: true } : {}) };   // B-0a33 (3): an empty cap is said as itself
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
        const look = noWake ? null : lookPeer(cid);
        const peer = look && look.peer;
        if (!peer && look && look.stale > 0) log(`[deliver] ${cid}: no live inbox on this machine — ${staleOnly(look)}`);
        if (peer) {
          undo1 = armTurn();
          const busy = busyOf(cid);
          const r = await peerMsg.postToPeer(peer, text);
          if (r.ok) { spent(); cardOk(); return { ok: true, lane: 'message', kind, peerName: peer.name || null, ...(busy === true ? { intoTurn: true } : {}) }; }   // intoTurn (lane queued-is-not-woke): the CLI takes it INTO its running turn — charged as master (ruled)
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
          // "not running" is said ONLY when no record passes (re-judged after the miss — the CLI may have exited between the
          // lookup and the post); a record that still passes refused with its own socket, which is NOT "not running"
          let verdict = '';
          if (!r.transient) {
            let again = null;
            try { again = lookPeer(cid); } catch { again = null; }
            verdict = again && again.peer ? ` — the socket refused the post, though a registration still passes its identity check (pid ${again.peer.pid}${again.peer.identity ? `, ${again.peer.identity}` : ''}${again.why ? `; ${again.why}` : ''})`
              : again && again.stale > 0 ? ` — the socket is not served: ${staleOnly(again)}`
                : ' — the socket is not served: the conversation is not running';
          }
          log(`[deliver] local peer post to ${peer.socketPath} failed: ${r.reason} (${where})${verdict}`);
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
        if (noWake && !steersIntoRunningTurn) return { ok: false, lane: 'rpc-queue', reason: rpc.s._isStreaming ? 'this message would not join the running turn — a delivery now would open a billed turn after it' : 'no turn is running to join — a delivery now would open a billed turn', refused: 'no-wake' };
        // a bound on a money record refuses at the send, by name (round 2) — before any frame, the hold given back in `finally`
        const queuedFull = !steersIntoRunningTurn && rpc.s._isStreaming === true ? queued.full(cid) : null;
        if (queuedFull) return { ok: false, lane: 'rpc-queue', kind, refused: 'queued-full', reason: queuedFull };
        try {
          rpc.s.pty.write(JSON.stringify({ type: 'peer-message', text, fromName: opts.fromName || null, cardText: opts.cardText || null, kind, ...(opts.channel ? { channel: opts.channel } : {}), ...(opts.group ? { group: opts.group } : {}) }) + '\n');
          require('./sent-record.js').noteFor(rpc.s, { text, kind: kind === 'notification' ? 'notice' : 'peer' });   // B-9a2e: the rpc-queue road's own record (a codex rollout keeps no peer mark) — VibeSpace's own notice is a notice, never a peer's frame   // `group`: the wrapper's marker carries it (lane group-report-card) — an older wrapper ignores it and draws the fromName card
          // EVERY frame joins the settle queue, charged or not — the wrapper
          // answers in write order, so a queue holding only the predicted-free
          // ones would hand this frame's answer to the next frame's entry.
          // the settle queue now owns this hold: it is charged when the wrapper
          // says the frame opened a turn after all, and released when it confirms
          // the steer — so the money is NOT settled here, it is handed on
          if (steersIntoRunningTurn) { machineTurn(); money.settled = true; noteFrameWritten(cid, charged); }
          else if (rpc.s._isStreaming === true) {
            // IN A TURN (lane queued-is-not-woke, law 1): the wrapper QUEUES this frame behind the running turn — said as
            // waiting, the group's mark held, the charge OWED until a turn carries it (or released when it is handed back)
            machineTurn(); lastPostAt.set(cid, clock.now()); money.settled = true;
            const since = Number.isFinite(rpc.s._turnOpenedAt) ? rpc.s._turnOpenedAt : null;   // the turn it waits behind (acp-events / codex-events stamp it)
            const qe = queued.noteWritten(cid, { charged, text, kind, fromName: opts.fromName || null, mark: opts.wakeMark || null, since, peerName: rpc.s.name || null, holder: rpc.wc && rpc.wc.pid ? String(rpc.wc.pid) : null, waitKey: `${rpc.s.backend || 'claude'}:${cid}` });   // the hold becomes the RESERVATION; the holder = the wrapper process that took it (round 2)
            noteFrameWritten(cid, null, qe.id);
            return { ok: true, lane: 'rpc-queue', kind, steered: false, queued: true, since, peerName: rpc.s.name || null };
          }
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
          // lane device-act-audit: the sender when the caller names it (vibespace-msg: agent:<cid>), else the delivery's own reason
          // B-95fc U2: a hand-over to a conversation just resumed THERE (opts.inboxWaitMs) — the machine waits for its own inbox, then
          // posts once; one authorization and one charge either way, and a wait that ran out charges nothing (undo2, the ladder's finally)
          const waitMs = Number.isFinite(opts.inboxWaitMs) && opts.inboxWaitMs > 0 ? opts.inboxWaitMs : 0;
          const r = await dm.peerPost({ cid, text, by: require('../device-acts.js').validBy(opts.by) ? opts.by : require('../device-acts.js').bySystem(spendReason), ...(waitMs ? { waitMs } : {}) });
          if (r && r.ok) { remoteEnded.delete(cid); unreachable.delete(hid); clearAway(cid); }   // B-95fc U1: it runs there again (B-2566: its machine answered for it — the held wake's word)
          if (r && r.ok) { spent(); cardOk(); return { ok: true, lane: 'remote-message', kind, peerName: r.peerName || null, hostId: hid, ...(Number.isFinite(r.waited) ? { waited: r.waited } : {}) }; }
          undo2();
          if (r && r.code === 'inbox_not_open') return { ok: false, lane: 'remote-message', hostId: hid, code: 'inbox_not_open', reason: String(r.reason || 'its inbox did not open on that machine') };
          if (r && r.code === 'registry_unread') { sayUnread(hid, r.reason); return { ok: false, lane: 'remote-message', hostId: hid, code: 'registry_unread', reason: String(r.reason || 'its machine could not read its conversations\' registry') }; }   // B-95fc follow-up: said by name — never «not running», never «its inbox did not open»
          // B-95fc U1: THE MACHINE ANSWERS FOR ITS OWN INBOX — asked only of an agent that advertises peer-state (an older one never: an
          // unknown op hangs; its road stays as today, said once); the miss is «not running» ONLY on its reply that the conversation
          // runs nowhere there — never a machine that could not be reached, never a CLI still starting
          const there = r && /no live inbox/.test(String(r.reason || '')) ? await remoteStateOf(dm, cid, hid) : undefined;
          if (there && there.live === false) { remoteEnded.delete(cid); remoteEnded.set(cid, { at: clock.now(), hostId: hid }); if (remoteEnded.size > 500) remoteEnded.delete(remoteEnded.keys().next().value); return { ok: false, lane: 'remote-message', hostId: hid, reason: (r && r.reason) || 'no live inbox for this conversation on that machine', notRunning: true, remoteEnded: true }; }
          return { ok: false, lane: 'remote-message', hostId: hid, reason: (r && r.reason) || 'remote daemon could not reach the inbox' };
        } catch (e) {
          if (undo2) undo2();
          // capability gate / daemon down — an honest miss, the stash covers it. B-6721: a request that LEFT and never got its
          // answer — the hub's own request timeout, a link lost — may have been posted by the device: `unanswered` says so to its
          // caller; never a capability gate, a policy refusal or an error the device ANSWERED (nothing was posted: round w8g2bt5bs)
          const unanswered = !!undo2 && !!e && (e.code === 'link_lost' || e.message === 'peer-post timeout');
          // B-2566's remainder: no handle at all (nothing posted) on a machine the list calls offline — UNREACHABLE: typed «not running»
          // (the park keeps what is owed and holds it until the machine replies), its own word beside it (never an ended conversation)
          const away = !undo2 ? markUnreachable(hid) : null;
          if (away) return { ok: false, lane: 'remote-message', hostId: hid, reason: e.message, notRunning: true, unreachable: true, since: away.since };
          return { ok: false, lane: 'remote-message', hostId: hid, reason: e.message, ...(unanswered ? { unanswered: true } : {}) };
        }
      }
      const live = liveWithoutLane(cid);
      if (live) return { ok: false, reason: live };   // RUNNING, so never `notRunning` (lane agy-peer-wake): the stash keeps it for the next turn
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

  // THE STASH AS AN OWED WAKE'S STORE (a channel receipt the pace held, sign-in off): the entry waits in the stash — its reach
  // gate, its clear, the prompt's drain and a hand-over all stand — and the park owes the ONE wake; the frame takes it out
  registerOwedWake('stash-wake', {
    // B-f276 1a (the read's should): its receipt KEPT by the gate (its reach cannot be judged now) ⇒ held — set aside on every road (the
    // not-running fall, the no-inbox miss, the bound), never only at the render; it goes once the gate hands the receipt over
    held(cid, e) { const ref = e && e.meta && e.meta.ref; if (!ref || stashEntries(cid).some((x) => x && x.ref === ref)) return false; if (isHeld() && !(stash[cid] || []).some((x) => x && x.ref === ref)) return true;   /* r3663 (2): its entry may wait in the unread list — unknown is held, never «carried» */ return (stash[cid] || []).some((x) => x && x.ref === ref && isKept(cid, x)); },
    render(cid, e) {
      const same = stashEntries(cid).filter((x) => x && e.meta && x.ref === e.meta.ref);
      const ent = same.find((x) => !x.ho);
      if (!ent) return same.length ? { wait: 'a hand-over is carrying it' } : null;   // gone = a prompt or a hand-over carried it; claimed = one is on its way, its miss would give it back
      const kind = ent.kind === 'peer' ? 'peer' : 'notification';
      const body = `VibeSpace held this wake for the wake pace:\n\n${ent.text}`;
      // ONE ROAD (acceptance r1, D2, measured: the turn this frame opens drained the same entry while the post sat in its 150-ms grace — the words twice, two cards): the frame CLAIMS it, invisible to a drain until the post settled; a miss gives it back
      const release = claimStash(cid, [ent], `owed:${e.id}`);
      return { text: kind === 'notification' ? vibespaceNoticeText(body) : body, kind, fromName: ent.fromName || null, cardText: ent.text, landed: async () => { drainStash(cid, new Set([ent])); }, release };
    },
    fell: () => true,   // the stash already holds it, the receipt's own card says so
  });
  /** WHAT STOPS A WAKE OF THIS CONVERSATION FROM FIRING AT ALL → {cause, why} (its cause from the ONE list, its own words), or null when one could (P13): a reachable inbox, wrapper or owning machine, or a live session whose CLI may be back in a moment. A live session the lane cannot reach mid-session says so, never «not running» (acceptance r5, P18: the agy-peer-wake invariant). THE GATE: `parkOwedWake` asks it, so every park does; the doors that must speak before they park ask it too */
  function wakeBlock(cid) {
    try {
      if (peerReachable(cid)) return null;
      const live = liveStateOf(cid);
      if (live) return live;
      const s = localSessionFor(cid);
      // B-cd4b (主开发 r587): a restored survivor whose batched attach still waits (`_attachPending`, src/server/boot-restore.js) is
      // RUNNING — counted live here, never «not running»; the send the wake leads to attaches it (or names why it could not)
      return s && (s.pty !== null || typeof s._attachPending === 'function') ? null : { cause: 'not-running', why: 'not running' };
    } catch { return null; }
  }
  function peerReachable(cid) {
    try { if (peerMsg.findPeer(cid)) return true; } catch { }
    if (findRpcPeer(cid)) return true;
    return !!ownerHostOf(cid); // a remote owner MAY be reachable — optimistic preview, the ladder decides for real
  }

  return {
    retryHeldState: () => (retryHeld ? { ...retryHeld } : null), _retryReading: () => retryReading,   // B-f276's remainder: the park held unread (a copy), its read again in flight
    deliverToConversation, peerReachable, liveForWake, unreachableOf, machineAwayOf, machineNameOf: (hid) => { const h = pairingOf(hid).host; return String((h && (h.name || h.id)) || hid || '').slice(0, 80); }, pairingOf: (hid) => pairingOf(hid).reply, stashFor, stashSlot, slotHolders, drainStash, stashCount, stashPeek, stashHealth, onStash,   // stashPeek: COPIES (the engine's boot reconcile); stashHealth: is the file current (withdraw r5); onStash: the ref'd entries' events (stashed / drained / evicted / unwritten)
    stashEntries, stashKeptCount, heldWhyOf, claimStash, claimedCount, restoreStash, registerFrameRestorer, restoreFrame, releasedAtBoot, flush: flushAtStop,
    // r3003 (a): the stash's hold — its facts (null: read), the person's words, a torn lift's copy and its instant, one read again
    stashHeld: () => { const h = heldHold(); return h ? h.held() : null; }, stashUnreadWords: () => { const h = heldHold(); return h ? h.words() : null; }, stashTorn: () => stashHold.torn(), stashTornAt: () => tornAt, stashReadAgain, stashRefusal: (what) => (heldHold() || stashHold).refusal(what),
    stashTornActed: (cid) => tornActed.has(cid),
    onStashLift: (fn) => { if (typeof fn !== 'function') return () => { }; liftListeners.add(fn); return () => liftListeners.delete(fn); },
    // r3988 (A): the stash's own word that an entry is IN THE FILE (the last write that landed held it), and who hears a write land after none did
    stashOnDisk, onStashLanded: (fn) => { if (typeof fn !== 'function') return () => { }; landListeners.add(fn); return () => landListeners.delete(fn); }, capUnclaimed, redactStash, registerRedactor, registerStashJudge,   // stashEntries: the SAME objects; claimStash / claimedCount: the hand-over's claim (a full drain leaves a claimed entry in place; the `ho` stamp is on disk); restoreStash / restoreFrame: a frame that came back is its original entries
    registerStashGate,   // verify r3 (lane channel-threads): a producer re-asks, at every read, whether an entry's `about` still reaches its conversation
    settleRpcDelivery,   // the wrapper's own peer_message_result settles a predicted-free steer
    // lane queued-is-not-woke (law 1): the wrapper's queue and turn edges, and a queued frame handed back — read off its records
    // fresh: the wrapper's own dated listing (round 4) — the only queue listing that can prove a frame did not run
    noteQueueItems: (cid, items, opts = {}) => { checkHolder(cid); queued.noteQueue(cid, items, holderOf(cid) || undefined, { fresh: !!(opts && opts.fresh) }); }, noteTurnStarted: (cid) => { checkHolder(cid); queued.noteTurnStarted(cid); clearEndedAnswer(cid); for (const fn of turnStartListeners) { try { fn(cid); } catch (e) { log('[deliver] a turn-start listener threw:', e.message); } } },
    onTurnStarted: (fn) => { turnStartListeners.add(fn); return () => turnStartListeners.delete(fn); }, noteConversationEnded: (cid, why) => queued.dropConversation(cid, why), onQueuedDropped: (fn) => queued.onDropped(fn), noteTurnEnded: (cid) => queued.noteTurnEnded(cid),
    noteHandedBack: (cid, text, reason) => queued.noteHandedBack(cid, text, reason, heldBackStash(cid)), onCarried: (fn) => queued.onCarried(fn), onHandedBack: (fn) => queued.onHandedBack(fn), queuedEntries: (cid) => queued.entriesFor(cid),
    queuedFileState: () => queued.fileState(), onQueuedFileState: (fn) => queued.onFileState(fn), queuedSetAside: () => queued.setAside(),   // B-e3fe follow-up: an unread msg-queued.json is said in For you, with the person's «set it aside»
    noteProcessGone, noteAttached, sweepQueued,   // round 2: the wrapper gone ⇒ the HUB hands back; a (re)attach ⇒ the hub ASKS for the queue
    parkOwedWake, registerOwedWake, registerWakePacer, owedEntries, wakeBlock, fellOwed, fellOwedPart,
    parkEndedWake, registerEndedWake, readoptSettled, noteLateWake, endedEntries, endedAnswerOf, stashCids, retryWaitingCount, markEndedPosting,   // piece 7: a wake owed to an ENDED conversation — a rung of the park, handed to the hub's resume line
      // lane paced-wake-retry: a wake the pace refused is owed — parked for the window's end
    onRetry, onTurnEnd, noteTurnEnd, retryPeek, retryEntries, retryTake, registerRetryJudge, claimRetry, retryCount, RETRY_STEPS_MS, RETRY_MAX_MS, RETRY_MAX_ATTEMPTS, RETRY_FLOOR_MS, RETRY_CAP, closeRetries, settleRetries, retryInFlightCount, armStashHandover, handoverArmed, takeArmedHandover, sincePost,   // R3: the hand-over a turn end runs for what the prompt could not carry   // THE RETRY PARK (lane notify-retry): a transient local miss on a live pid, retried at the turn end + on the backoff, ONE authorization
    _unsettledCount: (cid) => (unsettled.get(cid) || []).length,
    // exposed for the stash-drain sites: a drained message enters the agent's
    // context invisibly — the drain site emits the same card the live lanes do
    emitPeerCard: (cid, card) => { try { emitPeerCard?.(cid, card); } catch { } },
  };
}

module.exports = { create };
