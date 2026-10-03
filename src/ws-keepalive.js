'use strict';
/**
 * THE WS KEEPALIVE — one rule for every long-lived WebSocket bridge (imports nothing; lane stream-ping, 2026-10-02).
 *
 * 2.369.118 (userW's "Desktop disconnected" with nothing in any log): a stream over a still picture carries no bytes for
 * minutes, and a peer that vanished without a close frame (a phone that slept, a proxy that dropped the socket, a NAT
 * that forgot it) is never noticed by the server — the kernel's TCP timeout is many minutes, and until then the socket
 * "is open". The desktop bridge got 20 s pings and a NAMED close line; the live view's bridge (browser-stream) had none,
 * and browser-windows r5 measured the cost: a half-open viewer stayed counted (the window "watched") until the kernel gave
 * up. One rule, used by both bridges:
 *   every `pingMs` tick: a peer that answered no pong since the previous tick is DROPPED (terminated — a half-open peer
 *   would never read a close frame) with the reason `no pong for <2 × pingMs> ms` (the desktop bridge's own words); else
 *   it is pinged. A pong marks it alive. So a peer silent for two rounds (≤ 2 × pingMs) is gone, a live one never is.
 *
 * OUR OWN STALL IS NOT THE PEER'S DEATH (verify r1 T1①, the 2.369.16 rule — "ATTACH STORM STALL → HEARTBEAT KILLED THE
 * CLIENT"): the pong is READ on our event loop. A sync burst that blocks the loop right after a tick's ping (the
 * 2.369.16 storm: bursts back to back, one loop turn between them) leaves every peer's pong unread in the kernel, and
 * the next tick judged them all dead at once — measured: 3 live viewers answering every ping in 30 ms, two 3 s bursts at
 * keepaliveMs 200 ⇒ all 3 dropped (a reconnect storm into a stalled server). So a tick is a VERDICT only when the
 * server was not stalled across the round: the tick is late by > stallGraceMs, or the loop-gap gauge (a shared unref'd
 * pulse: the longest time the loop did not turn since the previous tick) saw a gap > stallGraceMs ⇒ the round is
 * STALLED: nobody is dropped, the silent peer is pinged again and judged next round. stallGraceMs = min(5 s, pingMs / 2)
 * (2.369.16: a lateness > 5 s is never a death). Bound: a peer pong-less across MAX_STALLED_MISSES stalled rounds in a
 * row is dropped anyway — a server that stalls every round is no reason to keep a dead socket forever.
 *
 *   keepaliveInit(now, {pingMs, stallGraceMs}) → the state
 *   keepaliveStep(state, event, now, {loopGapMs}) → {state, send: 'ping' | null, drop: false | {code, reason}, stalled}  (PURE)
 *   createLoopGauge({clock, pulseMs})     → the loop-gap gauge: read(since) → {gapMs, at}; retain()/release() run its pulse
 *   armKeepalive(ws, {pingMs, now, onDrop, gauge}) → {stop()} — the timer + the socket's pong, driving keepaliveStep with
 *                                           the gauge's gap AND the round's evidence (livenessVerdict below); on a drop it
 *                                           calls `onDrop({code, reason})` (the bridge names the close) and terminates.
 *
 * A MISSING PONG IS NOT YET SILENCE (lane desktop-keepalive, userW inc-muoshmqn-dect — folded in here at the 2.369.202
 * integration, so both bridges run ONE rule): the ping is a protocol frame QUEUED BEHIND every byte already in the send
 * buffer (up to the bridge's high-water mark), so a live peer reading slowly behind a full queue never saw it — measured
 * on the desktop bridge (test-desktop-stream-keepalive §6: a browser reading at 512 KiB/s was cut as dead). A pong-less
 * round is therefore a death only when the peer ALSO sent nothing and the socket made no progress THROUGH A BACKLOG
 * (bytes waiting in user space while the kernel accepted more since: room the PEER's acknowledgements made):
 *   livenessVerdict({pong, inbound, wroteBefore, wroteNow, queuedBefore}) → 'alive' | 'draining' | 'silent'   (PURE)
 * A round heard as alive / draining is a round with a pong; a drop after a round heard silent says so in its reason
 * (`… and nothing acknowledged`). keepaliveStep without `heard` (no evidence) keeps the classic words.
 * Gate: scripts/test-ws-keepalive.mjs (the step table + a mutant control + the census: every src/server/*-stream.js arms
 * it and pings nowhere else; ⑤ the stall table + the gauge; ⑥ the REAL bridge through a stall storm).
 */
