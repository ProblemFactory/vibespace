// THE LOCATE VERDICT (lane think-tools-phone, 主开发 2026-11-17 — the owner, with the row on screen and selected: «这哪里不可见了？»).
// «Locate in sidebar» said «Entry not visible — it may be archived or filtered out» about a row the owner was looking at: the rail
// had COLLAPSED the open list (the re-click rule) and the code looked for the row 60 ms after an open, before the list drew.
// The law: «not visible» is said ONLY when it is TRUE, with its reason and its door. This is that verdict, PURE, over the
// sidebar's own facts about ONE conversation, in the very order sidebar.js `_renderInner` applies its filters on the sessions
// list (the search box → the agent filter → the location filter → the conversation-kind filter → archived → the status filter →
// the quick view). A row inside a collapsed folder is no reason at all: Locate opens the folder.
//   locateVerdict(facts) → { show: true } | { show: false, why, name?, term? }
//   facts: { present, term, matchesTerm, backend, backendFilter[], host, hostFilter[], kindPass, archived, showArchived,
//            status, statusFilter[], activeView }
//   LOCATE_WORDS[why] → { words, door } — English keys the client says through t(); `door` = the one act that shows the row
//   (null: nothing in the sidebar can — the conversation is not in this list). {name} is said in the words the list's own
//   controls show (src/lib/sidebar.js _locateName: the filter menu's rows, the quick tabs) — never a raw id.
// PURE: imports nothing (client: src/lib/session-lifecycle.js + src/lib/sidebar.js; gate: scripts/test-locate-verdict.mjs).

const LOCATE_WORDS = Object.freeze({
  absent: Object.freeze({ words: 'This conversation is not in the session list', door: null }),   // ui-words: an English KEY — the client words it through t() where it is drawn (session-lifecycle.js; zh / ja rows)
  search: Object.freeze({ words: 'Hidden by the search box: «{term}»', door: 'Clear search' }),   // ui-words: an English KEY — the client words it through t() where it is drawn (session-lifecycle.js; zh / ja rows)
  backend: Object.freeze({ words: 'Hidden by the agent filter: {name}', door: 'Show all agents' }),   // ui-words: an English KEY — the client words it through t() where it is drawn (session-lifecycle.js; zh / ja rows)
  host: Object.freeze({ words: 'Hidden by the location filter: {name}', door: 'Show all locations' }),   // ui-words: an English KEY — the client words it through t() where it is drawn (session-lifecycle.js; zh / ja rows)
  kind: Object.freeze({ words: 'Hidden by the conversation-kind filter', door: 'Show all kinds' }),   // ui-words: an English KEY — the client words it through t() where it is drawn (session-lifecycle.js; zh / ja rows)
  archived: Object.freeze({ words: 'This conversation is archived', door: 'Show archived' }),   // ui-words: an English KEY — the client words it through t() where it is drawn (session-lifecycle.js; zh / ja rows)
  status: Object.freeze({ words: 'Hidden by the status filter: {name}', door: 'Show every status' }),   // ui-words: an English KEY — the client words it through t() where it is drawn (session-lifecycle.js; zh / ja rows)
  view: Object.freeze({ words: 'Hidden by the «{name}» view', door: 'Show all' }),   // ui-words: an English KEY — the client words it through t() where it is drawn (session-lifecycle.js; zh / ja rows)
});

const NON_ARCHIVED = 4; // live · tmux · external · stopped — the status filter narrows only when fewer are on (sidebar.js)

/** The one verdict: does the sessions list draw this conversation, and if not, why (the FIRST filter that drops it). */
function locateVerdict(f) {
  if (!f || !f.present) return { show: false, why: 'absent' };
  if (f.term && !f.matchesTerm) return { show: false, why: 'search', term: String(f.term) };
  const backends = Array.isArray(f.backendFilter) ? f.backendFilter : [];
  if (backends.length && !backends.includes(f.backend || 'claude')) return { show: false, why: 'backend', name: f.backend || 'claude' };
  const hosts = Array.isArray(f.hostFilter) ? f.hostFilter : [];
  if (hosts.length && !hosts.includes(f.host || 'local')) return { show: false, why: 'host', name: f.host || 'local' };
  if (f.kindPass === false) return { show: false, why: 'kind' };
  const statuses = Array.isArray(f.statusFilter) ? f.statusFilter : [];
  if (f.archived) {
    if (!f.showArchived) return { show: false, why: 'archived' };
  } else if (f.showArchived) {
    if (!statuses.includes(f.status)) return { show: false, why: 'status', name: f.status };
  } else {
    const on = statuses.filter((x) => x !== 'archived');
    if (on.length < NON_ARCHIVED && !on.includes(f.status)) return { show: false, why: 'status', name: f.status };
  }
  if (f.activeView && f.status !== f.activeView) return { show: false, why: 'view', name: f.activeView };
  return { show: true };
}

module.exports = { LOCATE_WORDS, locateVerdict, NON_ARCHIVED };
