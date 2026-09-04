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
const INTERVAL_MS = 30000;
const STALL_GRACE_MS = 5000;
const PULSE_MS = 1000;
const MAX_TAINTED_MISSES = 6;

function createWsHeartbeat(wss, { intervalMs = INTERVAL_MS, stallGraceMs = STALL_GRACE_MS, pulseMs = PULSE_MS, maxTaintedMisses = MAX_TAINTED_MISSES, now = Date.now, log = console } = {}) {
  let expectedAt = null;
  let lastPulse = null, maxGapMs = 0;
  /** Loop-gap pulse: called every ~pulseMs; a long gap = the loop was blocked. */
  function pulse() {
    const t = now();
    if (lastPulse != null) maxGapMs = Math.max(maxGapMs, t - lastPulse - pulseMs);
    lastPulse = t;
  }
  /** One heartbeat round. Returns { stalled, terminated, pinged, lateMs, maxGapMs }. */
  function tick() {
    const t = now();
    const lateMs = expectedAt == null ? 0 : Math.max(0, t - expectedAt);
    expectedAt = t + intervalMs;
    pulse();
    const gap = maxGapMs; maxGapMs = 0;
    const stalled = lateMs > stallGraceMs || gap > stallGraceMs;
    let terminated = 0, pinged = 0;
    if (stalled) {
      log.warn?.(`[ws] heartbeat round tainted (tick ${Math.round(lateMs / 1000)}s late, longest loop gap ${Math.round(gap / 1000)}s) — no client is judged this round`);
      global.__vsEvent?.('ws-heartbeat-stall-skip');
    }
    for (const client of wss.clients) {
      if (client._isAlive === false) {
        client._hbMisses = (client._hbMisses || 0) + 1;
        if (!stalled || client._hbMisses > maxTaintedMisses) {
          log.warn?.(`[ws] heartbeat terminating a client: no pong for ${client._hbMisses} round(s)${stalled ? ' (tainted rounds exhausted)' : ''}`);
          global.__vsEvent?.('ws-heartbeat-terminate');
          try { client.terminate(); terminated++; } catch {}
          continue;
        }
      } else {
        client._hbMisses = 0;
      }
      client._isAlive = false;
      try { client.ping(); pinged++; } catch {}
    }
    return { stalled, terminated, pinged, lateMs, maxGapMs: gap };
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

module.exports = { createWsHeartbeat, INTERVAL_MS, STALL_GRACE_MS, PULSE_MS, MAX_TAINTED_MISSES };
