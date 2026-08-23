'use strict';
// AUTO-CONTINUE AFTER A USAGE LIMIT RESETS (2.368.0, owner request after the
// CLI shipped its own version).
//
// The CLI has this feature, but it lives in the interactive REPL: `/rate-limit-
// options` is not in a stream-json session's command list (verified against a
// real init record) and the timer is a TUI `useInterval`. So a VibeSpace chat
// session hits the limit and just sits there. This module is our own, with the
// same shape — armed → fires at the reset — and one thing the CLI's cannot do:
// it SURVIVES A RESTART (the CLI's own text says "Automatic continue cancelled
// · Claude Code relaunched during the wait"). Ours is persisted and re-armed at
// boot, because a wait measured in HOURS that a deploy silently cancels is
// worse than no feature at all.
//
// ORDER OF PREFERENCE, deliberately: when the account pool has somewhere else
// to go it SWITCHES (usage-pool-engine, unchanged) — that resumes in seconds
// instead of hours. This module is the single-account fallback, so it arms on
// exhaustion and quietly disarms the moment the session produces work again
// (a switch, the user's own prompt, anything): the fire path must never be the
// reason a session starts spending.
//
// SPENDING IS THE RISK, so the gate is explicit at three levels: the global
// default (`claude.autoResumeOnLimit`, default OFF), a per-session value taken
// at spawn, and a live per-session toggle. Firing announces itself in the
// conversation — an unexplained turn that costs money is not acceptable.
const fs = require('fs');
const path = require('path');

// The CLI's own continue prompt, verbatim (2.1.239) — same words, so a session
// that has seen the TUI behave this way sees nothing new.
const CONTINUE_PROMPT = 'You can continue now. Continue the task you were working on when the usage limit was reached; do not repeat work that is already complete.';
const TICK_MS = 30000;      // the CLI polls at 30s; match it
const GRACE_MS = 15000;     // let the reset actually land before asking
const MAX_WAIT_MS = 26 * 60 * 60 * 1000; // a weekly bucket can be far out; refuse to sit forever

function writeJsonAtomic(file, obj) {
  fs.writeFileSync(file + '.tmp', JSON.stringify(obj, null, 2));
  fs.renameSync(file + '.tmp', file);
}

/**
 * @param deps.activeSessions Map<id, session>
 * @param deps.sendToSession  (id, session, text) => boolean — puts a USER message
 *        into the live session exactly as a typed one would (so it lands in the
 *        transcript and the UI); returns false when the session cannot take it.
 * @param deps.serverSetting  (key) => value  — the global default
 * @param deps.broadcast      (sessionId, msg) => void — per-session UI state
 * @param deps.notify         (sessionId, session, text) => void — a visible line in the chat
 */
