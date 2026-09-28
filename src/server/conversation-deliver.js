'use strict';
// ONE delivery ladder for "get a message into a conversation" (2.362.0,
// B-274d/B-dfd2) — extracted from jobs-wiring so background-job notifications
// and agent-to-agent messages ride the SAME implementation (CS law: transport
// is selected inside, callers never branch). Rungs, in order:
//   0. VibeSpace channel socket (EXPERIMENTAL, agents.vibespaceChannel)
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
const { vibespaceNoticeText } = require('../notification-senders.js'); // lane S3: every kind:'notification' delivery opens with the ONE head naming VibeSpace as the speaker
// verify r6 (lane channel-withdraw, 2026-09-27): THE ONE PREDICATE behind "which live session carries this conversation" —
// a pending fork carries its PARENT's id, and the three raw lookups below (rung 0, rung 1.5, the charged identity) handed
// the parent's frame to the fork's wrapper / channel socket and the parent's turn to the fork's credential slot
const { addressableId } = require('../claude-lock-capture.js');

const STASH_CAP = 30; // per-conversation; oldest fall off
// How long a written frame waits for the wrapper's own verdict before it stops
// being settleable (see `steersIntoRunningTurn`). The wrapper answers on the
// same stdin round-trip, and its own slowest rung is a 30 s `thread/queue/add`
// budget, so 120 s is >4× the longest legitimate wait: past it the frame is
// STRANDED (a wrapper that died between our write and its reply), and a
// stranded frame must be dropped rather than left to absorb the next message's
// answer — mis-settling a later delivery is how a free steer gets charged and
// a billed queue-add does not.
const SETTLE_TTL_MS = 120 * 1000;

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
function create({ dataDir, peerMsg, getHosts, getConvIndex, serverSetting, activeSessions, emitPeerCard, authorizeSpend = null, noteSpend = null, releaseSpend = null, onStashChange = () => { }, log = () => { } }) {
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
    // cap over the whole store would evict exactly the entry that just arrived); the oldest unclaimed fall off
    let over = q.filter((e) => !(e && e.ho)).length - STASH_CAP;
    const dropped = [];
    if (over <= 0) return dropped;
    for (let i = 0; i < q.length && over > 0;) {
      if (q[i] && q[i].ho) { i++; continue; }
      dropped.push(...q.splice(i, 1)); over--;
    }
    return dropped;
  }
  function stashFor(cid, envelope) {
    const q = stash[cid] || (stash[cid] = []);
    // a RE-STASHED entry (the drain's budget handed it back) keeps its own ts so the next drain shows it in order
    // `kind` = the PATH (S3 verify F3): the drain heads a notification and draws its card by it — never by the sender's NAME, which a peer chooses
    const kind = envelope.kind === 'notification' || envelope.kind === 'peer' ? envelope.kind : null;
    const entry = { source: envelope.source || 'agent', ...(kind ? { kind } : {}), ...(envelope.ref ? { ref: String(envelope.ref).slice(0, 200) } : {}), fromName: envelope.fromName || null, text: String(envelope.text || ''), ts: Number(envelope.ts) > 0 ? Number(envelope.ts) : Date.now() };
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
    if (evicted.length) log(`[deliver] ${cid}: ${evicted.length} oldest waiting entr${evicted.length === 1 ? 'y' : 'ies'} fell off the ${STASH_CAP}-entry cap (${evicted.map((e) => `${e.source}${e.fromName ? ` "${String(e.fromName).replace(/\s+/g, ' ').slice(0, 40)}"` : ''} ${new Date(Number(e.ts) || 0).toISOString()}`).join('; ')}) — never delivered`);
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
    for (const e of mine) { delete e.ho; if (!q.includes(e)) q.push(e); }
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
  /** A READ of one conversation's held entries (2026-09-27 verify: the
   *  channels engine's boot reconcile asks whether a receipt is still
   *  waiting). Copies; never drains, never re-orders. */
  function stashPeek(cid) { return (stash[cid] || []).map((e) => ({ ...e })); }
  /** The entries waiting for a conversation (the SAME objects — `drainStash(cid, new Set(these))` takes them). */
  function stashEntries(cid) { return (stash[cid] || []).slice(); }

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
      // machine turn and hold the next-turn group reports for the owner's own.
      const machineTurn = () => { try { const s = localSessionFor(cid); if (s) s._machineInputAt = Date.now(); } catch { } };
      const spent = () => { machineTurn(); if (!charged) return; money.settled = true; if (noteSpend) { try { noteSpend(charged); } catch (e) { log('[deliver] spend accounting failed:', e.message); } } };
      // `kind` rides the card (S3 verify F3): a peer's card is never a VibeSpace notice, whatever its name or first sentence.
      // verify r6 (S2): `recorded` = the exact text the CLI's transcript now holds for this delivery — a first-attach rebuild
      // renders THAT record and skips the held card (normalizers.replayCard), never both; the card's own text may be a summary
      const cardOk = () => { try { emitPeerCard?.(cid, { fromName: opts.fromName || null, text: opts.cardText || text, recorded: text, kind }); } catch (e) { log('[deliver] card emit failed:', e.message); } };
      // rung 0: VibeSpace channel socket (experimental, per-session opt-in)
      try {
        if (!noWake && serverSetting?.('agents.vibespaceChannel') === true && activeSessions) {
          for (const [wid, s] of activeSessions) {
            if (addressableId(s) !== cid) continue;   // verify r6: the same rule as every rung
            const sock = path.join(dataDir, 'channel-socks', wid + '.sock');
            if (!fs.existsSync(sock)) continue;
            const rc = await peerMsg.postChannelEvent(sock, text, { kind: 'peer_message' });
            if (rc.ok) { spent(); cardOk(); return { ok: true, lane: 'channel', kind, peerName: s.name || null }; }
          }
        }
      } catch (e) { log('[deliver] channel lane failed (falling through):', e.message); }
      // rung 1: this machine's CLI inbox registry
      try {
        const peer = noWake ? null : peerMsg.findPeer(cid);
        if (peer) {
          const r = await peerMsg.postToPeer(peer, text);
          if (r.ok) { spent(); cardOk(); return { ok: true, lane: 'message', kind, peerName: peer.name || null }; }
          log(`[deliver] local peer post to ${peer.socketPath} failed: ${r.reason}`);
          return { ok: false, lane: 'message', reason: r.reason };
        }
      } catch (e) { return { ok: false, reason: e.message }; }
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
          rpc.s.pty.write(JSON.stringify({ type: 'peer-message', text, fromName: opts.fromName || null, cardText: opts.cardText || null, kind }) + '\n');
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
      if (hid) {
        try {
          const hosts = getHosts?.();
          // BOUNDED connect (review-caught): plain device() rides the full
          // ~2.7min retry ladder on a down host — a send request must fall to
          // the stash rung honestly instead (the background connect still heals).
          const dm = await (hosts.deviceBounded ? hosts.deviceBounded(hid, 6000) : hosts.device(hid));
          const r = await dm.peerPost({ cid, text });
          if (r && r.ok) { spent(); cardOk(); return { ok: true, lane: 'remote-message', kind, peerName: r.peerName || null, hostId: hid }; }
          return { ok: false, lane: 'remote-message', hostId: hid, reason: (r && r.reason) || 'remote daemon could not reach the inbox' };
        } catch (e) {
          // capability gate / daemon down — an honest miss, the stash covers it
          return { ok: false, lane: 'remote-message', hostId: hid, reason: e.message };
        }
      }
      return { ok: false, reason: 'no live inbox for this conversation on any reachable machine' };
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
    stashEntries, claimStash, claimedCount, restoreStash, registerFrameRestorer, restoreFrame, releasedAtBoot, flush, capUnclaimed,   // stashEntries: the SAME objects; claimStash / claimedCount: the hand-over's claim (a full drain leaves a claimed entry in place; the `ho` stamp is on disk); restoreStash / restoreFrame: a frame that came back is its original entries
    settleRpcDelivery,   // the wrapper's own peer_message_result settles a predicted-free steer
    _unsettledCount: (cid) => (unsettled.get(cid) || []).length,
    // exposed for the stash-drain sites: a drained message enters the agent's
    // context invisibly — the drain site emits the same card the live lanes do
    emitPeerCard: (cid, card) => { try { emitPeerCard?.(cid, card); } catch { } },
  };
}

module.exports = { create };
