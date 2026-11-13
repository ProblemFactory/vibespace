// WebSocket heartbeat — STALL-AWARE (2.369.16, userW inc-mtndq0vb).
//
// Without ping/pong a half-open ws (network blip, sleep/wake) lingers in every
// session.clients map for the TCP keepalive window (~2h) and its stale size
// keeps shrinking the PTY via resizeSessionToMin — so the server pings every
// 30s and terminates a client that misses two consecutive pongs.
//
// The trap: the pong is processed on OUR event loop. When the loop is blocked
// (the 4-minute post-restart history-rebuild stall of the incident) the pong
// sits unread, the interval fires, sees `_isAlive === false`, and terminates
// a perfectly live client — dropping every inbound frame queued on that
// socket (the incident's second attach + two kills were lost exactly this
// way). A miss measured across our own stall is not evidence.
//
// Two stall detectors (the review found the first alone has a blind band: a
// 30-35s block starting right after a ping ends with the tick only 0-5s late
// yet the pong still unread — libuv runs timers before poll):
//   ① tick lateness  — the tick itself fired > STALL_GRACE_MS late;
//   ② loop-gap pulse — a 1s unref'd pulse records the LONGEST gap between
//      pulses since the previous tick; any gap > STALL_GRACE_MS taints the
//      round, wherever inside it the block happened.
// A tainted round terminates nobody (everyone re-pinged, judged next tick).
// Bound: a client that stays pong-less across MAX_TAINTED_MISSES consecutive
// tainted rounds is terminated anyway — a server that stalls every round for
// minutes is not a reason to keep a dead socket forever.
//
// A SLOW CLIENT IS NOT A DEAD ONE (lane connection-notice-once, measured 2026-11-06 at 200 kbit/s: a socket cut about once a minute,
// the `attached` it was owed never read, the chat stuck for good). The ping rides the same queue as everything else, so it
// waits behind what is queued: a frame that takes the link > 30 s (2 MiB slab = 560 kbit/s, 4 MiB replay = 1.1 Mbit/s) makes
// its ping late however healthy the client is. The cut lost the half-read frame (a WebSocket message is applied whole), the
// reconnect asked for the same bytes, the next round cut them again: no progress, ever.
// A miss is therefore waived on PROOF the peer is reading, and only then: src/ws-keepalive.js `drainVerdict` (`livenessVerdict` + keeping up) over `drainMark`, the one rule and the one
// measurement the stream bridges use too. The proof is narrow on purpose: bytes left this socket's queue WHILE THE QUEUE WAS NOT EMPTY. A non-empty queue means the kernel's send buffer was full, and a
// full buffer only makes room when the peer ACKs. Without that condition a half-dead path would pass for slow: the kernel
// swallows a trickle of frames into a buffer with room, ACK or no ACK, so a ghost on a chatty hub would "drain" for the ~15
// minutes TCP takes to give up — the very linger this heartbeat exists to end. One round of grace follows the last proof
// (DRAIN_GRACE_ROUNDS): the ping has to travel what the kernel still held. A waived round sends no second ping: the first is on its way.
// Never `bufferedAmount`: it holds a frame whole, so it does not fall on the very frame this rule exists for.
// A READER THAT CANNOT KEEP UP IS NOT WAIVED FOREVER (r4–r6, the acceptance's G1, H1, B1, B2). `output` frames carry no seq, so `lagged` never stops them and
// nothing else pushes back: a phone at 25 KB/s on a terminal printing 100 KB/s moves bytes every round, so every round read as a drain, and the queue grew without
// limit (measured: 73 MiB and rising in 30 s where the old cut held it at 6). Two growth heuristics later proved no bound, so the waiver is capped in BYTES:
// src/ws-keepalive.js `drainVerdict`. An EPISODE starts at the first round, pong or not, whose backlog is past DRAIN_BACKLOG_ALLOWANCE (`lagged`'s own 4 MiB: a
// chat's frames stop there, so growth past it is a producer `lagged` cannot stop) and ends at the first round back under it; a pong does not end it. Its CEILING is
// its first round's backlog + the allowance. A pong-less round above the ceiling is `losing`: it waives nothing and ends any grace, so the plain rule cuts on that round.
// THE BOUND, proved: at every round a socket survives, its backlog ≤ max(allowance, ceiling) + Pr, where Pr is the most the producer wrote in one round; the round
// that cuts it ≤ that + Pr. Why: a pong-less round that survives is ≤ the ceiling or ≤ the allowance; a pong round holds only what was written since its ping,
// behind which everything older was read, so it is ≤ the round before + Pr. So, with E ≤ max(allowance, what it was owed) + Pr the episode's first backlog:
// ≤ max(4 MiB, owed) + 4 MiB + 2·Pr at a round it survives, + 3·Pr at the round that cuts it. The old code held ≤ Pr (2·Pr at its cut); this rule adds at most
// max(4 MiB, owed) + 4 MiB + Pr. scripts/test-connection-notice-bound.mjs searches it on the acceptance's byte-faithful model, on this file: 0 profiles over in 3 random
// seeds × 10 000, a constant grid of 21 600, the ratchet and a stall-and-catch-up reader. Not covered: rounds our own stall taints (no one is judged then),
// and the clean rounds after them while a ping sent in a tainted round is still outstanding: each tainted round pings again, so later clean rounds are answered by
// those old pings and a pong round is never judged against the ceiling (one 3-minute stall, then a reader that keeps up exactly: 34 MiB held; the release the same).
// THE PRICE: none for a reader that keeps up, holds, or falls behind by less than the allowance since its episode began: none is cut for its backlog. A reader the
// producer outruns is kept until it has fallen 4 MiB behind where it began: 25 KB/s under 100 KB/s at 30 s rounds, cut at 120 s with 9 MiB (the old code: 60 s,
// 4.4 MiB); 1 MB/s under 3.2 MB/s at 2 s rounds, 10 s, 22 MiB (the old code: 4 s, 6 MiB).
// The proof says something on the path ACKed, not that the page read it: a box that terminates TCP ACKs for a peer already gone, and such a ghost is
// carried up to the same bound. No cap in rounds on purpose: 4 MiB at 12 KB/s is 12 rounds of a healthy client.
// A DEAD PEER with a backlog standing is waived on its death round and on the grace round: it is cut up to 3 rounds (≤ 90 s) after it died, the old code ≤ 2.
// An idle dead peer is cut as before.
// THE LIMIT: `taken` only moves when the kernel wakes the writer, which on a deep send buffer (~4 MB, a local relay or reverse proxy on loopback) is bursts of about
// a third of it. Measured on the model at 30 s rounds, 8 MB owed: ≤ 160 kbit/s is cut on its second round (bursts further apart than the grace); 200–560 kbit/s is
// kept through the drain, then often cut once the queue is empty (the kernel's 4 MB ahead of the ping takes longer than the grace to read); from 650 kbit/s kept.
// On a 1 MiB or 256 KiB send buffer, every rate tried from 160 kbit/s is kept.
//
// THE PULSE IS ALSO A MEASUREMENT (perf lane ⑤b, 2.369.167): every round's
// longest loop gap ≥ LOOP_GAP_METRIC_FLOOR_MS is recorded as telemetry metric
// `srv-loop-gap-ms` (Diagnostics percentiles; the reconnect-storm harness reads
// it). Before, the number existed only inside a warn line printed when it
// crossed the 5 s taint — every sub-stall storm was invisible. The floor keeps
// an idle server's timer jitter out of the ledger (≤ one record per 30 s round).
const { livenessVerdict, drainVerdict, drainMark } = require('../ws-keepalive');
const { LAGGED_LIMIT_BYTES } = require('../op-seq');
const INTERVAL_MS = 30000;
const STALL_GRACE_MS = 5000;
const PULSE_MS = 1000;
const MAX_TAINTED_MISSES = 6;
const DRAIN_GRACE_ROUNDS = 1; // after the last proof of a drain: the ping still has to travel what the kernel held
const DRAIN_BACKLOG_ALLOWANCE = LAGGED_LIMIT_BYTES; // past it a backlog must not grow across a pong-less round
const LOOP_GAP_METRIC = 'srv-loop-gap-ms';
const LOOP_GAP_METRIC_FLOOR_MS = 50;

