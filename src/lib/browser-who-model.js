// "WHO CAN USE IT" — THE CLIENT'S ARITHMETIC (PURE, DOM-free, `t` injected; 2026-09-27, the owner: give a browser
// profile to several conversations and/or Task Groups). The server sends STRUCTURE (GET /api/browser/housekeeping's
// `use` per row, GET /api/browser/profiles/:id/use for the dialog); this module turns it into the rows the Agent
// browser panel draws and the dialog's picker starts from, and into the words each surface prints — in the device's
// language, never the server's sentence. Nothing here fetches or touches the DOM (src/lib/browser-trace-view.js draws
// the panel row, src/lib/browser-who-dialog.js the dialog).
//
//   · whoChips   — the panel's chips: one per row of the list, KEYED (`session:<key>` / `task:<id>`), named from the
//                  server's live name, else the client's own session rows by conversation id, else "A conversation
//                  that is not running now"; a Task Group by its title, "a deleted Task Group" (amber) when the store
//                  no longer lists it; `nobody` = the amber sentence when every row can no longer admit anyone.
//   · foldChips  — the first N shown, the rest folded into "+N more" (N = 4 at the panel's width, 2 at ≤ 768 px).
//   · pickerRows — the dialog's picker rows: every Task Group, every live LOCAL agent session, then every row of the
//                  current list the roster does not cover (a stopped conversation, a deleted Task Group) and the
//                  conversation that made the profile — with the keys the save maps back to the wire.
//   · draftWho   — the picker's selection → the PATCH's `who` rows (a row the list already had by KEY, a live session
//                  picked now by its webui id — the server resolves it to its browser key).
//   · loseCount  — how many conversations using it now the draft would take it from (a lease holder neither in the
//                  draft by key nor by any of its Task Groups).
//   · saveWords / refusalWords — the toasts.

/** How many chips the panel row shows before "+N more" (the phone: 2). */
export const CHIPS_WIDE = 4;
export const CHIPS_NARROW = 2;

/** The key a list row is drawn under (the keyed reconcile's identity). */
export function chipKeyOf(row) {
  return row && row.kind === 'session' ? `session:${row.key}` : `task:${row && row.id}`;
}

/**
 * The panel's chips for one profile row's `use` (server structure). `nameOfConversation(conversationId)` names a
 * stopped conversation from this client's session rows ('' = unknown); `taskOf(id)` = this client's copy of a Task
 * Group ({title, archived} | null). → `{mode, chips:[{key, kind, name, live, dead, amber, tooltip, backend}], nobody}`.
 */
export function whoChips(use, { t = (s) => s, nameOfConversation = () => '', taskOf = () => null } = {}) {
  const u = use && typeof use === 'object' ? use : { mode: 'all' };
  if (u.mode === 'all') return { mode: 'all', chips: [], nobody: '' };
  const rows = Array.isArray(u.who) ? u.who : [];
  const chips = rows.map((w) => {
    if (w.kind === 'session') {
      const name = (w.live && w.name) || (w.conversationId ? nameOfConversation(w.conversationId) : '') || '';
      return { key: chipKeyOf(w), kind: 'session', name: name || t('A conversation that is not running now'), live: !!w.live, dead: false, amber: false, backend: w.backend || null,
        tooltip: w.live ? '' : t('not running now') };
    }
    const mine = taskOf(w.id);
    const title = w.title || (mine && mine.title) || '';
    const deleted = w.deleted === true || (w.deleted === undefined && !mine && !w.title);
    const archived = !deleted && (w.archived === true || !!(mine && mine.archived));
    // the tooltip says what the chip MEANS (2026-09-28: it repeated the name — "a deleted Task Group — a deleted Task Group")
    if (deleted) return { key: chipKeyOf(w), kind: 'task', name: t('a deleted Task Group'), live: false, dead: true, deleted: true, amber: true, tooltip: t('Nobody gets access through it any more — remove it with Change…') };
    return { key: chipKeyOf(w), kind: 'task', name: title || String(w.id), live: false, dead: archived, archived, amber: archived,
      tooltip: archived ? t('Task Group — archived: its conversations can’t use this now') : t('Task Group — every conversation in it, now or later') };
  });
  // NOBODY, said by name (never "everyone"): every row is a Task Group that can no longer admit anyone. A stopped
  // conversation is NOT attrition — it resumes under the same key.
  let nobody = '';
  if (u.mode === 'unknown') nobody = t('Nobody can use it now: its list could not be read — choose Change… to set it again');
  else if (chips.length && chips.every((c) => c.dead)) {
    const deleted = chips.filter((c) => c.deleted).length, archived = chips.length - deleted;
    if (chips.length === 1) nobody = deleted ? t('Nobody can use it now: the Task Group it was limited to was deleted') : t('Nobody can use it now: the Task Group it was limited to is archived');
    else nobody = archived ? t('Nobody can use it now: the Task Groups it was limited to were deleted or archived') : t('Nobody can use it now: the Task Groups it was limited to were deleted');
  }
  return { mode: 'only', chips, nobody };
}

