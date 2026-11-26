'use strict';
// THE BROWSER FRAMES' SCRUB WORKER (lane lg-vault-file, 主开发 r1915 (b) + r2445: the dialogs' text scrub through a worker). One
// worker a browser profile, while that profile needs it.
// - src/server/browser-dialogs.js starts it at the first CDP frame past the on-loop figure, and ends it at the profile's end, at a
//   vault lock, after an idle stretch, or when it is silent past its bound on the frame it is on (timed from that frame's turn, 主开发
//   r3342 (3): it answers its frames one at a time, in order). The worker's copy ends at a lock; the loop's copy is the boundary and
//   stands until the profile ends (r3342 (2)): the next large frame starts a new one with the loop's values, past a floor.
// - The profile's values reach it by MESSAGE only (a «values» message: the masked values, the credential signatures, the mask floor
//   and the walk's budget); it reads no file, opens nothing and sends no request. It compiles them with THE SAME scrubber the loop
//   uses (src/vault-scrubber.js compileTextScrubber) and runs THE SAME frame scrub (src/cdp-frame-scrub.js scrubFrame) — never a
//   copy of their rules (r2445 law 1).
// - Each «frame» is answered once, by its seq, with the scrubbed frame and what the loop notes (the request ids that carried a
//   credential, a cut, an unparseable frame). A frame before any values, or a scrub that throws, is answered «withheld»: the loop
//   withholds that frame WHOLE, by name — the raw frame never leaves.
// - Each «text» (row B-360d, lane mask-value-shape, 主开发 r4523: one half of a browser COMMAND's output past the on-loop figure) is
//   answered once, by its seq, in the SAME queue as the frames, with the text scrubbed by THE SAME compiled scrubber (the loop's
//   scrubText). A text before any values, a scrub that throws, or one that passed the text budget (the scrubber's `overs` moved) is
//   answered «withheld»: the hub refuses that command's output by name — nothing of it is printed. The work bound's answer carries
//   `over: true` (line 1051's follow, 主开发 r4754 (3)): its refusal is worded on its own — running the command again cannot help.
const { isMainThread, parentPort } = require('worker_threads');
if (isMainThread) throw new Error('src/server/browser-scrub-worker.js runs as a worker only (src/server/browser-dialogs.js starts it)');
const { answerMemory } = require('../worker-memory.js');
const VS = require('../vault-scrubber.js');   // THE SCRUBBER the loop compiles (browser-dialogs scrubberForProfile → vault-run.js re-exports it)
const CS = require('../cdp-frame-scrub.js');   // THE FRAME SCRUB the loop runs (browser-dialogs scrubCdpFrame)

let ready = false, fn = null, sigs = [], minB = VS.MIN_MASK_BYTES, budgetMs = 250;
parentPort.on('message', (msg) => {
  if (answerMemory(msg, parentPort)) return;   // the memory census (src/worker-memory.js): answered between two frames
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'values') {
    try {
      const pairs = Array.isArray(msg.pairs) ? msg.pairs : [];
      fn = pairs.length ? VS.compileTextScrubber(pairs) : null;
      sigs = Array.isArray(msg.sigs) ? msg.sigs : [];
      minB = Number(msg.minB) > 0 ? Number(msg.minB) : VS.MIN_MASK_BYTES;
      budgetMs = Number(msg.budgetMs) > 0 ? Number(msg.budgetMs) : 250;
      ready = true;
    } catch { ready = false; fn = null; sigs = []; }
    return;
  }
  if (msg.type === 'text') {   // row B-360d: one half of a command's output
    if (!ready || !fn) { parentPort.postMessage({ type: 'done', seq: msg.seq, withheld: 'the scrub worker had no values' }); return; }
    const before = fn.overs;
    let out;
    try { out = fn(String(msg.text)); } catch { parentPort.postMessage({ type: 'done', seq: msg.seq, withheld: 'the scrub failed' }); return; }
    if (fn.overs !== before) { parentPort.postMessage({ type: 'done', seq: msg.seq, withheld: 'the scrub passed its work bound (scrub_work_bound)', over: true }); return; }
    if (typeof out !== 'string') { parentPort.postMessage({ type: 'done', seq: msg.seq, withheld: 'the scrub failed' }); return; }
    parentPort.postMessage({ type: 'done', seq: msg.seq, r: { out } });
    return;
  }
  if (msg.type !== 'frame') return;
  if (!ready) { parentPort.postMessage({ type: 'done', seq: msg.seq, withheld: 'the scrub worker had no values' }); return; }
  let r;
  try { r = CS.scrubFrame(String(msg.frame), { fn, sigs, budgetMs, minB }); } catch { parentPort.postMessage({ type: 'done', seq: msg.seq, withheld: 'the scrub failed' }); return; }
  parentPort.postMessage({ type: 'done', seq: msg.seq, r: { out: r.out, noted: r.noted, cut: r.cut, unparseable: r.unparseable, withheld: r.withheld } });
});
