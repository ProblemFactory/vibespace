'use strict';
// A SCALED CLOCK (lane claude-steer-inject r5) — preloaded into data/bin/chat-wrapper.js by a suite (`node -r <this> chat-wrapper.js
// …`): every timer of one second or more runs $CLOCK_SCALE times sooner, so a leg can watch the wrapper's 15 s prompt-hook bound and
// its 30 s backstop END without waiting for them. Shorter timers (the same-tick interrupt, a 25 ms race) are untouched, and the
// log lines still name the true seconds (they print the constants). Never loaded by the product.
const SCALE = Number(process.env.CLOCK_SCALE || 1);
if (SCALE > 1) {
  const real = global.setTimeout;
  global.setTimeout = function setTimeout(fn, ms, ...rest) { return real(fn, Number(ms) >= 1000 ? Math.round(Number(ms) / SCALE) : ms, ...rest); };
}
