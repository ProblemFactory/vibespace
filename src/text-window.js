'use strict';
// THE ATTACH SLAB IS A TEXT WINDOW, NOT tail(50) (chat pipeline perf lane,
// chunk A). PURE — imports nothing, CJS: the server (ws-handler's live and
// view-only attach), transcript-service.page() (the HTTP default AND the
// daemon's `transcript-op page`, which bundles the same service) and the
// client (the short-view rescue's harm bound) read the same numbers.
//
// Why: fifty normalized records is a RECORD count, and on a tool-heavy
// conversation fifty records is a handful of sentences — the view opened on a
// stub (under two viewports on the §1c compact-mode fixture) and on a
// fold-dominated one the short-view rescue paged a second slab in before the
// reader saw anything. The window a reader needs is counted in things a
// reader READS.
//
// The rule (textWindow): walk back from the tail until `minText` text cards
// are inside the window; never fewer than `minRecords` records (today's
// tail(50) is the floor — nothing ever gets a smaller slab), never more than
// `maxRecords`, and past the floor never more than `maxGrowthBytes` of
// serialized records (one pasted image is ~540 KB of base64 — it ends the walk). A deterministic function
// of the message list: the same list gives the same start, so a same-epoch
// re-attach ships the same slab and the client's identical-skip (2.369.2)
// still fires.

// Pinned on the §1c fixture generator (scripts/huge-transcript-fixture.mjs),
// measured with the claude normalizer over the whole generated file (perf r1
// re-measure — the first cut's "48 MB: 222 records / 896 KB" did not
// reproduce): 48 MB = 5,892 records, tail(50) 118 KB / 12 text cards, 24 text
// = 112 records / 218 KB; 6 MB = 822 records, tail(50) 637 KB / 5 text (two
// pasted images inside it). 400 records bounds a pure-tool conversation.
//
// THE GROWTH BUDGET (perf r1, 2.369.167 — the verifier's 19-window probe):
// the first cut bounded the WHOLE window at 2 MiB, and on the 6 MB §1c
// fixture the walk to 24 text cards pulled a 513 KB pasted image in past the
// floor — 208 records / 1.55 MB per attach against tail(50)'s 637 KB, ×19
// windows = 29.8 MB on a cold open (12.3 MB before), first paint ×2.7. The
// text a reader reads is small; what made the window heavy was never text.
// So the bound is on what the window adds PAST the floor: `maxGrowthBytes`
// (128 KiB) of serialized records, and a record that would cross it ends the
// walk (an image past the floor is never pulled in for the sake of the text
// around it — it pages in with the reader). Measured offline over
// the same normalizer: the 48 MB fixture still reaches 24 text (112 records /
// 218 KB — its growth is 100 KB), the 6 MB one stops at 103 records / 768 KB
// (12 text; floor 637 KB). And the window goes only to a view
// that will paint it: an attach may ask `slab:'floor'` (src/lib/view-
// visibility.js attachSlab — a hidden view, or one of a burst), which is
// tail(minRecords) exactly (attachWindowOpts below).
const TEXT_WINDOW = Object.freeze({
  minText: 24,
  minRecords: 50,
  maxRecords: 400,
  maxGrowthBytes: 128 * 1024,
});

const nonEmptyText = (b) => !!b && b.type === 'text' && typeof b.text === 'string' && b.text.trim().length > 0;

/** Does this normalized message carry text a reader reads? A user message
 *  with a non-empty text block (never a tool_result carrier), or an assistant
 *  message with a non-empty `text` block. Thinking, tools, system/info cards,
 *  image-only attachments and retracted (rewound) messages do not count. */
function isTextCard(m) {
  if (!m || typeof m !== 'object' || m.rewound) return false;
  const c = Array.isArray(m.content) ? m.content : null;
  if (!c) return false;
  if (m.role === 'user') {
    if (c.some((b) => b && b.type === 'tool_result')) return false;
    return c.some(nonEmptyText);
  }
  if (m.role === 'assistant') return c.some(nonEmptyText);
  return false;
}

/** The serialized size of one record — what the attach frame pays for it
 *  (UTF-16 units of its JSON, the unit a ws frame's `data.length` counts). */
function jsonSize(m) {
  try { return JSON.stringify(m).length; } catch { return 0; }
}

const posInt = (v, d) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);

/**
 * textWindow(messages, opts) → { start, textCount, reason }
 *   start     — index of the first record of the window (slice(start) is it)
 *   textCount — text cards inside the window
 *   reason    — why the walk stopped: 'text' (minText reached, floor met),
 *               'maxRecords', 'maxGrowth' (the next record would take the
 *               bytes past the floor over maxGrowthBytes), or 'all' (message 0)
 *   growth    — serialized bytes the window holds PAST the floor
 */
function textWindow(messages, opts = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const total = list.length;
  const minText = posInt(opts.minText, TEXT_WINDOW.minText);
  const minRecords = posInt(opts.minRecords, TEXT_WINDOW.minRecords);
  const maxRecords = Math.max(minRecords, posInt(opts.maxRecords, TEXT_WINDOW.maxRecords));
  const maxGrowthBytes = posInt(opts.maxGrowthBytes, TEXT_WINDOW.maxGrowthBytes);
  // the floor never pays for its size: sizes are read only past it
  const sizeOf = typeof opts.sizeOf === 'function' ? opts.sizeOf : jsonSize;
  let start = total, textCount = 0, growth = 0, reason = 'all';
  while (start > 0) {
    const n = total - start;
    if (n >= minRecords && textCount >= minText) { reason = 'text'; break; }
    if (n >= maxRecords) { reason = 'maxRecords'; break; }
    const m = list[start - 1];
    if (n >= minRecords) {
      const sz = sizeOf(m) || 0;
      if (growth + sz > maxGrowthBytes) { reason = 'maxGrowth'; break; }
      growth += sz;
    }
    start--;
    if (isTextCard(m)) textCount++;
  }
  return { start, textCount, reason, growth };
}

// THE SLAB AN ATTACH ASKED FOR (perf r1). An attach frame may carry
// `slab: 'floor' | 'text'` (the client's PURE verdict, view-visibility.js
// attachSlab): 'floor' = tail(minRecords) exactly — a view nobody is looking
// at (hidden desktop / tab guest / minimized / phone-inactive), or one past
// every attach of a burst after its first, pays for the floor only; anything
// else (absent = an older client, 'text') is the text window. Both ws attach
// paths (the live attach and the view-only one) read this ONE mapping, so the
// word means the same slab on both; transcript-service.page's HTTP default
// (no attach, no view to ask for) stays the text window.
const SLAB_HINTS = Object.freeze(['floor', 'text']);
function attachWindowOpts(hint) {
  return hint === 'floor' ? { minText: 0 } : {};
}

/** The window itself — what every normalizer's tailWindow() returns. */
function sliceTextWindow(messages, opts) {
  const list = Array.isArray(messages) ? messages : [];
  return list.slice(textWindow(list, opts).start);
}

module.exports = { TEXT_WINDOW, SLAB_HINTS, isTextCard, textWindow, sliceTextWindow, attachWindowOpts, jsonSize };