const PING_MS = 20000;
/** 2.369.16: a tick later than this (or a loop gap longer) means OUR loop was blocked — no verdict that round. */
const STALL_GRACE_MS = 5000;
/** 2.369.16's bound (ws-heartbeat MAX_TAINTED_MISSES): consecutive stalled pong-less rounds before a drop anyway. */
const MAX_STALLED_MISSES = 6;
/** The gauge's pulse: the loop turning at least this often is "not stalled". */
const PULSE_MS = 1000;
/** The close code a keepalive drop reads as (the socket is terminated: no close frame ⇒ 1006 at both ends). */
const KEEPALIVE_DROP_CODE = 1006;
const dropReason = (pingMs) => `no pong for ${2 * pingMs} ms`;
/** The words a drop adds when the round's evidence was read and was silent (lane desktop-keepalive's close line). */
const NOTHING_ACKED = ' and nothing acknowledged';
/** The desktop bridge's export (lane desktop-keepalive): the silent rounds a peer is allowed — the ping round + one. */
const SILENT_ROUNDS_TO_CUT = 2;
/**
 * THE LIVENESS RULE (lane desktop-keepalive): a pong, or bytes FROM the peer (an RFB client asks for the next update
 * after every one it draws; an xpra client acks every frame; a live view sends its input / fits) ⇒ alive; while bytes
 * wait in the user-space queue (`queuedBefore` > 0) the kernel's send buffer is full, so every byte it accepted since
 * (`wroteNow` > `wroteBefore`, accepted = bytesWritten − writableLength) is room the peer's acknowledgements made ⇒
 * draining (alive, reading); with no backlog a small write lands in a non-full kernel buffer whether or not anybody is
 * there — never evidence ⇒ silent.
 */
function livenessVerdict({ pong = false, inbound = 0, wroteBefore = 0, wroteNow = 0, queuedBefore = 0 } = {}) {
  if (pong || Number(inbound) > 0) return 'alive';
  if (Number(queuedBefore) > 0 && Number(wroteNow) > Number(wroteBefore)) return 'draining';
  return 'silent';
}

function keepaliveInit(now = 0, { pingMs = PING_MS, stallGraceMs = null } = {}) {
  const p = Number(pingMs) > 0 ? Number(pingMs) : PING_MS;
  const g = Number(stallGraceMs) > 0 ? Number(stallGraceMs) : Math.min(STALL_GRACE_MS, p / 2);
  return { alive: true, lastPongAt: Number(now) || 0, pingMs: p, stallGraceMs: g, lastTickAt: Number(now) || 0, misses: 0 };
}
function keepaliveStep(state, event, now = 0, { loopGapMs = 0, heard = null } = {}) {
  const s = { ...(state || keepaliveInit(now)) };
  const t = Number(now) || 0;
  if (event === 'pong') { s.alive = true; s.misses = 0; s.lastPongAt = t || s.lastPongAt; return { state: s, send: null, drop: false, stalled: false }; }
  if (event === 'tick') {
    const grace = Number(s.stallGraceMs) > 0 ? Number(s.stallGraceMs) : Math.min(STALL_GRACE_MS, s.pingMs / 2);
    const late = Number.isFinite(Number(s.lastTickAt)) ? Math.max(0, t - Number(s.lastTickAt) - s.pingMs) : 0;
    const stalled = late > grace || (Number(loopGapMs) || 0) > grace; // our loop was blocked across this round
    s.lastTickAt = t;
    // the round's evidence (armKeepalive reads it): bytes from the peer or progress through a backlog ⇒ a live peer whose
    // pong waits behind the queue — the round counts as answered
    if (!s.alive && (heard === 'alive' || heard === 'draining')) s.alive = true;
    if (!s.alive) {
      s.misses = (Number(s.misses) || 0) + 1;
      const acked = heard === 'silent' ? NOTHING_ACKED : '';
      if (stalled && s.misses <= MAX_STALLED_MISSES) return { state: s, send: 'ping', drop: false, stalled }; // no verdict: judged next round
      const reason = s.misses === 1 ? dropReason(s.pingMs) + acked // the classic two silent rounds — the desktop bridge's words, byte-identical (+ what the evidence said)
        : stalled ? `no pong for ${Math.max(0, t - s.lastPongAt)} ms${acked} (${s.misses} stalled rounds in a row)` // the bound
        : `${dropReason(s.pingMs)}${acked} after ${s.misses - 1} stalled round(s)`; // forgiven while we stalled, silent in a clean round
      return { state: s, send: null, drop: { code: KEEPALIVE_DROP_CODE, reason }, stalled };
    }
    s.misses = 0;
    s.alive = false;
    return { state: s, send: 'ping', drop: false, stalled };
  }
  return { state: s, send: null, drop: false, stalled: false };
}
/**
 * THE LOOP-GAP GAUGE (verify r1 T1①): one unref'd pulse per process (running while any keepalive is armed); every
 * sample records how far past its cadence the loop turned. `read(since)` samples NOW (a tick that runs in the same loop
 * turn as the end of a block sees the block before the pulse does) and returns the longest gap that ended after `since`
 * (the gauge's own monotonic clock — never mixed with a caller's injected `now`).
 */
