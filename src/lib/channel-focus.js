// THE FIRST SCREEN'S PREDICATE lives in the shared tier since design 008 (B-3cf8): src/channel-focus.js (PURE, CJS —
// the engine builds the first read with the SAME statusTag the panel draws by). This file keeps the client's import
// path; every word of the rule (R3, design-communication-panel.zh.md §23) is there.
export { FOCUS_WINDOW_MS, HELD_WINDOW_MS, TAG_ORDER, heldPending, heldOf, statusTag, focusRows, filterRows, firstScreen, candidateOf, pageOrder, pageCursor, afterCursor, selectPage, queryOf, textMatches, ATTENTION_MAX, HEAD_ROWS, PAGE_ROWS, PAGE_MAX, QUERY_MAX } from '../channel-focus.js';
