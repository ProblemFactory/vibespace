// THE PAGE'S WAKE (B-8165, the follow-up of lane connection-notice-once) — PURE, imports nothing. src/client.js ticks every
// 5 s; a tick that comes > WAKE_GAP_MS after the one before means the browser suspended the page (or our own code held the
// main thread — the long-task ring covers most of the gap). The wake is always MEASURED (telemetry) and the versioned stores
// are always re-asked (the belt). The toast «Browser suspended this page for {n}s — caught up now» used to answer the SLEEP:
// it showed on every long freeze, also when nothing had happened meanwhile — and by connection-notice-once's own legs nobody
// could have noticed anything. It now answers WHAT WAS MISSED: the page fell behind only when frames reached it after the
// wake that it had not had before — the ones the browser held during the freeze, and the stores' replies to the belt (the
// hub answers a resync with nothing when no store moved, src/ws-handler.js state-resync). Counted CATCH_UP_SETTLE_MS after
// the wake, against the count the page froze with (the Page Lifecycle `freeze` event; no frame is handled while frozen) — a
// page only THROTTLED (hidden: one timer a minute) handled its frames live, so without a freeze the count is the wake's own;
// and a page nobody looks at (hidden at the settle) shows no toast.
export const WAKE_GAP_MS = 45000;
export const CATCH_UP_SETTLE_MS = 1500;

/** 'suspend' | 'main-thread-block' | null — the gap's kind (the long tasks of the gap's span, SUMMED: the freeze shape is many
 *  medium tasks, not one giant one) */
export function wakeKind({ gap, longTasks = [], now }) {
  if (!(gap > WAKE_GAP_MS)) return null;
  const total = (longTasks || []).filter((x) => x && now - x.at < gap + 5000).reduce((s, x) => s + (Number(x.ms) || 0), 0);
  return total >= gap * 0.5 ? 'main-thread-block' : 'suspend';
}

/** did the page fall behind? — frames reached it after the wake (counted at the settle) beyond the count before the gap */
export function fellBehind({ framesBefore, framesAfter }) {
  return (Number(framesAfter) || 0) > (Number(framesBefore) || 0);
}
