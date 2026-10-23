'use strict';
/**
 * THE OUTBOX CENSUS (lane outbox-window-scroll-filter; the owner, 2026-10-22, the Outbox window 「发件箱」: «1 条待我审批
 * 这一条在哪呢？» — the 「待审批」 filter listed 20 executed / refused API calls and the ONE waiting message sat below them,
 * out of reach). PURE (no DOM, no I/O, imports nothing): the window's head, its sections and its two filters are ONE
 * count over ONE list, so the head can never say «1 waits» while the filter shows something else.
 *
 *   outboxCensus({proposals, apiCards, apiFate}) — every section (the message proposals of the outbox store, the raw-API
 *     proposals of the API cards) newest first, with what WAITS for the owner: a message `awaiting-approval`, an API
 *     call whose fate is `pending` (`apiFate` = the API card model's fateOf, handed in). The head's numbers = the sums.
 *   outboxView(census, view) — 「待审批」 ('awaiting') = ONLY what waits, in every section, the sections that hold a
 *     waiting item FIRST (each listing only those); a section with nothing waiting is FOLDED to its one summary line;
 *     「全部」 ('all') = every item of every section, newest first, each with its outcome. No choice yet ⇒ 'awaiting'
 *     while anything waits, else 'all'. A section with no item at all is not drawn.
 *   runsOf(items, keyOf) — consecutive items whose `keyOf` is equal, as ONE run (the API rows' «×3»).
 */

const SECTIONS = Object.freeze(['messages', 'api']);
const VIEWS = Object.freeze(['awaiting', 'all']);
const newestFirst = (a, b) => (Number(b && b.at) || 0) - (Number(a && a.at) || 0);
const WAITS = Object.freeze({
  messages: (p) => !!p && p.state === 'awaiting-approval',
  api: (r, fate) => !!r && fate(r) === 'pending',
});

function outboxCensus({ proposals = [], apiCards = [], apiFate = (r) => (r && r.status) || null } = {}) {
  const src = { messages: proposals || [], api: apiCards || [] };
  const sections = SECTIONS.map((key) => {
    const items = src[key].filter(Boolean).slice().sort(newestFirst);
    const waitingItems = items.filter((x) => WAITS[key](x, apiFate));
    return { key, total: items.length, waiting: waitingItems.length, items, waitingItems };
  });
  return {
    total: sections.reduce((n, s) => n + s.total, 0),
    waiting: sections.reduce((n, s) => n + s.waiting, 0),
    sections,
  };
}

function outboxView(census, view = null) {
  const c = census || outboxCensus();
  const v = VIEWS.includes(view) ? view : (c.waiting ? 'awaiting' : 'all');
  const present = c.sections.filter((s) => s.total > 0);
  const shape = (s, folded, items) => ({ key: s.key, total: s.total, waiting: s.waiting, folded, items });
  const sections = v === 'all'
    ? present.map((s) => shape(s, false, s.items))
    : [...present.filter((s) => s.waiting).map((s) => shape(s, false, s.waitingItems)), ...present.filter((s) => !s.waiting).map((s) => shape(s, true, []))];
  return { view: v, total: c.total, waiting: c.waiting, sections };
}

function runsOf(items, keyOf) {
  const runs = [];
  for (const it of items || []) {
    const key = keyOf(it);
    const last = runs[runs.length - 1];
    if (last && last.key === key) last.items.push(it);
    else runs.push({ key, items: [it] });
  }
  return runs;
}

module.exports = { SECTIONS, VIEWS, outboxCensus, outboxView, runsOf };
