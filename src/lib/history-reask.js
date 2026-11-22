// THE PAGE'S RE-ASK OF A HISTORY THE HUB ANSWERED «NOT LOADED» — PURE (imports nothing, DOM-free; the clock is an ARGUMENT, so the
// legs never depend on the time of day). Row B-422c (主开发 r1243 item 2, r1461 (3)):
//   · a window told «not loaded» ASKS AGAIN BY ITSELF — never sooner than its BACK-OFF (2 s, doubling at each ask answered «not
//     loaded» again, ≤ 10 min) nor than the hub's own next try when that is later; ONE ask due at a time (an earlier one kept: one
//     answer said twice — the attach handler, then the reset its rebuild arms — never pushes a prompt ask back);
//   · the timer's ask is CHEAP (`history-ask`: the hub reads again and rebuilds nothing; a reply «not loaded» again changes only the
//     time in the page's words); a RELOAD (the re-attach that rebuilds, or a view's request) only when the hub says the history is
//     readable — `history-ready`, the ask's reply or the push — and a ready while a reload is on its way IS that reload (asked
//     again in 2 s if it still says «not loaded»);
//   · only an answer that CARRIES the history resets the back-off: a reconnect's answer «not loaded» again does not.
export const FLOOR_MS = 2000, CAP_MS = 10 * 60000, PROMPT_MS = 2000, RELOAD_FLIGHT_MS = 30000;

/** the hub's next try on THIS page's clock: its delay (`retryIn`, counted from the hub's now) from the page's `now` — a page clock
 *  ahead or behind the hub's asks neither early nor late; else the hub's instant (`retryAt`); 0 = none said */
export function retryAtOf(info, now) {
  const d = info && info.retryIn != null ? Number(info.retryIn) : NaN;
  return Number.isFinite(d) ? now + Math.max(0, d) : (Number(info && info.retryAt) || 0);
}

/** when the next ask is due → ms since the epoch: the back-off's floor (`prompt`: 2 s), the hub's time when later, ≤ 10 min from
 *  `now`; a due already set that is EARLIER stands */
export function reaskAt({ now, at = 0, tries = 0, prompt = false, pendingDue = 0 }) {
  const floor = prompt ? PROMPT_MS : Math.min(CAP_MS, FLOOR_MS * 2 ** Math.min(tries, 9));
  const due = now + Math.min(CAP_MS, Math.max(floor, (Number(at) || 0) - now));
  return pendingDue && pendingDue <= due ? pendingDue : due;
}

/** B-a60e (主开发 r2439 (2)), PURE: IT ENDS — an answer that LOADED the history (the re-attach, a view's reload) and says its rollout
 *  was found ABSENT (`historyNotFound`: a whole walk begun after the miss found none), on a page that said «not known yet»: the line's
 *  words become the FINAL word and the re-ask has stopped ('loaded'). Any other loaded answer: the history came in, the line goes. */
export function endsNotFound(msg, saidNotKnownYet) { return !!(msg && msg.historyNotFound && saidNotKnownYet); }

export const REASK_IDLE = Object.freeze({ code: null, tries: 0, due: 0, owed: false, reloadAt: 0 });

/** ONE event → { state, act } — `act`: 'arm' (a timer at state.due) · 'cancel' · 'ask' (the cheap ask) · 'reload' · null.
 *  { type: 'not-loaded', now, code, info }  an answer says the history waits (an attach, a view, the ask's reply, a page fetch)
 *  { type: 'loaded' }                       an answer CARRIED the history — the only reset
 *  { type: 'due', now }                     the timer fired
 *  { type: 'ready', now }                   the hub says it is readable (the ask's reply, the push) */
export function reaskNext(state, ev) {
  const s = { ...REASK_IDLE, ...(state || {}) };
  switch (ev && ev.type) {
    case 'not-loaded': {
      if (!ev.code) return { state: s, act: null };
      const due = reaskAt({ now: ev.now, at: retryAtOf(ev.info, ev.now), tries: s.tries, prompt: s.owed, pendingDue: s.due });
      return { state: { ...s, code: ev.code, owed: false, reloadAt: 0, due }, act: 'arm' };
    }
    case 'loaded':
      return { state: { ...REASK_IDLE }, act: 'cancel' };
    case 'due':
      if (!s.code) return { state: { ...s, due: 0 }, act: null };
      return { state: { ...s, tries: s.tries + 1, due: 0 }, act: 'ask' };
    case 'ready':
      if (!s.code) return { state: s, act: null };
      if (s.reloadAt && ev.now - s.reloadAt < RELOAD_FLIGHT_MS) return { state: { ...s, owed: true }, act: null };
      return { state: { ...s, reloadAt: ev.now }, act: 'reload' };
    default:
      return { state: s, act: null };
  }
}
