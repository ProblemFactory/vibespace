'use strict';
/**
 * THE LIVE-LANE CORE — one arm, one connection, `stop()` terminal
 * (docs/design-communication-panel.zh.md §6.4; P1's push half).
 *
 * PURE of vendors: it imports nothing and knows no transport. A transport is
 * `connect(handlers)` — open ONE connection and return `{close()}` — and every
 * lane in src/channels/live/ (the Lark long connection, the Gmail Pub/Sub
 * pull loop, the suite's fake ws) is this core over its own `connect`. The
 * core owns exactly the four things the design names and nothing else:
 *
 *  · LIVENESS IS POSITIVE EVIDENCE (the opencode-events round-4 lesson). The
 *    lane reports `live` only when a handshake landed or the transport HEARD
 *    something (`handlers.heard()` — an event, a pong, a pull that answered);
 *    it never asserts `live` from a timer. `laneState()` then adds the
 *    heartbeat window on top, so a lane that goes silent falls out of `live`
 *    by itself and polling returns to the fast cadence with nothing else
 *    deciding it.
 *  · THE ACK IS THE RETURN. `handlers.event(ev)` resolves with the engine's
 *    answer, and the engine answers only after the record is DURABLE
 *    (fence 11: persist → ack → process). A transport acks AFTER that promise
 *    resolves; it never acks on receipt.
 *  · `stop()` IS TERMINAL FOR AN ARM IN FLIGHT (the opencode-events round-6
 *    rule). Every continuation is keyed on the arm's epoch: a connect that
 *    lands after `stop()` is closed on the spot, a `heard()`/`closed()` from a
 *    superseded arm reports nothing, and `event()` on a stopped lane answers
 *    `{ok:false, why:'stopped'}` WITHOUT calling the engine — so the vendor
 *    gets no ack and redelivers to whoever is alive. Nothing is emitted after
 *    `stopped`.
 *  · THE LANE IS SINGLE-USE. A stopped lane never re-arms; the engine starts a
 *    fresh one (a re-declaration retries the lane ONCE, with a new arm).
 *
 * Reconnects back off exponentially between `reconnectMinMs` and
 * `reconnectMaxMs`; a `connect()` that throws with `err.permanent` (no SDK,
 * no credential, no scope) parks the lane as `unavailable` with that reason
 * instead of retrying into the same wall — the adapter row says why. A
 * permanent failure discovered INSIDE a connection (a 403 pull, a refused
 * watch renewal) is reported through `handlers.fail(err)` and parks the same
 * way; reporting it as `closed` would reconnect into the same wall every
 * ≤60 s forever (design §6.4: a permanent error parks). Both `closed` and
 * `fail` close the connection they end — a transport that reports its own
 * end may still own timers.
 *
 * The clock and the timers are injected so the push suite can drive a
 * heartbeat window without waiting one out.
 */

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 60 * 1000;

/**
 * @param {object} o
 * @param {string}   o.name          for the log line
 * @param {function} o.connect       async (handlers) => { close(why) } — handlers:
 *                                   heard(), event(ev) -> Promise<answer>, closed(why), fail(err)
 * @param {function} o.onEvent       the engine's: async (ev) => answer
 * @param {function} o.onState       the engine's: ({state, at, heard?, why?}) => void
 * @returns {{ stop(why?): void, state(): string }}
 */
function startLane({ name = 'lane', connect, onEvent, onState, now = () => Date.now(), log = console, setTimer = setTimeout, clearTimer = clearTimeout, reconnectMinMs = RECONNECT_MIN_MS, reconnectMaxMs = RECONNECT_MAX_MS } = {}) {
  if (typeof connect !== 'function') throw new Error('startLane: connect(handlers) is required');
  let stopped = false;
  let epoch = 0;          // the CURRENT arm; every continuation checks it
  let conn = null;
  let timer = null;
  let attempts = 0;
  let state = 'connecting';
  let inFlight = 0;

  function say(next, extra = {}) {
    if (stopped && next !== 'stopped') return;   // nothing after `stopped`
    state = next;
    try { onState && onState({ state: next, at: now(), ...extra }); }
    catch (e) { log.warn && log.warn(`[channels] ${name}: onState threw: ${(e && e.message) || e}`); }
  }

  async function arm() {
    if (stopped) return;
    const my = ++epoch;
    say('connecting', { attempt: attempts });
    let c;
    try {
      c = await connect({
        heard: () => { if (my !== epoch || stopped) return; say('live', { heard: true }); },
        event: async (ev) => {
          if (my !== epoch || stopped) return { ok: false, why: 'stopped' };   // no engine call, no ack
          inFlight++;
          try { return await onEvent(ev); } finally { inFlight--; }
        },
        closed: (why) => {
          if (my !== epoch || stopped) return;
          epoch++;                                  // this arm is over: its late handlers report nothing
          const c0 = conn; conn = null;
          try { c0 && typeof c0.close === 'function' && c0.close(why); } catch {}
          say('reconnecting', { why: why == null ? null : String(why) });
          schedule();
        },
        fail: (err) => {
          if (my !== epoch || stopped) return;
          epoch++;
          const c0 = conn; conn = null;
          try { c0 && typeof c0.close === 'function' && c0.close('unavailable'); } catch {}
          say('unavailable', { why: (err && err.message) || String(err), code: (err && err.code) || null });
        },
      });
    } catch (err) {
      if (my !== epoch || stopped) return;
      const why = (err && err.message) || String(err);
      if (err && err.permanent) { say('unavailable', { why, code: err.code || null }); return; }
      say('reconnecting', { why });
      schedule();
      return;
    }
    if (my !== epoch || stopped) {
      // The arm landed AFTER stop(): terminal means terminal — close it now.
      try { c && typeof c.close === 'function' && c.close('stopped'); } catch {}
      return;
    }
    conn = c || null;
    attempts = 0;
    say('live', { heard: true });   // a completed handshake is positive evidence
  }

  function schedule() {
    if (stopped || timer) return;
    const delay = Math.min(reconnectMaxMs, reconnectMinMs * (2 ** Math.min(attempts, 12)));
    attempts++;
    timer = setTimer(() => { timer = null; arm(); }, delay);
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  arm();

  return {
    stop(why = 'stopped') {
      if (stopped) return;
      stopped = true;
      epoch++;                                  // every in-flight continuation is now superseded
      if (timer) { try { clearTimer(timer); } catch {} timer = null; }
      const c = conn; conn = null;
      try { c && typeof c.close === 'function' && c.close(why); } catch (e) { log.warn && log.warn(`[channels] ${name}: close threw: ${(e && e.message) || e}`); }
      say('stopped', { why });
    },
    state: () => state,
    inFlight: () => inFlight,
  };
}

module.exports = { startLane, RECONNECT_MIN_MS, RECONNECT_MAX_MS };