function createLoopGauge({ clock = () => (globalThis.performance && typeof globalThis.performance.now === 'function' ? globalThis.performance.now() : Date.now()),
  pulseMs = PULSE_MS, setIntervalFn = setInterval, clearIntervalFn = clearInterval, keep = 64 } = {}) {
  let last = null, timer = null, users = 0;
  const gaps = []; // {at, ms}, newest last
  function sample() {
    const t = clock();
    if (last != null) { const ms = t - last - pulseMs; if (ms > 0) { gaps.push({ at: t, ms }); if (gaps.length > keep) gaps.shift(); } }
    last = t;
    return t;
  }
  function read(since = -Infinity) {
    const at = sample();
    let gapMs = 0;
    for (const g of gaps) if (g.at > since && g.ms > gapMs) gapMs = g.ms;
    return { gapMs, at };
  }
  function retain() {
    if (users++ > 0) return;
    last = clock();
    timer = setIntervalFn(sample, pulseMs);
    if (timer && typeof timer.unref === 'function') timer.unref();
  }
  function release() {
    if (users <= 0 || --users > 0) return;
    if (timer !== null) { clearIntervalFn(timer); timer = null; }
    last = null; gaps.length = 0;
  }
  return { read, sample, retain, release, now: clock, get users() { return users; } };
}
/** The process's gauge — every armed keepalive (both bridges) reads it. */
const LOOP_GAUGE = createLoopGauge();
function armKeepalive(ws, { pingMs = PING_MS, now = Date.now, onDrop = () => {}, setIntervalFn = setInterval, clearIntervalFn = clearInterval, gauge = LOOP_GAUGE } = {}) {
  let state = keepaliveInit(now(), { pingMs });
  let timer = null;
  let since = null;
  if (gauge) { gauge.retain(); since = gauge.now(); }
  const onPong = () => { state = keepaliveStep(state, 'pong', now()).state; };
  // the round's evidence (livenessVerdict): messages from the peer, and the kernel's progress through a backlog — bytes
  // the KERNEL accepted = bytesWritten − writableLength (Node's bytesWritten also counts what still waits in the socket's
  // own buffer: a queued 2-byte ping moved it on a dead path — lane desktop-keepalive, measured)
  let inbound = 0;
  const onMessage = () => { inbound++; }; // a listener of its own — the bridge's relay listener is untouched
  const wrote = () => { try { const so = ws._socket; return so ? Math.max(0, (Number(so.bytesWritten) || 0) - (Number(so.writableLength) || 0)) : 0; } catch { return 0; } };
  const queued = () => { try { return Number(ws.bufferedAmount) || 0; } catch { return 0; } };
  let wBefore = wrote(), qBefore = queued();
  const stop = () => {
    if (timer !== null) { clearIntervalFn(timer); timer = null; if (gauge) gauge.release(); }
    try { if (typeof ws.off === 'function') { ws.off('pong', onPong); ws.off('message', onMessage); } } catch { /* gone */ }
  };
  ws.on('pong', onPong);
  ws.on('message', onMessage);
  timer = setIntervalFn(() => {
    if (ws.readyState !== 1) { stop(); return; }
    let loopGapMs = 0;
    if (gauge) { const g = gauge.read(since); loopGapMs = g.gapMs; since = g.at; }
    const wNow = wrote(), qNow = queued();
    const heard = livenessVerdict({ pong: false, inbound, wroteBefore: wBefore, wroteNow: wNow, queuedBefore: qBefore });
    inbound = 0; wBefore = wNow; qBefore = qNow;
    const r = keepaliveStep(state, 'tick', now(), { loopGapMs, heard });
    state = r.state;
    if (r.drop) { stop(); try { onDrop(r.drop); } catch { /* the bridge's words */ } try { ws.terminate(); } catch { /* gone */ } return; }
    if (r.send === 'ping') { try { ws.ping(); } catch { /* closing */ } }
  }, state.pingMs);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return { stop };
}

module.exports = { PING_MS, STALL_GRACE_MS, MAX_STALLED_MISSES, PULSE_MS, KEEPALIVE_DROP_CODE, NOTHING_ACKED, SILENT_ROUNDS_TO_CUT, dropReason, livenessVerdict, keepaliveInit, keepaliveStep, createLoopGauge, LOOP_GAUGE, armKeepalive };
