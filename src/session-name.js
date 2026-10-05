'use strict';
// THE CONVERSATION'S DISPLAY NAME LADDER (lane session-title-record, B-fbef) — ONE pure function every surface asks
// (the sidebar card, the window title, the taskbar), over the merged sidebar row:
//   ① customName — the user's rename (the sidebar's rename / a ws rename-session → user-state customNames)
//   ② a GIVEN live name (`nameExplicit`: at creation / by a rename — lane peer-card-sender: a given live name outranks)
//   ③ `cliTitle` — the harness's own title (claude 2.1.288 `session_title_changed`; the newest: the live fact, else the
//      transcript's — discovery-facts titleFromText). The CLI's stamps never name a session (nameFromUserRecord) —
//      this record IS a title, the exception by declaration (backend-caps `titleRecord`). A harness that declares
//      `titleRecord: null` (codex, acp) never carries the fact, so the rung is simply absent — never an id branch.
//   ④ the first-user-message rule (discovery-facts nameFromUserRecord → `name`), then the live name, the folder, the id.
/** Rungs ①–③ only — a name somebody GAVE the conversation (the user, its creator, the harness), '' when none: a
 *  surface with its own fallbacks (a window title) asks this, then falls back as it always did. */
function sessionGivenName(s, customName) {
  if (customName) return customName;
  if (!s) return '';
  if (s.nameExplicit && s.webuiName) return s.webuiName;
  return s.cliTitle || '';
}
/** @param s the merged sidebar row (or an active-sessions row) @param customName the user's rename ('' / null = none) */
function sessionDisplayName(s, customName) {
  const given = sessionGivenName(s, customName);
  if (given || !s) return given;
  const cwdFolder = s.cwd ? String(s.cwd).replace(/\/+$/, '').split('/').pop() : '';
  return s.name || s.webuiName || cwdFolder || (s.sessionId ? String(s.sessionId).substring(0, 12) + '...' : '');
}
module.exports = { sessionDisplayName, sessionGivenName };