function createWsHeartbeat(wss, { intervalMs = INTERVAL_MS, stallGraceMs = STALL_GRACE_MS, pulseMs = PULSE_MS, maxTaintedMisses = MAX_TAINTED_MISSES, now = Date.now, log = console, metric = (name, value) => global.__vsMetric?.(name, value), gapFloorMs = LOOP_GAP_METRIC_FLOOR_MS } = {}) {
  let expectedAt = null, round = 0;
  let lastPulse = null, maxGapMs = 0;
  /** Loop-gap pulse: called every ~pulseMs; a long gap = the loop was blocked. */
  function pulse() {
    const t = now();
    if (lastPulse != null) maxGapMs = Math.max(maxGapMs, t - lastPulse - pulseMs);
    lastPulse = t;
  }
  /** One heartbeat round. Returns { stalled, terminated, pinged, draining, lateMs, maxGapMs }. */
  function tick() {
    const t = now();
    round++;
    const lateMs = expectedAt == null ? 0 : Math.max(0, t - expectedAt);
    expectedAt = t + intervalMs;
    pulse();
    const gap = maxGapMs; maxGapMs = 0;
    if (gap >= gapFloorMs) { try { metric(LOOP_GAP_METRIC, Math.round(gap)); } catch {} }
    const stalled = lateMs > stallGraceMs || gap > stallGraceMs;
    let terminated = 0, pinged = 0, draining = 0;
    if (stalled) {
      log.warn?.(`[ws] heartbeat round tainted (tick ${Math.round(lateMs / 1000)}s late, longest loop gap ${Math.round(gap / 1000)}s) — no client is judged this round`);
      global.__vsEvent?.('ws-heartbeat-stall-skip');
    }
    for (const client of wss.clients) {
      const mark = drainMark(client), before = client._hbMark;
      client._hbMark = mark;
      const evidence = mark && before ? { queuedBefore: before.queued, wroteBefore: before.taken, wroteNow: mark.taken } : {};
      const proof = livenessVerdict(evidence); // bytes left a full queue this round, a pong or not: the grace's proof
      // every round is judged against the episode (r6): a pong-less one above its ceiling is `losing`; a pong never ends the episode while the backlog is past the allowance
      const v = mark ? drainVerdict(client._hbEpisode || null, { ...evidence, pong: client._isAlive !== false, backlogNow: mark.backlog, backlogAllowance: DRAIN_BACKLOG_ALLOWANCE }) : { verdict: proof, memo: null };
      client._hbEpisode = v.memo;
      const heard = client._isAlive === false ? v.verdict : proof;
      if (heard === 'draining') client._hbDrainRound = round; // the kernel was full and made room: the peer is ACKing
      if (heard === 'losing') client._hbDrainRound = null; // the grace is for a queue that emptied, not one that outgrew its reader
      if (client._isAlive === false) {
        if (client._hbDrainRound != null && round - client._hbDrainRound <= DRAIN_GRACE_ROUNDS) { // slow, not dead: its ping waits behind what it is reading
          draining++;
          if (!client._hbDrainTold) { client._hbDrainTold = true; global.__vsEvent?.('ws-heartbeat-slow-drain'); }
          continue;
        }
        client._hbMisses = (client._hbMisses || 0) + 1;
        if (!stalled || client._hbMisses > maxTaintedMisses) {
          log.warn?.(`[ws] heartbeat terminating a client: no pong for ${client._hbMisses} round(s)${stalled ? ' (tainted rounds exhausted)' : ''}${heard === 'losing' ? ` — it is reading, but its queue grew to ${Math.round(mark.backlog / 1048576)} MiB: the producer outruns it` : ''}`);
          global.__vsEvent?.('ws-heartbeat-terminate');
          if (heard === 'losing') global.__vsEvent?.('ws-heartbeat-outrun');
          try { client.terminate(); terminated++; } catch {}
          continue;
        }
      } else {
        client._hbMisses = 0;
      }
      client._isAlive = false;
      try { client.ping(); pinged++; } catch {}
    }
    return { stalled, terminated, pinged, draining, lateMs, maxGapMs: gap };
  }
  function start() {
    if (wss._heartbeatTimer) return wss._heartbeatTimer;
    expectedAt = now() + intervalMs;
    lastPulse = now();
    wss._heartbeatTimer = setInterval(tick, intervalMs);
    wss._heartbeatTimer.unref?.();
    wss._heartbeatPulse = setInterval(pulse, pulseMs);
    wss._heartbeatPulse.unref?.();
    return wss._heartbeatTimer;
  }
  return { tick, pulse, start, INTERVAL_MS: intervalMs, STALL_GRACE_MS: stallGraceMs };
}

module.exports = { createWsHeartbeat, drainMark, DRAIN_GRACE_ROUNDS, DRAIN_BACKLOG_ALLOWANCE, INTERVAL_MS, STALL_GRACE_MS, PULSE_MS, MAX_TAINTED_MISSES, LOOP_GAP_METRIC, LOOP_GAP_METRIC_FLOOR_MS };