/** The first `max` chips and the folded rest ("+N more", its tooltip lists them). */
export function foldChips(chips, max = CHIPS_WIDE, { t = (s) => s } = {}) {
  const list = Array.isArray(chips) ? chips : [];
  const n = Math.max(1, Number(max) || CHIPS_WIDE);
  if (list.length <= n) return { shown: list.slice(), more: null };
  const rest = list.slice(n);
  return { shown: list.slice(0, n), more: { n: rest.length, text: t('+{n} more', { n: rest.length }), tooltip: rest.map((c) => c.name).join('\n') } };
}

/**
 * The dialog's picker rows. `view` = GET …/use; `sessions` = the client's live session rows (`sidebar._webuiSessions`);
 * `groups` = its Task Groups (`sidebar._tasks`); `groupsOfSession(s)` = the sidebar's membership rule; `folderTail`.
 * → `{rows, selected, remote, keyOf}` — `keyOf` maps a picker key back to the wire (`{kind:'task', id}` /
 * `{kind:'session', key}` / `{kind:'session', session}`) and to the conversation's browser key when known.
 */
export function pickerRows(view, { sessions = [], groups = [], groupsOfSession = () => [], folderTail = (x) => String(x || ''), nameOfConversation = () => '', t = (s) => s } = {}) {
  const v = view && typeof view === 'object' ? view : {};
  const use = v.use && typeof v.use === 'object' ? v.use : { mode: 'all' };
  const listed = use.mode === 'only' && Array.isArray(use.who) ? use.who : [];
  const rows = [], wire = new Map(), keyOfPick = new Map();
  const titleOf = (g) => String((g && (g.title || g.name)) || (g && g.id) || '');
  const liveGroups = (Array.isArray(groups) ? groups : []).filter((g) => g && g.id && !g.archived);
  for (const g of liveGroups) {
    const key = `task:${g.id}`;
    rows.push({ key, kind: 'group', id: g.id, name: titleOf(g), groupIds: [], groupNames: [] });
    wire.set(key, { kind: 'task', id: g.id });
  }
  let remote = false;
  const liveByKey = new Map();
  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (!s || !s.id) continue;
    if (s.backend === 'shell') continue;
    if (s.host || s.hostId) { remote = true; continue; }
    const cid = s.backendSessionId || s.claudeSessionId || null;
    let tgs = [];
    try { tgs = groupsOfSession(s) || []; } catch { tgs = []; }
    const key = `session:${s.id}`;
    rows.push({ key, kind: 'agent', id: cid || s.id, name: String(s.webuiName || s.name || s.id), folder: folderTail(s.cwd), backend: s.backend || 'claude', live: true,
      groupIds: tgs.map((g) => g.id), groupNames: tgs.map(titleOf), webuiId: s.id });
    const bk = typeof s.browserKey === 'string' && /^bk-[0-9a-f]{8}$/.test(s.browserKey) ? s.browserKey : null;
    // a live session the list already has BY KEY goes back as that key (nothing to resolve); a new pick by its webui id
    const inList = bk && listed.some((w) => w.kind === 'session' && w.key === bk);
    wire.set(key, inList ? { kind: 'session', key: bk } : { kind: 'session', session: s.id });
    if (bk) { keyOfPick.set(key, bk); liveByKey.set(bk, key); }
  }
  const selected = [];
  for (const w of listed) {
    if (w.kind === 'task') {
      const key = `task:${w.id}`;
      if (!wire.has(key)) {
        const dead = w.deleted || !w.title;
        rows.push({ key, kind: 'group', id: w.id, name: dead ? t('a deleted Task Group') : String(w.title), hint: dead ? t('nobody gets access through it any more') : (w.archived ? t('archived') : ''), groupIds: [], groupNames: [] });
        wire.set(key, { kind: 'task', id: w.id });
      }
      selected.push(key);
      continue;
    }
    const liveKey = liveByKey.get(w.key);
    if (liveKey) { selected.push(liveKey); continue; }
    const key = `session:bk:${w.key}`;
    const name = (w.name && w.live ? w.name : '') || (w.conversationId ? nameOfConversation(w.conversationId) : '') || t('A conversation that is not running now');
    rows.push({ key, kind: 'agent', id: w.conversationId || w.key, name, live: false, hint: t('not running now'), groupIds: [], groupNames: [] });
    wire.set(key, { kind: 'session', key: w.key });
    keyOfPick.set(key, w.key);
    selected.push(key);
  }
  // the conversation that MADE it, when it is not running and not listed (the first one a user thinks of)
  const cb = v.createdBy && typeof v.createdBy === 'object' ? v.createdBy : null;
  if (cb && cb.key && !liveByKey.has(cb.key) && !wire.has(`session:bk:${cb.key}`)) {
    const key = `session:bk:${cb.key}`;
    const name = (cb.conversationId ? nameOfConversation(cb.conversationId) : '') || t('A conversation that is not running now');
    rows.push({ key, kind: 'agent', id: cb.conversationId || cb.key, name, live: false, hint: t('made it · not running now'), groupIds: [], groupNames: [] });
    wire.set(key, { kind: 'session', key: cb.key });
    keyOfPick.set(key, cb.key);
  }
  return { rows, selected, remote, wire, keyOfPick };
}