function create({ dataDir, activeSessions, sendToSession, serverSetting, broadcast = () => { }, notify = null, log = () => { } }) {
  const file = path.join(dataDir, 'auto-resume.json');
  let armed = new Map(); // webuiId -> { at, resetsAt, reason, cid, fired }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    for (const [k, v] of Object.entries(raw && raw.armed ? raw.armed : {})) armed.set(k, v);
  } catch { }
  let timer = null;

  const save = () => {
    try { writeJsonAtomic(file, { armed: Object.fromEntries(armed) }); }
    catch (e) { log('[auto-resume] persist failed: ' + e.message); }
  };
  const globalDefault = () => { try { return serverSetting('claude.autoResumeOnLimit') === true; } catch { return false; } };

  /** Per-session preference: what the session was spawned with, else the global
   *  default. `session._autoResume` is set at create and by the live toggle. */
  function enabledFor(session) {
    if (!session) return false;
    if (session._autoResume === true) return true;
    if (session._autoResume === false) return false;
    return globalDefault();
  }

  function statusFor(id) {
    const session = activeSessions.get(id);
    const a = armed.get(id) || null;
    return {
      enabled: enabledFor(session),
      explicit: session && session._autoResume !== undefined ? !!session._autoResume : null,
      globalDefault: globalDefault(),
      armed: !!a && !a.fired,
      resetsAt: a ? a.resetsAt : null,
      reason: a ? a.reason : null,
    };
  }
  const emit = (id) => { try { broadcast(id, { type: 'auto-resume', sessionId: id, status: statusFor(id) }); } catch { } };

  /** The live toggle (ws). Turning it OFF also cancels a pending wait. */
  function setEnabled(id, on) {
    const session = activeSessions.get(id);
    if (session) session._autoResume = !!on;
    if (!on && armed.has(id)) { armed.delete(id); save(); }
    emit(id);
    return statusFor(id);
  }

  /** Exhaustion seen for this session (rate_limit_event status=rejected, or a
   *  limit banner). resetsAtMs may be null — without a reset time there is
   *  nothing to wait FOR, so we do not pretend. */
  function armIfEnabled(id, session, resetsAtMs, reason) {
    if (!id || !session) return null;
    if (!enabledFor(session)) return null;
    const at = Date.now();
    const resets = Number(resetsAtMs) || 0;
    if (!resets || resets <= at) return null;                 // already past / unknown
    if (resets - at > MAX_WAIT_MS) {                          // a week out: say so, do not squat
      log(`[auto-resume] ${id}: reset is ${(Math.round((resets - at) / 3600000))}h away — not arming`);
      return null;
    }
    const prev = armed.get(id);
    if (prev && !prev.fired && prev.resetsAt === resets) return prev; // idempotent
    const rec = { at, resetsAt: resets, reason: reason || 'usage limit', cid: session.claudeSessionId || null, fired: false };
    armed.set(id, rec);
    save();
    log(`[auto-resume] ${id}: armed for ${new Date(resets).toISOString()} (${reason})`);
    if (notify) { try { notify(id, session, `用量已达上限。已安排在 ${new Date(resets).toLocaleString()} 重置后自动继续（状态栏可取消）。`); } catch { } }
    emit(id);
    return rec;
  }

  /** Anything that proves the session is working again disarms the wait: a
   *  pool switch that took over, the user's own prompt, a fresh non-rejected
   *  reading. A fire that lands on an already-recovered session is a wasted
   *  (billed) turn. */
  function noteRecovered(id, why) {
    const a = armed.get(id);
    if (!a || a.fired) return;
    armed.delete(id); save();
    log(`[auto-resume] ${id}: disarmed (${why})`);
    emit(id);
  }
  function forget(id) { if (armed.delete(id)) { save(); } }

  function due(now) {
    const out = [];
    for (const [id, a] of armed) {
      if (a.fired) continue;
      if (now >= a.resetsAt + GRACE_MS) out.push([id, a]);
    }
    return out;
  }

  /** One tick: fire everything due whose session is alive and idle. */
  function tick(now = Date.now()) {
    let fired = 0;
    for (const [id, a] of due(now)) {
      const session = activeSessions.get(id);
      if (!session) { armed.delete(id); save(); continue; }          // gone: nothing to continue
      if (!enabledFor(session)) { noteRecovered(id, 'disabled'); continue; }
      if (session._isStreaming) { continue; }                        // it is already working — try next tick
      const ok = sendToSession(id, session, CONTINUE_PROMPT);
      if (!ok) { log(`[auto-resume] ${id}: could not deliver the continue prompt (will retry)`); continue; }
      armed.delete(id); save(); fired++;
      log(`[auto-resume] ${id}: usage limit reset — continued automatically`);
      if (notify) { try { notify(id, session, '用量上限已重置，已自动继续这个任务。'); } catch { } }
      emit(id);
    }
    return fired;
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => { try { tick(); } catch (e) { log('[auto-resume] tick failed: ' + e.message); } }, TICK_MS);
    if (timer.unref) timer.unref();
  }
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

  return { armIfEnabled, noteRecovered, forget, setEnabled, statusFor, enabledFor, tick, start, stop, CONTINUE_PROMPT, _armed: armed };
}

module.exports = { create, CONTINUE_PROMPT, TICK_MS, GRACE_MS, MAX_WAIT_MS };
