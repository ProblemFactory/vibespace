// THE LOCATE VERDICT (lane think-tools-phone, 主开发 2026-11-17 — the owner, with the row on screen and selected: «这哪里不可见了？»).
// «Locate in sidebar» said «Entry not visible — it may be archived or filtered out» about a row the owner was looking at: the rail
// had COLLAPSED the open list (the re-click rule) and the code looked for the row 60 ms after an open, before the list drew.
// The law: «not visible» is said ONLY when it is TRUE, with its reason and its door. This is that verdict, PURE, over the
// sidebar's own facts about ONE conversation. IT IS THE SESSIONS LIST'S ONE FILTER PREDICATE (B-b842, 主开发 2026-11-19): the
// list draws exactly the rows it shows (sidebar.js `_filterSessions`, called by `_renderInner`, judges EVERY row with it) and
// Locate names the first filter that drops one (`_locateFacts` — the same facts builder, `_listRowFacts`), so the two can never
// drift (the release kept a second copy of the chain, held equal only by a test that sliced the list's code as its oracle; the
// «stopped by a limit or overload» filter it never learned made Locate wait and blame the list). The order: the search box → the
// agent filter → the location filter → the conversation-kind filter → «stopped by a limit or overload» (never on the Tasks
// board) → archived → the status filter → the quick view; on the Tasks board only archived narrows (it organizes Task-Group
// membership — its own view filters). A row inside a collapsed folder is no reason at all: Locate opens the folder.
//   locateVerdict(facts) → { show: true } | { show: false, why, name?, term? }
//   facts: { present, term, matchesTerm, backend, backendFilter[], host, hostFilter[], kindPass, stoppedOnly, stoppedBy,
//            tasksTab, archived, showArchived, status, statusFilter[], statusOn[]?, activeView }
//   (statusOn: the non-archived statuses on — the list builds it ONCE a draw; Locate's one row may leave it out)
//   THE STATUS FILTER NARROWS ONLY BELOW ALL FOUR non-archived statuses, Archived on or off (主开发's read of B-b842: with
//   Archived on, a row whose status is none of the four stayed hidden after «Show every status» — the door found the same reason)
//   LOCATE_WORDS[why] → { words, door } — English keys the client says through t(); `door` = the one act that shows the row
//   (null: nothing in the sidebar can — the conversation is not in this list). {name} is said in the words the list's own
//   controls show (src/lib/sidebar.js _locateName: the filter menu's rows, the quick tabs) — never a raw id.
// PURE: imports nothing (client: src/lib/session-lifecycle.js + src/lib/sidebar.js; gate: scripts/test-locate-verdict.mjs).
// LOCATE_ORDER: the reasons in the list's order (every one but «absent» has a door that shows the row or moves it to a LATER one).

const LOCATE_WORDS = Object.freeze({
  absent: Object.freeze({ words: 'This conversation is not in the session list', door: null }),   // ui-words: an English KEY — the client words it through t() where it is drawn (session-lifecycle.js; zh / ja rows)
  search: Object.freeze({ words: 'Hidden by the search box: «{term}»', door: 'Clear search' }),   // ui-words: an English KEY — the client words it through t() where it is drawn (session-lifecycle.js; zh / ja rows)
  backend: Object.freeze({ words: 'Hidden by the agent filter: {name}', door: 'Show all agents' }),   // ui-words: an English KEY — the client words it through t() where it is drawn (session-lifecycle.js; zh / ja rows)
  host: Object.freeze({ words: 'Hidden by the location filter: {name}', door: 'Show all locations' }),   // ui-words: an English KEY — the client words it through t() where it is drawn (session-lifecycle.js; zh / ja rows)
  kind: Object.freeze({ words: 'Hidden by the conversation-kind filter', door: 'Show all kinds' }),   // ui-words: an English KEY — the client words it through t() where it is drawn (session-lifecycle.js; zh / ja rows)
  stopped: Object.freeze({ words: 'Hidden by the «Stopped by a limit or overload» filter', door: 'Turn off the «Stopped by a limit or overload» filter' }),   // ui-words: an English KEY — the client words it through t() where it is drawn (session-lifecycle.js; zh / ja rows)
  archived: Object.freeze({ words: 'This conversation is archived', door: 'Show archived' }),   // ui-words: an English KEY — the client words it through t() where it is drawn (session-lifecycle.js; zh / ja rows)
  status: Object.freeze({ words: 'Hidden by the status filter: {name}', door: 'Show every status' }),   // ui-words: an English KEY — the client words it through t() where it is drawn (session-lifecycle.js; zh / ja rows)
  view: Object.freeze({ words: 'Hidden by the «{name}» view', door: 'Show all' }),   // ui-words: an English KEY — the client words it through t() where it is drawn (session-lifecycle.js; zh / ja rows)
});

const NON_ARCHIVED = 4; // live · tmux · external · stopped — the status filter narrows only when fewer are on (sidebar.js)
const LOCATE_ORDER = Object.freeze(['search', 'backend', 'host', 'kind', 'stopped', 'archived', 'status', 'view']);

/** The one verdict: does the sessions list draw this conversation, and if not, why (the FIRST filter that drops it) — the list's
 *  own filter (sidebar.js `_filterSessions`) and Locate's sentence alike. */
function locateVerdict(f) {
  if (!f || !f.present) return { show: false, why: 'absent' };
  if (f.term && !f.matchesTerm) return { show: false, why: 'search', term: String(f.term) };
  const backends = Array.isArray(f.backendFilter) ? f.backendFilter : [];
  if (backends.length && !backends.includes(f.backend || 'claude')) return { show: false, why: 'backend', name: f.backend || 'claude' };
  const hosts = Array.isArray(f.hostFilter) ? f.hostFilter : [];
  if (hosts.length && !hosts.includes(f.host || 'local')) return { show: false, why: 'host', name: f.host || 'local' };
  if (f.kindPass === false) return { show: false, why: 'kind' };
  if (f.stoppedOnly && !f.tasksTab && !f.stoppedBy) return { show: false, why: 'stopped' };   // «因限额/过载停止 (N)» — never the Tasks board
  if (f.tasksTab) return f.archived && !f.showArchived ? { show: false, why: 'archived' } : { show: true };   // the Tasks board: archived only
  const on = Array.isArray(f.statusOn) ? f.statusOn : (Array.isArray(f.statusFilter) ? f.statusFilter : []).filter((x) => x !== 'archived');
  const narrows = on.length < NON_ARCHIVED;
  if (f.archived) {
    if (!f.showArchived) return { show: false, why: 'archived' };
  } else if (narrows && !on.includes(f.status)) return { show: false, why: 'status', name: f.status };   // Archived on or off: one rule
  if (f.activeView && f.status !== f.activeView) return { show: false, why: 'view', name: f.activeView };
  return { show: true };
}

module.exports = { LOCATE_WORDS, LOCATE_ORDER, locateVerdict, NON_ARCHIVED };