/** The picker's selection → the PATCH's `who` rows (unknown keys dropped). */
export function draftWho(selected, wire) {
  const out = [];
  for (const k of Array.isArray(selected) ? selected : []) { const w = wire && wire.get(String(k)); if (w) out.push({ ...w }); }
  return out;
}

/** How many conversations USING it now (a lease) the draft takes it from: a holder whose key is not in the draft and
 *  none of whose Task Groups is either. "All my conversations" takes it from nobody. */
export function loseCount(usedBy, { mode = 'all', keys = [], taskIds = [] } = {}) {
  if (mode !== 'only') return 0;
  const K = new Set((keys || []).map(String)), T = new Set((taskIds || []).map(String));
  // the keeper's re-judge, mirrored: a holder that is NOT running (`live: false`, no session carries its key) has no
  // readable Task Groups now — with a Task Group row in the draft it is kept undecided (judged at its next command), so
  // it is not one that loses it when you save
  return (Array.isArray(usedBy) ? usedBy : []).filter((u) => u && u.leased && !K.has(String(u.key)) && !(u.taskIds || []).some((x) => T.has(String(x))) && !(u.live === false && T.size > 0)).length;
}

/** The success toast: "Who can use work: all my conversations" / "Who can use work: A, B". */
export function saveWords({ label = '', mode = 'all', names = [] } = {}, t = (s) => s) {
  if (mode !== 'only') return t('Who can use {label}: all my conversations', { label });
  return t('Who can use {label}: {list}', { label, list: (names || []).filter(Boolean).join(', ') });
}

/** A refused save, in the device's words by the server's CODE (the server's sentence is the agent's; the user reads
 *  these). `null` = the caller says the generic "Could not change who can use it" + the server's sentence. */
export function refusalWords(r, t = (s) => s, { max = 64 } = {}) {
  const code = r && r.code;
  const name = (r && r.name) || '';
  switch (code) {
    case 'empty_list': return t('Pick at least one conversation or Task Group, or choose “All my conversations”.');
    case 'no_browser_key': return r && r.why === 'remote' ? t('“{name}” runs on another machine — the Agent browser runs on this machine only', { name }) : t('“{name}” has no browser of its own yet — restart it (Terminate → Resume), then add it', { name });
    case 'session-gone': return t('That conversation is not running any more — pick it again from the list');
    case 'unknown_task': return t('That Task Group no longer exists — pick another one');
    case 'unknown_conversation': return t('That conversation can no longer be added — pick it again from the list');
    case 'too_many': return t('At most {n} conversations and Task Groups', { n: max });
    case 'list-changed': return t('The list changed while this dialog was open (another window, or an agent) — here it is as it is now; nothing was saved');
    default: return null;
  }
}
