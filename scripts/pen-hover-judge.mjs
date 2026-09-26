// WHO OPENED THE HOVER CHOOSER? — the pen leg's judge (2026-09-26, the 2.369.183
// mirror red: test-taskbar-group-ui (l) "a pen hovers like a mouse" read
// `pointerType mouse` on a chooser the PEN had opened; red twice on the hosted
// runner, green standalone). PURE (imports nothing) and NOT a test-*.mjs on
// purpose (the tier census would demand a tier) — like scratch.mjs /
// mutant-copy.mjs. Shared by the heavy leg (it judges the page's recorded
// record) and the fast gate (it judges a fake-clock model of every
// interleaving, with a patched copy of THIS file as the negative control).
//
// THE RACE (measured, CPU ×20 through CDP: 7 of 10 trials red, the CI shape
// exactly): Chrome re-computes hover at the first frame after a LAYOUT change
// and dispatches a fake mousemove at the last known pointer position — typed
// `mouse`, pointerId 1 — even when that position came from a PEN (pointerId 2).
// The chooser's own open is such a layout change, so one or two frames after
// the open the MOUSE pointer "enters" the grouped button where the pen rests
// (a probe: a 3 px div appended far from the pen does the same, 4 of 4; with
// the page settled and no layout change, never). The recorder kept ONE slot,
// the last pointerenter's type, and the leg sampled it after the open: when the
// CDP sample beat the next frame it read `pen` (a fast box), when the frame won
// it read `mouse` (a loaded runner). The product was right both times — the
// chooser opened on the pen's own intent, 300 ms after the pen's pointerenter
// and BEFORE any mouse-typed event; the later mouse enter only met the open
// chooser (`keep()`).
//
// THE RULE: a hover open is attributed to the pointer whose OWN enter armed it —
// the first enter on the button after the leg's reset, typed — never to whoever
// entered last. Another pointer's enter AFTER the open is Chrome's hover
// recompute (reported, never a verdict). Another pointer's enter BEFORE the open
// (a layout change was pending when the pen arrived, or the page re-laid out
// during the rest) makes the open unattributable — the judge never assumes
// which enters the product arms on: 'premise', and the leg retries that trial
// by name; it settles
// the page (frames) before the pen moves so its own previous steps are never
// that layout change.

/** The page clock's floor for GROUP_HOVER_INTENT_MS (300) — leg (c)'s own tolerance. */
export const INTENT_FLOOR_MS = 280;

/**
 * @param {object} record — what the page recorded since the leg's reset, on the PAGE clock:
 *   enters: [{ type, id, at }]   every pointerenter on the grouped button (its own element), in order
 *   opens:  [{ at, mode }]       every chooser open (MutationObserver), in order
 *   sampledAt                   the page time the record was read
 * @param {{ type?: string, intentFloorMs?: number }} [opts] — `type` = the pointer the leg moved ('pen')
 * @returns {{ verdict: 'opened'|'no-open'|'premise'|'early'|'wrong-mode', why: string,
 *             by: object|null, open: object|null, dwellMs: number|null, recompute: object[] }}
 */
export function judgeHoverOpen(record = {}, { type = 'pen', intentFloorMs = INTENT_FLOOR_MS } = {}) {
  const enters = [...(record.enters || [])].sort((a, b) => a.at - b.at);
  const opens = [...(record.opens || [])].sort((a, b) => a.at - b.at);
  const by = enters.length ? enters[0] : null; // the enter that ARMED the intent: the first one after the reset
  const out = (verdict, why, extra = {}) => ({ verdict, why, by, open: null, dwellMs: null, recompute: [], ...extra });
  if (!by) return out('premise', `no pointerenter on the button was recorded (the ${type} never reached it)`);
  if (by.type !== type) return out('premise', `the first pointer to enter the button was a ${by.type || '(untyped)'} (id ${by.id}), not the ${type}`);
  const open = opens.find((o) => o.at >= by.at) || null;
  const horizon = open ? open.at : (Number.isFinite(record.sampledAt) ? record.sampledAt : Infinity);
  const foreign = enters.find((e) => e !== by && e.type !== type && e.at <= horizon);
  if (foreign) {
    return out('premise', `a ${foreign.type || '(untyped)'} pointer (id ${foreign.id}) entered the button ${Math.round(foreign.at - by.at)} ms after the ${type}, before ${open ? 'the open' : 'the sample'} (Chrome's hover recompute after a layout change was pending) — the open cannot be attributed to the ${type}`, { open });
  }
  const recompute = enters.filter((e) => e.type !== type && open && e.at > open.at);
  if (!open) return out('no-open', `the ${type} rested${Number.isFinite(horizon) ? ` ${Math.round(horizon - by.at)} ms` : ''} and nothing opened`, { recompute });
  const dwellMs = open.at - by.at;
  if (dwellMs < intentFloorMs) return out('early', `the chooser opened ${Math.round(dwellMs)} ms after the ${type}'s enter — before the intent (${intentFloorMs})`, { open, dwellMs, recompute });
  if (open.mode !== 'hover') return out('wrong-mode', `the chooser opened in ${open.mode} mode, not hover`, { open, dwellMs, recompute });
  return out('opened', `the ${type}'s own enter armed it: open ${Math.round(dwellMs)} ms after it, in hover mode${recompute.length ? `; Chrome's hover recompute then moved the ${recompute[0].type} pointer onto the button ${Math.round(recompute[0].at - open.at)} ms after the open (not a verdict)` : ''}`, { open, dwellMs, recompute });
}
