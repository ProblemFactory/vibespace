// THE POSTURE LADDER (lane duo-build-1 slice 4 — SPEC-v3 rev 3.3 §1.4 / §1.6 / §3 / §5; research-v4 B.5): which arrangement
// a half-folded iPhone Duo gets, decided ONLY from what the page can read — the six media queries of the Device Posture
// and Viewport Segments APIs (behind Safari feature flags today; matchMedia is the ONLY event source on a plain-http page:
// `navigator.devicePosture` exists only in a secure context). `folded` alone NEVER changes a layout (Safari's folded =
// UIHinge partiallyOpen: any screen, any angle — the cover's tent is folded too); only `…-viewport-segments: 2` does.
//   · targetOf(m, vc) — the state the queries ask for: 'book' (horizontal-viewport-segments: 2) | 'laptop'
//     (vertical-viewport-segments: 2) | 'pending' (folded, one segment, the regular class — wait, change nothing) | 'none'
//     (the compact class ignores folded: a tent / a standing cover is a stable folded + 1 segment)
//   · foldStep({ state, target }) — the ladder's next move: enter book / laptop after FOLD_ENTER_MS (a fold passes through
//     transitional readings), leave them after FOLD_LEAVE_MS (HIG «favor small adjustments»: a brief un-fold is not one),
//     pending at once (it changes nothing), pending's own FOLD_PENDING_MS timeout back to none (counted: the segments
//     never came — research-v4 B.3 ② says nothing promises them)
//   · seamOf({ edge, gap, fallback }) — the design seam around the shared edge (Safari's segments meet with no gap; ours
//     is FOLD_SEAM_PX; Android Chrome's mask wins when wider); laptopYield({ K, innerHeight, yFold }) — §5's yielding
//     order under a keyboard of K px (the problem strip, then the dead zone, then the bar; thresholds 197 / 317 / 361
//     at innerHeight 867)
// PURE: imports nothing. The owner (src/lib/fold-ladder.js) listens, times and writes <html data-fold>; nothing persists it.

const FOLD_MQ = Object.freeze({
  h1: '(horizontal-viewport-segments: 1)', h2: '(horizontal-viewport-segments: 2)',
  v1: '(vertical-viewport-segments: 1)', v2: '(vertical-viewport-segments: 2)',
  folded: '(device-posture: folded)', cont: '(device-posture: continuous)',
});
const FOLD_ENTER_MS = 120;
const FOLD_LEAVE_MS = 300;
const FOLD_PENDING_MS = 1500;
/** Our design seam, centred on the shared edge (SPEC-v3 §1.4: Safari's segments are continuous — 0 px — the 20 is ours). */
const FOLD_SEAM_PX = 20;
/** The shared edge when segments:2 holds but env() does not resolve — the regular class only (475.5 = 951 / 2, derived). */
const FOLD_EDGE_FALLBACK = 475.5;
const FOLD_STATES = Object.freeze(['none', 'pending', 'book', 'laptop']);

/** The state the six queries ask for (SPEC-v3 §1.6 targetOf). `m` = their `.matches`; `vc` = the viewport class. */
function targetOf(m = {}, vc = 'desktop') {
  if (m.h2) return 'book';                       // the only book trigger (the cover has no division region)
  if (m.v2) return 'laptop';                     // the only laptop trigger
  if (m.folded && vc === 'regular') return 'pending'; // wait — change nothing
  return 'none';                                 // compact ignores folded; flags off = every query false = none
}

/** The ladder's next move from `state` toward `target`: { to, delayMs, timeout } — to = null ⇒ stay (and cancel what
 *  was scheduled); delayMs = how long the target must hold before the move; timeout = a pending state's own fall-back. */
function foldStep({ state = 'none', target = 'none' } = {}) {
  if (target === state) return { to: null, delayMs: 0, timeout: state === 'pending' ? FOLD_PENDING_MS : 0 };
  if (target === 'book' || target === 'laptop') {
    // into a fold (from none / pending, or switching axis): the enter settle; from book ⇄ laptop the leave settle first
    return { to: target, delayMs: state === 'book' || state === 'laptop' ? FOLD_LEAVE_MS : FOLD_ENTER_MS, timeout: 0 };
  }
  if (target === 'pending') {
    // pending never re-arranges, so it is entered at once; leaving a fold for pending is a leave (300 ms)
    return { to: 'pending', delayMs: state === 'book' || state === 'laptop' ? FOLD_LEAVE_MS : 0, timeout: FOLD_PENDING_MS };
  }
  // target none: pending drops at once; a fold leaves after the leave settle
  return { to: 'none', delayMs: state === 'book' || state === 'laptop' ? FOLD_LEAVE_MS : 0, timeout: 0 };
}

/** The design seam around the shared edge: its width = max(ours, the gap the platform reports) (SPEC-v3 §1.4). `edge` =
 *  the shared edge in CSS px (NaN when env() did not resolve ⇒ the fallback, the regular class only). */
function seamOf({ edge = NaN, gap = 0, fallback = FOLD_EDGE_FALLBACK } = {}) {
  const e = Number.isFinite(edge) && edge > 0 ? edge : fallback;
  const w = Math.max(FOLD_SEAM_PX, Number.isFinite(gap) ? gap : 0);
  return { edge: e, from: e - w / 2, to: e + w / 2, width: w, guessed: !(Number.isFinite(edge) && edge > 0) };
}

/** SPEC-v3 §5's yielding order under a keyboard of `K` px in the laptop pose (the composer pinned to the visual
 *  viewport's bottom): ① the problem strip hides first, ② the dead zone under the band shrinks 24 → 0, ③ the bar hides
 *  only when even it no longer fits, ④ then the composer may touch the band. `yFold` = the fold line (innerHeight −
 *  475.5 when env() does not resolve). Heights: bar 44, strip 96, composer 104, dead zone 24, band ± 10. */
function laptopYield({ K = 0, innerHeight = 867, yFold = NaN } = {}) {
  const y = Number.isFinite(yFold) && yFold > 0 ? yFold : innerHeight - FOLD_EDGE_FALLBACK;
  const bandBottom = Math.round(y + FOLD_SEAM_PX / 2);
  const below = innerHeight - bandBottom;               // the lower segment under the band
  const k = Math.max(0, Number(K) || 0);
  const STRIP = 96, BAR = 44, COMPOSER = 104, DEAD = 24;
  const stripT = below - DEAD - BAR - STRIP - COMPOSER; // 197 at 867 (≈ 197.5 with the band bottom at 401.5)
  const barT = below - BAR - COMPOSER;                  // 317
  const bandT = below - COMPOSER;                        // 361
  const strip = k <= stripT;
  const bar = k <= barT;
  const dead = strip ? DEAD : Math.max(0, Math.min(DEAD, below - k - COMPOSER - (bar ? BAR : 0)));
  return { strip, bar, dead, intoBand: k > bandT, thresholds: { strip: stripT, bar: barT, band: bandT }, yFold: y };
}

module.exports = { FOLD_MQ, FOLD_ENTER_MS, FOLD_LEAVE_MS, FOLD_PENDING_MS, FOLD_SEAM_PX, FOLD_EDGE_FALLBACK, FOLD_STATES, targetOf, foldStep, seamOf, laptopYield };
