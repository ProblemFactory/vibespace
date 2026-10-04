'use strict';
// THE BOOT PHASE (lane update-reload-ready, B-0ece): the server says when it is
// ready for a PAGE, not merely listening. `booting` until every registered boot
// step the first paint needs is done — the session restore (GET /api/active
// lists what came back) and the first sessions sweep (GET /api/sessions; cold,
// it forks ps/pgrep per session — seconds on a busy fleet boot) — then `ready`.
// The update dialog and the stale-tab auto-reload wait for `ready` before they
// reload; the boot splash waits for it before it asks for the layout.
// A step that never finishes does not hold the fleet hostage: after stuckMs the
// phase turns `ready` anyway with the steps it gave up on in `stuck`, and ONE
// `boot-stuck` telemetry event names them (what the boot was waiting on).
// VIBESPACE_TEST_BOOT_HOLD_MS (TEST ONLY — a chrome suite's slow-booting
// scratch server) adds a `test-hold` step that finishes after that many ms.

/** PURE: the phase a set of steps adds up to. steps = [{ name, done }]. */
function phaseOf({ steps, startedAt, now, stuckMs }) {
  const waitingOn = steps.filter((s) => !s.done).map((s) => s.name);
  if (!waitingOn.length) return { phase: 'ready', waitingOn: [], stuck: [] };
  if (now - startedAt >= stuckMs) return { phase: 'ready', waitingOn: [], stuck: waitingOn };
  return { phase: 'booting', waitingOn, stuck: [] };
}

function create({ now = Date.now, stuckMs = 90000, sessionsCount = () => 0, record = () => {}, log = console, testHoldMs = 0, setTimer = setTimeout } = {}) {
  const startedAt = now();
  const steps = [];
  let readyAt = null, stuckReported = false, timer = null;
  const settle = () => {
    const p = phaseOf({ steps, startedAt, now: now(), stuckMs });
    if (p.phase === 'ready' && readyAt == null) {
      readyAt = now();
      if (timer) { try { clearTimeout(timer); } catch { } timer = null; }
      if (p.stuck.length && !stuckReported) {
        stuckReported = true;
        const detail = `waiting on ${p.stuck.join(', ')} after ${Math.round((readyAt - startedAt) / 1000)}s`;
        try { log.warn?.(`[boot] stuck — ${detail}; serving pages anyway`); } catch { }
        try { record({ kind: 'event', name: 'boot-stuck', detail }); } catch { }
      } else {
        try { log.log?.(`[boot] ready for pages after ${readyAt - startedAt} ms (${sessionsCount()} sessions)`); } catch { }
      }
    }
    return p;
  };
  /** Register a boot step; returns its done() (idempotent). */
  function step(name) {
    const s = { name, done: false };
    steps.push(s);
    return () => { if (!s.done) { s.done = true; settle(); } };
  }
  const listened = step('listen'); // nothing is ready before the listen callback registered the rest
  /** Called once the listen callback registered every step. */
  function arm() {
    if (testHoldMs > 0) { const done = step('test-hold'); setTimer(done, testHoldMs); }
    timer = setTimer(() => { timer = null; settle(); }, stuckMs);
    try { timer.unref?.(); } catch { }
    listened();
  }
  function snapshot() {
    const p = settle();
    return { phase: p.phase, waitingOn: p.waitingOn, stuck: p.stuck, sessions: sessionsCount(), startedAt, readyAt, uptimeMs: now() - startedAt };
  }
  return { step, arm, snapshot, isReady: () => snapshot().phase === 'ready' };
}

module.exports = { create, phaseOf };
