/**
 * TaskGroupManager — the structured store for Task Groups (岗位; the persistent
 * role a session belongs to). docs/design-task-system.md + design-task-refactor.md.
 *
 * A Task Group is a TAG above sessions and a SUPERSET of the old user groups:
 * kind:'group' entries are exactly the old groups, kind:'task' adds
 * objective/activity/attention. `data/task-groups.json` (migrated
 * once from the legacy data/tasks.json) is AUTHORITATIVE for everything the
 * board renders — the UI never parses agent-authored text (agents are
 * non-deterministic; see §3.2 of the design).
 *
 * - Legacy Groups migration: on first load with no store, sessionGroups +
 *   groupFolders from user-state.json become kind:'group' entries (one-time,
 *   guarded by file existence). user-state keeps the legacy keys dormant.
 * - THE CONTEXT TABLE (lane task-group-context, 2.369.346): ONE ordered list
 *   `ctx` of rows (src/task-context.js — path + note + how much the agent is
 *   told + verbs) replaces the two old folder bindings. Derived, never stored
 *   twice: the 'discover' rows = the old folders[] (auto-include by cwd), the
 *   'notes' row = the old contextDir (the .vibespace/TASK.md mirror). The old
 *   fields stay in the FILE one release (an older build reads them) but are
 *   held aside at load (_legacy) and read only by the one migration
 *   (migrateContextRows, src/server/migrations.js).
 * - Atomic writes + tasks-updated broadcast via onChange, same manager
 *   pattern as hosts.js/mounts.js. Export/import for config transfer.
 * NOTE: internal identifiers still say `task`/`progress` in places — the
 * user-facing concept is Task Group / Activity log; wire names (JSON fields,
 * API paths, the `tasks-updated` event, CLI commands) are kept for data +
 * contract compatibility.
 * CHECKLIST REMOVED (2.121.0, user decision): a group-level checklist of agent
 * WORK ITEMS never made sense — agents don't care about other agents' work
 * items; those live at the SESSION level (the agent's own native todo list,
 * surfaced as the card's Steps). Stored `plan` arrays are kept DORMANT in the
 * JSON (never rendered, never written) so nothing is destroyed.
 * BACKLOG ADDED (2.122.0, user decision): a different concept with the same
 * shelf — the group's PARKING LOT for NON-immediate items (deferred user
 * decisions, "later" work). See the BACKLOG_STATUSES note.
 */

const fs = require('fs');
const path = require('path');
const DOOR = require('./mount-door'); // B-afc4: the blocked-path door — asked BEFORE a user-path read
// lane hub-fuse-sync-guard: a context row on a STORAGE mount (src/storage-path.js) is never read on the main thread — the
// production hub's 6.5-min hold of 2026-10-23 had this store's _kindOf statSync on a OneDrive row in its window (the
// journal, 21:44: 1209 ms). Its stat / walk / text come from SafeFs facts (src/storage-facts.js: the last off-thread
// answer, re-read in the background past 4 s — the same TTL as the caches below); a local row keeps its sync road.
const SP = require('./storage-path.js');
const GM = require('./grant-model.js'); // lane grants-unify: the group's outside visibility is a row of the ONE grants store
const { timedSync } = require('./timed-sync.js'); // PURE: the store-write clock (design 011 lane 1, store-timing)
const SR = require('./store-read.js'); // B-f276's law for THIS store (lane bl-windows): a store that could not be read is never written over
// THE STORE HELD UNREAD (lane bl-windows 2026-11-18, 主开发 23:05Z — the release's _load read ANY failure as «no file»: the boot
// then saved the old tasks.json, or an empty store, OVER task-groups.json it could not read; every group, backlog row and activity
// log of the instance gone, nothing said). Only a file that is truly ABSENT falls to tasks.json or to an empty store; a read that
// FAILED, bytes that do not parse, bytes not of the store's shape: the store is HELD — nothing writes it, every act that would
// record something is refused BY NAME, the person is told ONCE, the read is tried again at a bounded pace (and at every start).
const STORE_SHAPE = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && !!v.tasks && typeof v.tasks === 'object' && !Array.isArray(v.tasks) && Object.values(v.tasks).every((t) => !!t && typeof t === 'object' && !Array.isArray(t)); // a plain map of records (an array of tasks, a null record: held, never loaded into a boot that crashes or a save that drops them)
const UNREAD_TEXT = "Task Groups cannot be read right now — {file} in VibeSpace's data folder could not be read ({code})"; // ui-words: an English KEY — the client words it through t() where the For-you item is drawn (zh / ja rows)
const UNREAD_DETAIL = "It is kept exactly as it is: nothing writes it. Until it reads, Task Groups are not shown and nothing is recorded — an agent's progress line or a parked row is refused, and the agent is told. VibeSpace reads it again every few minutes and at every start; check the storage that holds the data folder. A channel watch by a Task Group, or one that leaves a Task Group out, wakes nobody until it reads; what arrives meanwhile stays in its channel."; // ui-words: an English KEY (zh / ja rows)
const UNREAD_REFUSAL = "Task Groups: {act} was refused — {file} in VibeSpace's data folder could not be read ({code}); it is kept exactly as it is and read again every few minutes. Until it reads, Task Groups are not shown and nothing is recorded.";
// THE WAY OUT FOR DAMAGED BYTES (主开发 00:41Z (a)): bytes that do not parse or are not the store's shape never read better by
// themselves — the store stays HELD (never set aside and started empty by itself: an empty store agents then write into is worse
// than a stop) and the words name the door: a backup put in its place is read within minutes; a file moved aside needs a restart
// (a start then judges an absent file: no Task Groups)
const UNREAD_TEXT_DAMAGED = "Task Groups cannot be read — {file} in VibeSpace's data folder is damaged"; // ui-words: an English KEY (zh / ja rows) — no {code}: a damaged file's «code» is an English why
const UNREAD_DETAIL_DAMAGED = "It is kept exactly as it is: nothing writes it, and it will not read better by itself. Put a backup of it in its place (read within minutes), or move it aside and restart VibeSpace — a start then finds no file and begins with no Task Groups. Until then Task Groups are not shown and nothing is recorded. A channel watch by a Task Group, or one that leaves a Task Group out, wakes nobody until it reads; what arrives meanwhile stays in its channel."; // ui-words: an English KEY (zh / ja rows)
const UNREAD_REFUSAL_DAMAGED = "Task Groups: {act} was refused — {file} in VibeSpace's data folder is damaged; it is kept exactly as it is. Put a backup in its place, or move it aside and restart VibeSpace. Until then nothing is recorded.";
const damagedOf = (u) => !!u && (u.why === 'did not parse' || u.why === 'not the expected shape');
const fillWords = (t, p) => t.replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m));
/** the person's words while the store is held (the For-you notice, once) → {text, detail, i18n} */
function unreadNoticeWords(u) {
  const p = { file: u.file, code: u.code };
  const [T, D] = damagedOf(u) ? [UNREAD_TEXT_DAMAGED, UNREAD_DETAIL_DAMAGED] : [UNREAD_TEXT, UNREAD_DETAIL];
  return { text: fillWords(T, p), detail: fillWords(D, p), i18n: { text: { key: T, params: p }, detail: [{ key: D, params: p }] } };
}
const crypto = require('crypto');
const os = require('os');
const TC = require('./task-context.js'); // PURE: the Context table's rows, resolution, derivations, budget plan (lane task-group-context)
const { pickColorSeq } = require('./task-color-seq');
const { folderOf, insideFolder, membersWithout, onOtherMachine, memberFolders, folderOnHost } = require('./task-membership.js'); // PURE (lane open-task-binds): THE folder rule (a folder includes itself; a glob tail is the recursive switch) — the bundle's panel asks the same one
const belt = require('./agent-output-belt.js'); // lane agent-output-sinks: the sink belt — a progress note / detail a reader sees never carries a credential in the clear
// lane cli-call-timeouts: one TASK.md mirror write's bound (each op through SafeFs / fs.promises) and the retry after a miss
const MIRROR_BOUND_MS = 10000;
const MIRROR_RETRY_MS = 30000;
// lane groups-sweep-on-change commit 2 — MEMBERSHIP IS AN INDEX (groupsForSession): its result map holds at most this many
// asks between two rebuilds — one per distinct (session key, cwd + its realpath, spawned-into ids) asked, i.e. every live
// and discovered session × its cwds — and is CLEARED at the cap (an answer is recomputed, never wrong)
const MEMBER_RESULTS_MAX = 2048;
// B-55dc: the membership facts' reader when the store has no SafeFs worker (suites; an embedded store) — fs.promises, the
// libuv pool, never a sync call on the main thread
const MEMBER_FALLBACK = Object.freeze({
  stat: (p) => fs.promises.stat(p).then((st) => ({ isDirectory: st.isDirectory(), isFile: st.isFile() })),
  realpath: (p) => fs.promises.realpath(p).then((r) => ({ path: r })),
});
// B-55dc THE DECIDING DOOR's bound: how long an ask that decides what an agent is told or allowed waits for the first read
// of a path never read, before it answers with the «reading» answer (the rules then arrive at the next hook)
const DECIDE_BOUND_MS = 1500;
// task-context's own rooted rule (src/task-context.js isRooted): a rooted row resolves without the disk
const ROOTED_ROW = (p) => p.startsWith('/') || p === '~' || p.startsWith('~/') || TC.isRemote(p);
// what membership READS, per record, in store order: its key, id, archived, createdAt (the answer's order), sessions[] and
// its Context rows (the discover folders). A store write that moves none of it (a progress line, a title, a note, a
// backlog item) keeps the index; this is the split of the revision — by what membership reads, never by a list of writers
// (a writer added later that forgets to say «membership» would leave a stale index, and a stale membership is a wrong grant)
function memberSig(tasks) {
  const h = crypto.createHash('sha1');
  for (const [k, t] of Object.entries(tasks)) h.update(JSON.stringify(t && typeof t === 'object' ? [k, t.id, !!t.archived, t.createdAt ?? null, t.sessions ?? null, t.ctx ?? null] : [k, typeof t]) + '\n');
  return h.digest('hex');
}
// Backlog PRIORITY + the ownership-aware selection every READ uses (TASK.md,
// the per-turn reminders, the show/backlog listing) — the store keeps every
// item; which ones a read shows is decided there (2026-09-22).
const { BACKLOG_ROW_FIELDS, PRIORITIES: BACKLOG_PRIORITIES, normalizePriority, markedText, escapeItemText, unescapeItemText, sortBacklog, selectReminders, nudgeThreshold, backlogNudge, nudgeTextAll } = require('./backlog-select');
// "Clear content…" (2026-09-28): the ONE definition of what a clear replaces and
// who may do it — this store only holds the door (clearProgress below).
const { applyClear } = require('./record-clear');
// lane peer-census verify r4 F1: A TASK GROUP'S WORDS ARE ANOTHER SESSION'S. A progress note and a backlog item are
// written by ANY agent of the group (`vibespace-task progress` / `backlog-add`, a manager agent's audit line, a TASK.md
// file imported from disk), the title and objective by the user or a manager agent, a shared file's NAME by whoever wrote
// the file; every session of the group reads them through the hook's injection (renderContext / renderMultiContext / the
// two diff blocks), the generated TASK.md in the context folder and `vibespace-task show` — with NO rule at all, a note
// carrying `<system-reminder>…</system-reminder>` was live in every member's context (reproduced over this store). THE
// belt (src/peer-text.js) at every render: a title, an item's text, a note, a file name as ONE LINE PIECE (a cut is the
// belt's `max` — bound, THEN judged, r2 F1's rule), a detail and the objective as a BLOCK (each line judged on its own).
// The STORE keeps the words as written (the user's board draws them as textContent); the agent routes' answers take the
// same belt in src/agent-routes.js (taskShowAnswer / taskItemAnswer / taskEntryAnswer / taskGroupBrief).
const { toAgentText } = require('./peer-text.js');
const { artifactsIntroLine } = require('./harnesses/artifacts-of.js'); // PURE: the one Artifacts sentence (lane artifacts-prompt-hint)
const agentLine = (s, max = 0) => toAgentText(s == null ? '' : s, { kind: 'line', ...(max > 0 ? { max } : {}) });
// THE GROUP-WIDE WORDS (lane injection-relevance): a line that asks, is blocked or waits on somebody is every member's news —
// an update ranks it right after the lines addressed to the member (the injection audit's ask-word heuristic, en + zh;
// matched on lowercased text)
const GROUP_WIDE_RE = /\b(?:ask(?:s|ed|ing)?|block(?:s|ed|er|ing)?|needs[- ]input|waiting (?:on|for)|for[- ]you|urgent)\b|待你|阻塞|卡住|需要你|请你|等你/;
const ACTIVITY_ROOM = 2200;   // an update's picked activity lines: at most 8 in this many bytes (the digest rides beside them)
const agentBlock = (s) => toAgentText(s == null ? '' : s, { kind: 'block' });

// lane cli-registry: the SessionStart tools section renders from THE agent CLI registry (one row per CLI on PATH — its
// paragraph, its gate); CHANNELS_SECTION_LINES (lane channels-teach: the paragraph by reach) lives in its row, re-exported
const { renderSessionStartTools, CHANNELS_SECTION_LINES } = require('./agent-cli-registry.js');
const OF = require('./server/owner-facts.js'); // lane agent-context-owner-facts (B-7960): the owner's clock + tray words (PURE src/when-words.js, src/tray-words.js bound to the instance)

// Task Groups (岗位) have NO status — they are persistent roles; only an
// `archived` flag. Task STATUS lives on the session (session-status.js STATES,
// which now includes `done`).
const KINDS = ['task', 'group'];
// NO CAP ON THE BACKLOG STORE (2026-09-22, owner: "没必要设上限，只要有合适的
// priority 分级和 ownership，每次 push 能选择正确的条目就行"). The old
// `backlogItems: 200` was a cap on the STORE — the 工作 group sat at exactly
// 200 (150 done + 48 open + 2 dropped) and every backlog-add was sliced off
// silently while the CLI echoed the last surviving id. A bound belongs to a
// READ (what an injection or a listing SELECTS, by ownership and priority
// within its byte budget), never to a WRITE: storage keeps everything, a
// write is acknowledged only once it is found stored (agent-routes), and
// scripts/test-backlog-no-truncation.mjs fails any slice on this store.
const CAPS = { title: 120, objective: 20000, note: 2000, detail: 6000, reason: 500, backlogItem: 500 };
// lane task-group-context: the default byte budget of ONE group's Context table in an injection (setting
// tasks.contextIndexBytes — the key B-86d3 ② gave the old folder index, kept; 0 = only the inline room) — see _ctxPlan.
// The table never plans past what the hook carries: INJECT_ROOM = agent-routes' INLINE_CAP, LOG_RESERVE = the activity
// log's floor below it (the law: tools / rules first, then the context block, the log last).
const CONTEXT_BUDGET_BYTES = TC.DEFAULT_BUDGET;
const INJECT_ROOM = 9600;
const LOG_RESERVE = 1200;
// a listed folder is walked at most this deep / this many entries (a walk that hits the cap is "over N files")
const WALK_DEPTH = 4;
const WALK_CAP = 400;
// lane task-group-fanout: the turn's off-thread signature read — the hook path waits at most SIG_BOUND_MS (its call aborts
// at 3 s); one worker call's own deadline is SIG_READ_MS (past it the worker is presumed wedged — SafeFs replaces it)
const SIG_BOUND_MS = 1000;
const SIG_READ_MS = 10000;
const sigEsc = (p) => p.replace(/%/g, '%25').replace(/\|/g, '%7C');
// a told file is read up to this many bytes (a bigger one never fits a budget whole — it steps down)
const READ_CAP = 64 * 1024;
// the four depths in the agent's words (a stepped row's line names both)
// row B-422c, second half (主开发 r3499 / r3507; lane mask-value-shape): a storage fact refused BY THE OFF-THREAD READER (its worker
// restarting after a deadline — SafeFs no-worker / no-idle-worker —, no reader wired, or its own read past the deadline) is UNKNOWN,
// never a fact about the folder or the file: «not read now», with why, never «empty», «absent» or «not answering». A refusal the
// STORAGE gave (EIO, EACCES) stays blocked; ENOENT stays missing. → 'restarting' | 'slow' | null
const READER_DOWN = new Set(['no-worker', 'no-idle-worker', 'no-reader']);
// line 834's round (主开发 r3771): a deadline met while NO worker was ever taken (SafeFs's `noWorker`, carried by storage-facts) is
// the reader restarting; the reader's own one-try refusal (`path-trying`: the first press on that path has not answered yet) is
// the storage not answering in time — both the reader's, never a fact about the file
const readerDownWhy = (f) => (!f || f.ok || f.pending ? null : f.noWorker === true ? 'restarting' : f.timedOut || f.code === 'timeout' || f.code === 'path-trying' ? 'slow' : READER_DOWN.has(f.code) ? 'restarting' : null);
const NOT_READ_WORDS = { restarting: 'its reader is restarting', slow: 'its storage did not answer in time' };
const KEPT_GOOD_MAX = 256;   // the folders whose last good listing is kept for a refused read (TaskGroupManager._keepGood)
// line 834's follow (主开发 r3809): the kept listing's age as the tree's other marks say one — s, min, h, d (never «10800 s ago»)
const readAgo = (ms) => { const s = Math.max(0, Math.round(Number(ms) / 1000)); return s < 90 ? `${s} s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 48 * 3600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
const TELL_WORDS = { note: 'the path and note only', names: 'file names', index: 'file names + key files', contents: 'full contents' };
// the unclaimed-HIGH reminder line's TEXT budget in BYTES (CJK = 3 B/char), shared by every group of one injection
const HIGH_LINE_TEXT_BYTES = 600;
// Multi-group payloads share ONE text budget for the "claimed by THIS session"
// item lines too (2026-09-22 verifier: 2 groups × 5 CJK items ≈ 4.8 KB of item
// text put a 2-group SessionStart at 9.8 KB before anything else was added);
// past it an item keeps its id + marker + a short clip (`backlog-show <id>`).
const MINE_LINE_TEXT_BYTES = 1500;
const MINE_CLIP_OVER_BUDGET = 40;
// Backlog (2.122.0) = the group's PARKING LOT for non-immediate items: deferred
// user decisions, "later" work. Semantically NOT the removed checklist (agent
// work items — those live on each session's own todo): injection never dumps
// it (only a summary + a one-line query pointer), and agents are taught to
// never start backlog items unasked.
// CLAIM MODEL (2.123.0, user directive): each item has a stable short `id`
// (B-xxxx — the user can copy it and hand it to ANY member agent, which can
// then view/claim it) and a `claimedBy` list of session keys. The session that
// parks an item auto-claims it. Injection reminders show the items a session
// CLAIMED (not merely created), and diff events for an item go ONLY to
// sessions that created or claimed it — everyone else just has the count line.
const BACKLOG_STATUSES = ['open', 'done', 'dropped'];
const BACKLOG_ID_RE = /^B-[0-9a-f]{4,8}$/i;
function mintBacklogId(taken) {
  let id;
  do { id = 'B-' + crypto.randomBytes(2).toString('hex'); } while (taken.has(id));
  taken.add(id);
  return id;
}
// B-0248 step 3 (r1436, THE LOST CLAIM): A PAGE'S BACKLOG CHANGE IS ONE ROW, BY ITS ID, applied to the LIVE list. The page used to
// send its copy of the WHOLE list, and the store took it: an agent's claim, row or close that landed after that copy reached the
// page was written out of the store (the agent told «done»). `backlogRow: {id, expect?: {status}, set?: {text, detail, priority,
// status, resolvedBy, resolvedAt}, unclaim?: [session key], remove?: true}` · `backlogAdd: row`. Each field is typed (a string; the
// time a number): a field set to null or '' leaves the row — never its line (a row keeps its text). `expect.status` = the status the
// press saw: a row closed or reopened meanwhile is refused (backlog_row_moved), never written over (an agent's close keeps its own
// «resolved by»). An ADD is taken once: the same row again (its addedBy + addedAt + text — the page keeps the stamp of a try whose
// answer was lost) adds nothing. A row gone meanwhile is refused BY NAME (backlog_row_gone), a malformed one too (backlog_row_bad):
// nothing written. → the next list; the store's own normalization (ids, caps, statuses) runs on it as on any backlog write
const BACKLOG_REFUSALS = Object.freeze(['backlog_row_gone', 'backlog_row_moved', 'backlog_row_bad', 'backlog_whole']);
const BACKLOG_ROW_TYPES = Object.freeze({ text: 'string', detail: 'string', priority: 'string', status: 'string', resolvedBy: 'string', resolvedAt: 'number' });
function backlogWithRow(list, { backlogRow, backlogAdd } = {}) {
  const bad = (why) => Object.assign(new Error(`${why} — nothing was written`), { code: 'backlog_row_bad' });
  const next = (Array.isArray(list) ? list : []).map((b) => ({ ...b, claimedBy: [...(Array.isArray(b.claimedBy) ? b.claimedBy : [])] }));
  if (backlogRow !== undefined) {
    const r = backlogRow;
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !BACKLOG_ID_RE.test(r.id)) throw bad("backlogRow names its row by the row's id (B-…)");
    const i = next.findIndex((b) => b.id === r.id);
    if (i < 0) throw Object.assign(new Error(`backlog row ${r.id} is no longer in this group (removed meanwhile) — nothing was written`), { code: 'backlog_row_gone', id: r.id });
    if (r.expect !== undefined) {
      if (!r.expect || typeof r.expect !== 'object' || typeof r.expect.status !== 'string') throw bad('backlogRow.expect names the status the press saw');
      const live = next[i].status || 'open';
      if (live !== r.expect.status) throw Object.assign(new Error(`backlog row ${r.id} is ${live} now (changed meanwhile) — nothing was written`), { code: 'backlog_row_moved', id: r.id, status: live });
    }
    if (r.remove === true) next.splice(i, 1);
    else {
      const b = next[i];
      if (r.set !== undefined) {
        if (!r.set || typeof r.set !== 'object' || Array.isArray(r.set)) throw bad('backlogRow.set is one object of fields');
        for (const k of Object.keys(r.set)) if (!BACKLOG_ROW_FIELDS.includes(k)) throw bad(`backlogRow.set takes ${BACKLOG_ROW_FIELDS.join(', ')} — not «${String(k).slice(0, 40)}»`);
        for (const k of BACKLOG_ROW_FIELDS) {
          if (!Object.prototype.hasOwnProperty.call(r.set, k)) continue;
          const v = r.set[k];
          if (v === null || v === '') { if (k === 'text') throw bad('a backlog row keeps its line'); delete b[k]; continue; }
          if (typeof v !== BACKLOG_ROW_TYPES[k] || (k === 'text' && !v.trim())) throw bad(`backlogRow.set.${k} is a ${BACKLOG_ROW_TYPES[k]}${k === 'text' ? ' with words' : ''}`);
          b[k] = v;
        }
      }
      if (r.unclaim !== undefined) { const gone = new Set(sanitizeStrArray(r.unclaim, 20)); b.claimedBy = b.claimedBy.filter((k) => !gone.has(k)); }
    }
  }
  if (backlogAdd !== undefined) {
    if (!backlogAdd || typeof backlogAdd !== 'object' || Array.isArray(backlogAdd)) throw bad('backlogAdd is one row');
    if (typeof backlogAdd.text !== 'string' || !backlogAdd.text.trim()) throw bad('backlogAdd.text is the row\'s line (words)');
    const { id: _id, claimedBy: _claims, ...row } = backlogAdd;   // a new row's id is the store's; nobody's claim rides a page's add
    const sameAdd = (b) => Number(row.addedAt) > 0 && Number(b.addedAt) === Number(row.addedAt) && String(b.addedBy || '') === String(row.addedBy || '') && String(b.text || '').trim() === row.text.slice(0, CAPS.backlogItem).trim();   // both sides trimmed (r1699 (6): a row stored by another road keeps its spaces)
    if (!next.some(sameAdd)) next.push(row);   // a try whose answer was lost, sent again: taken once
  }
  return next;
}
/** B-0248 step 3 (r1443 (ii)): a page from BEFORE the update still sends its whole copy. Its ADD (the copy + ONE row without an id —
 *  every stored row carries its id, so the only id-less row a page sends is the one the person just typed, and that page cleared its
 *  box at the press) → that row, taken as one row (the typed words kept, the stale copy of the rest never written); any other
 *  whole list → null (refused by name: reload) */
function oldPageAdd(body) {
  if (!body || typeof body !== 'object' || Object.keys(body).length !== 1 || !Array.isArray(body.backlog)) return null;
  const fresh = body.backlog.filter((it) => it && typeof it === 'object' && !(typeof it.id === 'string' && BACKLOG_ID_RE.test(it.id)));
  return fresh.length === 1 ? fresh[0] : null;
}
// ACTIVITY-LOG ENTRY IDS (2026-09-28, "Clear content…"): an entry used to be
// {at, note, detail?, session} — addressable only by its millisecond (two
// writers can share one, an import mints whole minutes) or by an array index
// the 500-entry cap shifts. Every entry now carries a stable `P-<6 hex>` id,
// minted at addProgress and backfilled once at load (the backlog-id precedent
// above); `vibespace-task show` prints it for the caller's own entries and
// `progress-redact <id>` names it.
const PROGRESS_ID_RE = /^P-[0-9a-f]{6}$/;
function mintProgressId(taken) {
  let id;
  do { id = 'P-' + crypto.randomBytes(3).toString('hex'); } while (taken.has(id));
  taken.add(id);
  return id;
}
// PROGRESS ARCHIVE (2.369.204, the owner 2026-10-03: "进展记录不再删除"): the live list keeps the newest
// LIVE_PROGRESS entries; an entry leaving it is MOVED — appended to data/task-groups-archive/<taskId>/<YYYY-MM>.ndjson
// (the entry's own `at`, UTC month), one JSON line per entry, THROUGH THE STORE WRITER (B-0248 step 3 (c): an append job on its
// thread, fsynced — the main thread never opens the share at a note), and the live list is trimmed only once that append LANDED
// (_archiveLanded): a crash between the two leaves the entry twice (every reader dedups by id), never nowhere. A month
// file is only ever appended to, except by a clear and a config import (each rewrites ONE month file, tmp + rename);
// a Task Group delete removes its directory. Reads page backwards by `before` (readProgress), bounded per request.
const LIVE_PROGRESS = 500;
const ARCHIVE_DIR = 'task-groups-archive';
const MONTH_FILE_RE = /^(\d{4}-\d{2})\.ndjson$/;
const ARCHIVE_CHUNK = 128 * 1024;          // ≥ one entry's line (note 2000 + detail 6000 chars, JSON-escaped)
const ARCHIVE_READ_BUDGET = 4 * 1024 * 1024; // bytes one page may read from the archive
const monthOf = (at) => { const d = new Date(Number(at) || 0); return isNaN(d) ? '1970-01' : d.toISOString().slice(0, 7); };
const archivableId = (id) => typeof id === 'string' && /^[\w-]{1,80}$/.test(id);
// B-0248 step 3 (c) follow (r1821 (1)): a clear's or an import's month rewrite, or a group's removal, while an archive append is still
// on its way past the writer's bound — REFUSED BY NAME, nothing changed (the person tries again; the append lands meanwhile)
const ARCHIVE_BUSY = (why) => Object.assign(new Error(`the Activity log's storage is still writing (${why}) — nothing was changed; try again in a moment`), { code: 'EVSARCHIVEBUSY' });
// r2292: an IMPORT whose owed archive months could not be written first (the storage keeps failing) — refused by name, nothing imported
const ARCHIVE_FAILING = (why) => Object.assign(new Error(`the Activity log's archive write keeps failing (${why}) — nothing was imported; its entries stay in the live list and the store writer retries`), { code: 'EVSARCHIVEFAILING' });
const parseLine = (ln) => { try { const p = JSON.parse(ln); return p && typeof p === 'object' && p.id ? p : null; } catch { return null; } };
function readAt(fd, pos, len) { const b = Buffer.alloc(len); const n = fs.readSync(fd, b, 0, len, pos); return b.subarray(0, n); }
/** the first whole line starting at or after `pos` (pos 0 = the file's first line): {start, end, at} or null */
function lineFrom(fd, pos, size) {
  const from = Math.max(0, pos - 1);
  const b = readAt(fd, from, Math.min(ARCHIVE_CHUNK, size - from));
  const nl = pos === 0 ? -1 : b.indexOf(10);
  if (pos !== 0 && nl < 0) return null;
  const s = pos === 0 ? 0 : nl + 1;
  const e = b.indexOf(10, s);
  if (e < 0) return null;
  const p = parseLine(b.subarray(s, e).toString('utf8'));
  return { start: from + s, end: from + e + 1, at: p ? Number(p.at) : -Infinity };
}
/** the byte offset just past the last line older than `lim` in a time-ordered month file (binary search, then ≤ 3 chunks) */
function monthCut(fd, size, lim) {
  if (!Number.isFinite(lim)) return size;
  let lo = 0, hi = size;
  while (hi - lo > 2 * ARCHIVE_CHUNK) {
    const mid = Math.floor((lo + hi) / 2);
    const ln = lineFrom(fd, mid, size);
    if (!ln || ln.at >= lim) hi = ln ? ln.start : mid; else lo = ln.end;
  }
  const b = readAt(fd, lo, Math.min(size, hi + ARCHIVE_CHUNK) - lo);
  let at = 0;
  while (at < b.length) {
    const e = b.indexOf(10, at);
    if (e < 0) break;
    const p = parseLine(b.subarray(at, e).toString('utf8'));
    if (p && Number(p.at) >= lim) return lo + at;
    at = e + 1;
  }
  return lo + at;
}

function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

// agent browser P1 (§3.2.5 row 3): a group's default profile is a profile ID
// (bp-<8 hex>) or null — a label would drift with a rename, so the picker
// sends the id; anything else is null (never a throw out of a patch).
// lane lg-group-parents (B-91a7): at most this many parents a group names (the owner's rule ①: several = the union)
const PARENTS_MAX = 8;
// lane lg-group-parents U4: the parents' standing rules a child's injection tells — each at most, and in all at most (bytes)
const INHERITED_RULE_MAX = 1500, INHERITED_RULES_MAX = 3000;
// the U2 read (7): a parent WIDENS what a child may use — a bearer (an agent, a job, an automation key) never sets one, sign-in on or off
// the chain's cure (E): the parent refusals by CODE — a route hands the code on (a client keys on it, never on the words)
const PARENT_REFUSALS = Object.freeze(['bad_parents', 'unknown_parent', 'parent_self', 'too_many_parents', 'parent_cycle', 'parents_owner_only', 'parents_stale']);
const PARENTS_OWNER_ONLY = () => Object.assign(new Error("a Task Group's parents are the owner's to set (the group's settings, signed in) — a bearer never sets them"), { code: 'parents_owner_only' });
function sanitizeBrowserProfileId(v) { const s = typeof v === 'string' ? v.trim() : ''; return /^bp-[0-9a-f]{8}$/.test(s) ? s : null; }
/** MULTIVIEW D4 (docs/design-browser-multiview.zh.md): the group's default PER-CONVERSATION browser cap, 1..6, or null (follow the instance setting). */
function sanitizeBrowserCap(v) { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? Math.max(1, Math.min(6, Math.round(n))) : null; }
function sanitizeStrArray(arr, cap = 200) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    if (typeof x !== 'string' || !x || seen.has(x)) continue;
    seen.add(x);
    out.push(x);
    if (out.length >= cap) break;
  }
  return out;
}

// B-9ac8: the activity log's count when a cap's re-pick kept NO line — none fit, how many, where they are (`gid` = `--group <id> `
// in a payload of several groups: the CLI refuses a bare `show` there; `show` prints the NEWEST entries, never all)
const noneFitWords = (n, gid = '') => `none fit inline — ${n} line${n === 1 ? '' : 's'}; \`vibespace-task ${gid}show\` prints the newest`;

class TaskGroupManager {
  constructor({ dataDir, onChange, readUserState, getSetting, isPathShadowed, mirrorFs, mirrorBoundMs, sigBoundMs, isLiveKey, grants = null, homeDir, unreadNotice = null, unreadRetry = null, hostRealOf = null, writer = null }) {
    // B-16d7: (hostId, cwd) → the real path THAT machine resolved for a cwd it listed (src/hosts.js realCwdOf), or null
    this._hostRealOf = typeof hostRealOf === 'function' ? hostRealOf : () => null;
    this._writerDep = writer;   // lane lg-store-writes U5: the store writer (a suite's stand-in), else the process's
    // lane grants-unify: the group's outside visibility is a ROW of the ONE grants store (door group-visibility) — the store (or
    // a getter); absent ⇒ none (every group opaque, a write refused by name)
    this._grants = typeof grants === 'function' ? grants : () => grants;
    // (path) → the disconnected storage whose mount point contains it, or
    // null. Late singleton (mounts wire up after this store) — the getter
    // resolves at call time; server.js re-runs syncAllContextMd() once
    // mounts exist and on every mounts-updated.
    this._isPathShadowed = isPathShadowed || (() => null);
    // Authoritative store for Task Groups (岗位). Renamed from tasks.json in the
    // 岗位/活儿 refactor; _load migrates the old file once. The internal
    // `_state.tasks` map keeps its key (a wire/data structure — renaming it would
    // break existing files for no user-visible gain).
    this._file = path.join(dataDir, 'task-groups.json');
    this._legacyFile = path.join(dataDir, 'tasks.json');
    this._archiveRoot = path.join(dataDir, ARCHIVE_DIR);
    this._archQ = new Map();   // B-0248 step 3 (c): month file → { gid, month, ids (owed, not made yet), flying ([{id, clearedAt}] in an append on its way) }
    this._onChange = onChange || (() => {});
    this._state = { version: 1, tasks: {} };
    this._lastMd = new Map(); // groupId → last written TASK.md content (skip no-op writes)
    // lane cli-call-timeouts (hub feedback 2026-10-23: `vibespace-task progress` hung 30+ min): the TASK.md MIRROR is
    // written OFF the store write — queued per group (the newest content wins), through SafeFs (`mirrorFs()` = server.js
    // app.locals.safeFs: a worker with a deadline, a blocked mount refused at its door; fs.promises when none) and BOUNDED
    // by MIRROR_BOUND_MS. A route answers after the store write; mirrorStateOf(id) says when the copy is behind.
    this._mirrorFs = typeof mirrorFs === 'function' ? mirrorFs : (mirrorFs ? () => mirrorFs : () => null);
    // a landed storage fact that differs from the kept one drops the derived caches (the next ask re-derives)
    this._facts = require('./storage-facts.js').create({ safeFs: () => this._mirrorFs(), onLanded: () => { for (const c of [this._resCache, this._walkCache, this._sigCache]) if (c) c.clear(); } });
    // B-55dc: THE MEMBERSHIP ANSWER COSTS THE MAIN LOOP NO FILE CALL — a discover row's kind and a cwd's realpath are the last
    // OFF-LOOP read (SafeFs's worker, else fs.promises); a read that changes who is a member says so once (_memberMoved)
    this._mfacts = require('./member-facts.js').create({ reader: () => this._mirrorFs(), fallback: MEMBER_FALLBACK, onMoved: (op, p, v) => this._memberMoved(op, p, v), log: (m) => console.log(`[task-groups] ${m}`) });
    this._mirror = new Map(); // groupId → { want: {dir, content}|null, inflight, since, startedAt, failedAt, why, retry }
    this._mirrorBoundMs = Number(mirrorBoundMs) > 0 ? Number(mirrorBoundMs) : MIRROR_BOUND_MS;   // (a suite shortens it)
    this._sigBoundMs = Number(sigBoundMs) > 0 ? Number(sigBoundMs) : SIG_BOUND_MS;   // lane task-group-fanout: the turn read's bound (a suite shortens it)
    this._getSetting = getSetting || null; // tasks.autoStyleOrder for the allocator
    this._home = homeDir || os.homedir(); // a Context row's ~ and its last relative base
    // lane task-group-context: the OLD folder fields (folders[] / contextDir) — held aside per group, written back
    // into the file by _save (an older build still reads them, one release), read ONLY by migrateContextRows
    this._legacy = new Map();
    // lane task-group-fanout: the archive list the last user-state write held — noteArchived unbinds only what is NEW in it;
    // `isLiveKey(key)` (server.js: a running conversation) keeps an archived one in its groups until it ends
    this._isLiveKey = typeof isLiveKey === 'function' ? isLiveKey : () => false;
    this._archLive = new Set();
    this._archOwed = new Map();   // the census cure (finding 3): archived keys whose unbind is not on disk yet — kept OUT of the baseline (B-0248 step 3: key → the generation of its unbind)
    this._archSeen = null;
    this._archList = null; this._archLanding = false; this._archAgain = false; this._archGen = 0;   // B-0248 step 3: the last archive list, the owed unbind's one landing in flight (_landArchived), the owed keys' generation
    if (typeof readUserState === 'function') { try { const st = readUserState(); this._archSeen = new Set((st && Array.isArray(st.archivedSessions) ? st.archivedSessions : []).map(String)); } catch (e) { this._archSeen = e && e.code === 'store_unread' ? null : new Set(); } }   // B-225b: a HELD list is no list — its first read after the lift is taken as seen, nothing unbound on a guess
    // THE STORE HELD UNREAD: `unreadNotice` = { say(words) → a handle | null (the For-you door; null/throw = not up yet — said at
    // the next try), lift(handle) } (task-groups-wiring.js); `unreadRetry` = { firstMs, maxMs } of the read again (a suite's)
    this._readUserState = readUserState;
    this._unread = null; this._unreadSaid = null; this._unreadTries = 0; this._unreadT = null; this._unreadP = null;
    this._unreadNotice = unreadNotice && typeof unreadNotice.say === 'function' ? unreadNotice : null;
    this._unreadRetryCfg = unreadRetry && typeof unreadRetry === 'object' ? unreadRetry : {};
    this._afterLoad(this._load());
    if (!this._unread) this._closeStaleNotice(0); // S1: a held boot's notice does not outlive a start that reads
  }

  /** a notice an EARLIER (held) boot filed, while this one reads: closed — when the For-you door stands (the boot builds it later) */
  _closeStaleNotice(n) {
    if (!this._unreadNotice || typeof this._unreadNotice.closeOpen !== 'function' || n > 3) return;
    const later = () => { const t = setTimeout(() => this._closeStaleNotice(n + 1), 30_000); t.unref?.(); };
    const tryNow = () => { if (this._unread) return; try { this._unreadNotice.closeOpen(); } catch { later(); } };
    if (typeof setImmediate === 'function') setImmediate(tryNow); else tryNow();
  }

  /** what follows a load (the boot's, and a held store's read again that answered): the old fields held, the one-time
   *  migrations, the saves they need, every TASK.md — NOTHING of it while the store is held (`existed` null) */
  _afterLoad(existed) {
    if (existed === null) return; // held: no migration, no save, no TASK.md (the in-memory store is empty — never the truth)
    const readUserState = this._readUserState;
    for (const t of Object.values(this._state.tasks)) this._holdLegacy(t);
    this._primeMemberRows();   // B-55dc: the boot STARTS every Context row's first read, once, off the loop (no refresh loop)
    // lane lg-group-parents (the U2 read, MAJOR 1): the lineage as the writer would take it — a gone id, a built-in name, a cycle a
    // hand edit (or an older build) left are dropped at load, in memory; written with the store's next save
    try { const dropped = this._healParents(); if (dropped.length) console.log(`[task-groups] load: ${dropped.length} parent link(s) dropped (a gone group, itself, or a cycle): ${dropped.slice(0, 5).map(([child, parent]) => `${child} › ${parent}`).join(', ')}`); } catch { /* a heal never blocks the boot */ }
    // One-time migration: Task Groups lost their status (岗位 refactor) — a
    // `done` group becomes archived, others just drop the field.
    let migrated = false;
    // colorSeq backfill (2.231.1): pre-existing groups get their immutable
    // auto-identity slot in creation order, through the SAME allocator used
    // at create (occupied slots + manual-color masks accumulate as we go).
    {
      const all = Object.values(this._state.tasks);
      const missing = all.filter((t) => !Number.isInteger(t.colorSeq))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)));
      for (const t of missing) { t.colorSeq = pickColorSeq(all, this._styleOrder()); migrated = true; }
    }
    for (const t of Object.values(this._state.tasks)) {
      if ('status' in t) { if (t.archived === undefined) t.archived = (t.status === 'done'); delete t.status; migrated = true; }
      // Backfill (in-memory is enough; persisted on the next change): content
      // gate falls back to the coarse updatedAt until a content edit happens.
      if (t.contentUpdatedAt === undefined) t.contentUpdatedAt = t.updatedAt;
      // One-time Backlog seed (2.122.0, user decision): the removed checklist's
      // dormant UNCHECKED items become open backlog items (they were exactly
      // "not done yet" = parked). Guard = backlog undefined, so this runs once;
      // the dormant plan array itself stays untouched.
      if (t.backlog === undefined) {
        t.backlog = (Array.isArray(t.plan) ? t.plan : [])
          .filter((p) => p && p.text && !p.done)
          .map((p) => ({
            text: String(p.text).slice(0, CAPS.backlogItem),
            status: 'open',
            ...(typeof p.detail === 'string' && p.detail ? { detail: String(p.detail).slice(0, CAPS.detail) } : {}),
            ...(p.addedBy ? { addedBy: String(p.addedBy).slice(0, 120) } : {}),
            ...(Number(p.addedAt) ? { addedAt: Number(p.addedAt) } : {}),
          }));
        migrated = true;
      }
      // Claim-model backfill (2.123.0): every item gets a stable id; the
      // creator auto-claims (except UI-added 'user' — claims are session
      // identities). Idempotent — only touches items missing the fields.
      {
        const taken = new Set((t.backlog || []).map((b) => b.id).filter(Boolean));
        for (const b of t.backlog || []) {
          if (!b.id || !BACKLOG_ID_RE.test(b.id)) { b.id = mintBacklogId(taken); migrated = true; }
          if (!Array.isArray(b.claimedBy)) {
            b.claimedBy = (b.addedBy && b.addedBy !== 'user') ? [b.addedBy] : [];
            migrated = true;
          }
        }
      }
      // Activity-log entry ids (2026-09-28): every entry gets its stable P- id,
      // idempotently — an entry that already has a valid, unique one keeps it.
      {
        const taken = new Set();
        for (const p of (Array.isArray(t.progress) ? t.progress : [])) {
          if (!p || typeof p !== 'object') continue;
          if (typeof p.id === 'string' && PROGRESS_ID_RE.test(p.id) && !taken.has(p.id)) { taken.add(p.id); continue; }
          p.id = mintProgressId(taken); migrated = true;
        }
      }
    }
    if (existed === false && typeof readUserState === 'function') { // a store that could not be read is NOT absent: never migrated over
      // One-time legacy Groups migration (file existence is the guard: once the
      // store exists, legacy sessionGroups in user-state stay dormant).
      let listHeld = false;
      try { this._migrateGroups(readUserState()); } catch (e) { if (e && e.code === 'store_unread') listHeld = true; /* else: a fresh install */ }
      // B-225b R9: the conversation list HELD is not «no legacy groups» — the store is not written now, so the next start (its file
      // still absent) migrates from the list it reads; a change made before then writes it as any change does
      if (listHeld) console.warn('[task-groups] the conversation list could not be read — the one-time legacy groups migration waits for a start that reads it');
      else this._save({ boot: true });
    } else if (migrated) {
      this._save({ boot: true });
    }
    // Regenerate every context folder's TASK.md at boot (state may have
    // changed while a previous server was down; the program is the ONLY
    // writer of .vibespace/, so regenerating is always safe).
    for (const t of Object.values(this._state.tasks)) this._syncTaskMd(t);
  }

  _load() {
    // Prefer the current file; fall back to the legacy tasks.json ONCE and migrate it forward (write the new file) — ONLY when
    // the current file is truly ABSENT (THE STORE READ, src/store-read.js). The legacy file is left in place (harmless) so an
    // older server build could still read it if rolled back. → true (read) · false (absent: empty) · null (HELD unread)
    // lane lg-store-writes U5: A LOAD READS WHAT THIS PROCESS STILL OWES — a store made again in the same process (a suite's
    // restart) lands the write the last one handed the writer before it reads (a hub's boot owes nothing: no wait)
    try { const W = this._writer(); if (W.pending(this._file)) W.flushSync([this._file]); } catch { }
    const read = (f) => { try { return { text: timedSync('task-groups.read', () => fs.readFileSync(f, 'utf-8')) }; } catch (error) { return { error }; } };
    const a = SR.storeAnswer(read(this._file), { valid: STORE_SHAPE });
    if (a.state === 'data') { this._state = a.value; return true; }
    this._state = { version: 1, tasks: {} };
    if (a.state !== 'missing') { this._holdUnread(a, this._file); return null; } // NEVER written over: held
    const l = SR.storeAnswer(read(this._legacyFile), { valid: STORE_SHAPE });
    if (l.state === 'data') { this._state = l.value; this._save({ boot: true }); return true; } // migrate tasks.json → task-groups.json (lane lg-store-writes U5: a boot save, landed before the boot's migrations read the file)
    if (l.state === 'unreadable') { this._holdUnread(l, this._legacyFile); return null; } // the old file EXISTS and could not be read: held, never started over
    return false; // absent (an unparsable legacy file is an old build's, left in place as before)
  }

  // ── THE STORE HELD UNREAD (see STORE_SHAPE above) ──
  /** the store could not be read: HELD — said once (the log, and the person through `unreadNotice`), read again soon */
  _holdUnread(a, file) {
    const was = this._unread;
    this._unread = { file: path.basename(file), code: String(a.code || a.why || 'unreadable'), why: String(a.why || 'unreadable'), at: (was && was.at) || Date.now() };
    if (!was) console.warn(`[tasks] ${this._unread.file} could not be read (${this._unread.code}: ${this._unread.why}) — HELD: kept exactly as it is, nothing writes it, nothing is recorded until it reads; read again soon`);
    this._sayUnread();
    if (!this._unreadSaid && typeof setImmediate === 'function') setImmediate(() => this._sayUnread()); // the boot builds the For-you door after this store: said once it stands
    this._unreadRetrySoon();
  }
  /** → whether the store is held (and what it is: { file, code, why, at }) — the routes' and the board's question */
  unreadState() { return this._unread ? { ...this._unread, damaged: damagedOf(this._unread) } : null; }
  /** → whether the store is held, without a copy (the grant model asks it at every judgment of a live agent) */
  isHeldUnread() { return !!this._unread; }
  /** THE MEMBERSHIP A GRANT IS JUDGED ON (主开发 00:41Z MUST 1): the ids of groupsForSession — or, while the store is HELD, a THROW by
   *  name (code TASK_GROUPS_UNREAD): an empty list there reads as «in no Task Group» (an «All agents except G» row admits G's own; a
   *  lease kept to G is detached). Every grant reader already maps a throw to UNREADABLE (the grant model refuses an undecided
   *  group and keeps what it holds). groupsForSession itself stays non-throwing (its many plain readers). */
  groupIdsForGrant(args, reader = 'grant') {
    // ONE LOG LINE A HOLD (主开发's follow): the refusal is thrown at every call (every list broadcast, every verb) — the FIRST of a hold
    // is marked `firstOfHold`, and the grant readers log only that one
    // …PER READER (`reader`: the logging callers name themselves — a silent reader never takes another's one line)
    if (this._unread) { try { this._refuseUnread('judging a grant by Task Group'); } catch (e) { const said = this._grantSaid || (this._grantSaid = new Map()), k = String(reader); if (said.get(k) !== this._unread.at) { said.set(k, this._unread.at); e.firstOfHold = true; } throw e; } }
    return (this.groupsForSession(args) || []).map((g) => g.id);
  }
  /** the ONE line an agent's hook injection carries while the store is held (主开发 00:41Z (b)) — else null: never «in no group» in silence */
  unreadHookLine() { const u = this._unread; return u ? `VibeSpace: Task Groups cannot be read right now — ${u.file} in VibeSpace's data folder ${damagedOf(u) ? 'is damaged' : 'could not be read'} (${u.code}). This conversation's Task Groups are UNKNOWN, not empty: their context is not shown and vibespace-task is refused until the store reads again.` : null; }
  /** an act that would record something, while the store is held: REFUSED BY NAME (code TASK_GROUPS_UNREAD) — the route answers it */
  _refuseUnread(act) {
    if (!this._unread) return;
    const e = new Error(this.unreadRefusal(act));
    e.code = 'TASK_GROUPS_UNREAD';
    throw e;
  }
  /** → the refusal's words while held (else null) — for a caller that answers instead of throwing (the agent routes) */
  unreadRefusal(act) { return this._unread ? fillWords(damagedOf(this._unread) ? UNREAD_REFUSAL_DAMAGED : UNREAD_REFUSAL, { act, file: this._unread.file, code: this._unread.code }) : null; }
  /** the person is told ONCE (a For-you notice); a door not up yet (the boot builds it later) is tried again at the next read */
  _sayUnread() {
    if (!this._unread || this._unreadSaid || !this._unreadNotice) return;
    let h = null;
    try { h = this._unreadNotice.say(unreadNoticeWords(this._unread)); } catch { h = null; }
    if (h != null && h !== false) this._unreadSaid = { handle: h };
  }
  _unreadRetrySoon() {
    if (this._unreadT || !this._unread) return;
    const n = ++this._unreadTries;
    const t = setTimeout(() => { this._unreadT = null; this.readAgain().catch((e) => { console.warn(`[tasks] the read again failed: ${e && e.message}`); this._unreadRetrySoon(); }); }, SR.retryDelay(n, this._unreadRetryCfg));
    t.unref?.(); this._unreadT = t;
  }
  /** ONE read again of a held store, OFF the loop (fs.promises), one in flight → true when it answered (the hold LIFTED: the
   *  store loaded as the boot loads it, its notice lifted, every listener told); false = still held (the next try is armed) */
  readAgain() {
    if (!this._unread) return Promise.resolve(true);
    if (this._unreadP) return this._unreadP;
    const job = this._unreadP = (async () => {
      const read = (f) => fs.promises.readFile(f, 'utf-8').then((text) => ({ text }), (error) => ({ error }));
      const a = SR.storeAnswer(await read(this._file), { valid: STORE_SHAPE });
      let state = null, existed = null, held = null; const file = this._file;
      if (a.state === 'data') { state = a.value; existed = true; }
      // GONE SINCE THE HOLD (the reader's must): a hold PROVES the file was there — a read that now finds no file (a detached mount, a
      // missing data folder) is NOT a fresh install: STILL HELD (no empty store, no migration, no save, the notice stands); the next
      // START judges a truly absent file (the boot's rule), the reads go on meanwhile (the storage may come back)
      else if (a.state === 'missing' && this._unread.file === path.basename(this._legacyFile)) {
        // the hold was the LEGACY file's (task-groups.json absent at the boot, tasks.json unreadable): read IT again — migrated forward when it answers
        const l = SR.storeAnswer(await read(this._legacyFile), { valid: STORE_SHAPE });
        if (l.state === 'data') { state = l.value; existed = 'legacy'; }
        else if (l.state === 'missing') held = { code: 'ENOENT', why: 'the file is not there since it could not be read' };
        else held = l;
        if (held) { this._holdUnread(held, this._legacyFile); return false; }
      }
      else if (a.state === 'missing') held = { code: 'ENOENT', why: 'the file is not there since it could not be read' };
      else held = a;
      if (held) { this._holdUnread(held, file); return false; }
      const was = this._unread, said = this._unreadSaid, tries = this._unreadTries;
      // THE HOLD LIFTS ONLY AFTER A WHOLE LOAD: the load (its migrations, their saves) runs with the hold down; a throw restores it
      this._unread = null; this._state = state;
      try { if (existed === 'legacy') this._save(); this._afterLoad(true); } // the legacy file migrated forward, as the boot does
      // the HOLD FIRST, then the empty state (must 1): from the hold on, every write this load queued is refused at its write
      catch (e) { this._unread = was; this._state = { version: 1, tasks: {} }; this._unreadSaid = said; console.warn(`[tasks] ${was.file} read again but its load failed (${e && e.message}) — STILL HELD`); this._unreadRetrySoon(); return false; }
      this._unreadSaid = null; this._unreadTries = 0;
      if (this._unreadT) { clearTimeout(this._unreadT); this._unreadT = null; }
      console.log(`[tasks] ${was.file} read again after ${tries} tr${tries === 1 ? 'y' : 'ies'}: ${Object.keys(this._state.tasks || {}).length} Task Group(s) — the hold is lifted`);
      if (said && this._unreadNotice && typeof this._unreadNotice.lift === 'function') { try { this._unreadNotice.lift(said.handle); } catch { } }
      this._notify(); // the late load: every listener told (the re-judge of reach, the board, the roster)
      for (const fn of [...(this._liftHooks || [])]) { try { fn(); } catch { /* a listener's own */ } }   // B-f276 unit B: the family's one notice hears the lift
      return true;
    })();
    const free = () => { if (this._unreadP === job) this._unreadP = null; };
    job.then(free, free);
    return job;
  }

  // the old fields leave the live record (nothing can read them by accident) and wait in _legacy for the file
  _holdLegacy(t) {
    if (!t || typeof t !== 'object' || !('folders' in t || 'contextDir' in t)) return;
    this._legacy.set(t.id, { folders: t.folders, contextDir: t.contextDir });
    delete t.folders; delete t.contextDir;
  }

  /** lane roster-per-pass: a counter that moves with EVERY write of the state (each save, each notify) — the live roster's
   *  Task Groups half is valid only while it holds still (src/server/roster-pass.js) */
  rev() { return this._rev || 0; }

  /** the process's store writer (src/store-writer.js) — or a suite's */
  _writer() { return this._writerDep || require('./store-writer.js').storeWriter(); }
  /** the document on disk: the held old fields ride back beside each record (one release — see _holdLegacy) */
  _docForDisk() { return !this._legacy.size ? this._state : { ...this._state, tasks: Object.fromEntries(Object.entries(this._state.tasks).map(([id, t]) => [id, this._legacy.has(id) ? { ...t, ...this._legacy.get(id) } : t])) }; }
  /** THE ANSWER OF AN ACT WAITS FOR THE STORE (lane lg-store-writes U5): true once task-groups.json holds every change made so
   *  far (false: a write failed, is still queued at the writer's bound, or the exit left it — said by the writer); the loop
   *  never waits. `answer(saved)` — the route's answer on the writer's SYNCHRONOUS road (the U4/U5 cure): called inside the
   *  writer's own settle, so an answer still waiting when the hub stops goes out inside the exit's flush */
  persisted(answer = null) { try { return this._writer().durable(this._file, { timeoutMs: 20000, answer }).catch(() => false); } catch { if (answer) { try { answer(false); } catch { } } return Promise.resolve(false); } }   // 20 s: under the CLI's 30 s write budget (src/cli-call.js), so a stalled mount answers «notOnDisk» in time, never «no answer»
  /** THE STORE'S SAVE GOES THROUGH THE STORE WRITER (lane lg-store-writes, B-0248 U5): task-groups.json (every group's record,
   *  its backlog and Activity log, pretty-printed) was written whole — temp + rename — on the main thread at every progress
   *  note, bind and update (6.6 s of holds in five hours on the production hub, 3.1 s the longest). Now its bytes are handed
   *  to the writer by name, made when the write is due (a burst of notes is one write), as an ACT (rank 0 + durable(): an
   *  agent's note and a person's edit are the writer's next writes, and their routes answer once persisted() resolves). A
   *  BOOT save (a legacy migration, a migrated record) lands before the boot's migrations read the file: `{ boot: true }`. */
  _save({ boot = false } = {}) {
    if (this._unread) return false; // HELD unread: task-groups.json is never written over (THE STORE HELD UNREAD)
    this._rev = (this._rev || 0) + 1;
    let landed = { ok: true, why: null };   // the census cure ((b)): a BOOT save answers its landing — its caller's failure branch reads it
    try {
      const W = this._writer();
      // an act is URGENT by the writer's own flag (the U4/U5 cure: no durable() asked here — the route that answers waits
      // through persisted())
      // the cure of the moved line's must 1 (主开发 2026-11-19 22:38Z): the bytes are made AT the write — so a write queued before
      // a hold was restored (a read again whose load threw) must never land the held, EMPTY store: the producer refuses while
      // held (EHELD, the hosts.js law) — the writer keeps it owed, and once the store reads again it writes the state READ
      W.dirty(this._file, { name: 'task-groups.write', rank: 0, urgent: !boot, produce: () => { if (this._unread) throw Object.assign(new Error('task-groups.json is held (its read failed) — nothing is written over it until it reads'), { code: 'EHELD' }); return JSON.stringify(this._docForDisk(), null, 2); }, onWritten: (ok, e) => this._storeWritten(ok, e) });
      if (boot) { const r = W.flushSync([this._file]); const miss = r.deferred ? { why: 'the hub is stopping — its exit flush writes it next' } : r.left.find((x) => x.file === this._file); if (miss) landed = { ok: false, why: miss.why }; if (miss) console.warn(`[tasks] task-groups.json not on disk at the boot (${miss.why}) — kept in memory, the store writer retries`); }
    } catch (e) { console.warn(`[tasks] save failed: ${e.message}`); }
    // Keep every context folder's generated TASK.md in lockstep with the
    // store (content-compare guard makes this a no-op for unchanged tasks)
    for (const t of Object.values(this._state.tasks)) this._syncTaskMd(t);
    return landed;
  }

  /** a store write's outcome (the writer's onWritten): a failure said once until one lands */
  _storeWritten(ok, e) {
    if (!ok) { if (!this._storeOwedSaid) { this._storeOwedSaid = true; console.warn(`[tasks] task-groups.json not written: ${(e && (e.code || e.message)) || 'an error'} — kept in memory, the store writer retries`); } return; }
    if (this._storeOwedSaid) { this._storeOwedSaid = false; console.warn('[tasks] task-groups.json is on disk again'); }
  }

  // ── Context folder: generated TASK.md + injection payload (P2) ──

  // lane agent-context-owner-facts (B-7960 a): every time this store renders for an agent goes through THE formatter in
  // the owner's zone, named (`2026-10-20 16:16 PT` — src/when-words.js; the instance's zone: src/server/owner-facts.js).
  // `now` drops today's date — passed ONLY by the injection, whose head states that day (OF.zoneSentence); TASK.md (a
  // file read on later days), `show` and the update block keep every date.
  _tsShort(ms, now = null) { return OF.when(ms, { now }); }

  // cap = how many Activity-log entries to include (TASK.md keeps 50).
  // cap = 0 omits the log entirely (renderContext appends its own budgeted log
  // section LAST instead — see the truncation note there).
  renderTaskMd(t, cap = 50, { now = null } = {}) {
    const ts = (ms) => this._tsShort(ms, now);
    const lines = [
      `# ${agentLine(t.title)}`,
      '',
      `- Task ID: ${t.id}`,
      `- Updated: ${ts(t.updatedAt)}`,
    ];
    // lane task-group-context: the objective IS the group's standing instructions — the ONE home of its rules, told
    // verbatim to every member whatever its folder (study 3 C4: one rule in three drifting copies)
    lines.push('', '## Objective — the group\'s standing rules', '', agentBlock(t.objective?.trim()) || '_(not set yet)_');
    // the full renderings (TASK.md) list the Context table's rows, one line each (no contents — the injection tells
    // them at their chosen depth); verify r5 F2 (lane peer-census): a path is a manager agent's words too — a piece
    if (cap > 0) {
      const rows = this._ctxRows(t);
      if (rows.length) {
        lines.push('', '## Context', '');
        const res = this._res(t);
        rows.forEach((r, i) => lines.push(this._rowHead(r, res[i], { full: true })));
      }
    }
    // Backlog rides in the FULL renderings only (TASK.md / show) — the
    // injection payload (cap 0) deliberately omits it (user directive 2.122.0:
    // don't dump the backlog every hook; renderContext adds only a summary of
    // items THIS session parked + a one-line query pointer).
    // Listed in sortBacklog order (priority high → normal → low, newest first
    // within a priority); `!` = high, `↓` = low after the id.
    const openBl = sortBacklog((t.backlog || []).filter((b) => b.status === 'open'));
    if (cap > 0 && openBl.length) {
      lines.push('', '## Backlog  _(parked — deferred decisions / future work, NOT immediate tasks; `!` high · `↓` low)_', '');
      for (const b of openBl) {
        // markedText: the marker, then the text — a text that itself begins "! "/"↓ " is backslash-escaped
        lines.push(`- [${b.id || '?'}] ${markedText({ priority: b.priority, text: agentLine(b.text) })}${b.claimedBy?.length ? `  _(claimed by ${b.claimedBy.join(', ')})_` : '  _(unclaimed)_'}`);
        if (b.detail) for (const dl of agentBlock(b.detail).split('\n')) lines.push(`  > ${dl}`);
      }
    }
    const total = (t.progress || []).length;
    const prog = cap > 0 ? (t.progress || []).slice(-cap) : [];
    if (prog.length) {
      lines.push('', '## Activity log', '');
      if (total > cap) lines.push(`_(showing the last ${cap} of ${total} entries — run \`vibespace-task show\` or read this file for the rest)_`, '');
      for (const p of prog) {
        lines.push(`- ${ts(p.at)} ${agentLine(p.note)}${p.session ? ` _(${p.session})_` : ''}`);
        if (p.detail) for (const dl of agentBlock(p.detail).split('\n')) lines.push(`  > ${dl}`);
      }
    }
    lines.push('', '---', '_Generated by VibeSpace from the task store — do NOT edit (overwritten on every change). Update the task via the VibeSpace UI or the `vibespace-task` command._', '');
    return lines.join('\n');
  }

  /** Regenerate every context folder's TASK.md (content-compared no-op when
   *  unchanged; a folder skipped as shadowed retries here once its storage
   *  is back). */
  syncAllContextMd() {
    for (const t of Object.values(this._state.tasks)) this._syncTaskMd(t);
  }

  _syncTaskMd(t) {
    const ctxDir = this.contextDirOf(t);   // the 'notes' row's folder (lane task-group-context)
    if (!ctxDir) return;
    // A context folder living on a storage that is currently DISCONNECTED:
    // writing would recreate the tree on the bare mount point (stranded,
    // and the reconnect then fails "not empty" — real OneDrive incident).
    // Skip; the next syncAllContextMd after the mount comes back writes it.
    let shadow = null;
    try { shadow = this._isPathShadowed(ctxDir); } catch { shadow = null; }
    if (shadow) {
      if (!(this._shadowWarned ||= new Set()).has(t.id)) {
        this._shadowWarned.add(t.id);
        console.warn(`[tasks] TASK.md for ${t.id} skipped: ${ctxDir} is on "${shadow.name}" which is not connected`);
        global.__vsEvent?.('ctx-md-skipped-shadowed');
      }
      return;
    }
    this._shadowWarned?.delete(t.id);
    // B-afc4: a context folder under a BLOCKED mount (the liveness probe: slow / wedged / dead) is skipped the same way —
    // the write would hang inside the dead FUSE. The next syncAllContextMd after it answers writes it.
    if (DOOR.blocked(ctxDir)) {
      if (!(this._blockWarned ||= new Set()).has(t.id)) {
        this._blockWarned.add(t.id);
        console.warn(`[tasks] TASK.md for ${t.id} skipped: ${ctxDir} is on a storage that is not answering`);
      }
      return;
    }
    this._blockWarned?.delete(t.id);
    let content;
    try { content = this.renderTaskMd(t); } catch { return; }
    const m = this._mirror.get(t.id);
    if (this._lastMd.get(t.id) === content && !(m && (m.inflight || m.want))) return;
    this._queueMirror(t.id, ctxDir, content);
  }

  /** lane cli-call-timeouts: queue the group's TASK.md (the newest content wins) — never a write on the caller's turn */
  _queueMirror(id, contextDir, content) {
    const m = this._mirror.get(id) || { want: null, inflight: false, since: 0, startedAt: 0, failedAt: 0, why: '', retry: null };
    m.want = { dir: contextDir, content };
    if (!m.since) m.since = Date.now();
    this._mirror.set(id, m);
    if (!m.inflight) this._runMirror(id);
  }

  /** the fs the mirror writes through: SafeFs's ops (a worker, a deadline) or fs.promises — each op bounded */
  _mirrorIo() {
    const sf = (() => { try { return this._mirrorFs(); } catch { return null; } })();
    const bound = (p) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Object.assign(new Error('the shared folder did not answer in ' + this._mirrorBoundMs + ' ms'), { code: 'MIRROR_TIMEOUT' })), this._mirrorBoundMs);
      timer.unref?.();
      Promise.resolve(p).then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
    });
    const o = { timeoutMs: this._mirrorBoundMs };
    if (sf && typeof sf.call === 'function') return {
      mkdir: (p) => bound(sf.call('mkdir', { path: p }, o)),
      read: (p) => bound(sf.call('readText', { path: p, maxSize: 4 << 20 }, o)).then((r) => (r && typeof r.content === 'string' ? r.content : null)),
      write: (p, c) => bound(sf.call('writeFile', { path: p, content: c }, o)),
      rename: (a, b) => bound(sf.call('rename', { oldPath: a, newPath: b }, o)),
    };
    const fsp = fs.promises;
    return {
      mkdir: (p) => bound(fsp.mkdir(p, { recursive: true })),
      read: (p) => bound(fsp.readFile(p, 'utf-8')),
      write: (p, c) => bound(fsp.writeFile(p, c)),
      rename: (a, b) => bound(fsp.rename(a, b)),
    };
  }

  /** write the queued TASK.md of one group; a failed / timed-out write keeps it queued and retries (backoff) */
  async _runMirror(id) {
    const m = this._mirror.get(id);
    if (!m || m.inflight || !m.want) return;
    if (m.retry) { clearTimeout(m.retry); m.retry = null; }
    const { dir: contextDir, content } = m.want;
    m.want = null; m.inflight = true; m.startedAt = Date.now();
    const io = this._mirrorIo();
    const dir = path.join(contextDir, '.vibespace');
    const file = path.join(dir, 'TASK.md');
    let ok = false; let why = '';
    try {
      await io.mkdir(dir);
      let cur = null;
      try { cur = await io.read(file); } catch { cur = null; }
      if (cur !== content) { const tmp = file + '.tmp'; await io.write(tmp, content); await io.rename(tmp, file); }
      ok = true;
    } catch (e) { why = e && (e.code === 'MIRROR_TIMEOUT' || e.safeFsTimeout) ? 'timeout' : e && e.code === 'storage-blocked' ? 'blocked' : 'error'; }
    m.inflight = false;
    const t = this._state.tasks[id];
    if (ok) {
      this._lastMd.set(id, content);
      m.failedAt = 0; m.why = '';
      if (!m.want) m.since = 0;
    } else {
      m.failedAt = Date.now(); m.why = why;
      if (!m.want) {   // nothing newer came: keep this copy for ONE retry timer (a change or syncAllContextMd before it retries at once)
        if (t && this.contextDirOf(t) === contextDir) m.want = { dir: contextDir, content };
        if (m.want) { m.retry = setTimeout(() => { m.retry = null; this._runMirror(id); }, MIRROR_RETRY_MS); m.retry.unref?.(); }
        return;
      }
      // a newer copy was queued while this one hung: it is tried now (the writes stay serialized, each one bounded)
    }
    if (m.want) this._runMirror(id);
    else if (!m.since) this._mirror.delete(id);
  }

  /** lane cli-call-timeouts: the group's mirror, as a fact a route can answer — null = current (nothing queued);
   *  { behind: true, since, why } once a write has been waiting longer than MIRROR_BOUND_MS or the last one failed */
  mirrorStateOf(id, now = Date.now()) {
    const m = this._mirror.get(id);
    if (!m || !m.since) return null;
    const late = m.failedAt > 0 || (m.inflight && now - m.startedAt > this._mirrorBoundMs);
    return { behind: !!late, pending: true, since: m.since, why: m.why || (late ? 'slow' : '') };
  }

  /** every queued mirror write landed or gave up (tests; a clean shutdown) */
  async mirrorIdle(maxMs = 30000) {
    const until = Date.now() + maxMs;
    while (Date.now() < until && [...this._mirror.values()].some((m) => m.inflight || (m.want && !m.retry))) await new Promise((r) => setTimeout(r, 5));
  }

  _listContextFiles(dir, cap = 100) {
    this._lastReadFrom = null;
    if (SP.storageRootOf(dir)) {
      const f = this._facts.get('contextFiles', { path: dir, cap });
      // line 834's follow (主开发 r3809): a storage listing is as old as the READ that gave it — when that read began, never when it is taken
      if (f.ok) { this._lastReadFrom = typeof this._facts.askedAt === 'function' ? this._facts.askedAt('contextFiles', { path: dir, cap }) : null; return Array.isArray(f.result) ? f.result : []; }
      if (f.pending || readerDownWhy(f)) { this._lastUnknown = f.pending ? 'pending' : readerDownWhy(f); return null; }   // B-422c: UNKNOWN, never []
      return [];
    }
    const out = [];
    const walk = (d, rel, depth) => {
      if (out.length >= cap || depth > 4) return;
      let entries = [];
      try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (out.length >= cap) return;
        if (e.name === '.vibespace' || e.name === '.git' || e.name === 'node_modules') continue;
        const p = path.join(d, e.name);
        const r = rel ? rel + '/' + e.name : e.name;
        if (e.isDirectory()) walk(p, r, depth + 1);
        else {
          let st; try { st = fs.statSync(p); } catch { continue; }
          out.push({ path: r, size: st.size, mtime: st.mtimeMs });
        }
      }
    };
    walk(dir, '', 0);
    return out;
  }

  // Cheap content signature of a context folder — path:size:mtime of each
  // indexed file. Detects USER-written changes (files added / edited / removed
  // in contextDir, OUTSIDE the task store, which therefore don't bump
  // updatedAt) so the next agent turn re-injects the group. Ignores .vibespace/
  // (program-managed) since _listContextFiles skips it. TTL-cached: this runs
  // on EVERY prompt for every belonged group — without the cache a big context
  // dir would put a recursive dir walk on the hook's 3s-timeout path.
  // NO CALLER IN src/ (row B-422c's line 834 rounds, 主开发 r3771 / r3809): it stays as the suites' door to the LEGACY, notes-relative
  // signature that renderContextDiff still parses — test-context-diff (the escaped «|») and test-peer-text-census build it here
  contextDirSignature(dir) {
    if (!dir) return '';
    if (!this._sigCache) this._sigCache = new Map();
    const hit = this._sigCache.get(dir);
    if (hit && Date.now() - hit.at < 4000) return hit.sig;
    // Path is escaped (% then |) so renderContextDiff can parse entries back
    // out of the joined string — a raw '|' in a filename would shear the entry.
    const listed = this._listContextFiles(dir, 200);
    if (listed == null) return hit ? hit.sig : '';   // B-422c: a listing not read now keeps the last signature, never an empty one
    const sig = listed
      .map((f) => `${f.path.replace(/%/g, '%25').replace(/\|/g, '%7C')}:${f.size}:${Math.round(f.mtime || 0)}`)
      .join('|');
    this._sigCache.set(dir, { sig, at: Date.now() });
    return sig;
  }

  // ── THE CONTEXT TABLE (lane task-group-context, POC v2.2 + the owner's fourth level) ──
  // ONE ordered list of rows replaces folders[] + contextDir (src/task-context.js has the rules). Every row is told
  // with its path + note, at the depth the group chose (只说明 · 文件名 · 文件名 + 关键文件内容 · 内容), in table order,
  // within ONE byte budget: a row that does not fit steps DOWN a level and its line says so — a shared file is never
  // silently reduced to a name (study 3 C2). Referenced groups' shareable rows come last.

  _ctxRows(t) { return Array.isArray(t && t.ctx) ? t.ctx : []; }
  _groupOf(tOrId) { return typeof tOrId === 'string' ? this._state.tasks[tOrId] || null : tOrId || null; }

  // (abs) → 'dir' | 'file' | 'missing' | 'blocked' — the mount door is asked BEFORE the stat (B-afc4)
  _kindOf(abs) {
    if (typeof abs !== 'string' || !path.isAbsolute(abs)) return 'missing';
    if (DOOR.blocked(abs)) return 'blocked';
    if (SP.storageRootOf(abs)) {
      const f = this._facts.get('stat', { path: abs }), why = this._noteRead(abs, f);   // B-422c: what this read is, kept for the words
      if (f.pending) return 'reading';
      if (f.ok) return f.result.isDirectory ? 'dir' : f.result.isFile ? 'file' : 'missing';
      if (why) return 'reading';   // B-422c: the reader refused — not read now, never «not answering»
      return f.code === 'ENOENT' || f.code === 'ENOTDIR' ? 'missing' : 'blocked';
    }
    try { const st = fs.statSync(abs); return st.isDirectory() ? 'dir' : st.isFile() ? 'file' : 'missing'; } catch { return 'missing'; }
  }

  /** Where each row points (TC.resolveRows over the store's stat): [{ abs, kind, via }] in table order. Cached 4 s per
   *  table — membership asks it on every prompt of every session. `rows` = resolve these instead (a probe). */
  _res(t, rows = null) {
    const list = rows || this._ctxRows(t);
    if (!list.length) return [];
    const key = this._resKey(list);
    if (!this._resCache) this._resCache = new Map();
    const hit = this._resCache.get(key);
    if (hit && Date.now() - hit.at < 4000) return hit.res;
    const res = TC.resolveRows(list, { home: this._home, kindOf: (a) => this._kindOf(a) });
    // THE CACHE HOLDS WHAT THE STORE HAS (lane groups-sweep-on-change commit 2, 主开发's cliff 2026-11-11): a fixed 256
    // cleared whole, so past 256 groups with Context rows every membership ask re-statted every row of every group
    // (260 groups: ~780 stats an ask) — its bound grows with the store's groups (+ room for a render's probes)
    if (this._resCache.size > Math.max(256, 2 * Object.keys(this._state.tasks || {}).length + 64)) this._resCache.clear();
    this._resCache.set(key, { res, at: Date.now() });
    return res;
  }

  _resKey(list) { return JSON.stringify(list.map((r) => (r.ref ? '@' + r.ref : r.path))); }

  /** «STILL READING» NEVER READS AS MEMBER (cure r1, the readers' MUST 2): a RELATIVE discover row resolves against the
   *  previous row's folder (`prev`), then the group's first DIR (`first`), then home — the first that EXISTS. While a base it
   *  could use, or the candidate it stopped at, is still being read, the release might have answered another folder (the
   *  home candidate is the wide one), so the row admits NOTHING until its facts are read: under-include only, flagged. */
  _memberUnderInclude(list, res) {
    let firstUnknown = false;   // `first` = the first rooted row that is a dir: a rooted row still being read before it could be it
    for (let i = 0; i < list.length; i++) {
      const r = list[i], x = res[i];
      if (!r || r.ref || typeof r.path !== 'string' || !ROOTED_ROW(r.path) || TC.isRemote(r.path)) continue;
      if (x && x.kind === 'dir') break;
      if (x && x.kind === 'reading') { firstUnknown = true; break; }
    }
    let prevUnknown = false;    // `prev` = the nearest earlier row that resolved to a dir / a file: still being read ⇒ unknown
    for (let i = 0; i < list.length; i++) {
      const r = list[i], x = res[i];
      if (!r || r.ref || typeof r.path !== 'string' || TC.isRemote(r.path)) continue;
      if (!ROOTED_ROW(r.path) && Array.isArray(r.tags) && r.tags.includes('discover') && (prevUnknown || firstUnknown || !x || x.kind === 'reading')) {
        res[i] = { abs: null, kind: 'reading', via: null, unread: true };
      }
      const y = res[i];
      // THE CARRY (cure r2, the coordinator's law): «unknown» is carried forward by every row resolved over it — a relative
      // row of ANY tag resolved while a base above it was unknown resolved against the wrong one, so its folder (the next
      // `prev`) is unknown too, whatever it answered. Only a ROOTED row that was itself read, or a relative row resolved
      // while nothing above it was unknown, clears it (a missing / blocked row moves no `prev` and clears nothing).
      if (y && y.kind === 'reading') prevUnknown = true;
      else if (!ROOTED_ROW(r.path) && (prevUnknown || firstUnknown)) prevUnknown = true;
      else if (y && (y.kind === 'dir' || y.kind === 'file')) prevUnknown = false;
    }
  }

  /** The old folders[], derived: every 'discover' row's folder [{ path, recursive: true }] (membership by cwd). */
  foldersOf(tOrId) { const t = this._groupOf(tOrId); return t ? TC.discoverFolders(this._ctxRows(t), this._memberRes(t)) : []; }
  /** B-06de: the folder rows FOR MEMBERSHIP, machine-scoped ({path, recursive, host}: a hub row, or `host::/path` another machine's) */
  memberFoldersOf(tOrId) { const t = this._groupOf(tOrId); return t ? memberFolders(this._ctxRows(t), this._memberRes(t)) : []; }
  /** B-55dc: a row's kind FOR MEMBERSHIP — _kindOf's answer with no file call: the door, a STORAGE row's SafeFs fact (as
   *  _kindOf), else the last off-loop read of this path ('reading' before its first one lands). */
  _memberKindOf(abs) {
    if (typeof abs !== 'string' || !path.isAbsolute(abs)) return 'missing';
    if (DOOR.blocked(abs) || SP.storageRootOf(abs)) return this._kindOf(abs);   // neither reaches a sync call there
    return this._mfacts.kind(abs);
  }
  /** _res for membership: the same TC.resolveRows over _memberKindOf, kept 4 s per table AND per landed fact (a read that
   *  lands re-derives at the next ask) — a separate cache, so a render's resolution (its own stat) never mixes in */
  _memberRes(t) {
    const list = this._ctxRows(t);
    if (!list.length) return [];
    const key = this._resKey(list), gen = this._mfacts.gen(), now = Date.now();
    if (!this._mresCache) this._mresCache = new Map();
    const hit = this._mresCache.get(key);
    if (hit && hit.gen === gen && now - hit.at < 4000) return hit.res;
    // a group with no RELATIVE discover row needs no file fact at all: its rooted rows match by their string (a dir, a
    // missing path and «reading» answer alike for a cwd — a file holds none), so none is read (cure r1, the readers' should)
    const rel = list.some((r) => r && Array.isArray(r.tags) && r.tags.includes('discover') && typeof r.path === 'string' && !ROOTED_ROW(r.path));
    const res = TC.resolveRows(list, { home: this._home, kindOf: rel ? (a) => this._memberKindOf(a) : () => 'reading' });
    if (rel) this._memberUnderInclude(list, res);
    if (this._mresCache.size > Math.max(256, 2 * Object.keys(this._state.tasks || {}).length + 64)) this._mresCache.clear();
    this._mresCache.set(key, { res, at: now, gen });
    return res;
  }
  /** The old contextDir, derived: the 'notes' row's absolute folder or null (the .vibespace/TASK.md mirror lives there). */
  contextDirOf(tOrId) { const t = this._groupOf(tOrId); return t ? TC.notesDir(this._ctxRows(t), this._res(t)) : null; }

  // a row's stat, behind the mount door (B-afc4: a blocked mount is answered, never read) — null when blocked / gone
  _stat(abs) {
    if (DOOR.blocked(abs)) return null;
    if (SP.storageRootOf(abs)) { const f = this._facts.get('stat', { path: abs }); this._noteRead(abs, f); return f.ok ? { size: f.result.size, mtimeMs: f.result.mtimeMs, isDirectory: () => !!f.result.isDirectory, isFile: () => !!f.result.isFile } : null; }
    try { return fs.statSync(abs); } catch { return null; }
  }
  // B-422c: a storage path NOT READ NOW (its fact pending, or refused by the reader) → its why ('pending' | 'restarting' | 'slow'),
  // else null — what the readers above RECORDED from the fact they read (no second read, nothing asked of the mount here)
  _notReadOf(abs) { return (this._notReadWhy && this._notReadWhy.get(abs)) || null; }
  _noteRead(abs, f) {
    const why = f.pending ? 'pending' : readerDownWhy(f);
    if (!this._notReadWhy) this._notReadWhy = new Map();
    if (why) { if (this._notReadWhy.size > 512) this._notReadWhy.clear(); this._notReadWhy.set(abs, why); } else this._notReadWhy.delete(abs);
    return why;
  }

  // a listed folder's files, path order (≤ WALK_DEPTH deep, ≤ WALK_CAP; `over` = more were there) — cached 4 s per folder;
  // a folder on a blocked mount lists nothing (asked BEFORE the walk)
  _walk(dir, { fresh = false, offLoop = false } = {}) {
    if (DOOR.blocked(dir)) return { files: [], over: false };
    if (!this._walkCache) this._walkCache = new Map();
    const hit = this._walkCache.get(dir);
    if (hit && !fresh && Date.now() - hit.at < 4000) return hit.w;
    // lane task-group-fanout: a hook-path reader with an off-thread reader wired never walks here — the last listing, said
    if (offLoop && this._sigReader()) return { ...(hit ? hit.w : { files: [], over: false }), reading: true };
    const files = this._listContextFiles(dir, WALK_CAP + 1);
    // B-422c (r3507 hold 1): a listing NOT READ NOW is never cached as empty — the LAST READ one is kept, marked with its why and its age
    // line 834's round (主开发 r3771): the storage facts' landing clears the walk's cache, and a refusal replacing a listing IS such a
    // landing — so the last listing read is taken from _lastGood, which that clear never reaches
    const kept = (this._lastGood && this._lastGood.get(dir)) || hit;   // the newest READ listing, stamped with its read's own time
    if (files == null) return { ...(kept ? kept.w : { files: [], over: false }), reading: true, notRead: this._lastUnknown || 'pending', readAt: kept ? kept.at : null };
    const w = { files: files.slice(0, WALK_CAP), over: files.length > WALK_CAP };
    if (this._walkCache.size > 256) this._walkCache.clear();
    const at = Date.now();
    this._walkCache.set(dir, { w, at });
    this._keepGood(dir, w, this._lastReadFrom != null ? this._lastReadFrom : at);
    return w;
  }
  /** row B-422c (line 834's round, 主开发 r3771): a folder's LAST GOOD listing and when it was read — written wherever the walk's cache
   *  is set from a read, never cleared by the facts' landing (src/storage-facts.js onLanded), so a refused read can say what was read
   *  last and how long ago. Bounded: KEPT_GOOD_MAX folders, the oldest dropped first; a NEWER read replaces its folder's (an older one,
   *  adopted late from a signature hit, is dropped — line 834's follow). `at` is the read's own time (when it began). */
  _keepGood(dir, w, at) {
    if (!this._lastGood) this._lastGood = new Map();
    const had = this._lastGood.get(dir);
    if (had && had.at > at) return;   // line 834's follow: a signature hit adopted late never puts an OLDER listing back over a newer one
    this._lastGood.delete(dir);
    if (this._lastGood.size >= KEPT_GOOD_MAX) this._lastGood.delete(this._lastGood.keys().next().value);
    this._lastGood.set(dir, { w, at });
  }

  // a told file's text: { text, size, binary, big } — never past READ_CAP (a bigger file is `big`, never read whole)
  _readText(abs) {
    if (SP.storageRootOf(abs) && !DOOR.blocked(abs)) {
      const f = this._facts.get('textHead', { path: abs, cap: READ_CAP });
      if (f.ok) return f.result;
      const down = readerDownWhy(f);   // B-422c: the reader refused — reading (not read now), never blocked
      return { text: '', size: 0, binary: false, big: false, reading: !!f.pending || !!down, missing: f.code === 'ENOENT', blocked: !f.pending && !down && f.code !== 'ENOENT' };
    }
    const st = this._stat(abs);   // the mount door is asked there, BEFORE any read
    if (!st) return { text: '', size: 0, binary: false, big: false, blocked: DOOR.blocked(abs), missing: !DOOR.blocked(abs) };
    let fd = null;
    try {
      const size = st.size;
      if (size > READ_CAP) return { text: '', size, binary: false, big: true };
      fd = fs.openSync(abs, 'r');
      const b = Buffer.alloc(size);
      const n = fs.readSync(fd, b, 0, size, 0);
      const buf = b.subarray(0, n);
      if (buf.subarray(0, 8192).includes(0)) return { text: '', size, binary: true, big: false };
      return { text: buf.toString('utf-8'), size, binary: false, big: false };
    } catch { return { text: '', size: 0, binary: false, big: false, missing: true }; }
    finally { if (fd !== null) { try { fs.closeSync(fd); } catch { } } }
  }

  // `tasks.contextIndexBytes` as a number — the Context table's budget per group (absent ⇒ 10240; 0 = no table budget,
  // only the inline room the hook carries)
  contextIndexBytes() {
    let raw; try { raw = this._getSetting?.('tasks.contextIndexBytes'); } catch { raw = undefined; }
    const v = raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : CONTEXT_BUDGET_BYTES;
  }

  // the rows a group's injection tells, in order: its own path rows, then each referenced group's shareable rows
  // (read-only here unless shared 可写) — [{ row, x (resolution), from (null | the referenced group), refNote }]
  _toldRows(t, { skipFrom = null } = {}) {
    const own = this._ctxRows(t), res = this._res(t);
    const out = [];
    own.forEach((r, i) => { if (!r.ref) out.push({ row: r, x: res[i], from: null, k: r.path }); });
    for (const r of own) {
      if (!r.ref) continue;
      const g = this._state.tasks[r.ref];
      if (!g) { out.push({ row: r, x: { ref: true }, from: null, gone: true, k: '@' + r.ref }); continue; }
      const gr = this._ctxRows(g), gres = this._res(g);
      const shared = [];
      gr.forEach((sr, i) => { if (!sr.ref && TC.SHARES.includes(sr.share)) shared.push({ row: TC.sharedRows([sr])[0], x: gres[i], from: g, refNote: r.note, k: `@${g.id}:${sr.path}` }); });
      out.push({ row: r, x: { ref: true }, from: g, head: true, n: shared.length, k: '@' + r.ref });
      out.push(...shared);
    }
    // lane lg-group-parents U4: every ANCESTOR's rows marked 含子组 (TC.childRows) ride here READ-ONLY — nearest parent first,
    // one head each («inherited from the parent Task Group X»); an ancestor that marked none adds nothing. A row that points
    // where a row already told points (the group's own, a reference's, a nearer parent's) is told ONCE — the nearer one wins
    // (the U4 read, 4: never «you may edit it» and «read-only» for one path); `skipFrom` = a multi-group injection's own groups
    // (their rows are told as themselves — the U4 read, 5)
    const where = (it) => (it.x && it.x.abs ? 'abs:' + it.x.abs : 'path:' + (it.row && it.row.path));
    const told = new Set(out.filter((it) => !it.head && !it.gone && it.row && it.row.path).map(where));
    for (const aid of this.ancestorsOf([t.id])) {
      if (skipFrom && skipFrom.has(aid)) continue;
      const a = this._state.tasks[aid], ar = this._ctxRows(a);
      if (!ar.some((sr) => sr && !sr.ref && sr.children === true)) continue;
      const ares = this._res(a), rows = [];
      ar.forEach((sr, i) => {
        if (!sr || sr.ref || sr.children !== true) return;
        const it = { row: { ...TC.childRows([sr])[0], fromParent: true }, x: ares[i], from: a, k: `^${a.id}:${sr.path}` };
        if (told.has(where(it))) return;
        told.add(where(it)); rows.push(it);
      });
      if (!rows.length) continue;
      out.push({ row: { parent: a.id }, x: { ref: true }, from: a, head: true, n: rows.length, k: '^' + a.id });
      out.push(...rows);
    }
    return out;
  }
  /** lane lg-group-parents (the U4 read, BLOCKER 1): does this group's injection tell ANY Context row — its own, or one a parent
   *  gives it (a child with no table of its own is still told its parents' 含子组 rows)? */
  _hasTold(t) {
    if (!t) return false;
    if (this._ctxRows(t).length) return true;
    return this.ancestorsOf([t.id]).some((aid) => this._ctxRows(this._state.tasks[aid]).some((r) => r && !r.ref && r.children === true));
  }
  /** lane lg-group-parents (the U4 read, MAJOR 2): every DESCENDANT of `id` (breadth-first, archived ones too) — a lineage move
   *  (a parent added / dropped / archived / removed) changes what each is told, so each one's content instant moves. */
  _descendantsOf(id) {
    const seen = new Set([id]), out = [], queue = [id];
    while (queue.length) for (const c of this.childrenOf(queue.shift())) if (!seen.has(c)) { seen.add(c); out.push(c); queue.push(c); }
    return out;
  }
  _touchDescendants(id, at) { const out = []; for (const d of this._descendantsOf(id)) { const g = this._state.tasks[d]; if (g) { g.contentUpdatedAt = Math.max(g.contentUpdatedAt || 0, at); out.push(d); } } return out; }   // the chain's cure (E): → the ids it touched (each named in the change notice)
  /** lane lg-group-parents U4: the standing instructions of every ANCESTOR (nearest first) — [{ id, title, objective }], only
   *  those that hold any (the owner's «继承自 X»). */
  inheritedRulesOf(tOrId, { skip = null } = {}) {
    const t = this._groupOf(tOrId);
    if (!t) return [];
    return this.ancestorsOf([t.id]).filter((aid) => !(skip && skip.has(aid))).map((aid) => this._state.tasks[aid]).filter((a) => a && String(a.objective || '').trim()).map((a) => ({ id: a.id, title: String(a.title || a.id), objective: String(a.objective).trim() }));
  }
  /** The inherited rules as the injection tells them: each ancestor's, bounded (INHERITED_RULE_MAX each, INHERITED_RULES_MAX in
   *  all — a parent's long text never evicts the child's own table); one past the bound is NAMED, never dropped silently. */
  _inheritedRuleLines(t, { skip = null, room = null, toldAbove = null } = {}) {
    // `skip`: a multi-group injection's own groups and the parents already told · `room`: ONE byte budget for the WHOLE injection
    // (the U4 read, 3 — a multi-group payload shares it; every heading and line counted) · `toldAbove`: the parents an earlier
    // group of the same injection told (named, never repeated)
    const R = room || { bytes: INHERITED_RULES_MAX };
    const list = this.inheritedRulesOf(t, { skip });
    const out = [], untold = [];
    const B = (s) => Buffer.byteLength(s, 'utf-8') + 1;
    const name = (a) => `"${agentLine(a.title)}" (${agentLine(a.id)})`;
    const names = (xs) => xs.slice(0, 5).map(name).join(', ') + (xs.length > 5 ? ` and ${xs.length - 5} more` : '');
    for (const a of list) {
      const head = `## Standing rules inherited from the parent Task Group ${name(a)}`;
      const body = agentBlock(a.objective);
      const left = R.bytes - B('') - B(head);
      if (left < 200) { untold.push(a); continue; }
      const cap = Math.min(INHERITED_RULE_MAX, left - 80);
      const bytes = Buffer.byteLength(body, 'utf-8');
      const text = bytes > cap ? Buffer.from(body, 'utf-8').subarray(0, cap).toString('utf-8').replace(/\uFFFD+$/, '') + ` … (the rest — ${bytes - cap} bytes — is cut here)` : body;
      out.push('', head, text);
      R.bytes -= B('') + B(head) + B(text);
    }
    if (untold.length) { const l = `- also inherits the standing rules of ${names(untold)} — not told here (no room left)`; out.push('', l); R.bytes -= B('') + B(l); }
    if (toldAbove && toldAbove.length) { const l = `- also inherits the standing rules of ${names(toldAbove)} (told above)`; out.push('', l); R.bytes -= B('') + B(l); }
    return out;
  }

  // the path an agent reads a row by: the notes row of a REMOTE session reads its live-synced copy (ctxBase)
  _shown(x, ctxBase = null, notesAbs = null) {
    if (!x || !x.abs) return null;
    return ctxBase && notesAbs && (x.abs === notesAbs || x.abs.startsWith(notesAbs + '/')) ? ctxBase + x.abs.slice(notesAbs.length) : x.abs;
  }

  /** ONE row's head line (verify r5 F2: a path, a note, a file name are a member's words — pieces through the belt). */
  _rowHead(r, x, { full = false, shown = null, from = null } = {}) {
    if (r.ref) return `- The Context table of another Task Group — "${agentLine(from ? from.title : r.ref)}" (${agentLine(r.ref)})${r.note ? ` — ${agentLine(r.note)}` : ''}`;
    if (r.parent) return `- Inherited from the parent Task Group "${agentLine(from ? from.title : r.parent)}" (${agentLine(r.parent)})`;   // lane lg-group-parents U4
    const isDir = x && x.kind === 'dir';
    const where = x && x.abs ? agentLine(shown || x.abs) + (isDir ? '/' : '') : agentLine(r.path);
    const verbs = [];
    const tags = r.tags || [];
    if (tags.includes('discover')) verbs.push('conversations started here auto-join');
    if (tags.includes('notes')) verbs.push('agents keep the group\'s shared notes here');
    if (tags.includes('readonly')) verbs.push('read-only: never modify it');
    if (from) verbs.push(r.fromParent ? `inherited from the parent Task Group "${agentLine(from.title)}"` : `from the Task Group "${agentLine(from.title)}"${tags.includes('readonly') ? '' : ', you may edit it'}`);
    let state = '';
    if (!x || (!x.abs && x.kind === 'missing')) state = ' — not there now';
    else if (x.kind === 'missing') state = ' — not there now';
    else if (x.kind === 'blocked') state = ' — its storage is not answering, not read';
    else if (x.kind === 'reading' && NOT_READ_WORDS[this._notReadOf(x.abs)]) state = ` — not read now (${NOT_READ_WORDS[this._notReadOf(x.abs)]}): it is read again at the next ask`;   // B-422c
    else if (x.kind === 'reading') state = ' — on a storage mount, read off the main loop: its first answer has not landed yet';
    else if (x.kind === 'remote') state = ` — a folder on the machine "${agentLine(x.host)}": told only to conversations opened there`;
    const told = full ? ` [told: ${TELL_WORDS[TC.chosenTell(r, x && x.kind)]}]` : '';
    return `- ${where} — ${r.note ? agentLine(r.note) : '(no note yet)'}${verbs.length ? ` (${verbs.join(' · ')})` : ''}${state}${told}`;
  }

  // the lines of ONE row at ONE level → { lines, bytes } (bytes = Infinity when the level cannot be told whole: a
  // listing past WALK_CAP, a file past READ_CAP, a contents walk past `cap` bytes — the planner then steps down)
  _rowAt(r, x, level, { cap = Infinity, shown = null, from = null } = {}) {
    const head = this._rowHead(r, x, { shown, from });
    const B = (ls) => Buffer.byteLength(ls.join('\n'), 'utf-8') + 1;
    const ok = x && (x.kind === 'dir' || x.kind === 'file');
    if (level === 'note' || !ok) return { lines: [head], bytes: B([head]) };
    const kb = (n) => (n < 1024 ? n + ' B' : (n / 1024).toFixed(1).replace(/\.0$/, '') + ' KB');
    const quote = (text) => agentBlock(text.replace(/\s+$/, '')).split('\n').map((l) => '  > ' + l);
    // the bytes files not yet read would add (their size + a header line + the quote marks, about 1 in 16 bytes a line)
    const estimate = (files) => files.reduce((n, f) => n + (f.size || 0) + Math.ceil((f.size || 0) / 16) + B([`  ${f.path} (00.0 KB):`]), 0);
    if (x.kind === 'file') {
      // B-422c: a told file's size not read now is said so, never «0 B»
      if (level === 'names') { const st = this._stat(x.abs), nr = !st && this._notReadOf(x.abs); const l = `${head} — ${st ? kb(st.size) : nr ? `size not read now (${NOT_READ_WORDS[nr] || 'its first answer has not landed yet'})` : kb(0)}`; return { lines: [l], bytes: B([l]) }; }
      const f = this._readText(x.abs);
      if (f.big || f.missing || f.blocked || f.reading) return { lines: [head], bytes: Infinity };
      if (f.binary) { const l = `${head} — ${kb(f.size)}, binary (not shown)`; return { lines: [l], bytes: B([l]) }; }
      const ls = [`${head} — contents below (${kb(f.size)}):`, ...quote(f.text)];
      return { lines: ls, bytes: B(ls) };
    }
    const w = this._walk(x.abs);
    if (w.over) return { lines: [head], bytes: Infinity, over: true };
    const names = w.files.map((f) => `  - ${agentLine(f.path)} (${kb(f.size)})`);
    if (w.notRead) {   // B-422c (r3507 hold 1): not read now — the last read listing, said as such with its age; no file of it is read
      const why = NOT_READ_WORDS[w.notRead] || 'its first answer has not landed yet', n = w.files.length;
      const ls = [`${head} — not read now (${why}): ${w.readAt ? `the listing below is the LAST READ one, ${readAgo(Date.now() - w.readAt)} — ${n} file${n === 1 ? '' : 's'}` : 'no listing read yet'}; ask again in a moment`, ...(w.readAt ? names : [])];
      return { lines: ls, bytes: B(ls), files: n };
    }
    if (level === 'names') {
      const ls = [`${head} — ${w.files.length} file${w.files.length === 1 ? '' : 's'} below (paths relative to it), read what you need:`, ...names];
      return { lines: ls, bytes: B(ls), files: w.files.length };
    }
    if (level === 'index') {
      const keys = (r.keys || TC.KEY_FILES).map((k) => k.toLowerCase());
      const hits = keys.map((k) => w.files.find((f) => !f.path.includes('/') && f.path.toLowerCase() === k)).filter(Boolean);
      const body = [];
      for (const [k, f] of hits.entries()) {
        const c = this._readText(path.join(x.abs, f.path));
        if (c.big || c.missing || c.blocked || c.reading) return { lines: [head], bytes: Infinity };
        body.push(`  ${agentLine(f.path)} (${kb(c.size)})${c.binary ? ' — binary (not shown)' : ':'}`, ...(c.binary ? [] : quote(c.text)));
        if (B(body) > cap) return { lines: [head], bytes: Infinity, need: B([head, ...names, ...body]) + estimate(hits.slice(k + 1)) };   // past the room: what it WOULD need, read no further
      }
      const ls = [`${head} — ${w.files.length} file${w.files.length === 1 ? '' : 's'} below (paths relative to it), read what you need; ${hits.length ? `the key files' contents follow (${hits.map((f) => agentLine(f.path)).join(', ')})` : 'none of its key files is here'}:`, ...names, ...body];
      return { lines: ls, bytes: B(ls), files: w.files.length };
    }
    const body = [];
    let total = 0;
    for (const [k, f] of w.files.entries()) {
      const c = this._readText(path.join(x.abs, f.path));
      if (c.big || c.missing || c.blocked || c.reading) return { lines: [head], bytes: Infinity };
      total += c.size;
      body.push(`  ${agentLine(f.path)} (${kb(c.size)})${c.binary ? ' — binary (not shown)' : ':'}`, ...(c.binary ? [] : quote(c.text)));
      if (B(body) > cap) return { lines: [head], bytes: Infinity, need: B([head, ...body]) + estimate(w.files.slice(k + 1)) };   // past the room: what it WOULD need, read no further
    }
    const ls = [`${head} — every file's contents below (${w.files.length} file${w.files.length === 1 ? '' : 's'}, ${kb(total)}):`, ...body];
    return { lines: ls, bytes: B(ls), files: w.files.length };
  }

  /**
   * THE TABLE AT ITS DEPTHS, within `budget` bytes: every told row in order at its chosen level, stepping down while it
   * does not fit; a stepped row's line says what it needed and what it is told instead. → { lines, used, rows: [{ row,
   * x, from, level, chosen, need, left, files }] } — the preview and the injection read the same plan.
   */
  _ctxPlan(t, budget, { ctxBase = null, gid = '', only = null, skipFrom = null } = {}) {
    const told = this._toldRows(t, { skipFrom }).filter((it) => !only || only.has(it.k));
    const notesAbs = this.contextDirOf(t);
    const kb = (n) => (n < 1024 ? n + ' B' : (n / 1024).toFixed(1).replace(/\.0$/, '') + ' KB');
    // each told row asks TC.planRows (THE step-down rule) through a lazy cost: a level is rendered only when the plan asks
    // it, at the bytes left then (a contents walk stops reading past them and answers what it WOULD need)
    const items = told.map((it) => {
      if (it.head || it.gone) {
        const line = this._rowHead(it.row, null, { from: it.from }) + (it.gone ? ' — that group no longer exists' : it.row.parent ? ` — ${it.n} row${it.n === 1 ? '' : 's'} it gives its child groups, below:` : it.n ? ` — ${it.n} row${it.n === 1 ? '' : 's'} it shares, below:` : ' — it shares no rows yet');
        return { it, kind: 'ref', chosen: 'note', shown: null, cache: new Map([['note', { lines: [line], bytes: Buffer.byteLength(line, 'utf-8') + 1 }]]) };
      }
      const shown = this._shown(it.x, ctxBase, notesAbs);
      return { it, kind: it.x && it.x.kind, chosen: TC.chosenTell(it.row, it.x && it.x.kind), shown, cache: new Map() };
    });
    const at = (m, lvl, cap) => {
      if (!m.cache.has(lvl)) m.cache.set(lvl, this._rowAt(m.it.row, m.it.x, lvl, { cap, shown: m.shown, from: m.it.from }));
      return m.cache.get(lvl);
    };
    const bare = (r) => (Number.isFinite(r.bytes) ? r.bytes : r.need != null ? r.need : Infinity);
    // the «[over the injection budget: …]» words a folder / file row stepped down to `level` carries — ONE builder for the cost
    // and the render (B-4a9f: the note's own bytes were not charged, so a plan's used bytes could pass the budget it respected)
    const stepSaid = (m, from, level, need, left) => {
      const over = m.kind === 'dir' && !!(at(m, from, left) || {}).over;   // the chosen level's own render says it (never a second walk that could have moved)
      const why = need != null ? `${TELL_WORDS[from]} need ${kb(need)}, ${kb(left)} was left` : `${TELL_WORDS[from]} ${over ? `cover more than ${WALK_CAP} files` : 'cannot be told whole'}`;
      return ` [over the injection budget: ${why} — told as ${TELL_WORDS[level]} instead${level === 'note' ? `; \`vibespace-task ${gid}show --full\` lists every file` : ''}]`;
    };
    const withSaid = (lines, said) => [lines[0].replace(/:$/, '') + said + (lines.length > 1 ? ':' : ''), ...lines.slice(1)];
    const cost = (m) => (lvl, left) => {
      const r = at(m, lvl, left), b = bare(r);
      if (!Number.isFinite(b) || lvl === m.chosen || !(m.kind === 'dir' || m.kind === 'file') || !Array.isArray(r.lines) || !r.lines.length) return b;
      const n = bare(at(m, m.chosen, left));   // planRows' own `need` (the chosen level's cost, at the same bytes left)
      const said = stepSaid(m, m.chosen, lvl, Number.isFinite(n) ? n : null, left);
      return b + Buffer.byteLength(withSaid(r.lines, said)[0], 'utf-8') - Buffer.byteLength(r.lines[0], 'utf-8');   // the step-down note, CHARGED
    };
    const plan = TC.planRows(items.map((m) => ({ kind: m.kind, chosen: m.chosen, cost: cost(m) })), budget);
    const out = [], rowsOut = [];
    items.forEach((m, i) => {
      const p = plan[i];
      const { row, x, from } = m.it;
      const r = at(m, p.level, p.left);
      let lines = r.lines;
      if (p.from && (m.kind === 'dir' || m.kind === 'file')) lines = withSaid(lines, stepSaid(m, p.from, p.level, p.need, p.left));
      out.push(...lines);
      rowsOut.push({ row, x, from, level: p.level, chosen: m.chosen, need: p.need, left: p.left, files: r.files == null ? null : r.files, bytes: Buffer.byteLength(lines.join('\n'), 'utf-8') + 1, ...(m.kind === 'ref' ? { ref: true } : {}) });
    });
    const used = rowsOut.reduce((n, r) => n + r.bytes, 0);
    return { lines: out, used, rows: rowsOut };
  }

  /** The Context block as the injection prints it (heading + plan lines), or [] (no rows). */
  _ctxBlock(t, budget, { ctxBase = null, gid = '', heading = '## Context' } = {}) {
    if (!this._hasTold(t)) return { lines: [], plan: null };   // lane lg-group-parents (the U4 read, 1): a parent's rows count
    const plan = this._ctxPlan(t, budget, { ctxBase, gid });
    return { lines: ['', `${heading} (each row: path — note (what it is for); told at the depth the group chose, within ${(budget / 1024).toFixed(1).replace(/\.0$/, '')} KB)`, '', ...plan.lines], plan };
  }

  /** Every told file's state (path:size:mtime, % and | escaped, absolute paths): detects USER-written changes under the
   *  rows — files added / edited / removed outside the store, which bump nothing — so the next turn re-tells them. Rows
   *  told at 只说明 are not walked. TTL-cached 4 s (it runs on EVERY prompt for every belonged group). The hook path reads
   *  it OFF the main thread first (readSignatures) and asks signatureFact; this string form is the same answer. */
  contextSignature(tOrId) { return this.signatureFact(tOrId).sig; }

  _sigKey(t) {
    const inh = this._toldRows(t).filter((it) => it.row && it.row.fromParent).map((it) => [it.k, it.row.tell || '']);   // lane lg-group-parents: a parent's rows are read too
    return 'ctx:' + t.id + ':' + JSON.stringify(this._ctxRows(t).map((r) => [r.path || '@' + r.ref, r.tell || ''])) + (inh.length ? ':^' + JSON.stringify(inh) : '');
  }

  /** the off-thread reader the signature walks through (SafeFs — the server's pool) or null (a suite, a CLI: the old
   *  synchronous walk, byte-identical — scripts/test-task-group-fanout.mjs replays it as the control) */
  _sigReader() { let sf = null; try { sf = this._mirrorFs(); } catch { sf = null; } return sf && typeof sf.call === 'function' ? sf : null; }

  /** the signature as the old synchronous walk computes it (a FRESH walk — it refreshes the render's cache too, so a
   *  re-delivery this signature causes lists what it saw) */
  _syncSig(t, key) {
    const parts = [];
    for (const j of this._sigJobs(t)) {
      if (j.kind === 'file') { const st = this._stat(j.abs); if (!st && this._notReadOf(j.abs)) return null; if (st) parts.push(`${sigEsc(j.abs)}:${st.size}:${Math.round(st.mtimeMs || 0)}`); }
      else { const w = this._walk(j.abs, { fresh: true }); if (w.notRead) return null; for (const f of w.files) parts.push(`${sigEsc(j.abs + '/' + f.path)}:${f.size}:${Math.round(f.mtime || 0)}`); }   // B-422c: a listing not read now is no fact
    }
    const sig = parts.join('|');
    this._sigPut(key, { sig, at: Date.now() });
    return sig;
  }
  _sigPut(key, e) {
    if (!this._sigCache) this._sigCache = new Map();
    if (this._sigCache.size > 256) this._sigCache.clear();
    this._sigCache.set(key, e);
  }

  /** what the signature reads: every told row's file / folder in table order ([{ kind, abs }]; a row told 只说明 is not read) */
  _sigJobs(t) {
    const jobs = [];
    for (const it of this._toldRows(t)) {
      if (it.head || it.gone || !it.x) continue;
      if (TC.chosenTell(it.row, it.x.kind) === 'note') continue;
      if (it.x.kind === 'file' || it.x.kind === 'dir') jobs.push({ kind: it.x.kind, abs: it.x.abs });
    }
    return jobs;
  }

  /**
   * THE SIGNATURE A TURN MAY USE (lane task-group-fanout) → { sig, stale }. A read within the last 4 s (the TTL it always
   * had) answers; with no off-thread reader the old synchronous walk; else the LAST signature, `stale: true` — the hook
   * path then DEFERS that group (nothing told on a fact it did not read, no seen mark moved; the next turn reads again).
   * `after` (a session's sigStale mark — the landing count when it went stale): only a read that LANDED after it answers,
   * fresh or not (a root slower than the bound every time is still told, one turn late — never dropped).
   */
  signatureFact(tOrId, { after = null } = {}) {
    const t = this._groupOf(tOrId);
    if (!t || !this._hasTold(t)) return { sig: '', stale: false };
    const key = this._sigKey(t);
    const hit = this._sigCache && this._sigCache.get(key);
    const take = (h) => {
      // the render lists exactly what this signature saw (its walks, adopted for this turn)
      if (h.walks) { if (!this._walkCache) this._walkCache = new Map(); for (const [dir, w] of h.walks) { this._walkCache.set(dir, { w, at: Date.now() }); this._keepGood(dir, w, h.at); } }
      return { sig: h.sig, stale: false };
    };
    if (after != null) return hit && (hit.gen || 0) > after ? take(hit) : { sig: hit ? hit.sig : '', stale: true };
    if (hit && Date.now() - hit.at < 4000) return take(hit);
    if (!this._sigReader()) { const sg = this._syncSig(t, key); return sg == null ? { sig: hit ? hit.sig : '', stale: true } : { sig: sg, stale: false }; }   // B-422c: a fact not read now defers, as the off-thread road does
    return { sig: hit ? hit.sig : '', stale: true };
  }
  /** the landing count a stale mark records (signatureFact `after`) */
  sigGen() { return this._sigGen || 0; }

  /** ONE group's signature read OFF the main thread (a SafeFs `contextFiles` per told folder — the same walk as
   *  _listContextFiles, scripts/test-sync-fs-census ④ — and a `stat` per told file), joined while one is in flight. A
   *  missing / unreadable path reads as the sync walk reads it (nothing); a worker that does not answer (its deadline, a
   *  blocked mount at the pool's door) fails the read — never a fact. */
  _readSig(t, sf) {
    const key = this._sigKey(t);
    if (!this._sigReads) this._sigReads = new Map();
    if (this._sigReads.has(key)) return this._sigReads.get(key);
    const at = Date.now();
    const jobs = this._sigJobs(t);
    const one = (j) => {
      if (DOOR.blocked(j.abs)) return Promise.resolve(j.kind === 'dir' ? [] : null);   // B-afc4: the walk's own answer for a blocked mount
      const call = j.kind === 'dir' ? sf.call('contextFiles', { path: j.abs, cap: WALK_CAP + 1 }, { timeoutMs: SIG_READ_MS }) : sf.call('stat', { path: j.abs }, { timeoutMs: SIG_READ_MS });
      return call.then((r) => r, (e) => { if (e && (e.safeFsTimeout || e.status === 503)) throw e; return j.kind === 'dir' ? [] : null; });
    };
    const p = Promise.all(jobs.map(one)).then((facts) => {
      const parts = [], walks = new Map();
      jobs.forEach((j, i) => {
        if (j.kind === 'file') { const st = facts[i]; if (st) parts.push(`${sigEsc(j.abs)}:${st.size}:${Math.round(st.mtimeMs || 0)}`); return; }
        const files = Array.isArray(facts[i]) ? facts[i] : [];
        const w = { files: files.slice(0, WALK_CAP), over: files.length > WALK_CAP };
        walks.set(j.abs, w);
        for (const f of w.files) parts.push(`${sigEsc(j.abs + '/' + f.path)}:${f.size}:${Math.round(f.mtime || 0)}`);
      });
      this._sigGen = (this._sigGen || 0) + 1;
      this._sigPut(key, { sig: parts.join('|'), at, gen: this._sigGen, walks });
      if (!this._walkCache) this._walkCache = new Map();
      if (this._walkCache.size > 256) this._walkCache.clear();
      for (const [dir, w] of walks) { const h = this._walkCache.get(dir); if (!h || h.at <= at) { this._walkCache.set(dir, { w, at }); this._keepGood(dir, w, at); } }
    });
    const done = p.then(() => true, () => false).finally(() => { if (this._sigReads.get(key) === done) this._sigReads.delete(key); });
    this._sigReads.set(key, done);
    return done;
  }

  /**
   * THE TURN'S READ (lane task-group-fanout; the owner's constraint 2026-10-24: what the model is told must not change). The
   * hook path's Context-table signatures were a synchronous walk of every told folder on the main thread — 92–185 ms per
   * turn on the owner's NFS rows (not a storage mount, so the .350 SafeFs road never covered them). Now every group whose
   * signature is older than its TTL (or `stale` — the session's marks: re-read unless one landed after the mark) is read
   * OFF the main thread, and the call waits at most `boundMs` (inside the hook's 3 s). → a Promise that settles by then, or
   * null when nothing needs reading (every signature fresh, or no off-thread reader: the route stays synchronous).
   */
  readSignatures(groups, { boundMs = this._sigBoundMs, stale = null } = {}) {
    const sf = this._sigReader();
    if (!sf) return null;
    const list = [];
    for (const g of Array.isArray(groups) ? groups : []) {
      const t = this._groupOf(g && typeof g === 'object' ? g.id : g);
      if (!t || !this._hasTold(t)) continue;
      const hit = this._sigCache && this._sigCache.get(this._sigKey(t));
      const mark = stale && Object.prototype.hasOwnProperty.call(stale, t.id) ? stale[t.id] : null;
      if (mark == null && hit && Date.now() - hit.at < 4000) continue;
      list.push(t);
    }
    if (!list.length) return null;
    let timer = null;
    const bound = new Promise((r) => { timer = setTimeout(r, Math.max(0, boundMs)); });   // a request waits on it: never unref'd
    return Promise.race([Promise.all(list.map((t) => this._readSig(t, sf))), bound]).then(() => { clearTimeout(timer); });
  }

  /** The WHOLE listing behind `vibespace-task show --full` (where a stepped-down row points): the notes folder (dir +
   *  files, the old answer's shape) and every row's files. Paths as the agent reads them (a remote session's synced copy). */
  contextIndexOf(id, ctxBase = null, { offLoop = false } = {}) {
    const t = this.get(id);
    if (!t || !this._hasTold(t)) return null;
    const notesAbs = this.contextDirOf(t);
    const rows = [];
    // lane task-group-fanout: `offLoop` (the agent route, after readWalks) — a folder still being read is listed as last
    // read and SAID (its note), never walked on the main thread
    const said = (note, w) => (w.notRead ? `${note ? note + ' — ' : ''}(not read now: ${NOT_READ_WORDS[w.notRead] || 'its first answer has not landed yet'} — ${w.readAt ? `the files are the LAST READ listing, ${readAgo(Date.now() - w.readAt)}` : 'no listing read yet'}; ask again in a moment)`   // B-422c
      : (w.reading ? `${note ? note + ' — ' : ''}(still being read: a slow folder — ask again in a moment)` : note));
    for (const it of this._toldRows(t)) {
      if (it.head || it.gone || !it.x || !it.x.abs) continue;
      const shown = this._shown(it.x, ctxBase, notesAbs);
      if (it.x.kind === 'dir') { const w = this._walk(it.x.abs, { offLoop }); rows.push({ path: shown, note: said(it.row.note || '', w), files: w.files.map((f) => ({ path: shown + '/' + f.path, size: f.size })) }); }
      else if (it.x.kind === 'file') { const st = this._stat(it.x.abs), nr = !st && this._notReadOf(it.x.abs); rows.push({ path: shown, note: nr ? `${it.row.note ? it.row.note + ' — ' : ''}(size not read now: ${NOT_READ_WORDS[nr] || 'its first answer has not landed yet'}; ask again in a moment)` : it.row.note || '', files: [{ path: shown, size: st ? st.size : nr ? null : 0 }] }); }   // B-422c: never size 0 for a size not read
    }
    const base = notesAbs ? (ctxBase || notesAbs) : null;
    return { dir: base, files: notesAbs ? this._walk(notesAbs, { offLoop }).files.map((f) => ({ path: base + '/' + f.path, size: f.size })) : [], rows };
  }

  /** `show --full`'s folders (every told folder + the notes folder) read OFF the main thread (lane task-group-fanout) into
   *  the walk cache → a Promise settled within `boundMs`, or null (all fresh / no off-thread reader). */
  readWalks(id, { boundMs = this._sigBoundMs } = {}) {
    const sf = this._sigReader();
    const t = this._state.tasks[id];
    if (!sf || !t || !this._hasTold(t)) return null;
    const dirs = new Set(this._toldRows(t).filter((it) => !it.head && !it.gone && it.x && it.x.kind === 'dir' && it.x.abs).map((it) => it.x.abs));
    const notes = this.contextDirOf(t);
    if (notes) dirs.add(notes);
    if (!this._walkCache) this._walkCache = new Map();
    const due = [...dirs].filter((d) => !DOOR.blocked(d) && !((h) => h && Date.now() - h.at < 4000)(this._walkCache.get(d)));
    if (!due.length) return null;
    const reads = due.map((d) => { const at = Date.now(); return sf.call('contextFiles', { path: d, cap: WALK_CAP + 1 }, { timeoutMs: SIG_READ_MS }).then((files) => {
      const list = Array.isArray(files) ? files : [];
      if (this._walkCache.size > 256) this._walkCache.clear();
      const w = { files: list.slice(0, WALK_CAP), over: list.length > WALK_CAP };
      this._walkCache.set(d, { w, at });
      this._keepGood(d, w, at);
    }, () => { }); });
    let timer = null;
    const bound = new Promise((r) => { timer = setTimeout(r, Math.max(0, boundMs)); });   // a request waits on it: never unref'd
    return Promise.race([Promise.all(reads), bound]).then(() => { clearTimeout(timer); });
  }

  /** ONE migration (2026-10-task-group-context-rows, src/server/migrations.js): every group that has no table yet gets
   *  its rows from its held old fields (TC.rowsFromLegacy — folders[] → 文件名 + 自动发现会话, contextDir → 文件名 +
   *  记笔记). The old fields stay in the file one release, no longer read. Idempotent (a group with `ctx` is skipped). */
  migrateContextRows() {
    this._refuseUnread("the Context rows' migration"); // THE STORE HELD UNREAD: refused BY NAME before anything moves
    const rep = { groups: 0, rows: 0, folders: 0, notes: 0, merged: 0, nonRecursive: 0, skipped: 0 };
    for (const t of Object.values(this._state.tasks)) {
      if (Array.isArray(t.ctx)) { rep.skipped++; continue; }
      const old = this._legacy.get(t.id) || {};
      // int346 (lane open-task-binds' folder rule): a stored glob tail (the agent context's own print of a recursive folder,
      // written back) is the recursive switch, never part of the row's path — PURE folderOf, as every other reader of folders[]
      const m = TC.rowsFromLegacy({ ...old, folders: Array.isArray(old.folders) ? old.folders.map((f) => folderOf(f) || f) : old.folders });
      t.ctx = m.rows;
      rep.groups++; rep.rows += m.rows.length; rep.folders += m.folders; rep.notes += m.notes; rep.merged += m.merged; rep.nonRecursive += m.nonRecursive;
    }
    if (rep.groups) {   // lane lg-store-writes U5: the boot migration's rows are on disk when it returns (the ledger records it next)
      const L = this._save({ boot: true }); this._notify();
      // the census cure ((b), B-a09e's class): rows not on disk at the bound ⇒ the migration THROWS by name — not recorded, and the
      // runner holds the migrations after it (EVSNOTONDISK, the order law); the next boot migrates again (idempotent: ctx set ⇒ skipped)
      if (!L.ok) throw Object.assign(new Error(`task-groups.json: the migrated context rows are in memory and not on disk yet (${L.why}) — not recorded, the migration runs again at the next boot`), { code: 'EVSNOTONDISK' });
    }
    return rep;
  }

  // THE FIRST PROMPT AFTER A RESTART (B-86d3 ①): the groups whose restored seen marks say "unchanged since you last saw
  // it" are not repeated — ONE line names them and where their current state is (src/seen-marks.js).
  renderUnchangedNote(groupIds, { multi = false } = {}) {
    const ts = (groupIds || []).map((id) => this._state.tasks[id]).filter((t) => t && !t.archived);
    if (!ts.length) return '';
    const names = ts.map((t) => `"${agentLine(t.title)}" (${t.id})`).join(', ');
    return `<vibespace-task-unchanged>VibeSpace restarted; unchanged since you last saw ${ts.length > 1 ? 'them' : 'it'}, so not repeated: ${names} — \`vibespace-task ${multi ? '--group <id> ' : ''}show --full\` prints the current state.</vibespace-task-unchanged>`;
  }

  // The SessionStart injection payload (design §4a): rendered task state +
  // Class-B file INDEX (names only, agents read what they need) + the rules.
  // ctxBase: for REMOTE sessions the context folder is auto-synced to
  // <remoteHome>/.vibespace/ctx/<groupId> — pass that as ctxBase and every
  // file path in the injection is translated to the remote copy (an agent on
  // the host can't read the local paths).
  // ORDER + SIZE MATTER (real incident): Claude Code persists an oversized hook
  // additionalContext to disk and hands the agent only a ~2KB HEAD preview.
  // The old layout put a ~24KB Activity log FIRST and the tool rules LAST — so
  // agents saw a pure log preview, never learned vibespace-task/-status/-ask,
  // and simply didn't use them. Now: identity/objective → TOOL RULES
  // → context folder → Activity log LAST, with the log byte-budgeted so the
  // whole payload stays inline (< ~8KB) in the common case.
  // Newest-first Activity-log picker. THREE layers of truncation so one very
  // long entry can't starve the rest (user directive 2026-07-13): (1) at most
  // MAX_ENTRIES lines, (2) each note capped to PER_NOTE chars (the overflow is
  // recoverable via `show --full`, flagged with †), then (3) the byte budget as
  // a floor-guarded stop — and the route applies a final hard byte-cap on top.
  _pickLogLines(t, room, now = null, min = 3, memo = null) {   // F1 (lane injection-relevance): `min` — a re-pick under a cap keeps fewer; `memo` — its re-picks reuse the lines
    const MAX_ENTRIES = 12;   // how many history lines at most
    const PER_NOTE = 200;     // per-entry char cap so long notes don't hog the budget
    const total = (t.progress || []).length;
    const picked = [];
    for (let i = total - 1; i >= 0 && picked.length < MAX_ENTRIES; i--) {
      const p = t.progress[i];
      let line = memo ? memo.get(p) : undefined;
      if (line === undefined) {
        const raw = String(p.note || '');
        const clipped = raw.length > PER_NOTE;
        // clean char-slice (no word-boundary regex — that gutted CJK notes, which
        // have no spaces: /\s+\S*$/ stripped back to the first space); the belt cuts BEFORE it judges (verify r4 F1)
        const note = agentLine(raw, clipped ? PER_NOTE : 0);
        line = `- ${this._tsShort(p.at, now)} ${note}${(p.detail || clipped) ? ' †' : ''}${p.session ? ` _(${p.session})_` : ''}`;
        if (memo) memo.set(p, line);
      }
      const len = Buffer.byteLength(line, 'utf-8') + 1;
      if (picked.length >= min && len > room) break;
      picked.unshift(line); room -= len;
    }
    return { picked, total };
  }

  // Self-rescue for the CLI's oversized-hook handling: past ~10KB Claude Code
  // persists the payload to disk and the agent sees only a ~2KB head preview —
  // but the preview NAMES the full file (verified empirically, 2.77.0). One
  // early line teaches the agent to Read it, which makes truncation recoverable
  // instead of fatal.
  _persistRescueLine() {
    return '(If this arrives wrapped in <persisted-output> with only a 2KB preview, FIRST use the Read tool on the full-output file path named in it, THEN continue — the rules and group state matter.)';
  }

  // The shared tools teaching, one emission per payload. gid = the --group
  // prefix agents must use ('' single-group; '--group <id> ' generic in the
  // shared multi-group section).
  _toolsSectionParts(gid, multi, tools = null, fileTools = undefined) {
    // DISCOVERY layer (2.111.22) with COPY-READY samples (2.111.25, user directive): every line shows the COMPLETE correct
    // invocation. Per-feature toggles (2.211.0): a disabled tool is OMITTED. Since lane cli-registry the header and the
    // paragraphs (task / status / ask / jobs / channels by reach / msg) are the rows of src/agent-cli-registry.js — the
    // header's count = the paragraphs that rendered; every toggle and the reach closed ⇒ no section at all.
    const out = renderSessionStartTools(tools, { gid, multi, tray: OF.tray().phrase });   // B-7960 b: the tray by its label and CURRENT place
    if (!out.length) return [];
    // the section's TRAILER (it teaches no CLI): absolute paths + lane artifacts-prompt-hint's sentence — which writes become
    // Artifacts, the session's harness names its file tools (agent-routes fileToolsOf). It rides the paths line, whose half
    // is tightened then (141 → 69 B): the 9600 B fixtures had ~100 B of room
    const artifactsLine = artifactsIntroLine(fileTools);
    out.push(
      '',
      artifactsLine
        ? `In chat replies use ABSOLUTE file paths (the UI makes them clickable). ${artifactsLine}`
        : 'In chat replies use ABSOLUTE file paths (e.g. /home/user/out/final.wav) — the UI makes them clickable; bare/relative names may not resolve.');
    return out;
  }

  // Backlog note for INJECTION (user directive 2.122.0/2.123.0): never dump
  // the whole backlog per hook. The SELECTION is selectReminders
  // (src/backlog-select.js, 2026-09-22 — the store has no cap, so the read
  // picks): ≤ 5 OPEN items THIS session CLAIMED, by priority then recency
  // (the session that parks one auto-claims it, so the responsible agent
  // re-surfaces them); ONE line naming the open HIGH items nobody owns (so an
  // unowned urgent item cannot rot); everything else is a count. Returns lines.
  //
  // `isLiveClaim(key)` (optional — agent-routes passes "is that session
  // running"): a high item whose claimants are all gone counts as unowned.
  // `highBudget` = the BYTES the unclaimed-HIGH line may spend on item TEXT
  // (default 600; ids beyond it). renderMultiContext passes ONE shared budget
  // so N groups never repeat ~1.5 KB of CJK text each.
  //
  // `mineBudget` = the same for the claimed-item lines (multi-group only;
  // absent = each item's own 160-char clip, the single-group shape).
  //
  // THE CLEANUP NUDGE (2026-09-22): when the items this session HOLDS (claimed
  // or parked by it, open) reach `tasks.backlogNudgeAt` (default 20, 0 = off;
  // `nudgeAt` overrides the setting for callers that already read it), the
  // note ends with ONE nudgeText paragraph — the same words the route's
  // add/edit/claim answers carry. `nudge: false` = the caller aggregates
  // (renderMultiContext: ONE paragraph for every group, one 500 B budget).
  // This note rides every FULL context injection (SessionStart, the codex
  // first prompt, a full re-delivery); the turns in between get the same
  // paragraph from prompt-context through backlogNudgeFor.
  _backlogNoteLines(t, { gid = '', sessionKey = null, tools = null, isLiveClaim = null, highBudget = null, mineBudget = null, nudgeAt = null, nudge: withNudge = true } = {}) {
    if (tools && tools.task === false) return []; // backlog commands ride vibespace-task
    const open = (t.backlog || []).filter((b) => b.status === 'open');
    if (!open.length) return [];
    const LIMIT = 5;
    const sel = selectReminders(open, sessionKey, { limit: LIMIT, isLive: isLiveClaim });
    const budget = highBudget || { bytes: HIGH_LINE_TEXT_BYTES };
    const highLine = () => {
      if (!sel.unclaimedHigh.length) return [];
      const more = sel.unclaimedHighTotal - sel.unclaimedHigh.length;
      const parts = [];
      let used = 0;
      for (const b of sel.unclaimedHigh) {
        const full = `[${b.id || '?'}] ${escapeItemText(agentLine(b.text, 100))}${b.stale ? ' (claimant not running)' : ''}`;
        const cost = Buffer.byteLength(full, 'utf-8') + 3;
        if (used + cost <= budget.bytes) { parts.push(full); used += cost; } else parts.push(`[${b.id || '?'}]`);
      }
      budget.bytes = Math.max(0, budget.bytes - used);
      return [`- unclaimed HIGH: ${parts.join(' · ')}${more > 0 ? ` · +${more} more` : ''}  _(no running session owns these — \`backlog-claim <id>\` if one is yours to carry)_`];
    };
    const out = [''];
    if (sel.mine.length) {
      out.push(`### Backlog reminders — items CLAIMED by THIS session, still open  _(highest priority first, \`!\` high · \`↓\` low; surface them to the user when relevant; \`vibespace-task ${gid}backlog-done <id>\` once decided/finished; \`backlog-unclaim <id>\` to hand one back)_`);
      for (const b of sel.mine) {
        const whole = agentLine(b.text);
        let clipped = whole.length > 160;
        let text = clipped ? agentLine(b.text, 160) : whole;
        if (mineBudget) {
          const cost = Buffer.byteLength(text, 'utf-8');
          if (cost <= mineBudget.bytes) mineBudget.bytes -= cost;
          else if (whole.length > MINE_CLIP_OVER_BUDGET) { text = agentLine(b.text, MINE_CLIP_OVER_BUDGET); clipped = true; }
        }
        out.push(`- [${b.id || '?'}] ${markedText({ priority: b.priority, text })}${(b.detail || clipped) ? ' †' : ''}`);
      }
      if (sel.mineTotal > LIMIT) out.push(`- … +${sel.mineTotal - LIMIT} more claimed by you`);
      out.push(...highLine());
      const others = sel.othersCount;
      out.push(`(group backlog holds ${open.length} open parked item${open.length > 1 ? 's' : ''}${others ? ` incl. ${others} not claimed by you` : ''} — \`vibespace-task ${gid}backlog\` lists them)`);
    } else {
      out.push(`Group backlog: ${open.length} open parked item${open.length > 1 ? 's' : ''} (deferred decisions / future work — NOT immediate tasks; never start one unasked). \`vibespace-task ${gid}backlog\` lists them; \`backlog-claim <id>\` takes ownership of one.`);
      out.push(...highLine());
    }
    if (withNudge) {
      const e = this._nudgeEntry(t, sessionKey, gid, nudgeAt);
      if (e) out.push(nudgeTextAll([e]));
    }
    return out;
  }

  // one group's nudge for this session, or null (under the threshold / off)
  _nudgeEntry(t, sessionKey, gid = '', nudgeAt = null) {
    const nudge = backlogNudge((t && t.backlog) || [], sessionKey, { threshold: nudgeAt != null ? nudgeAt : this.backlogNudgeAt() });
    return nudge ? { nudge, gid, group: t.id } : null;
  }

  // THE nudge paragraph for a session across `groupIds` ('' = none): ONE
  // paragraph under ONE 500 B budget however many groups are over the
  // threshold (nudgeTextAll). Used by renderMultiContext and by the per-turn
  // delivery (prompt-context) — one wording on every carrier. `multi` = the
  // session belongs to several groups (commands carry --group). The backlog
  // commands ride vibespace-task, so the task tool off ⇒ ''.
  backlogNudgeFor(groupIds, sessionKey, { multi = false, tools = null, nudgeAt = null } = {}) {
    if (!sessionKey || (tools && tools.task === false)) return '';
    const entries = [];
    for (const id of (groupIds || [])) {
      const t = this._state.tasks[id];
      if (!t || t.archived) continue;
      const e = this._nudgeEntry(t, sessionKey, multi ? `--group ${id} ` : '', nudgeAt);
      if (e) entries.push(e);
    }
    return nudgeTextAll(entries);
  }

  // `tasks.backlogNudgeAt` as a number (absent ⇒ 20; 0 = off) — the store's
  // getSetting IS serverSetting in production (server.js)
  backlogNudgeAt() {
    try { return nudgeThreshold(this._getSetting?.('tasks.backlogNudgeAt')); } catch { return nudgeThreshold(undefined); }
  }

  // the Context table's bytes in ONE injection: its own budget (tasks.contextIndexBytes; 0 = none) capped by the room
  // the hook carries after `before` and `after` (the notes teaching) and the activity log's floor
  _budgetFor(before, after = [], { share = 1, reserve = LOG_RESERVE } = {}) {
    const B = (ls) => Buffer.byteLength(ls.join('\n'), 'utf-8') + 1;
    const room = Math.max(0, Math.floor((INJECT_ROOM - reserve - B(before) - (after.length ? B(after) : 0)) / Math.max(1, share)));
    const own = this.contextIndexBytes();
    return own ? Math.min(own, room) : room;
  }

  // the notes row's teaching (the old shared-context-folder sections, its listing now told by the table row)
  _notesTeaching(ctxBase, notesAbs) {
    const base = ctxBase || notesAbs;
    const cbase = agentLine(base);   // verify r5 F2 (the third spelling the first pass missed — reproduced by the suite's own leg): a line piece
    return ['', `## Shared context folder (the group's shared memory)`, '',
      (ctxBase
        ? `\`${cbase}\` — a live-synced copy (newer file wins, ~1 min lag) of this group's shared context folder (its 记笔记 row in the Context table above).`
        : `\`${cbase}\` — this group's shared context folder (its 记笔记 row in the Context table above).`)
      + ` It is the group's SHARED MEMORY between agents: every session working this Task Group — now and in the future — reads it. It is NOT a place to publish deliverables for the user (put user-facing output wherever the user asked for it).`,
      '', '### Using the shared context folder', '',
      `Whenever you learn something that OTHER agents working this group will likely need — conventions you discovered, gotchas, decisions and their reasons, or details another ROLE depends on (e.g. a compliance-focused session needs technical specifics that only a development session knows — the dev session should write them up) — organize it into a file in \`${cbase}\` yourself, without waiting to be asked. Write for a fellow agent starting cold: skimmable, factual, dated where it matters. Prefer updating/consolidating an existing file over piling up new ones.`,
      '',
      ctxBase
        ? `Files you write to \`${cbase}\` sync back to the group's shared folder (newer file wins, within ~1 minute). Do not create a \`.vibespace/\` subfolder there.`
        : `Everything under \`${agentLine(notesAbs)}/.vibespace/\` is GENERATED by VibeSpace and read-only for you — never create, edit, or delete anything there (\`TASK.md\` in it always mirrors the state above). Write your shared files in the context folder itself, outside \`.vibespace/\`.`];
  }

  /** 「新对话会收到」 (the Task Group window's preview): what a NEW conversation of this group receives — renderContext's
   *  EXACT output (`text`) — plus the group's own part of it (`block`: the identity, the standing instructions and the
   *  Context table, the slice the window edits) and the plan behind the table (`rows`, `budget`, `used`). */
  contextPreview(id, { tools = null, fileTools = undefined } = {}) {
    const t = this.get(id);
    const now = Date.now();
    const text = this.renderContext(id, { tools, fileTools, now });
    const parts = this._contextHead(t, { now, tools, fileTools });
    const notesAbs = this.contextDirOf(t);
    const teach = notesAbs ? this._notesTeaching(null, notesAbs) : [];
    const effective = this._budgetFor(parts, teach);
    const B = (ls) => Buffer.byteLength(ls.join('\n'), 'utf-8') + 1;
    const room = Math.max(0, INJECT_ROOM - LOG_RESERVE - B(parts) - (teach.length ? B(teach) : 0));
    const { lines, plan } = this._ctxBlock(t, effective, { ctxBase: null, gid: '' });
    const own = this._ctxRows(t);
    const rows = plan ? plan.rows.map((r) => ({
      i: r.from ? null : own.findIndex((o) => (r.ref ? o.ref === r.row.ref : !o.ref && o.path === r.row.path)),
      from: r.from ? { id: r.from.id, title: r.from.title } : null,
      path: r.row.ref || r.row.parent ? null : r.row.path, ref: r.row.ref || null, note: r.row.note || '',
      ...(r.row.parent ? { parent: r.row.parent } : {}), ...(r.row.fromParent ? { inherited: true } : {}),   // lane lg-group-parents U4
      abs: r.x && r.x.abs ? r.x.abs : null, kind: r.x ? (r.x.ref ? 'ref' : r.x.kind) : null, via: r.x && r.x.via ? r.x.via : null,
      level: r.level, chosen: r.chosen, need: r.need, left: r.left, files: r.files, bytes: r.bytes || 0,
    })) : [];
    const block = [this.renderTaskMd(t, 0, { now }).replace(/\n---\n[\s\S]*$/, '').trim(), ...this._inheritedRuleLines(t), ...lines].join('\n');
    return { text, block, bytes: Buffer.byteLength(text, 'utf-8'), budget: { own: this.contextIndexBytes(), room, effective, cap: INJECT_ROOM }, used: plan ? plan.used : 0, rows };
  }

  // the head of a single-group injection, up to and including the tools section (everything the table rides after)
  _contextHead(t, { multi = false, now = Date.now(), skipTools = false, sessionKey = null, tools = null, isLiveClaim = null, fileTools = undefined } = {}) {
    const parts = [
      `<vibespace-task-context>`,
      `This session belongs to VibeSpace Task Group "${agentLine(t.title)}" (${t.id}). The state below is shared across ALL sessions of this group. ${OF.zoneSentence(now)}`,
      this._persistRescueLine(),
      '',
      // cap=0: meta/objective only — the log is appended LAST below.
      this.renderTaskMd(t, 0, { now }).replace(/\n---\n[\s\S]*$/, '').trim(),
      ...this._inheritedRuleLines(t),   // lane lg-group-parents U4: the parents' standing rules, «继承自 X»
      ...this._backlogNoteLines(t, { gid: multi ? `--group ${t.id} ` : '', sessionKey, tools, isLiveClaim }),
    ];
    // ── How to report back — self-documenting + scoped + enum-disambiguated ──
    // In multi-group payloads the tools section is emitted ONCE by
    // renderMultiContext (skipTools) — repeating ~2.3KB per group is what blew
    // a 2-group payload to 9.8KB / 3-group to 15.7KB, past the hook persist
    // threshold (agents then see only a ~2KB head preview and never learn the
    // tools — the same fleet-wide failure 2.68.0 fixed for the single-group case).
    if (!skipTools) parts.push(...this._toolsSectionParts(multi ? `--group ${t.id} ` : '', multi, tools, fileTools));
    return parts;
  }

  renderContext(id, { multi = false, ctxBase = null, logBudget = 8000, skipTools = false, sessionKey = null, tools = null, isLiveClaim = null, fileTools = undefined, now: nowAt = null, cap = 0 } = {}) {
    const t = this.get(id);
    const now = nowAt || Date.now();   // B-7960: ONE instant for the zone sentence and every dateless time below it
    const parts = this._contextHead(t, { multi, now, skipTools, sessionKey, tools, isLiveClaim, fileTools });
    // ── THE CONTEXT TABLE (lane task-group-context): AFTER the rules and the tools (the injection-budget law), every row
    // at its chosen depth within the table's budget AND the room the hook carries — INJECT_ROOM less what came before,
    // the notes teaching below it and the activity log's floor — so a row steps down and SAYS so, never cut silently
    const notesAbs = this.contextDirOf(t);
    const teach = notesAbs ? this._notesTeaching(ctxBase, notesAbs) : [];
    parts.push(...this._ctxBlock(t, this._budgetFor(parts, teach), { ctxBase, gid: multi ? `--group ${t.id} ` : '' }).lines);
    parts.push(...teach);
    // Activity log LAST — the one section that can safely lose lines to a cut.
    // Newest entries win the byte budget (≥3, ≤12), printed oldest → newest.
    const totalLog = (t.progress || []).length;
    const close = `</vibespace-task-context>`;
    if (totalLog) {
      const used = Buffer.byteLength(parts.join('\n'), 'utf-8');
      const memo = new Map();   // a cap's re-picks reuse the rendered lines
      const logOf = (room, min) => {
        const { picked } = this._pickLogLines(t, room, now, min, memo);
        // B-9ac8: a re-pick under the cap can keep NO line (the preamble + other groups' contexts used the room) — the header
        // then says so, how many there are and where they are; «last 0 of 500» was honest and useless
        const head = !picked.length ? `  _(${noneFitWords(totalLog, multi ? `--group ${t.id} ` : '')})_`
          : picked.length < totalLog ? `  _(last ${picked.length} of ${totalLog} — \`vibespace-task ${multi ? `--group ${t.id} ` : ''}show\` prints more)_` : '';   // B-9ac8 follow-up: the partial header names its group as the none-fit one does
        return ['', '## Activity log' + head + (picked.some(l => l.includes(' †')) ? `  _(† = has detail — \`vibespace-task ${multi ? `--group ${t.id} ` : ''}show --full\`)_` : ''), '', ...picked];
      };
      let room = Math.max(1200, logBudget - used);
      let log = logOf(room, 3);
      // F1 (lane injection-relevance): over the caller's `cap` the log is RE-PICKED under a smaller room — its OLDEST
      // lines go and the header still counts them; a tail cut of the joined text would take the NEWEST (printed last)
      const over = () => Buffer.byteLength([...parts, ...log, close].join('\n'), 'utf-8') - cap;
      while (cap > 0 && room > 0 && over() > 0) { room = Math.max(0, room - Math.max(128, over())); log = logOf(room, 0); }
      parts.push(...log);
    }
    parts.push(close);
    return parts.join('\n');
  }

  // ── Diff-based UPDATE injection (2.113.0, user request) ──
  // A mid-session group change used to re-inject the ENTIRE group context
  // (identity + tools teaching + folder index + activity log) —
  // several KB per member agent per change, mostly repeating what the agent
  // already knows. Instead agent-routes keeps a compact per-session SNAPSHOT
  // of what each group looked like at last delivery (next to _groupSeenAt)
  // and updates deliver only the DELTA via renderContextDiff. Full context
  // still goes out on first contact / after a restart (snapshot lost with the
  // in-memory session — same accepted trade-off as _groupSeenAt).

  _h(s) { return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 12); }

  // What the injected context RENDERS, compactly — the diff can only ever be
  // as good as this coverage, so it mirrors exactly the fields that bump
  // contentUpdatedAt (title/objective/the Context table) + progress. The
  // rows' FILE state is deliberately absent: agent-routes already keeps
  // the table's signature separately (_ctxSig) and passes old/new to the diff.
  // the table as told, row by row: { k (own: its path · a reference: @<group> · a shared row: @<group>:<path>), h, path }
  _ctxKeys(t) {
    const shown = (r) => { if (!r || r.children !== true) return r; const { children, ...rest } = r; return rest; };   // the U4 read (7): 含子组 is never told to the group's own members
    return this._toldRows(t).map((it) => ({ k: it.k, h: this._h(JSON.stringify([shown(it.row), it.n == null ? null : it.n, it.gone ? 1 : 0])), path: it.row.ref ? '@' + it.row.ref : it.row.parent ? '^' + it.row.parent : it.row.path }));
  }
  _ctxHash(t) { return this._h(JSON.stringify(this._ctxKeys(t).map((r) => [r.k, r.h]))); }
  /** lane lg-group-parents U4: the inherited rules' hash — a group with no ancestor holding any hashes as [] (so a snapshot from
   *  before this release, which has none, reads as «unchanged» for it). */
  _inhHash(t) { return this._h(JSON.stringify(this.inheritedRulesOf(t).map((a) => [a.id, a.title, a.objective]))); }

  /** The instant agent-routes' injection gate compares: the group's own content instant, or a REFERENCED group's table
   *  instant when later (its shared rows are told here — an edit there must reach this group's members). */
  contentAtOf(tOrId) {
    const t = this._groupOf(tOrId);
    if (!t) return 0;
    let at = t.contentUpdatedAt || t.updatedAt || 0;
    for (const r of this._ctxRows(t)) if (r.ref) { const g = this._state.tasks[r.ref]; if (g && (g.ctxUpdatedAt || 0) > at) at = g.ctxUpdatedAt; }
    // lane lg-group-parents U4: an ANCESTOR's content (its standing rules, its 含子组 rows) is told here too
    for (const aid of this.ancestorsOf([t.id])) { const a = this._state.tasks[aid]; const aat = Math.max(a.contentUpdatedAt || 0, a.ctxUpdatedAt || 0); if (aat > at) at = aat; }
    return at;
  }

  snapshotForDiff(id) {
    const t = this.get(id);
    const prog = t.progress || [];
    return {
      title: t.title,
      objHash: this._h(t.objective || ''),
      inhHash: this._inhHash(t),          // lane lg-group-parents U4: the parents' standing rules as told
      ctxHash: this._ctxHash(t),          // lane task-group-context: the table as told (own rows + the referenced shared rows)
      ctxRows: this._ctxKeys(t),          // …row by row, so the update can say which rows changed (in memory only — the LITE one keeps the hash)
      backlog: (t.backlog || []).map((b) => ({ id: b.id, text: b.text, status: b.status || 'open', p: normalizePriority(b.priority), d: b.detail ? this._h(b.detail) : '', addedBy: b.addedBy || null, claimedBy: [...(b.claimedBy || [])] })),
      // New activity = entries with at > this. Two writes inside the SAME ms
      // split by an injection in between could drop one line from a diff —
      // accepted (unreachable in practice; recoverable via show --full).
      lastProgressAt: prog.length ? prog[prog.length - 1].at : 0,
    };
  }

  // Compute one group's delta between snap (what the session last saw) and its
  // current state → { lines, bits } (bits = phrase-level summary fragments for
  // enumeration headers, e.g. ['objective updated', '3 new activity']).
  // lines EMPTY when nothing the injection renders actually changed (e.g. an
  // objective re-saved with identical text — the old behavior re-injected the
  // whole group for that; caller skips injection, still advances markers).
  // Returns null when the snapshot is unusable OR the change cannot be told as
  // a delta (a pre-table / LITE snapshot whose rows changed; a file told by its
  // CONTENTS changed — the agent needs the new text) → caller falls back to full
  // delivery. Rows added / changed are re-told at their depths (a one-line
  // "folder is now X" left pre-existing files permanently invisible,
  // review-caught); removed rows are named. Line order mirrors
  // renderContext (identity → objective → folder → activity LAST)
  // so tail-first truncation drops the safest section first.
  diffChanges(id, snap, { gid = '', ctxBase = null, oldSig = '', newSig = '', sessionKey = null, sessionName = '' } = {}) {
    const t = this.get(id);
    if (!snap || typeof snap !== 'object' || typeof snap.objHash !== 'string') return null;
    // lane task-group-context: a snapshot from before the Context table cannot be diffed against it; a restored LITE one
    // (the hash only) cannot say WHICH rows changed — both fall back to the full delivery
    if (typeof snap.ctxHash !== 'string') return null;
    const rowsChanged = snap.ctxHash !== this._ctxHash(t);
    if (rowsChanged && !Array.isArray(snap.ctxRows)) return null;
    const ch = [];
    const bits = []; // summary fragments, same order as the sections
    if (snap.title !== t.title) { ch.push(`- Renamed: "${agentLine(snap.title)}" → "${agentLine(t.title)}"`); bits.push('renamed'); }
    // lane lg-group-parents U4: the parents' standing rules changed (a parent's edit, a parent added / removed / archived) —
    // told again whole (bounded as the full injection bounds them); a snapshot without the hash reads as «no inherited rules»
    if ((typeof snap.inhHash === 'string' ? snap.inhHash : this._h('[]')) !== this._inhHash(t)) {
      bits.push('inherited rules updated');
      const inh = this._inheritedRuleLines(t);
      ch.push(inh.length ? '- Standing rules inherited from parent groups, NOW:' : '- No standing rules are inherited from a parent group any more');
      for (const l of inh) if (l) ch.push(l.startsWith('## ') ? '  ' + l.slice(3) + ':' : l.split('\n').map((x) => '  > ' + x).join('\n'));
    }
    if (this._h(t.objective || '') !== snap.objHash) {
      bits.push('objective updated');
      const obj = agentBlock((t.objective || '').trim());
      if (!obj) ch.push('- Objective CLEARED');
      else {
        ch.push('- Objective UPDATED to:');
        let room = 1800, cut = false; // bounded so a 20KB objective can't evict the sections below
        for (const l of obj.split('\n')) {
          const len = Buffer.byteLength(l, 'utf-8') + 4;
          if (len > room) { if (room > 200) ch.push('  > ' + agentLine(l, Math.floor(room / 2))); cut = true; break; }
          ch.push('  > ' + l); room -= len;
        }
        if (cut) ch.push(`  > … _(truncated — \`vibespace-task ${gid}show --full\` for the rest)_`);
      }
    }
    // Backlog changes are EVENTS (a parked/resolved item), so they do ride the
    // diff — unlike the standing content, which injection never dumps (2.122.0).
    // Matched by the stable per-item `id` (2.123.0 — text edits read as
    // "reworded", not REMOVED+NEW; the old occurrence-indexed text pairing is
    // gone with the ids). TARGETED (user directive): an item's events go ONLY
    // to sessions that created OR claimed it — pass sessionKey to filter; a
    // null sessionKey (tests/legacy callers) keeps every event.
    const relevant = (it) => !sessionKey || it.addedBy === sessionKey || (it.claimedBy || []).includes(sessionKey);
    const oldById = new Map();
    for (const b of (snap.backlog || [])) if (b.id) oldById.set(b.id, b);
    const blCh = [];
    // F2 (lane injection-relevance): what OTHER sessions parked or resolved since the snapshot — never named mid-session
    // before (the injection audit: 179 of 179 HIGH parks) — is told as ONE count line below, HIGH ids named. A restored
    // LITE snapshot (seen-marks: `of`) keeps only this session's items, so the others' are judged by time there: parked /
    // resolved after its last activity line (a re-tell after a restart is the safe direction)
    const lite = snap.of !== undefined;
    const since = Number(snap.lastProgressAt) || 0;
    const byOthers = { parked: [], resolved: 0 };
    for (const b of t.backlog || []) {
      const o = b.id ? oldById.get(b.id) : null;
      const st = b.status || 'open';
      if (!o) {
        // brand-new items: only OPEN ones are worth announcing (a new item
        // already resolved is history, not a pending parked thing)
        if (st === 'open' && relevant(b)) blCh.push(`- Backlog PARKED [${b.id}]: ${agentLine(b.text)}${b.detail ? ' †' : ''}${b.addedBy ? `  _(by ${b.addedBy})_` : ''}`);
        else if (sessionKey && !relevant(b)) {
          if (st === 'open' && (!lite || (b.addedAt || 0) > since)) byOthers.parked.push(b);
          else if (lite && st !== 'open' && (b.resolvedAt || 0) > since) byOthers.resolved++;
        }
        continue;
      }
      oldById.delete(b.id); // remaining at the end = removed items
      if (!relevant(b) && !relevant(o)) { if ((o.status || 'open') === 'open' && st !== 'open') byOthers.resolved++; continue; } // not this session's item — F2's count line covers it
      if ((o.status || 'open') !== st) {
        const verb = st === 'done' ? 'RESOLVED' : st === 'dropped' ? 'DROPPED' : 'REOPENED';
        blCh.push(`- Backlog ${verb} [${b.id}]: ${agentLine(b.text)}${b.resolvedBy && st !== 'open' ? `  _(by ${b.resolvedBy})_` : ''}`);
        continue; // the status flip is the headline — skip lesser deltas
      }
      const oldClaims = o.claimedBy || [], newClaims = b.claimedBy || [];
      const gained = newClaims.filter((x) => !oldClaims.includes(x));
      const lost = oldClaims.filter((x) => !newClaims.includes(x));
      if (gained.length) blCh.push(`- Backlog CLAIMED [${b.id}]: ${agentLine(b.text)}  _(by ${gained.join(', ')})_`);
      if (lost.length) blCh.push(`- Backlog UNCLAIMED [${b.id}]: ${agentLine(b.text)}  _(${lost.join(', ')} handed it back)_`);
      // a snapshot taken before priorities existed carries no `p` — that is not a change
      if (st === 'open' && o.p !== undefined && o.p !== normalizePriority(b.priority)) blCh.push(`- Backlog priority ${o.p} → ${normalizePriority(b.priority)} [${b.id}]: ${agentLine(b.text)}`);
      if (st === 'open' && o.text !== b.text) blCh.push(`- Backlog item reworded [${b.id}]: ${agentLine(b.text)}`);
      else if (st === 'open' && (b.detail ? this._h(b.detail) : '') !== (o.d || '')) {
        blCh.push(`- Backlog item detail updated [${b.id}]: ${agentLine(b.text)}  _(† \`vibespace-task ${gid}show --full\`)_`);
      }
    }
    for (const [, o] of oldById) if ((o.status || 'open') === 'open' && relevant(o)) blCh.push(`- Backlog REMOVED [${o.id}]: ${agentLine(o.text)}`);
    const nBlChanges = blCh.length;
    if (blCh.length > 15) {
      const extra = blCh.length - 15;
      blCh.length = 15;
      blCh.push(`- … +${extra} more backlog changes  _(\`vibespace-task ${gid}backlog\`)_`);
    }
    ch.push(...blCh);
    if (nBlChanges) bits.push(`${nBlChanges} backlog change${nBlChanges > 1 ? 's' : ''}`);
    if (byOthers.parked.length || byOthers.resolved) {
      const hi = byOthers.parked.filter((b) => normalizePriority(b.priority) === 'high').map((b) => b.id);
      const said = [];
      if (byOthers.parked.length) said.push(`${byOthers.parked.length} parked${hi.length ? ` (${hi.length} HIGH [${hi.slice(0, 4).join(', ')}${hi.length > 4 ? `, +${hi.length - 4}` : ''}])` : ''}`);
      if (byOthers.resolved) said.push(`${byOthers.resolved} resolved`);
      ch.push(`- Backlog: ${said.join(', ')} by others since your last update — \`vibespace-task ${gid}backlog\``);
      bits.push('backlog by others');
    }
    // ── the Context table (lane task-group-context): rows removed are named; rows added or changed are re-told at their
    // depths within a slice of the update's room (the same plan the full context prints)
    if (rowsChanged) {
      const keys = this._ctxKeys(t);
      const was = new Map(snap.ctxRows.map((r) => [r.k, r]));
      const now = new Set(keys.map((r) => r.k));
      for (const r of snap.ctxRows) if (!now.has(r.k)) {
        // lane lg-group-parents (the U4 read, 6): an inherited row's removal says where it came from, never a raw key
        const m = /^\^([^:]+)(?::(.*))?$/.exec(String(r.k || ''));
        if (m && m[2] === undefined) ch.push(`- No Context rows are inherited from the parent Task Group ${agentLine(m[1])} any more`);
        else if (m) ch.push(`- Context row REMOVED (it was inherited from the parent Task Group ${agentLine(m[1])}): ${agentLine(m[2])}`);
        else ch.push(`- Context row REMOVED: ${agentLine(r.path)}`);
      }
      const touched = keys.filter((r) => !was.has(r.k) || was.get(r.k).h !== r.h);
      if (touched.length) {
        const plan = this._ctxPlan(t, 2400, { ctxBase, gid, only: new Set(touched.map((r) => r.k)) });
        ch.push(`- Context row${touched.length > 1 ? 's' : ''} ${touched.every((r) => !was.has(r.k)) ? 'ADDED' : 'ADDED or CHANGED'} — as told now:`, ...plan.lines.map((l) => '  ' + l));
      }
      bits.push('context table changed');
    }
    if (oldSig !== newSig && this._hasTold(t)) {
      // Signature format is path:size:mtime joined by | (contextSignature — absolute paths; a legacy
      // contextDirSignature's are relative to the notes folder; % and | escaped there) — peel size:mtime off the END
      // so paths containing ':' stay intact, then unescape the path.
      const parseSig = (s) => {
        const m = new Map();
        for (const e of String(s || '').split('|')) {
          if (!e) continue;
          const i = e.lastIndexOf(':'); if (i < 0) continue;
          const j = e.lastIndexOf(':', i - 1); if (j < 0) continue;
          m.set(e.slice(0, j).replace(/%7C/g, '|').replace(/%25/g, '%'), e.slice(j));
        }
        return m;
      };
      const a = parseSig(oldSig), b = parseSig(newSig);
      const notesAbs = this.contextDirOf(t);
      const abs = (p) => (p.startsWith('/') ? p : notesAbs ? notesAbs + '/' + p : p);
      const changed = new Map();   // told item → { upd, add, del } (paths relative to the row)
      const told = this._toldRows(t).filter((it) => !it.head && !it.gone && it.x && it.x.abs && (it.x.kind === 'dir' || it.x.kind === 'file'));
      // a path may sit under several rows (a folder row and a file row inside it) — each row hears it at its own depth
      const itemsOf = (p) => told.filter((it) => (it.x.kind === 'file' ? p === it.x.abs : p.startsWith(it.x.abs + '/')));
      const note = (p, kind) => {
        const ap = abs(p);
        for (const it of itemsOf(ap)) {
          if (!changed.has(it)) changed.set(it, { upd: [], add: [], del: [] });
          changed.get(it)[kind].push(it.x.kind === 'file' ? '' : ap.slice(it.x.abs.length + 1));
        }
      };
      for (const k of b.keys()) if (a.has(k) && a.get(k) !== b.get(k)) note(k, 'upd');
      for (const k of b.keys()) if (!a.has(k)) note(k, 'add');
      for (const k of a.keys()) if (!b.has(k)) note(k, 'del');
      for (const [it, c] of changed) {
        // a file told by its CONTENTS changed ⇒ the agent needs the new text: the full delivery re-tells it
        const lvl = TC.chosenTell(it.row, it.x.kind);
        const keys = (it.row.keys || TC.KEY_FILES).map((k) => k.toLowerCase());
        const told1 = (rel) => lvl === 'contents' || (lvl === 'index' && !rel.includes('/') && keys.includes(rel.toLowerCase()));
        if ([...c.upd, ...c.add, ...c.del].some(told1)) return null;
      }
      for (const [it, c] of changed) {
        if (it.x.kind === 'file') {
          // a file row told by name: its folder row (if any) names the change, else its own line does
          if ([...changed.keys()].some((o) => o !== it && o.x.kind === 'dir' && it.x.abs.startsWith(o.x.abs + '/'))) continue;
          ch.push(`- ${agentLine(this._shown(it.x, ctxBase, notesAbs))} — ${c.del.length ? 'removed' : c.add.length ? 'is there now' : 'updated'}`);
          if (!bits.includes('shared files changed')) bits.push('shared files changed');
          continue;
        }
        const shown = this._shown(it.x, ctxBase, notesAbs);
        const isNotes = notesAbs && it.x.abs === notesAbs;
        const list = (arr) => arr.slice(0, 8).map((p) => `${agentLine(shown)}${p ? '/' + agentLine(p) : ''}`).join(', ') + (arr.length > 8 ? ` (+${arr.length - 8} more)` : '');
        const fbits = [];
        if (c.upd.length) fbits.push(`updated ${list(c.upd)}`);
        if (c.add.length) fbits.push(`new ${list(c.add)}`);
        if (c.del.length) fbits.push(`removed ${list(c.del)}`);
        if (fbits.length) { ch.push(isNotes ? `- Shared context folder files — ${fbits.join('; ')}` : `- Files under ${agentLine(shown)} — ${fbits.join('; ')}`); if (!bits.includes('shared files changed')) bits.push('shared files changed'); }
      }
    }
    const fresh = (t.progress || []).filter((p) => p.at > (snap.lastProgressAt || 0));
    let act = null;
    if (fresh.length) {
      const pick = this.renderNewActivity(t, fresh, { sessionKey, sessionName, snap });
      const lines = pick(ACTIVITY_ROOM);
      if (lines.length) { act = { from: ch.length, room: ACTIVITY_ROOM, pick }; ch.push(...lines); bits.push(`${fresh.length} new activity`); }
    }
    const out = { lines: ch, bits };
    // the activity section's RE-PICK (F1) rides the result unenumerated: a block over its cap shrinks it by a smaller room
    // (renderDiffBlock / renderContextDiffMulti) — the result's shape stays { lines, bits }
    if (act) Object.defineProperty(out, 'act', { value: act });
    return out;
  }

  // THE NEW ACTIVITY OF AN UPDATE (lane injection-relevance, 2026-10-24). The owner asked whether a member's model can
  // fail to learn that something it needs EXISTS; the injection audit replayed the store through these renderers: half of
  // the other sessions' lines logged inside a member's span never reached it (97 % to the count of 8, which sat at the
  // cadence's p90), a sixth of the lines ADDRESSED to it among them, a third of the 8 slots repeating its OWN lines.
  // Inside the same 8 lines / 2200 B now: the member's own lines are COUNTED, never repeated; the others' are RANKED —
  // 0 addressed to it (its key or uuid head, its name — whole, or an identifier-like word of it: a peer writes
  // `injection-relevance` for «lane injection-relevance» — a backlog id it parked or claims), 1 group-wide (an ask /
  // blocked / needs-input word, an open HIGH id), 2 the rest, 3 a cleared entry (its words are gone) — newest first inside
  // a rank; a line that does not fit is SKIPPED (never `break`); the picked ones print in TIME order. Every session left
  // out is NAMED above them (≤ 6 digest lines + ONE overflow line; a cleared entry is never quoted — a clear is not news):
  // existence before text, so any cut takes text first. Returns pick(room) → the section's lines ([] when only the
  // member's own lines are new); a block over its cap re-picks under a smaller room (F1: the lowest-ranked, oldest go).
  renderNewActivity(t, fresh, { sessionKey = null, sessionName = '', snap = null } = {}) {
    const key = sessionKey ? String(sessionKey) : '';
    const needles = [];
    if (key) {
      needles.push(key.toLowerCase());
      const head = /^[0-9a-z]{8}/i.exec(key.slice(key.indexOf(':') + 1));
      if (head) needles.push(head[0].toLowerCase());
    }
    const name = String(sessionName || '').trim().toLowerCase();
    if (name.length >= 3) needles.push(name, ...name.split(/\s+/).filter((w) => w !== name && w.length >= 5 && /[-_0-9]/.test(w) && /^[a-z0-9._-]+$/.test(w)));
    const its = (b) => !!key && (b.addedBy === key || (b.claimedBy || []).includes(key));
    const mine = new Set([...(t.backlog || []), ...((snap && snap.backlog) || [])].filter((b) => b && b.id && its(b)).map((b) => String(b.id).toLowerCase()));
    const highs = new Set((t.backlog || []).filter((b) => b.id && (b.status || 'open') === 'open' && normalizePriority(b.priority) === 'high').map((b) => String(b.id).toLowerCase()));
    let own = 0;
    const rows = [];
    fresh.forEach((p, i) => {
      if (key && p.session === key) { own++; return; }
      const raw = String(p.note || '');            // per-entry cap so one long
      const clipped = raw.length > 200;            // note can't starve the diff
      const note = agentLine(raw, clipped ? 200 : 0); // clean slice (CJK has no spaces); the belt cuts BEFORE it judges (verify r4 F1)
      const tail = ` ${note}${(p.detail || clipped) ? ' †' : ''}${p.session ? ` _(${p.session})_` : ''}`;
      let rank = 3;
      if (!p.clearedAt) {
        const text = (raw + '\n' + String(p.detail || '')).slice(0, 4000).toLowerCase();
        const ids = text.match(/\bb-[0-9a-f]{4,8}\b/g) || [];
        rank = needles.some((n) => text.includes(n)) || ids.some((x) => mine.has(x)) ? 0
          : GROUP_WIDE_RE.test(text) || ids.some((x) => highs.has(x)) ? 1 : 2;
      }
      rows.push({ i, p, rank, tail, min: Buffer.byteLength(tail, 'utf-8') + 5, line: null, len: 0 });   // min: the line's bytes before its time
    });
    if (!rows.length) return () => [];
    const order = rows.slice().sort((a, b) => a.rank - b.rank || b.i - a.i);
    // the time is formatted only for a row that may still fit, once (the owner's-clock format costs ~0.15 ms a line:
    // a 500-line burst spent ~55 ms on lines it never printed)
    const lineOf = (r) => { if (r.line === null) { r.line = `  - ${this._tsShort(r.p.at)}${r.tail}`; r.len = Buffer.byteLength(r.line, 'utf-8') + 1; } return r.len; };
    return (room) => {
      const told = new Set();
      for (const r of order) { if (told.size >= 8) break; if (r.min > room || lineOf(r) > room) continue; told.add(r); room -= r.len; }
      const bySession = new Map();
      for (const r of rows) {
        if (told.has(r)) continue;
        const k = r.p.session || '';
        let g = bySession.get(k);
        if (!g) bySession.set(k, (g = { k, n: 0, addressed: 0, best: 9, last: -1, quote: null }));
        g.n++; if (r.rank === 0) g.addressed++;
        g.best = Math.min(g.best, r.rank); g.last = Math.max(g.last, r.i);
        if (!r.p.clearedAt) g.quote = r;   // rows run oldest → newest: the last one kept is its newest
      }
      const sessions = [...bySession.values()].sort((a, b) => a.best - b.best || b.last - a.last);
      const digest = sessions.slice(0, 6).map((g) => `  - ${g.k || 'unattributed'} logged ${g.n} more${g.addressed ? ` (${g.addressed} addressed to you)` : ''}${g.quote ? ` — newest: "${agentLine(g.quote.p.note, 48)}"` : ''}`);
      const rest = sessions.slice(6);
      if (rest.length) {
        const n = rest.reduce((a, g) => a + g.n, 0), addressed = rest.reduce((a, g) => a + g.addressed, 0);
        digest.push(`  - … ${n} more from ${rest.length} other session${rest.length === 1 ? '' : 's'}${addressed ? ` (${addressed} addressed to you)` : ''}`);
      }
      const picked = rows.filter((r) => told.has(r)).map((r) => r.line);
      const first = [...told].filter((r) => r.rank === 0).length;
      const more = rows.length - told.size;
      const head = `- New activity (${fresh.length}${own ? `, ${own} of them yours — not repeated` : ''})${more ? ` — ${told.size} told${first ? ` (${first} addressed to you first)` : ''}, ${more} more below by session` : ''}:${picked.some((l) => l.includes(' †')) ? '  _(† = has detail)_' : ''}`;
      return [head, ...digest, ...picked];
    };
  }

  // ONE group's delta as a standalone <vibespace-task-update> block.
  // Back-compat single-group API: computes + renders. Returns null (fall back
  // to full) / '' (no-op change, skip) / the block.
  renderContextDiff(id, snap, { multi = false, ctxBase = null, oldSig = '', newSig = '', sessionKey = null, sessionName = '' } = {}) {
    const gid = multi ? `--group ${id} ` : '';
    const r = this.diffChanges(id, snap, { gid, ctxBase, oldSig, newSig, sessionKey, sessionName });
    if (r === null) return null;
    if (!r.lines.length) return '';
    return this.renderDiffBlock(id, r, { multi, ctxBase });
  }

  // Render a single group's precomputed diffChanges result as a block.
  renderDiffBlock(id, changes, { multi = false, ctxBase = null, cap = 5000 } = {}) {
    const t = this.get(id);
    const notesAbs = this.contextDirOf(t);
    const gid = multi ? `--group ${t.id} ` : '';
    let ch = changes.lines.slice(); // cap loop mutates
    const head = [
      '<vibespace-task-update>',
      // TASK.md pointer is LOCAL-only: the remote ctx rsync excludes
      // .vibespace/, so <ctxBase>/.vibespace/TASK.md never exists on a host.
      `Task Group "${agentLine(t.title)}" (${t.id}) changed since your last update — DELTAS ONLY below; everything else you already know still stands. Full current state: \`vibespace-task ${gid}show --full\`${notesAbs && !ctxBase ? ` (or \`${agentLine(notesAbs)}/.vibespace/TASK.md\`)` : ''}.`,
      '',
    ];
    // Hard cap ~5KB (`cap`: less when the route fits the block into what is left). The activity sits last = the safest
    // to lose, and it shrinks FIRST by a RE-PICK under a smaller room (F1, lane injection-relevance: its lowest-ranked,
    // OLDEST lines go — a pop from the end took the NEWEST — and the digest naming every session left out stays); only
    // then are change lines dropped from the END (the full-state pointer in the header always survives).
    const act = changes.act;
    const over = () => Buffer.byteLength([...head, ...ch, '</vibespace-task-update>'].join('\n'), 'utf-8') - cap;
    for (let room = act ? act.room : 0; room > 0 && over() > 0;) {
      room = Math.max(0, room - Math.max(128, over()));
      ch = [...changes.lines.slice(0, act.from), ...act.pick(room)];
    }
    let dropped = 0;
    let lines = [...head, ...ch, '</vibespace-task-update>'];
    while (Buffer.byteLength(lines.join('\n'), 'utf-8') > cap && ch.length > 1) {
      ch.pop(); dropped++;
      lines = [...head, ...ch, `- … (+${dropped} more lines — \`vibespace-task ${gid}show --full\`)`, '</vibespace-task-update>'];
    }
    return lines.join('\n');
  }

  // SEVERAL groups changed on one turn → ONE combined block, LAYERED like
  // renderMultiContext (same directive class as 2.68.0): stacking per-group
  // blocks one after another meant a ~2KB persisted-preview truncation could
  // show ONLY the first group — the agent never learned the FACT that a second
  // group also changed (user directive). The HEADER enumerates every changed
  // group with a phrase summary, so truncation can only cost details, never
  // the existence of a group's update; per-group sections follow SMALLEST
  // FIRST (a big group's bulk truncates last, and the tail-drop hits it first).
  // items: [{ id, changes }] from diffChanges, each with non-empty lines.
  renderContextDiffMulti(items, { cap = 6500 } = {}) {
    const metas = items
      .map((it) => ({ ...it, t: this.get(it.id), size: Buffer.byteLength(it.changes.lines.join('\n'), 'utf-8') }))
      .sort((a, b) => a.size - b.size);
    const enumStr = metas.map((m) => `"${agentLine(m.t.title)}" (${m.t.id}): ${m.changes.bits.join(' + ') || 'changed'}`).join(' · ');
    const head = [
      '<vibespace-task-update>',
      `${metas.length} of your Task Groups changed since your last update — DELTAS ONLY below; everything else you already know still stands. Changed: ${enumStr}. Full state per group: \`vibespace-task --group <id> show --full\`.`,
    ];
    let body = [];
    const build = () => { body = []; for (const m of metas) body.push('', `## "${agentLine(m.t.title)}" (${m.t.id})`, ...(m.lines || m.changes.lines)); };
    build();
    // Cap ~6.5KB total (`cap`: less when the route fits the block into what is left). F1 (lane injection-relevance): the
    // biggest group's activity (it sits last) is RE-PICKED under a smaller room first, then the next group's — the
    // lowest-ranked, OLDEST lines go, never the newest, each digest stays. Only then are body lines dropped from the END;
    // a section emptied down to its heading loses the heading too. The enumeration header always survives, so no
    // group's update can vanish.
    const size = () => Buffer.byteLength([...head, ...body, '</vibespace-task-update>'].join('\n'), 'utf-8');
    for (let i = metas.length - 1; i >= 0 && size() > cap; i--) {
      const m = metas[i], act = m.changes.act;
      for (let room = act ? act.room : 0; room > 0 && size() > cap;) {
        room = Math.max(0, room - Math.max(128, size() - cap));
        m.lines = [...m.changes.lines.slice(0, act.from), ...act.pick(room)];
        build();
      }
    }
    let lines = [...head, ...body, '</vibespace-task-update>'];
    let over = false;
    while (Buffer.byteLength(lines.join('\n'), 'utf-8') > cap && body.length > 3) {
      body.pop(); over = true;
      while (body.length && (body[body.length - 1].startsWith('## ') || body[body.length - 1] === '')) body.pop();
      lines = [...head, ...body, `- … (truncated — per-group \`vibespace-task --group <id> show --full\`)`, '</vibespace-task-update>'];
    }
    return lines.join('\n');
  }

  // Reverse lookup: every NON-archived Task Group this session belongs to, by
  // (a) explicit membership (sessions[] holds its key), (b) an auto-include
  // folder matching its cwd, or (c) the group it was spawned into
  // (initialGroupId — covers the window before the async UI bind lands).
  // lane new-session-form: the New Session form spawns into SEVERAL groups —
  // `initialGroupIds` is that LIST (selection order; the session's
  // `_initialGroupIds`), joined with the single `initialGroupId` older callers
  // pass. Belonging is LIVE: a UI bind/drag or a folder change takes effect on the
  // agent's next turn with no respawn (fixes the old bind≠context gap). Returns
  // full task objects, stable order.
  //
  // lane groups-sweep-on-change commit 2 — MEMBERSHIP IS AN INDEX. Callers ask per prompt (agent-routes prompt-context,
  // server.js ctxGroupsOf), per roster build × every live session (roster-pass), per agent call / route (task-context,
  // resolveAgentGroup, jobs, msg endpoints — every session per send) and per grant / mount check (mounts-plugins-wiring,
  // spawn caps, automations, peer cards, apps access); the walk below looped every group per call and, per group, built
  // the Context rows' cache key by serializing them. The index (_memberIndex) holds what membership reads, once per store
  // revision: the unarchived groups in the answer's order, each one's session-key Set and its resolved discover folders,
  // and a result map keyed by the call's own strings. Its truth:
  //  · the store moved (rev) ⇒ memberSig is asked: what membership reads unchanged ⇒ the index stays (a progress line
  //    every few seconds costs one signature, not a rebuild); changed ⇒ rebuilt;
  //  · a group's folders are the ones _res holds NOW: the index keeps the very cache entry they came from and re-derives
  //    them when that entry is gone or past its 4 s bound — a folder created on disk is seen within it, as by the walk;
  //  · the result map is bounded (MEMBER_RESULTS_MAX) and dropped when the store or a folder list moves;
  //  · ON ANY DOUBT THE WALK ANSWERS, said nowhere: a call shape the index does not key (a non-string key / cwd), a record
  //    that is not an object or whose createdAt is not a number, any throw while the index is read or built. A stat that
  //    throws, a symlink loop, a cwd that no longer exists are the walk's own answers (_kindOf ⇒ missing, the realpath ⇒
  //    the cwd alone) — the index reads the same _res / _realOf, so it gives them; never a throw into a grant check.
  //
  // B-df5f — A FOLDER IS RESOLVED ON THE MACHINE IT BELONGS TO, OR NOT AT ALL: `hostId` (the session's machine, a parameter —
  // never a branch on which machine) names a conversation of ANOTHER machine; its cwd is matched as written (or by a
  // `realCwd` its own machine resolved), never through the hub's realpath — a path of the other machine that exists on the
  // hub as a symlink would resolve to the hub's target and match a group it should not (or miss one).
  groupsForSession(args = {}) {
    let ans = null;
    try { ans = this._memberAnswer(args || {}); } catch { ans = null; }   // a doubt: the walk answers
    if (ans) this._mixStats.answers++;
    else { this._mixStats.walks++; ans = this._groupsForSessionWalk(args); }
    // B-55dc THE LAW «nobody loses anything on an answer still being read»: the answer says, as a NON-enumerable flag,
    // whether a path it depended on is not read yet — a site that would REVOKE / END / DROP on «not a member» does
    // nothing while it is up and re-judges at the store's signal when the read lands (a grant may refuse: it is asked again)
    if (Array.isArray(ans) && this.membershipUnread(args)) { Object.defineProperty(ans, 'unread', { value: true, enumerable: false }); this._handedUnread = true; }
    return ans;
  }

  /** B-55dc: the member groups' IDS, carrying the drawing door's `unread` flag (a `.map` would drop it) — server.js's two
   *  synchronous wrappers (the exit's and the window reach's `groupsOf`) read this, so a re-judge there can keep */
  memberIds(args = {}) {
    const gs = this.groupsForSession(args) || [];
    const ids = gs.map((g) => g.id);
    if (gs.unread) Object.defineProperty(ids, 'unread', { value: true, enumerable: false });
    return ids;
  }

  /** B-55dc: does THIS ask's answer depend on a path not read yet? (a cwd whose realpath, or a discover group whose row,
   *  has no fact yet — every such read is started by the asking). A key alone depends on no file fact ⇒ false. */
  membershipUnread(args = {}) {
    const a = args || {};
    if (typeof a.cwd !== 'string' || !a.cwd) return false;
    // the ROWS half (a relative discover row whose candidates are not read) does not depend on the cwd — any such row could
    // move any cwd's answer (a safe over-flag: a keeping site keeps a little longer, never revokes on it): kept per landed
    // facts (gen) and store rev
    const gen = this._mfacts.gen(), rev = this.rev();
    let r = this._rowsUnread;
    if (!r || r.gen !== gen || r.rev !== rev) {
      let v = false;
      try { v = this._memberNeeds({}, { rowsOnly: true }).length > 0; } catch { v = false; }
      r = this._rowsUnread = { gen: this._mfacts.gen(), rev, v };
    }
    if (r.v) return true;
    // the CWD half: its realpath not read yet AND it could add a group (the rule _memberNeeds applies) — kept per cwd. A
    // conversation of ANOTHER machine (B-df5f: `hostId`) takes no hub realpath at all, so its cwd is never flagged for one
    if (a.realCwd || onOtherMachine(a.hostId) || !path.isAbsolute(a.cwd) || DOOR.blocked(a.cwd) || SP.storageRootOf(a.cwd)) return false;
    if (this._mfacts.real(a.cwd) !== undefined) return false;   // read already (the asking started it)
    const c = this._cwdMatters || (this._cwdMatters = new Map());
    const hit = c.get(a.cwd);
    if (hit && hit.gen === gen && hit.rev === rev) return hit.v;
    let v = false;
    try {
      const discover = (x) => x && Array.isArray(x.tags) && x.tags.includes('discover');
      v = Object.values((this._state && this._state.tasks) || {}).some((t) => t && typeof t === 'object' && !t.archived && this._ctxRows(t).some(discover) && !this.foldersOf(t).some((f) => insideFolder(a.cwd, f)));
    } catch { v = false; }
    if (c.size >= 4096) c.clear();
    c.set(a.cwd, { gen, rev, v });
    return v;
  }



  get _mixStats() { return this.__mixStats || (this.__mixStats = { builds: 0, kept: 0, answers: 0, walks: 0, hits: 0, cleared: 0, waited: 0, bounded: 0, unknownNow: 0, moves: 0, settles: 0 }); }
  memberIndexStats() { const ix = this._mix; return { ...this._mixStats, results: ix ? ix.results.size : 0, max: MEMBER_RESULTS_MAX }; }

  _memberIndex() {
    const tasks = this._state && this._state.tasks;
    if (!tasks || typeof tasks !== 'object') return null;
    const rev = this.rev(), now = Date.now();
    let ix = this._mix;
    if (ix && (ix.tasks !== tasks || ix.rev !== rev)) {
      // …and every record it answers with is still the store's own object (an import may replace one with an equal copy)
      if (ix.tasks === tasks && memberSig(tasks) === ix.sig && ix.groups.every((g) => tasks[g.key] === g.t)) { ix.rev = rev; this._mixStats.kept++; }
      else ix = this._mix = null;
    }
    if (!ix) {
      const groups = [];
      for (const [key, t] of Object.entries(tasks)) {
        if (!t || typeof t !== 'object') return null;
        if (t.archived) continue;
        if (!(t.createdAt == null || Number.isFinite(t.createdAt))) return null;
        groups.push({ key, t, sessions: new Set(Array.isArray(t.sessions) ? t.sessions : []), rows: this._ctxRows(t).length > 0, resKey: null, resEntry: null, dirs: [], fsig: '' });
      }
      groups.sort((a, b) => (a.t.createdAt || 0) - (b.t.createdAt || 0));
      ix = this._mix = { tasks, rev, sig: memberSig(tasks), groups, results: new Map() };
      this._mixStats.builds++;
    }
    let moved = false;
    for (const g of ix.groups) {
      if (!g.rows) continue;   // no rows ⇒ no folders (the walk's _res answers [] there, uncached)
      const e = g.resKey !== null && this._mresCache ? this._mresCache.get(g.resKey) : undefined;
      if (e !== undefined && e === g.resEntry && e.gen === this._mfacts.gen() && now - e.at < 4000) continue;
      g.dirs = this.memberFoldersOf(g.t);   // B-06de: machine-scoped rows
      g.resKey = this._resKey(this._ctxRows(g.t));
      g.resEntry = this._mresCache ? this._mresCache.get(g.resKey) : undefined;
      const fsig = JSON.stringify(g.dirs);
      if (fsig !== g.fsig) { if (g.fsig) (this._movedIds || (this._movedIds = new Set())).add(g.t.id); g.fsig = fsig; moved = true; }
    }
    if (moved && ix.results.size) ix.results.clear();
    return ix;
  }

  _memberAnswer({ sessionKey, cwd, realCwd, hostId, initialGroupId, initialGroupIds } = {}) {
    for (const v of [sessionKey, cwd, realCwd, hostId]) if (v != null && typeof v !== 'string') return null;   // a shape the index does not key
    const ix = this._memberIndex();
    if (!ix) return null;
    const spawned = [...new Set([...(Array.isArray(initialGroupIds) ? initialGroupIds : []), initialGroupId].filter((x) => typeof x === 'string' && x))].sort();
    const real = this._realHere(cwd, realCwd, hostId);
    const cwds = [cwd, real && real !== cwd ? real : null].filter(Boolean);
    const key = JSON.stringify([sessionKey || '', cwds, spawned]);
    const hkey = onOtherMachine(hostId) ? `${key}\u0001${hostId}` : key;   // B-06de: the machine is part of the answer
    let hit = ix.results.get(hkey);
    if (hit) this._mixStats.hits++;
    else {
      const sp = new Set(spawned);
      hit = ix.groups.filter((g) => (sessionKey && g.sessions.has(sessionKey)) || sp.has(g.t.id) || (cwds.length > 0 && g.dirs.some((f) => folderOnHost(f, hostId) && cwds.some((c) => insideFolder(c, f)))));
      if (ix.results.size >= MEMBER_RESULTS_MAX) { ix.results.clear(); this._mixStats.cleared++; }
      ix.results.set(hkey, hit);
    }
    return hit.map((g) => g.t);
  }

  /** B-df5f: the cwd's realpath — the hub's own (`_realOf`) for a conversation of THIS machine; for one of another machine
   *  (`hostId`, task-membership onOtherMachine: 'local' is the hub) only a `realCwd` that machine resolved itself — handed, or
   *  the one its discovery said (B-16d7, hostRealOf) — else none (the cwd is matched as written). */
  _realHere(cwd, realCwd, hostId) {
    if (!onOtherMachine(hostId)) return this._realOf(cwd, realCwd);
    if (realCwd) return realCwd;
    let r = null; try { r = this._hostRealOf(hostId, cwd); } catch { r = null; }
    return typeof r === 'string' && r ? r : null;
  }

  // Match a folder against the cwd AND its symlink-resolved realpath (a session
  // opened under claude-code-webui → vibespace must match a folder on either).
  // The realpath is read ONCE per cwd, OFF the loop (B-55dc: it was a fs.realpathSync per new cwd on the main thread — this
  // runs per prompt): before that read lands the cwd alone matches; the deciding door waits for it (groupsForSessionDecided).
  _realOf(cwd, realCwd) {
    let real = realCwd;
    if (!real && cwd) {
      if (DOOR.blocked(cwd)) real = null;   // B-afc4: a dead FUSE — never read; resolved once it answers
      else if (SP.storageRootOf(cwd)) real = null;   // lane hub-fuse-sync-guard: never a walk into a storage mount — the cwd itself matches
      else { const r = this._mfacts.real(cwd); real = r === undefined ? null : r; }
    }
    return real;
  }

  // ── B-55dc: THE TWO DOORS ────────────────────────────────────────────────────────────────────────────────────────────
  // groupsForSession is THE DRAWING DOOR: synchronous, no file call — the last off-loop facts; before a path's first read
  // a rooted discover row counts as a folder, a relative row stops at its first candidate, the cwd matches without its
  // realpath. groupsForSessionDecided is THE DECIDING DOOR, for whatever decides what an agent is TOLD or ALLOWED (the
  // hooks' injection, the agent doors, the spawn road): it first WAITS — a promise, never the loop — for the first read
  // of every path this ask needs that was never read, then answers as the release did from the very first ask. The wait
  // is bounded (DECIDE_BOUND_MS): a mount that does not answer gets the «reading» answer when it passes (where the release
  // held the whole hub while the mount hung) — a fact whose read FAILED and waits its back-off gets it at once (cure r2) —
  // and the group's rules arrive at the next hook by the seen marks.
  /** THE DECIDING DOOR's wait alone, for a synchronous route that re-enters itself (agent-routes' hooks): null when this
   *  ask needs no first read (the route goes straight on, synchronously), else the promise of the bounded wait. */
  membershipRead(args = {}, { boundMs = DECIDE_BOUND_MS } = {}) {
    let keys = [];
    try { keys = this._memberNeeds(args || {}); } catch { keys = []; }
    return keys.length ? this.groupsForSessionDecided(args, { boundMs }).then(() => true, () => false) : null;
  }

  async groupsForSessionDecided(args = {}, { boundMs = DECIDE_BOUND_MS } = {}) {
    const a = args || {};
    const until = Date.now() + Math.max(0, Number(boundMs) || 0);
    for (let round = 0; round < 8; round++) {   // a relative row asks its next candidate only once the previous one answered
      let keys = [];
      try { keys = this._memberNeeds(a); } catch { keys = []; }
      if (!keys.length) break;
      const left = until - Date.now();
      const all = left > 0 ? await this._mfacts.wait(keys, left) : false;
      // only keys waiting their back-off (no read in flight): the «reading» answer AT ONCE, never the whole bound (cure r2)
      if (all === null) { this._mixStats.unknownNow++; break; }
      if (!all) { this._mixStats.bounded++; break; }
      this._mixStats.waited++;
    }
    return this.groupsForSession(a);
  }

  /** The facts THIS ask needs that were never read (their reads started): the cwd's realpath, and every path a discover
   *  group's resolution asks — a rooted row (a file is no folder), each relative candidate, the group's first folder. */
  _memberNeeds({ cwd, realCwd, hostId } = {}, { rowsOnly = false } = {}) {
    if (!rowsOnly && (typeof cwd !== 'string' || !cwd)) return [];   // a key alone needs no file fact
    const discover = (r) => r && Array.isArray(r.tags) && r.tags.includes('discover');
    const groups = Object.values((this._state && this._state.tasks) || {}).filter((t) => t && typeof t === 'object' && !t.archived && this._ctxRows(t).some(discover));
    if (!groups.length) return [];   // no discover row anywhere: no folder can make anyone a member — no file fact matters
    const need = [];
    const local = (p) => typeof p === 'string' && path.isAbsolute(p) && !DOOR.blocked(p) && !SP.storageRootOf(p);
    // THE ROWS: only a RELATIVE discover row's folder depends on what is on disk (its candidates, and the rows that are its
    // bases). A ROOTED discover row matches by its string — a dir, a missing path and «reading» alike, and a file can hold
    // no cwd — so its kind never moves a membership: never read for it
    for (const t of groups) {
      const rows = this._ctxRows(t);
      if (!rows.some((r) => discover(r) && typeof r.path === 'string' && !ROOTED_ROW(r.path))) continue;
      TC.resolveRows(rows, { home: this._home, kindOf: (p) => { const k = this._memberKindOf(p); if (k === 'reading' && local(p)) need.push(['stat', p]); return k; } });
    }
    if (rowsOnly) return need;
    // THE CWD's REALPATH can only ADD a group whose folders do not already hold the cwd itself: read it only then — and
    // only for a conversation of the hub (B-df5f _realHere: another machine's cwd is matched as written, never read here)
    if (!realCwd && !onOtherMachine(hostId) && local(cwd) && groups.some((t) => !this.foldersOf(t).some((f) => insideFolder(cwd, f))) && this._mfacts.real(cwd) === undefined) need.push(['realpath', cwd]);
    return need;
  }


  /** a landed fact that differs from the kept one: when it MOVES a membership answer — a discover group's folders changed,
   *  or a cwd's realpath (a symlinked cwd) landed — the store's own change signal goes out ONCE (coalesced into one tick):
   *  a page that drew the «reading» answer redraws without anyone asking. A first read that moves nothing says nothing —
   *  but the settle below; a first read that FAILS calls here too (`v` undefined, cure r2), for that settle alone. */
  /** B-16d7: another machine's real folders moved (its discovery's R facts, src/hosts.js) — the groups each one adds or takes are
   *  named and the change fans out (onChange: the exit re-judge, the roster), as a landed realpath of this machine's own does */
  hostRealMoved(pairs, hostId = null) { for (const [c, r] of Array.isArray(pairs) ? pairs : []) if (typeof c === 'string' && typeof r === 'string') this._memberMoved('realpath', c, r, hostId); }   // the pairs' machine (B-06de × B-16d7)
  _memberMoved(op, p, v, host = null) {   // `host`: the machine whose real folder moved (none = the hub's own, member-facts)
    const pend = this._mmPending || (this._mmPending = { real: [] });
    if (op === 'realpath' && v != null && v !== p) pend.real.push([p, v, host]);   // a symlinked cwd: the groups its realpath ADDS are named at the flush
    if (this._mmTimer) return;
    this._mmTimer = setImmediate(() => {
      this._mmTimer = null;
      const reals = (this._mmPending && this._mmPending.real) || []; this._mmPending = null;
      try { this._memberIndex(); } catch { }   // re-derives every discover group from the landed facts (no file call)
      const moved = new Set(this._movedIds || []); this._movedIds = null;
      // a symlinked cwd's realpath can only ADD the groups whose folders hold the real path and not the cwd — named, never
      // «every group» (the readers' should: a null signal pushed every group's delta to every page)
      for (const [cwd, rp, host] of reals) {
        for (const t of Object.values((this._state && this._state.tasks) || {})) {
          if (!t || typeof t !== 'object' || t.archived) continue;
          const fo = this.memberFoldersOf(t).filter((f) => folderOnHost(f, host));   // B-06de × B-16d7 (the meeting, LAW): only the rows on THAT machine — a far machine's moved folder never names a hub row's group, nor the hub's a far row's
          if (fo.some((f) => insideFolder(rp, f)) && !fo.some((f) => insideFolder(cwd, f))) moved.add(t.id);
        }
      }
      const ids = [...moved];
      // a settle waits for the last FIRST read in flight (cure r1, MUST 3: the re-derive's own re-reads of known facts do not
      // count) — a relative row's next candidate, a cwd's realpath still on its way keep the flag for the landing that ends them
      const handed = !!this._handedUnread && !this._mfacts.pending();
      if (handed || ids.length) this._handedUnread = false;
      if (ids.length) { this._mixStats.moves++; this._notify(ids); }
      // an answer handed out «still being read» is read now and moved nothing: the sites that KEPT on it re-judge (the same
      // signal, naming no group — nothing is broadcast to a page); a re-judge that asks again re-arms it until all is read
      else if (handed) { this._mixStats.settles++; this._notify([]); }
    });
    if (this._mmTimer && typeof this._mmTimer.unref === 'function') this._mmTimer.unref();
  }

  // THE WALK — membership as it was asked before the index, kept as the index's answer on any doubt and as its
  // equality pin (scripts/test-groups-sweep-on-change.mjs: every call shape ≡ the walk over seeded stores)
  _groupsForSessionWalk({ sessionKey, cwd, realCwd, hostId, initialGroupId, initialGroupIds } = {}) {
    const spawnedInto = new Set([...(Array.isArray(initialGroupIds) ? initialGroupIds : []), initialGroupId].filter((x) => typeof x === 'string' && x));
    const real = this._realHere(cwd, realCwd, hostId);
    const cwds = [cwd, real && real !== cwd ? real : null].filter(Boolean);
    const out = [];
    for (const t of Object.values(this._state.tasks)) {
      if (t.archived) continue;
      let member = false;
      if (sessionKey && Array.isArray(t.sessions) && t.sessions.includes(sessionKey)) member = true;
      if (!member && spawnedInto.has(t.id)) member = true;
      if (!member && cwds.length) {
        for (const f of this.memberFoldersOf(t)) {   // lane task-group-context: the 自动发现会话 rows (recursive) — B-06de: of the conversation's OWN machine
          if (folderOnHost(f, hostId) && cwds.some((c) => insideFolder(c, f))) { member = true; break; }
        }
      }
      if (member) out.push(t);
    }
    return out.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  // Injection payload for a session across N groups. 0 → '' (caller falls back
  // to the baseline tools intro). 1 → the normal single-group context. N → each
  // group's context, prefaced so the agent knows it spans multiple 岗位 and must
  // use `--group <id>` to act on a specific one.
  renderMultiContext(groupIds, { ctxBaseFor = null, sessionKey = null, tools = null, isLiveClaim = null, fileTools = undefined, cap = 0 } = {}) {
    const ids = (groupIds || []).filter((id) => this._state.tasks[id] && !this._state.tasks[id].archived);
    if (!ids.length) return '';
    const baseOf = (id) => (ctxBaseFor ? ctxBaseFor(id) : null);
    if (ids.length === 1) return this.renderContext(ids[0], { ctxBase: baseOf(ids[0]), sessionKey, tools, isLiveClaim, fileTools, cap });
    // LAYERED, not per-group blocks (user directive): tools → ALL identities →
    // ALL shared folders → ALL activity logs. Truncation then degrades by
    // LAYER — the first group's bulk can no longer erase the very EXISTENCE of
    // groups 2..N from a persisted payload's 2KB preview.
    const ts = Object.fromEntries(ids.map((id) => [id, this.get(id)]));
    const titles = ids.map((id) => `"${agentLine(ts[id].title)}" (${id})`).join(', ');
    const now = Date.now();   // B-7960: the zone sentence ONCE, every dateless time below it against the same day
    const head = [
      `<vibespace-task-context>`,
      `This session belongs to ${ids.length} VibeSpace Task Groups (岗位): ${titles}. Their shared state follows in LAYERS (all groups' identities → their Context tables → recent activity)${(!tools || tools.task !== false) ? '; use \`vibespace-task --group <id> …\` to act on a specific group' : ''}. ${OF.zoneSentence(now)}`,
      this._persistRescueLine(),
    ];
    head.push(...this._toolsSectionParts('--group <id> ', true, tools, fileTools));
    head.push('', '## Your Task Groups');
    // ONE text budget for every group's unclaimed-HIGH line — past it, ids
    // only — and ONE for every group's claimed-item lines (short clips past it)
    const highBudget = { bytes: HIGH_LINE_TEXT_BYTES };
    const mineBudget = { bytes: MINE_LINE_TEXT_BYTES };
    const toldInh = new Set();   // lane lg-group-parents U4: the parents whose rules this injection already told
    const inhRoom = { bytes: INHERITED_RULES_MAX };   // …and ONE room for all of them (the U4 read, 3)
    for (const id of ids) {
      // renderTaskMd's H1/H2 demoted one level so groups nest under the layer heading
      const md = this.renderTaskMd(ts[id], 0, { now }).replace(/\n---\n[\s\S]*$/, '').trim().replace(/^(#{1,2}) /gm, '#$1 ');
      head.push('', md);
      // lane lg-group-parents U4: each group's parents' rules — a parent that is one of this session's own groups, or that an earlier
      // group of it already told, is told ONCE
      const above = this.inheritedRulesOf(ts[id]).filter((a) => toldInh.has(a.id) && !ids.includes(a.id));
      head.push(...this._inheritedRuleLines(ts[id], { skip: new Set([...ids, ...toldInh]), room: inhRoom, toldAbove: above }).map((l) => l.replace(/^## /, '### ')));
      for (const a of this.inheritedRulesOf(ts[id])) toldInh.add(a.id);
      // per-group backlog note (own-parked summary or a one-line pointer)
      const bl = this._backlogNoteLines(ts[id], { gid: `--group ${id} `, sessionKey, tools, isLiveClaim, highBudget, mineBudget, nudge: false })
        .map((l) => l.replace(/^### /, '#### '));
      head.push(...bl);
    }
    // THE cleanup nudge, ONCE for every group over the threshold (one 500 B
    // budget — N per-group paragraphs pushed a 2-group payload past 10 KiB)
    const nudge = this.backlogNudgeFor(ids, sessionKey, { multi: true, tools });
    if (nudge) head.push('', nudge);
    // ── THE CONTEXT TABLES (lane task-group-context): each group's rows at their depths, the room shared — a group
    // takes at most its own budget and an even share of what is left, its unused bytes carried to the next
    const own = new Set(ids);   // lane lg-group-parents: a parent that is one of these groups is told as itself (its rows and rules once)
    const withRows = ids.filter((id) => this._ctxRows(ts[id]).length || this._toldRows(ts[id], { skipFrom: own }).length);
    const withNotes = ids.filter((id) => this.contextDirOf(ts[id]));
    const teach = [];
    if (withNotes.length) {
      teach.push('', `## Shared context folders (each group's shared memory)`, '',
        `Each folder below is that group's SHARED MEMORY between agents (its 记笔记 row in the group's Context table) — every session working the group, now and future, reads it (NOT a place for user-facing deliverables). When you learn something other agents of a group will likely need (conventions, gotchas, decisions and their reasons, cross-role details), organize it into a file in that group's folder yourself, without waiting to be asked — skimmable, factual, dated; prefer updating existing files over piling up new ones. The \`.vibespace/\` subfolder inside each is GENERATED and read-only (its TASK.md mirrors the group state).`);
      for (const id of withNotes) teach.push(`- "${agentLine(ts[id].title)}" → \`${agentLine(baseOf(id) || this.contextDirOf(ts[id]))}\`` + (baseOf(id) ? ' _(live-synced copy, newer file wins, ~1 min lag)_' : ''));
    }
    if (withRows.length) {
      head.push('', `## Context tables (path — note (use); told at each group's chosen depth)`);
      withRows.forEach((id, i) => {
        // the logs keep ~600 B a group (≥ 3 lines each, _pickLogLines)
        const budget = this._budgetFor(head, teach, { share: withRows.length - i, reserve: Math.max(LOG_RESERVE, 600 * ids.filter((g) => (ts[g].progress || []).length).length) });
        const plan = this._ctxPlan(ts[id], budget, { ctxBase: baseOf(id), gid: `--group ${id} `, skipFrom: own });
        head.push('', `### "${agentLine(ts[id].title)}"`, ...plan.lines);   // its id is in the identities layer above
      });
    }
    head.push(...teach);
    const withLog = ids.filter((id) => (ts[id].progress || []).length);
    const memo = new Map();   // F1: a cap's re-picks reuse the rendered lines
    const build = (roomPer, min = 3) => {
      const parts = [...head];
      if (withLog.length) {
        parts.push('', `## Recent activity  _(newest last; \`vibespace-task --group <id> show --full\` prints more; † = has detail)_`);
        for (const id of withLog) {
          const { picked, total } = this._pickLogLines(ts[id], roomPer, now, min, memo);
          parts.push('', `### "${agentLine(ts[id].title)}"` + (picked.length < total ? `  _(${picked.length ? `last ${picked.length} of ${total}` : noneFitWords(total, `--group ${id} `)})_` : ''), ...picked);   // B-9ac8: never «last 0 of N»
        }
      }
      parts.push(`</vibespace-task-context>`);
      return parts.join('\n');
    };
    const headBytes = Buffer.byteLength(head.join('\n'), 'utf-8');
    let roomPer = Math.max(700, Math.floor((8200 - headBytes) / Math.max(1, withLog.length)));
    let out = build(roomPer);
    while (Buffer.byteLength(out, 'utf-8') > 8400 && roomPer > 700) {
      roomPer = Math.max(700, Math.floor(roomPer / 2));
      out = build(roomPer);
    }
    // F1 (lane injection-relevance): over the caller's `cap` every group's log is RE-PICKED under a smaller room — the
    // OLDEST lines go and each heading still counts them; a tail cut of the text would take the last group's NEWEST
    const over = () => Buffer.byteLength(out, 'utf-8') - cap;
    while (cap > 0 && withLog.length && roomPer > 0 && over() > 0) {
      roomPer = Math.max(0, roomPer - Math.max(128, Math.ceil(over() / withLog.length)));
      out = build(roomPer, 0);
    }
    return out;
  }

  // lane task-group-fanout: a write names the groups it touched (`ids`; null = every group) — the hub's ONE broadcaster
  // (src/server/task-fanout.js) sends those groups' DELTA, never the store (1.57 MB to every client per Activity line before)
  /** B-f276 unit B (主开发 r3212): a listener told at EVERY lift of a held store (the family's one notice) → its off */
  onLift(fn) { if (typeof fn !== 'function') return () => { }; (this._liftHooks ||= new Set()).add(fn); return () => this._liftHooks.delete(fn); }
  _notify(ids = null) { this._rev = (this._rev || 0) + 1; this._primeMemberRows(); try { this._onChange({ ids: ids == null ? null : [].concat(ids) }); } catch { } }
  /** B-55dc PRIMING: a store edit (a Context row added or changed) STARTS the off-loop reads membership will need, so a
   *  synchronous asker after it finds them read; no file call here (the reads are promises), nothing when nothing is new */
  _primeMemberRows() { try { if (this._mfacts) this._memberNeeds({}, { rowsOnly: true }); } catch { } }

  _migrateGroups(userState) {
    const groups = userState?.sessionGroups && typeof userState.sessionGroups === 'object' ? userState.sessionGroups : {};
    const folders = userState?.groupFolders && typeof userState.groupFolders === 'object' ? userState.groupFolders : {};
    const names = new Set([...Object.keys(groups), ...Object.keys(folders)]);
    let at = Date.now();
    for (const name of names) {
      const id = this._genId(name);
      this._state.tasks[id] = {
        id,
        title: String(name).slice(0, CAPS.title),
        // Migrated groups become full tasks (user decision 2026-07-05: 把现有的
        // group folders都升级成tasks) — a title-only task behaves like a group
        kind: 'task',
        archived: false,
        attention: null,
        objective: '',
        backlog: [],
        progress: [],
        sessions: sanitizeStrArray(groups[name], 2000),
        ctx: TC.rowsFromLegacy({ folders: sanitizeStrArray(folders[name], 100) }).rows,   // lane task-group-context: the old group folders → 自动发现会话 rows
        color: null,
        injectContext: true,
        createdAt: at,
        updatedAt: at,
      };
      at += 1; // preserve a stable relative order
    }
  }

  _genId(title) {
    const d = new Date();
    const ymd = String(d.getFullYear() % 100).padStart(2, '0')
      + String(d.getMonth() + 1).padStart(2, '0')
      + String(d.getDate()).padStart(2, '0');
    let slug = slugify(title);
    if (!slug) slug = crypto.randomBytes(3).toString('hex'); // CJK / symbols-only titles
    let id = `T-${ymd}-${slug}`;
    while (this._state.tasks[id]) id = `T-${ymd}-${slug}-${crypto.randomBytes(2).toString('hex')}`;
    return id;
  }

  list() {
    return this._withChildIndex(() => Object.values(this._state.tasks)
      .map((t) => this._view(t))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
  }

  /** lane grants-unify: a group's outside visibility AS THE STORE HOLDS IT → `{externalVisibility: 'visible'|'messageable'|null,
   *  externalVisibilityExcept: [principal]}` (the members left out; an unreadable row ⇒ null — opaque). */
  visibilityOf(id) {
    let rows = [];
    try { const g = this._grants(); rows = g ? g.rowsFor('group-visibility', String(id)) : []; } catch { rows = []; }
    const n = rows.length ? GM.normRow(rows[0]) : null;
    if (!n || !n.ok) return { externalVisibility: null, externalVisibilityExcept: [] };
    const e = n.row.to.find((x) => x.kind === 'group' && x.id === String(id));
    return { externalVisibility: e && (e.level === 'visible' || e.level === 'messageable') ? e.level : null, externalVisibilityExcept: n.row.except };
  }
  /** THE ONE WRITER of a group's outside visibility: `{externalVisibility?, externalVisibilityExcept?}` (each absent ⇒ kept).
   *  lane held-except-doors: Closed KEEPS the members left out (an except-only row — they hold again when the group is opened
   *  again; never a silent drop), and `externalVisibilityRemoveExcept` names each one the change takes away (one left out
   *  unnamed ⇒ the ONE writer's `except_unnamed`, thrown with its code). */
  _setVisibility(id, patch) {
    const g = this._grants();
    if (!g) throw new Error('the grants store is not available — the visibility was not changed');
    const cur = this.visibilityOf(id);
    const level = patch.externalVisibility !== undefined ? (['visible', 'messageable'].includes(patch.externalVisibility) ? patch.externalVisibility : null) : cur.externalVisibility;
    const except = patch.externalVisibilityExcept !== undefined ? (Array.isArray(patch.externalVisibilityExcept) ? patch.externalVisibilityExcept : null) : cur.externalVisibilityExcept;
    if (except === null) throw new Error('externalVisibilityExcept must be a list of conversations ({kind:"conversation", key}) and Task Groups');
    const removeExcept = Array.isArray(patch.externalVisibilityRemoveExcept) ? patch.externalVisibilityRemoveExcept : [];
    const w = g.set('group-visibility', String(id), { to: level ? [{ kind: 'group', id: String(id), level }] : [], except, removeExcept }, 'user');
    if (!w.ok) throw Object.assign(new Error(w.error || w.code), { code: w.code });
  }

  // ONE group as the wire carries it (list() / view()) — copies, never the live record.
  // lane task-group-context: the table + where each row points (`ctxRes`, derived); `folders` / `contextDir` are the
  // DERIVED old names (the 'discover' rows, the 'notes' row) — every reader of the wire keeps working, nothing stores them
  _view(t) {
    const rows = this._ctxRows(t), res = this._res(t);
    return {
      ...t, plan: undefined, backlog: (t.backlog || []).map((b) => ({ ...b })), progress: [...(t.progress || [])], sessions: [...(t.sessions || [])],
      ...(Array.isArray(t.parents) ? { parents: [...t.parents] } : {}),   // lane lg-group-parents: a copy, never the live list
      // lane lg-group-parents U5a: the lineage as the store reads it, DERIVED (never stored) — the window draws «继承自 X» and greys
      // a parent pick that would close a cycle from these, so it never re-implements the walk
      ancestors: this.ancestorsOf([t.id]), descendants: this._descendantsOf(t.id),
      ctx: rows.map((r) => ({ ...r, ...(r.tags ? { tags: [...r.tags] } : {}) })),
      ctxRes: res.map((x) => (x.ref ? { ref: true } : { abs: x.abs || null, kind: x.kind, via: x.via || null, ...(x.host ? { host: x.host } : {}), ...(x.kind === 'reading' && NOT_READ_WORDS[this._notReadOf(x.abs)] ? { why: this._notReadOf(x.abs) } : {}) })),   // B-422c: the page words a reader refusal
      folders: TC.discoverFolders(rows, res), contextDir: TC.notesDir(rows, res),
      ...this.visibilityOf(t.id),   // int346: lane grants-unify's outside visibility (rows of the grants store) rides this ONE wire shape
    };
  }
  view(id) { return this._view(this.get(id)); }

  get(id) {
    const t = this._state.tasks[id];
    if (!t) throw new Error('task not found');
    return t;
  }

  // ── THE LINEAGE (lane lg-group-parents, B-91a7 — the owner's four rules of 2026-11-05) ─────────────────────────────────
  // A group may name SEVERAL parents (`parents: [groupId]`, ≤ PARENTS_MAX; rule ①: the union — a DAG, no order, no override).
  // ONE writer (create / update, through _sanitizeParents — a cycle is refused before anything is written; remove() takes a
  // gone group out of every child's list; importBundle heals what a bundle brings). ONE reader for the grant doors
  // (grantGroupsOf: own groups + their ancestors, PURE src/grant-model.js judges). Setting a parent WIDENS what the child may
  // use, so it is the owner's door only (PATCH /api/tasks/:id) — the manager agent's group-admin verb never takes it.
  _titleOf(id) { const t = this._has(id) ? this._state.tasks[id] : null; return t ? String(t.title || id) : String(id); }
  /** the U2 read (6): a group id is one this store HOLDS — its own key, never a built-in name (`constructor`, `__proto__`) */
  _has(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(this._state.tasks, id) && !!this._state.tasks[id]; }
  /** The path UP from `from` (through every parent, archived ones too — an unarchive must never close a cycle) to `target`
   *  → [from, …, target], or null. Breadth-first with a visited set: a cycle hand-written on disk ends the walk. */
  _pathUp(from, target) {
    const back = new Map([[from, null]]), queue = [from];
    while (queue.length) {
      const id = queue.shift();
      if (id === target) { const out = []; for (let x = id; x !== null; x = back.get(x)) out.unshift(x); return out; }
      const t = this._has(id) ? this._state.tasks[id] : null;
      for (const p of t && Array.isArray(t.parents) ? t.parents : []) if (this._has(p) && !back.has(p)) { back.set(p, id); queue.push(p); }
    }
    return null;
  }
  /** A `parents` patch → the clean list, or a thrown Error with its `code` (nothing written): a list of ids of groups this
   *  store holds (`unknown_parent`), never the group itself (`parent_self`), at most PARENTS_MAX (`too_many_parents`), never
   *  one that already sits below it (`parent_cycle` — the words name the path, top down). `selfId` null = a new group (no
   *  child yet, so no cycle). */
  _sanitizeParents(list, selfId) {
    const no = (code, msg) => { throw Object.assign(new Error(msg), { code }); };
    if (list === null) return [];   // the U2 read (10): null clears, as the sibling fields read it
    if (!Array.isArray(list)) no('bad_parents', 'parents must be a list of Task Group ids');
    const out = [];
    for (const raw of list) {
      const id = typeof raw === 'string' ? raw : raw && typeof raw === 'object' && typeof raw.id === 'string' ? raw.id : '';
      if (!this._has(id)) no('unknown_parent', `no Task Group "${String(id).slice(0, 80)}" to be a parent`);
      if (id === selfId) no('parent_self', 'a Task Group cannot be its own parent');
      if (!out.includes(id)) out.push(id);
    }
    if (out.length > PARENTS_MAX) no('too_many_parents', `a Task Group names at most ${PARENTS_MAX} parents`);
    if (selfId) for (const p of out) {
      const up = this._pathUp(p, selfId);   // p … selfId: selfId already sits above p
      if (up) no('parent_cycle', `«${this._titleOf(p)}» already sits below «${this._titleOf(selfId)}» (${up.slice().reverse().map((x) => this._titleOf(x)).join(' › ')}) — it cannot also be its parent`);
    }
    return out;
  }
  /** The parents a group names that this store still holds (its own order). */
  parentsOf(id) { const t = this._has(id) ? this._state.tasks[id] : null; return t && Array.isArray(t.parents) ? t.parents.filter((p) => p !== id && this._has(p)) : []; }
  /** The groups that name `id` as a parent (direct children, creation order). */
  childrenOf(id) {
    if (this._childIx) return this._childIx.get(id) || [];   // the U5a read, 2: a list() builds the index ONCE (else every step scanned every group)
    return Object.values(this._state.tasks).filter((t) => t && Array.isArray(t.parents) && t.parents.includes(id)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).map((t) => t.id);
  }
  _withChildIndex(fn) {
    if (this._childIx) return fn();
    const ix = new Map();
    for (const t of Object.values(this._state.tasks).sort((a, b) => ((a && a.createdAt) || 0) - ((b && b.createdAt) || 0))) for (const p of t && Array.isArray(t.parents) ? t.parents : []) { if (!ix.has(p)) ix.set(p, []); if (!ix.get(p).includes(t.id)) ix.get(p).push(t.id); }
    this._childIx = ix;
    try { return fn(); } finally { this._childIx = null; }
  }
  /** Every ANCESTOR of the groups `ids` (breadth-first, nearest first; never one of `ids` themselves). An archived group gives
   *  nothing ITSELF but the road runs THROUGH it (the U3a read, MAJOR 4: a grandparent's «除了» must still cover a grandchild
   *  whose middle group was archived — rule ③ fails closed); a parent this store no longer holds is skipped; a cycle
   *  hand-written on disk ends the walk (visited set). */
  /** the chain's cure (B): a group's NAME as a grant door's lineage words say it to an agent (GM.lineageWords' nameOf) — ONE LINE
   *  PIECE of the peer-text belt (a member wrote it); null for an id this store does not hold (the words then say the id). */
  lineageNameOf(id) { const g = this._has(id) ? this._state.tasks[id] : null; return g ? agentLine(String(g.title || ''), 200) : null; }
  ancestorsOf(ids) {
    const start = new Set((Array.isArray(ids) ? ids : [ids]).filter((x) => typeof x === 'string' && x));
    // the U2 read (9): a start this store does not hold, or an ARCHIVED one, gives nothing (as an archived group's members get nothing)
    const seen = new Set(start), out = [], queue = [...start].filter((x) => this._has(x) && !this._state.tasks[x].archived);
    while (queue.length) {
      for (const p of this.parentsOf(queue.shift())) {
        if (seen.has(p)) continue;
        seen.add(p);
        queue.push(p);   // the road runs through an archived group …
        if (!this._state.tasks[p].archived) out.push(p);   // … which itself gives nothing
      }
    }
    return out;
  }
  /** THE ONE READER the grant doors take a caller's groups from: `groups` (records or ids — groupsForSession's answer) →
   *  `{ ids, inherited }` = its own group ids and their ancestors (grant-model `groupIds` / `inheritedGroupIds`). */
  grantGroupsOf(groups) {
    // the release's hold (2.369.411) meets B-91a7: while the store is HELD unread, a parent's members are UNKNOWN by name — refused as
    // groupIdsForGrant refuses (TASK_GROUPS_UNREAD), never «no parents» (every caller maps the throw to unreadable)
    this._refuseUnread('judging a grant by Task Group (its parent groups)');
    const ids = [...new Set((Array.isArray(groups) ? groups : []).map((g) => String(g && typeof g === 'object' ? g.id : g)).filter((x) => x && x !== 'undefined' && x !== 'null'))];
    const out = { ids, inherited: this.ancestorsOf(ids) };
    // B-55dc meets B-91a7 (the restack): a membership still being READ under-includes its ancestors too — the drawing door's
    // non-enumerable `unread` rides on BOTH lists (a door that keeps on it sees it on the lineage), never dropped by the walk
    if (groups && groups.unread) for (const a of [out.ids, out.inherited]) Object.defineProperty(a, 'unread', { value: true, enumerable: false });
    return out;
  }
  /** The heal (the boot's load and importBundle): every group's parents re-read as the writer would take them — gone ids,
   *  built-in names, itself and duplicates dropped, the cap kept AFTER that, and an edge that would close a cycle dropped. The
   *  edges are taken again one by one, each judged against the edges taken so far: the store's OWN groups first (they were
   *  acyclic), then `late` (a bundle's groups) — so of a cycle a bundle brings, the BUNDLE's edge is the one dropped (the U2 read,
   *  3); groups in id order, parents in their order. → the dropped edges `[[child, parent]]` (the caller says them). */
  _healParents(late = null) {
    const asked = new Map();
    for (const [id, t] of Object.entries(this._state.tasks)) if (t && Array.isArray(t.parents)) { asked.set(id, t.parents); t.parents = []; }
    const lateSet = late instanceof Set ? late : new Set(late || []);
    const order = [...asked.keys()].sort((a, b) => (lateSet.has(a) - lateSet.has(b)) || (a < b ? -1 : a > b ? 1 : 0));
    const dropped = [];
    for (const id of order) {
      const t = this._state.tasks[id], was = asked.get(id);
      for (const p of was) {
        if (typeof p !== 'string' || p === id || !this._has(p) || t.parents.includes(p)) { if (typeof p === 'string' && p !== id && !t.parents.includes(p)) dropped.push([id, p]); continue; }
        if (t.parents.length >= PARENTS_MAX || this._pathUp(p, id)) { dropped.push([id, p]); continue; }
        t.parents.push(p);
      }
    }
    for (const id of asked.keys()) { const t = this._state.tasks[id]; if (!t.parents.length) delete t.parents; }
    return dropped;
  }
  /** (the U2 read, 8) a record handed back to a caller: a copy of the live parents list, never the list itself */
  // the chain's cure (A, the U5a must): an answer ALWAYS says the list — `[]` when none is stored. A copy that MERGES the answer
  // ({...old, ...answer}, the sidebar's) kept the old parents when the key was absent, and its next edit wrote them back
  _out(t) { return { ...t, parents: Array.isArray(t.parents) ? [...t.parents] : [] }; }

  create({ title, kind, archived, objective, sessions, ctx, folders, contextDir, color, pattern, injectContext, browserProfileId, browserCap, parents } = {}, { bearer = false } = {}) {
    this._refuseUnread('a new Task Group'); // THE STORE HELD UNREAD: refused BY NAME before anything moves
    const cleanTitle = String(title || '').trim().slice(0, CAPS.title);
    if (!cleanTitle) throw new Error('title required');
    // lane lg-group-parents (the U2 read, 7): a bearer never NAMES a parent; `parents: null` on a create is «none», what a new group has
    // anyway — the update refuses a bearer's null on purpose (clearing a parent can let a descendant out of an ancestor's «除了»)
    if (parents !== undefined && parents !== null && bearer) throw PARENTS_OWNER_ONLY();
    const cleanParents = parents !== undefined ? this._sanitizeParents(parents, null) : [];   // lane lg-group-parents: refused before anything is made
    const id = this._genId(cleanTitle);
    const now = Date.now();
    const t = {
      id,
      title: cleanTitle,
      kind: KINDS.includes(kind) ? kind : 'task',
      archived: !!archived, // a Task Group (岗位) has NO status — persistent role; only archived
      attention: null,
      objective: typeof objective === 'string' ? objective.slice(0, CAPS.objective) : '',
      backlog: [],
      progress: [],
      sessions: sanitizeStrArray(sessions, 2000),
      // lane task-group-context: THE table; the old fields still create it (the CLI's --folder / --context-dir ship to
      // other hosts, an agent manager's verb, an old bundle) — as the rows they mean
      ctx: this._ctxFromCreate({ ctx, folders, contextDir, id }),
      color: this._sanitizeColor(color),
      pattern: (() => { try { return this._sanitizePattern(pattern); } catch { return null; } })(),
      // Immutable auto-identity slot (2.231.1): lowest free sequence index,
      // skipping slots masked by existing manual color/texture picks.
      // Deletion frees the slot for the next creation; the slot never
      // changes for the life of the group.
      colorSeq: pickColorSeq(Object.values(this._state.tasks), this._styleOrder()),
      injectContext: injectContext !== false, // per-group context-injection toggle (default on)
      // agent browser P1 (§3.2.5 row 3): the DEFAULT browser profile of this
      // group's NEW sessions — never a retroactive edit of running ones
      browserProfileId: sanitizeBrowserProfileId(browserProfileId),
      browserCap: sanitizeBrowserCap(browserCap), // MULTIVIEW D4: the group's default per-conversation browser cap (null = the instance setting)
      ...(cleanParents.length ? { parents: cleanParents } : {}),   // lane lg-group-parents: stored only when it names one
      createdAt: now,
      updatedAt: now,
      contentUpdatedAt: now,
    };
    this._state.tasks[id] = t;
    this._archRebound(t.sessions);   // B-0248 step 3 follow (r1699 (1)): a member named at the group's creation is a person's act — an owed archive unbind of it is not retried
    // lane lg-group-parents (the U2 read, MAJOR 1): an id given out fresh never inherits an edge left on disk by a group of the
    // same id that is gone (a hand edit, an older build's remove) — no child is adopted without the owner choosing it
    const purged = [];   // the chain's cure (E): each child rewritten is named in the change notice
    for (const c of Object.values(this._state.tasks)) if (c && c !== t && Array.isArray(c.parents) && c.parents.includes(id)) { purged.push(c.id); const left = c.parents.filter((p) => p !== id); if (left.length) c.parents = left; else delete c.parents; }
    this._save();
    this._notify(purged.length ? [id, ...purged] : id);
    return this._out(t);
  }

  _ctxFromCreate({ ctx, folders, contextDir, id }) {
    let rows = Array.isArray(ctx) ? TC.sanitizeRows(ctx, { selfId: id }) : [];
    if (folders !== undefined || (contextDir !== undefined && contextDir !== null && contextDir !== '')) {
      const dir = this._sanitizeContextDir(contextDir);
      rows = TC.applyLegacyPatch(rows, null, { ...(folders !== undefined ? { folders: this._sanitizeFolders(folders) } : {}), ...(dir ? { contextDir: dir } : {}) });
    }
    return rows;
  }

  // Folders are {path, recursive}. recursive:true (default) = sessions in any
  // SUBFOLDER auto-join; false = only sessions whose cwd is EXACTLY path.
  // Accepts legacy bare strings (→ {path, recursive:true}) so old data + old
  // callers keep working; dedup by path. PURE folderOf (lane open-task-binds):
  // a glob tail (`/x/**` — the agent context's own print of a recursive
  // folder, written back into the store) is the recursive switch, never part
  // of the path — the stored folder matched no conversation at all.
  _sanitizeFolders(folders) {
    if (!Array.isArray(folders)) return [];
    const seen = new Set();
    const out = [];
    for (const raw of folders) {
      const f = folderOf(raw);
      if (!f || seen.has(f.path)) continue;
      const p = f.path;
      if (!(path.isAbsolute(p) || /^[^:]+::\//.test(p))) continue; // plain abs path or host::path
      seen.add(p);
      out.push(f);
      if (out.length >= 100) break;
    }
    return out;
  }

  _sanitizeContextDir(dir) {
    if (typeof dir !== 'string' || !dir.trim()) return null;
    const p = dir.trim();
    if (!path.isAbsolute(p)) throw new Error('contextDir must be an absolute path');
    return p;
  }

  // Texture line-style (2.231.0): null = auto assignment decides; explicit
  // value = the user's manual pick (incl. 'solid' to force no texture).
  // Visual-only like color — never bumps contentUpdatedAt.
  /** tasks.autoStyleOrder — read via the injected settings getter so the
   *  allocator's mask comparisons use the SAME slot renderings the client
   *  draws (order mismatch would let auto colors collide with manual ones). */
  _styleOrder() {
    try { const v = this._getSetting?.('tasks.autoStyleOrder'); return v === 'solid-first' ? 'solid-first' : 'interleaved'; } catch { return 'interleaved'; }
  }

  _sanitizePattern(v) {
    if (v == null || v === '') return null;
    const p = String(v).trim();
    if (!['solid', 'dash', 'dot', 'diag'].includes(p)) throw new Error('invalid pattern');
    return p;
  }

  _sanitizeColor(c) {
    if (typeof c !== 'string' || !c.trim()) return null;
    const v = c.trim().slice(0, 40);
    if (/[{};]/.test(v)) throw new Error('invalid color');
    return v;
  }

  update(id, patch = {}, { bearer = false } = {}) {
    this._refuseUnread('a change to a Task Group (a field, a backlog row)'); // THE STORE HELD UNREAD: refused BY NAME before anything moves
    const t = this.get(id);
    if (patch.parents !== undefined && bearer) throw PARENTS_OWNER_ONLY();   // lane lg-group-parents (the U2 read, 7): a bearer never sets a lineage
    const parents = patch.parents !== undefined ? this._sanitizeParents(patch.parents, t.id) : undefined;   // lane lg-group-parents: refused BEFORE any field moves; applied LAST (below)
    // the cure's cure (2): a whole-list write that names the list it READ (`parentsBase`, the ids joined by commas) is refused when the
    // list moved meanwhile — a second window's stale copy would write a removed parent back (the (A) class through a narrow door)
    if (patch.parents !== undefined && patch.parentsBase !== undefined && String(patch.parentsBase) !== (Array.isArray(t.parents) ? t.parents : []).join(',')) throw Object.assign(new Error('the parent groups changed meanwhile (another window) — nothing was written; the tab shows them as they are now'), { code: 'parents_stale', parents: Array.isArray(t.parents) ? [...t.parents] : [] });   // cure 3 (a): the answer carries the list as it is
    // B-0248 step 3 (r1436): ONE ROW of the backlog (a page's change) is applied to the LIVE list (backlogWithRow), before any field moves
    if (patch.backlogRow !== undefined || patch.backlogAdd !== undefined) {
      if (patch.backlog !== undefined) throw Object.assign(new Error('a backlog write is the whole list or one row (backlogRow / backlogAdd), never both — nothing was written'), { code: 'backlog_row_bad' });
      patch = { ...patch, backlog: backlogWithRow(t.backlog, patch) };
    }
    if (patch.title !== undefined) {
      const clean = String(patch.title || '').trim().slice(0, CAPS.title);
      if (!clean) throw new Error('title required');
      t.title = clean;
    }
    if (patch.kind !== undefined) {
      if (!KINDS.includes(patch.kind)) throw new Error('invalid kind');
      t.kind = patch.kind;
    }
    if (patch.archived !== undefined) t.archived = !!patch.archived;
    if (patch.objective !== undefined) t.objective = String(patch.objective || '').slice(0, CAPS.objective);
    if (patch.sessions !== undefined) { t.sessions = sanitizeStrArray(patch.sessions, 2000); this._archRebound(t.sessions); }
    // lane task-group-context: the table is written whole (`ctx`); the old fields still edit it, as the rows they mean
    // (folders = exactly these 自动发现会话 folders, contextDir = this 记笔记 folder / null = none)
    const ctxBefore = JSON.stringify(this._ctxRows(t));
    if (patch.ctx !== undefined) {
      if (!Array.isArray(patch.ctx)) throw new Error('ctx must be an array of rows');
      t.ctx = TC.sanitizeRows(patch.ctx, { selfId: t.id });
    }
    if (patch.folders !== undefined || patch.contextDir !== undefined) {
      const legacy = {};
      if (patch.folders !== undefined) legacy.folders = this._sanitizeFolders(patch.folders);
      if (patch.contextDir !== undefined) legacy.contextDir = this._sanitizeContextDir(patch.contextDir);
      t.ctx = TC.applyLegacyPatch(this._ctxRows(t), this._res(t), legacy);
    }
    const ctxChanged = JSON.stringify(this._ctxRows(t)) !== ctxBefore;
    if (patch.color !== undefined) t.color = this._sanitizeColor(patch.color);
    if (patch.pattern !== undefined) t.pattern = this._sanitizePattern(patch.pattern);
    if (patch.injectContext !== undefined) t.injectContext = !!patch.injectContext;
    // Background-job owner-notify tri-state (2.344.0): true/false override the
    // global agents.jobNotify for jobs owned by this group's sessions; null =
    // inherit. Any group's explicit false wins over another's true (quietest).
    if (patch.jobNotify !== undefined) t.jobNotify = patch.jobNotify === true ? true : patch.jobNotify === false ? false : null;
    // Communication Channels v1 (2.362.0): how visible this group's sessions
    // are to sessions OUTSIDE the group — 'none' (default, opaque) |
    // 'visible' (listable) | 'messageable' (listable + can be messaged).
    // lane grants-unify: the level and the members it leaves OUT («除了») are the group's row of the ONE grants store, written
    // through the ONE writer — the record's own pre-unify `externalVisibility` stays on disk one release, never read
    if (patch.externalVisibility !== undefined || patch.externalVisibilityExcept !== undefined) this._setVisibility(id, patch);
    // agent browser P1 (§3.2.5): the group's default profile for NEW sessions
    // (a `bp-<8 hex>` id or null); binding/unbinding never rewrites a running
    // session's pin — a default is where a session STARTS
    if (patch.browserProfileId !== undefined) t.browserProfileId = sanitizeBrowserProfileId(patch.browserProfileId);
    // MULTIVIEW D4: the group's default per-conversation browser cap — a conversation's own value (chip / Session Properties) wins
    if (patch.browserCap !== undefined) t.browserCap = sanitizeBrowserCap(patch.browserCap);
    // patch.plan is deliberately IGNORED (checklist removed 2.121.0) — an old
    // client bundle may still send it; a stored dormant t.plan stays untouched.
    if (patch.backlog !== undefined) {
      if (!Array.isArray(patch.backlog)) throw new Error('backlog must be an array');
      const taken = new Set(); // ids stay unique — a duplicated id gets re-minted
      const normalized = patch.backlog.map((it) => ({
        // stable identity — survives text edits, referenced by CLI/diff/user
        id: (typeof it?.id === 'string' && BACKLOG_ID_RE.test(it.id) && !taken.has(it.id)) ? (taken.add(it.id), it.id) : mintBacklogId(taken),
        text: String(it?.text || '').slice(0, CAPS.backlogItem),
        status: BACKLOG_STATUSES.includes(it?.status) ? it.status : 'open',
        // closed set high|normal|low — anything else (absent, typo) is 'normal'
        priority: normalizePriority(it?.priority),
        // sessions that CLAIMED the item (reminder + diff-notification targets)
        claimedBy: sanitizeStrArray(it?.claimedBy, 20),
        // optional full context behind the one-liner (same split as Activity)
        ...(typeof it?.detail === 'string' && it.detail.trim() ? { detail: it.detail.trim().slice(0, CAPS.detail) } : {}),
        // attribution: who parked it / who resolved it ('user' = from the UI)
        ...(it?.addedBy ? { addedBy: String(it.addedBy).slice(0, 120) } : {}),
        ...(Number(it?.addedAt) ? { addedAt: Number(it.addedAt) } : {}),
        ...(it?.resolvedBy ? { resolvedBy: String(it.resolvedBy).slice(0, 120) } : {}),
        ...(Number(it?.resolvedAt) ? { resolvedAt: Number(it.resolvedAt) } : {}),
      })).filter((it) => it.text);
      t.backlog = normalized; // every item — see the CAPS note: a bound is a READ's, never the store's
    }
    if (patch.attention !== undefined) {
      t.attention = patch.attention
        ? { reason: String(patch.attention.reason || '').slice(0, CAPS.reason), since: Number(patch.attention.since) || Date.now() }
        : null;
    }
    // lane lg-group-parents (the U2 read, MAJOR 2): the lineage moves only after every check above that can throw has passed
    const ancBefore = parents !== undefined ? this.ancestorsOf([t.id]) : [];   // the chain's cure (E, its read): the ancestors before the move
    if (parents !== undefined) { if (parents.length) t.parents = parents; else delete t.parents; }
    const ancMoved = parents !== undefined ? [...new Set([...ancBefore, ...this.ancestorsOf([t.id])])] : [];   // … and after: their derived descendants moved
    t.updatedAt = Date.now();
    // contentUpdatedAt gates AGENT re-injection: only what the injected context
    // actually renders (title/objective/backlog/the Context table) counts.
    // Cosmetic patches (color, injectContext, archived, kind, binds) bump only
    // updatedAt — they used to trigger a full "was UPDATED" re-injection to
    // every member agent. The table's own instant (ctxUpdatedAt) also reaches
    // every group that REFERENCES this one (contentAtOf).
    if (['title', 'objective', 'backlog', 'parents'].some((k) => patch[k] !== undefined) || ctxChanged) {
      t.contentUpdatedAt = t.updatedAt;
    }
    // lane lg-group-parents U4 (the read, MAJOR 2): what every DESCENDANT is told moves with this group's lineage, its archive, its
    // standing rules and its table — each one's own instant moves (an archived or removed parent is no longer an ancestor the
    // child's gate could read)
    const touched = (parents !== undefined || patch.archived !== undefined || patch.objective !== undefined || patch.title !== undefined || ctxChanged) ? this._touchDescendants(t.id, t.updatedAt) : [];
    if (ctxChanged) t.ctxUpdatedAt = t.updatedAt;
    this._save();
    const noticeIds = [...new Set([...touched, ...ancMoved])];
    this._notify(noticeIds.length ? [id, ...noticeIds] : id);   // the chain's cure (E, the U4 should + its read): every descendant touched, and the old and new ancestors, named in the notice
    return this._out(t);
  }

  remove(id) {
    this._refuseUnread('deleting a Task Group'); // THE STORE HELD UNREAD: refused BY NAME before anything moves
    this.get(id); // throws if missing
    // THE BASE'S ORDER (the release is the oracle — the census cure, 主开发 2026-11-19 08:56Z, the hunt's finding 4): the cleanup in
    // the other stores FIRST, then the record. A kill before the record lands brings the group back WITHOUT its visibility row (the
    // safe side: it admits nobody new); the reversed order (the cleanup riding the landing) could leave a row and a folder that a
    // group made again under the same id would inherit.
    // its archived Activity log goes with it (first: a failed delete keeps the group, never orphaned words)
    if (archivableId(id)) { this._archiveDrop(id); fs.rmSync(path.join(this._archiveRoot, id), { recursive: true, force: true }); }
    const touched = this._touchDescendants(id, Date.now());   // lane lg-group-parents U4: the descendants are told without it (the cure (E): each named in the notice)
    delete this._state.tasks[id];
    for (const c of Object.values(this._state.tasks)) if (c && Array.isArray(c.parents) && c.parents.includes(id)) { if (!touched.includes(c.id)) touched.push(c.id); const left = c.parents.filter((p) => p !== id); if (left.length) c.parents = left; else delete c.parents; }   // lane lg-group-parents: a gone parent leaves every child's list
    try { const g = this._grants(); if (g) g.remove('group-visibility', String(id), 'user'); } catch { /* the row of a gone group admits nobody */ }   // lane grants-unify
    this._legacy.delete(id);
    this._save();
    this._notify(touched.length ? [id, ...touched] : id);
  }
  /** this store's owed write waited for (a named wait — test-store-write-census WAITS): {ok, why} — under the writer's own bound
   *  (the moved2 cure 3: a ten-minute hold of the main thread is not taken; a held unbind stays owed, said, and the writer lands it) */
  _landNow(what) {
    try {
      const W = this._writer(); if (!W.pending(this._file)) return { ok: true };
      const r = W.flushSync([this._file]);
      if (r.deferred) return { ok: false, why: 'the hub is stopping — its exit flush writes it next' };
      const m = (r.left || []).find((x) => x.file === this._file);
      if (m) { console.warn(`[tasks] ${what}: task-groups.json not on disk yet (${m.why})`); return { ok: false, why: m.why }; }
      return { ok: true };
    } catch (e) { return { ok: false, why: (e && e.message) || String(e) }; }
  }

  // Granular tag add/remove — atomic server-side so two clients binding
  // different sessions never clobber each other's sessions array.
  bind(id, sessionKey) {
    this._refuseUnread('adding a conversation to a Task Group'); // THE STORE HELD UNREAD: refused BY NAME before anything moves
    const t = this.get(id);
    const key = String(sessionKey || '');
    if (!key) throw new Error('sessionKey required');
    // the census cure (finding 3): a conversation bound AGAIN after its archive stays — an unbind still owed for it is not retried
    // (it re-enters the baseline: the person's later act wins)
    this._archRebound([key]);
    if (!t.sessions.includes(key)) {
      t.sessions.push(key);
      t.updatedAt = Date.now();
      this._save();
      this._notify(id);
    }
    return { ...t };
  }

  unbind(id, sessionKey) {
    this._refuseUnread('removing a conversation from a Task Group'); // THE STORE HELD UNREAD: refused BY NAME before anything moves
    const t = this.get(id);
    this.unbindKeys([String(sessionKey || '')], { ids: [id], exact: true });
    return { ...t };
  }

  /** THE ONE UNBIND WRITER (lane task-group-fanout): `keys` leave the members (sessions[]) of `ids` (every group when
   *  null) — ONE save, ONE notify naming the groups that changed (the rule: task-membership membersWithout). `dryRun`
   *  writes nothing (the migration archives what would go first). → { changed: [group id], gone: { groupId: [key] } } */
  unbindKeys(keys, { ids = null, exact = false, dryRun = false } = {}) {
    if (!dryRun) this._refuseUnread('a membership change'); // THE STORE HELD UNREAD (a dry run writes nothing)
    const changed = [], gone = {};
    for (const t of ids ? ids.map((i) => this._state.tasks[i]).filter(Boolean) : Object.values(this._state.tasks)) {
      const r = membersWithout(t.sessions, keys, { exact });
      if (!r.gone.length) continue;
      changed.push(t.id); gone[t.id] = r.gone;
      if (dryRun) continue;
      t.sessions = r.keep;
      t.updatedAt = Date.now();
    }
    if (changed.length && !dryRun) { this._save(); this._notify(changed); }
    return { changed, gone };
  }

  /** An ARCHIVED conversation leaves every group (lane task-group-fanout; measured: 752 member keys in the lanes group,
   *  never pruned). The user-state write hook hands the archive list in; only the keys NEW since the last list are
   *  unbound (a conversation bound again after its archive stays). One still RUNNING keeps its groups until it ends —
   *  its next turn still needs the group's context (the owner's constraint) — and leaves at the first write after.
   *  → the group ids that changed */
  noteArchived(list) {
    if (this._unread) return []; // THE STORE HELD UNREAD: nothing consumed — the archive list is judged after the hold lifts
    const now = new Set((Array.isArray(list) ? list : []).map(String));
    const was = this._archSeen;
    this._archList = now;              // B-0248 step 3: the list itself (a landing that answers later puts its keys back into the baseline only while it holds them)
    this._archSeen = new Set(now);
    if (!was) return [];
    for (const k of now) if (!was.has(k)) this._archLive.add(k);
    const due = [];
    for (const k of [...this._archLive]) {
      if (!now.has(k)) { this._archLive.delete(k); continue; }   // unarchived meanwhile
      let live = false; try { live = !!this._isLiveKey(k); } catch { live = false; }
      if (!live) { this._archLive.delete(k); due.push(k); }
    }
    if (!due.length && !this._archOwed.size) return [];
    const changed = due.length ? this.unbindKeys(due).changed : [];
    // B-0248 step 3 (r1436): THE UNBIND OFF THE LOOP. It is handed to the store writer (unbindKeys' save: an act, the writer's next
    // writes) — never a synchronous flush of the whole store on the main thread (it was one: lane lg-store-writes U5's law D). THE
    // BASELINE LAW STANDS (the census cure, 主开发 2026-11-19 08:56Z — the hunt's finding 3): from the hand-off until the store says it
    // holds the unbind (persisted() true), its keys stay OUT of the baseline — a pass meanwhile sees them as new and hands the landing
    // again; a landing that fails keeps them out; a landed one puts them back into the CURRENT baseline (a conversation bound again
    // after it stays). THE CRASH WINDOW is the writer's: the user-state file (this pass's list) is written before this hook, so a kill
    // before the writer's next write leaves the archived conversation a member for good (the next start's baseline already holds its
    // key) — a window the release had only on a failed landing; now it is every unbind's, milliseconds unless the storage stalls.
    if (changed.length) { const gen = ++this._archGen; for (const k of due) this._archOwed.set(k, gen); }   // each key owed BY ITS UNBIND (a later one is a later generation)
    if (this._archOwed.size) this._landArchived();
    for (const k of this._archOwed.keys()) this._archSeen.delete(k);
    return changed;
  }
  /** a conversation bound AGAIN (bind, a whole members write): an unbind still owed for it is not retried — it re-enters the baseline
   *  (the census cure, finding 3: the person's later act wins; B-0248 step 3: every membership-adding road, not only bind) */
  _archRebound(keys) { for (const k of keys || []) if (this._archOwed && this._archOwed.delete(k) && this._archSeen) this._archSeen.add(k); }
  /** B-0248 step 3: the owed archive unbind's landing, asked of the store writer (persisted(): bounded, the loop never waits) — ONE
   *  at a time, a pass meanwhile asks again after it. Landed ⇒ its keys leave the owed set and enter the current baseline while the
   *  archive list still holds them (bind() takes a key out of the owed set itself: the person's later act wins) */
  _landArchived() {
    if (this._archLanding) { this._archAgain = true; return; }
    const keys = [...this._archOwed];   // [key, generation]: a landing settles the unbinds made before it, never a later one of the same key
    this._archLanding = true; this._archAgain = false;
    const settle = (saved) => {
      this._archLanding = false;
      if (saved === true) for (const [k, gen] of keys) if (this._archOwed.get(k) === gen) { this._archOwed.delete(k); if (this._archList && this._archList.has(k) && this._archSeen) this._archSeen.add(k); }
      if (this._archAgain && this._archOwed.size) this._landArchived();
    };
    this.persisted().then(settle, () => settle(false));
  }

  // User-visible progress note (P1: from the detail UI; P3: vibespace-task CLI).
  // note = the ONE-LINE summary everyone sees inline (board, injected context);
  // detail = optional full context, retrieved on demand (TASK.md, show --full,
  // the board's expandable rows). Keeping them separate is what lets the
  // injected Activity log stay dense without losing information.
  addProgress(id, { note, detail, session } = {}) {
    this._refuseUnread('an activity-log line'); // THE STORE HELD UNREAD: refused BY NAME before anything moves
    const t = this.get(id);
    const dataDir = path.dirname(this._file);   // the belt finds the vault from here
    const clean = belt.maskForSink(String(note || '').trim(), { dataDir, message: true }).slice(0, CAPS.note);   // agent-output-sinks: mask BEFORE it lands
    if (!clean) throw new Error('note required');
    const cleanDetail = typeof detail === 'string' && detail.trim() ? belt.maskForSink(detail.trim(), { dataDir, message: true }).slice(0, CAPS.detail) : null;
    const taken = new Set((t.progress || []).map((p) => p && p.id).filter(Boolean));
    t.progress.push({ id: mintProgressId(taken), at: Date.now(), note: clean, ...(cleanDetail ? { detail: cleanDetail } : {}), session: typeof session === 'string' ? session.slice(0, 200) : null });
    t.progress = this._keepLive(id, t.progress);
    t.updatedAt = Date.now();
    t.contentUpdatedAt = t.updatedAt; // progress is injected content
    this._save();
    this._notify(id);
    return { ...t };
  }

  // ── THE ARCHIVE APPEND OFF THE LOOP (B-0248 step 3 (c), r1443) — every note of a group at its LIVE_PROGRESS bound appended its oldest
  // entry to its month file on the main thread (an open + write + close on the data folder's share). Now the overflow is handed to
  // the store writer by its ids: it STAYS LIVE (in memory and in task-groups.json) until its append landed, then it leaves the live
  // list in one more save; a failed append keeps it live and the writer retries (the release's law). The bytes are made AT the write
  // from the live entry — a clear of an entry still owed is written cleared; one cleared while its append flew is cleared in the
  // file once it landed. A month file a clear or an import rewrites, and a group's removal, settle what is owed to it first. ──
  /** `list` over the live LIVE_PROGRESS: its overflow is owed to the archive (its month files) — the list is returned WHOLE (each
   *  entry leaves it once its append landed: _archiveLanded); an id the archive cannot hold keeps its overflow live, as before */
  _keepLive(id, list) {
    if (list.length <= LIVE_PROGRESS || !archivableId(id)) return list;
    for (const p of list.slice(0, list.length - LIVE_PROGRESS)) {
      if (!p || typeof p !== 'object' || typeof p.id !== 'string') continue;   // an entry with no id stays live (every entry has one since 2026-09-28)
      const file = path.join(this._archiveRoot, id, monthOf(p.at) + '.ndjson');
      const q = this._archQ.get(file) || { gid: id, month: monthOf(p.at), ids: new Set(), flying: null };
      if (q.flying && q.flying.some((x) => x.id === p.id)) continue;
      q.ids.add(p.id); this._archQ.set(file, q);
    }
    for (const [file, q] of this._archQ) if (q.gid === id && q.ids.size) this._archiveAsk(file);
    return list;
  }
  /** a month file's append handed to the store writer (THE archive writer; its timed-sync row's literal name) */
  _archiveAsk(file) {
    try { this._writer().dirty(file, { name: 'task-groups-archive.write', makeDir: true, produce: () => this._archiveProduce(file), onWritten: (ok, e) => this._archiveLanded(file, ok, e) }); }
    catch (e) { console.warn(`[tasks] an Activity-log archive append could not be handed to the store writer: ${e && e.message}`); }
  }
  /** the bytes of one append, made NOW from the live entries still owed (a cleared one written cleared) → {append} | null (nothing owed) */
  _archiveProduce(file) {
    if (this._unread) throw Object.assign(new Error('task-groups.json is held (its read failed) — nothing is appended until it reads'), { code: 'EHELD' });
    const q = this._archQ.get(file);
    if (!q || !q.ids.size) { if (q && !q.flying) this._archQ.delete(file); return null; }   // nothing owed: no empty entry left behind (r1821 (4))
    const t = this._state.tasks[q.gid];
    const live = new Map(((t && t.progress) || []).filter((p) => p && p.id).map((p) => [p.id, p]));
    const sent = [], lines = [];
    for (const id of q.ids) { const p = live.get(id); if (p) { sent.push({ id, clearedAt: p.clearedAt || null }); lines.push(JSON.stringify(p) + '\n'); } }
    q.ids.clear();
    if (!lines.length) { if (!q.flying) this._archQ.delete(file); return null; }
    q.flying = sent; q.flyingSince = Date.now(); q.heldAt = null;   // on its way from now (the settle's «already older than the bound»)
    return { append: lines.join('') };
  }
  /** an append's outcome: landed ⇒ its entries leave the live list (one save); failed ⇒ owed again, said once until one lands */
  _archiveLanded(file, ok, e) {
    const q = this._archQ.get(file);
    if (!q) return;
    const fly = q.flying || [];
    q.flying = null; q.flyingSince = null; q.heldAt = null;
    if (!ok) {
      for (const x of fly) q.ids.add(x.id);
      q.failWhy = String((e && (e.code || e.message)) || 'an error');   // r2292: an import's settle names a write that keeps failing
      if (!this._archiveFailSaid) { this._archiveFailSaid = true; console.warn(`[tasks] an Activity-log archive append was not written (${(e && (e.code || e.message)) || 'an error'}) — its entries stay in the live list, the store writer retries`); }
      if (q.ids.size) this._archiveAsk(file);
      return;
    }
    q.failWhy = null;
    if (this._archiveFailSaid && fly.length) { this._archiveFailSaid = false; console.warn('[tasks] the Activity-log archive is written again'); }
    const t = this._state.tasks[q.gid];
    if (t && fly.length && Array.isArray(t.progress)) {
      const byId = new Map(t.progress.filter((p) => p && p.id).map((p) => [p.id, p]));
      // cleared while its append flew: the file holds the words it had — cleared there now (the clear's own one-file rewrite)
      for (const x of fly) { const p = byId.get(x.id); if (p && p.clearedAt && p.clearedAt !== x.clearedAt) this._archiveClear(q.gid, q.month, new Set([x.id]), { by: p.clearedBy || 'owner', at: p.clearedAt }); }
      const landed = new Set(fly.map((x) => x.id));
      t.progress = t.progress.filter((p) => !(p && landed.has(p.id)));   // MOVED: on disk in its month file
      this._save();
    }
    if (!q.ids.size && !q.flying) this._archQ.delete(file);
  }
  /** what this store still owes `files` (month files about to be rewritten or removed; all of them when null) lands first — a named
   *  wait (test-store-write-census WAITS), under the writer's own bound. → null when nothing of them is owed or on its way any more;
   *  else WHY (r1821 (1): A SETTLE THAT RAN OUT OF ITS BOUND IS NOT A SETTLE — an append still in flight would land in a rewritten
   *  file's old copy, or make a removed group's folder again: the caller refuses BY NAME, ARCHIVE_BUSY, before anything moves) */
  _archiveSettle(files, { owed = false } = {}) {
    // r2104 (c): THE FILE'S OWN FLIGHT is judged — a month only OWED is safe (its append is made after a rewrite, into the new file), so
    // it is neither flushed nor refused (another store's held write never refuses a person's clear)
    // r2292: …but an IMPORT REPLACES a group's live list: an entry only owed would no longer be found by its append — in NEITHER place.
    // The import doors pass `owed`: what is owed is WRITTEN first (a flush, not a refusal); a write not made is the door's refusal
    const flying = (files || [...this._archQ.keys()]).filter((f) => { const q = this._archQ.get(f); return !!(q && q.flying); });
    const due = owed ? (files || [...this._archQ.keys()]).filter((f) => { const q = this._archQ.get(f); return !!(q && (q.flying || q.ids.size)); }) : flying;
    if (!due.length) return null;
    const W = this._writer(), bound = Math.round((Number.isFinite(W.graceMs) && W.graceMs > 0 ? W.graceMs : 90000) / 3);   // the writer's own synchronous bound (store-pace syncBoundMs)
    // r2104 (a): NO HOLD A PRESS — an append already older than the bound, or held at its file's last settle, is refused AT ONCE
    for (const f of flying) { const q = this._archQ.get(f), age = Date.now() - (q.flyingSince || Date.now()); if (q.heldAt || age >= bound) return `its write has been held by the storage for ${Math.max(1, Math.round(age / 1000))} s`; }
    for (const f of due) this._archQ.get(f).failWhy = null;   // r2292: a failure is judged by THIS flush
    const r = W.flushSync(due) || {};
    if (r.deferred) return 'the hub is stopping';
    const still = due.filter((f) => { const q = this._archQ.get(f); return !!(q && q.flying); });
    const unmade = owed ? due.filter((f) => { const q = this._archQ.get(f); return !!(q && !q.flying && q.ids.size); }) : [];   // r2292: still only owed — its write failed, or the writer stayed held
    if (!still.length && !unmade.length) return null;   // r2104 (b): landed, or FAILED — a failed append is no flight (nothing on its way; its entries stay owed and live): the act goes on (an import excepted: r2292)
    for (const f of still) this._archQ.get(f).heldAt = Date.now();
    const miss = (r.left || []).find((x) => (still.length ? still : unmade).includes(x.file));
    return String((miss && miss.why) || (still.length ? 'its write has not landed' : 'its write was not made'));
  }
  /** THE TWO IMPORT DOORS' settle (r2292): an import replaces a group's live list, so what its archive is only OWED (overflowed entries
   *  not written yet: inside the writer's pause, or after a FAILED append) is WRITTEN first — else those entries reach NEITHER place.
   *  → null when nothing is owed or on its way any more; else the refusal, nothing imported: EVSARCHIVEFAILING when an owed write
   *  failed in this flush (the storage keeps failing), else EVSARCHIVEBUSY (an append held on its way, or the writer held elsewhere) */
  _archiveImportSettle() {
    const why = this._archiveSettle(null, { owed: true });
    if (!why) return null;
    const qs = [...this._archQ.values()];
    return !qs.some((q) => q.flying) && qs.some((q) => q.ids.size && q.failWhy) ? ARCHIVE_FAILING(why) : ARCHIVE_BUSY(why);
  }
  /** the configuration import's question, asked BEFORE any section is applied (r2104; r2292: the import doors' own settle — what is
   *  owed is written first) → the refusal (an Error with its code, EVSARCHIVEBUSY or EVSARCHIVEFAILING: the import is refused WHOLE); else null */
  archiveBusy() { return this._archiveImportSettle(); }

  /** a group's removal: what it still owes its archive is DROPPED (never written after its folder went); an append on its way lands
   *  first (an append that lands after the removal would make the folder again — a group made again under the same id inheriting it) */
  _archiveDrop(id) {
    const W = this._writer();
    const mine = [...this._archQ].filter(([, q]) => q.gid === id);
    const why = this._archiveSettle(mine.filter(([, q]) => q.flying).map(([f]) => f));   // an append on its way lands FIRST — or nothing is removed
    if (why) throw ARCHIVE_BUSY(why);
    for (const [file, q] of mine) { q.ids.clear(); W.forget(file); this._archQ.delete(file); }
  }
  _archiveMonths(id) {
    if (!archivableId(id)) return [];
    try { return fs.readdirSync(path.join(this._archiveRoot, id)).filter((f) => MONTH_FILE_RE.test(f)).sort().reverse(); } catch { return []; }
  }
  /** one month file's entries (deduped by id, a cleared copy wins), or [] */
  _monthEntries(id, file, { strict = false } = {}) {
    let text = '';
    try { text = fs.readFileSync(path.join(this._archiveRoot, id, file), 'utf8'); }
    catch (e) { if (strict && !(e && e.code === 'ENOENT')) { const x = new Error(`Task Groups: an import was refused — the archived month ${file} of ${id} could not be read (${(e && e.code) || 'unreadable'}); it is kept as it is`); x.code = 'TASK_GROUPS_UNREAD'; throw x; } return []; } // strict (the import's rewrite): a month that could not be read is never written over
    const byId = new Map();
    for (const ln of text.split('\n')) { const p = parseLine(ln); if (p && (!byId.has(p.id) || p.clearedAt)) byId.set(p.id, p); }
    return [...byId.values()];
  }
  /** the archived entries `ref` names (a P- id: every month; an ms `at`: its month) — one per id */
  _archiveFind(id, ref) {
    const r = String(ref == null ? '' : ref).trim();
    if (PROGRESS_ID_RE.test(r)) {
      for (const f of this._archiveMonths(id)) { const hit = this._monthEntries(id, f).find((p) => p.id === r); if (hit) return [hit]; }
      return [];
    }
    if (/^\d{10,}$/.test(r)) return this._monthEntries(id, monthOf(Number(r)) + '.ndjson').filter((p) => Number(p.at) === Number(r));
    return [];
  }
  /** a clear's archive half: every line of month `m` whose id is in `ids` cleared, the ONE file rewritten (tmp + rename) → the ids changed */
  _archiveClear(id, m, ids, { by, at }) {
    const f = path.join(this._archiveRoot, id, m + '.ndjson');   // its callers settle the month first (clearProgress, before anything moves)
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch { return []; }
    const changed = new Set();
    const lines = text.split('\n').map((ln) => {
      const p = parseLine(ln);
      if (!p || !ids.has(p.id)) return ln;
      if (applyClear(p, { kind: 'activity', by, at }).changed) changed.add(p.id);
      return JSON.stringify(p);
    });
    if (changed.size) { fs.writeFileSync(f + '.tmp', lines.join('\n')); fs.renameSync(f + '.tmp', f); }
    return [...changed];
  }
  /**
   * ONE PAGE of group `id`'s Activity log older than `before` (ms; absent = from the newest), newest first: the live
   * list, then the archive months newest-first — ≤ `limit` (1..200) entries (an instant shared with the page's last
   * entry rides along, so a `before` cursor never skips one), deduped by id, ≤ ARCHIVE_READ_BUDGET bytes read.
   * `more` = an older entry may exist (ask again with before = the last entry's `at`).
   */
  readProgress(id, { before = null, limit = 100 } = {}) {
    const t = this.get(id);
    const cap = Math.max(1, Math.min(200, Math.floor(Number(limit)) || 100));
    const lim = before === null || before === undefined || before === '' || !Number.isFinite(Number(before)) ? Infinity : Number(before);
    const out = [], seen = new Set();
    let stop = false;
    const add = (p) => {
      if (!p || !(Number(p.at) < lim)) return;
      if (out.length >= cap && Number(p.at) !== Number(out[out.length - 1].at)) { stop = true; return; }
      if (p.id && seen.has(p.id)) return;
      if (p.id) seen.add(p.id);
      out.push(p);
    };
    const live = Array.isArray(t.progress) ? t.progress : [];
    for (let i = live.length - 1; i >= 0 && !stop; i--) add(live[i]);
    let budget = ARCHIVE_READ_BUDGET;
    const top = Number.isFinite(lim) ? monthOf(lim) : null;
    for (const f of this._archiveMonths(id)) {
      if (stop || budget <= 0) break;
      if (top && f.slice(0, 7) > top) continue;
      let fd;
      try { fd = fs.openSync(path.join(this._archiveRoot, id, f), 'r'); } catch { continue; }
      try {
        let end = monthCut(fd, fs.fstatSync(fd).size, lim), carry = Buffer.alloc(0);
        while (end > 0 && !stop && budget > 0) {
          const from = Math.max(0, end - ARCHIVE_CHUNK);
          const b = Buffer.concat([readAt(fd, from, end - from), carry]);
          budget -= end - from;
          const lines = b.toString('utf8').split('\n');
          carry = from > 0 ? Buffer.from(lines.shift(), 'utf8') : Buffer.alloc(0);
          for (let i = lines.length - 1; i >= 0 && !stop; i--) add(parseLine(lines[i]));
          end = from;
        }
      } finally { fs.closeSync(fd); }
    }
    return { entries: out.map((p) => ({ ...p })), more: out.length > 0 && (stop || budget <= 0) };
  }

  /** The Activity-log entries `ref` names in group `id`: a `P-<hex>` id (at most
   *  one), or an entry's `at` in ms (every entry of that instant — the caller
   *  refuses an ambiguous one). [] = none. */
  findProgress(id, ref) {
    const t = this.get(id);
    const r = String(ref == null ? '' : ref).trim();
    if (!r) return [];
    if (PROGRESS_ID_RE.test(r)) return (t.progress || []).filter((p) => p && p.id === r);
    if (/^\d{10,}$/.test(r)) return (t.progress || []).filter((p) => p && Number(p.at) === Number(r));
    return [];
  }

  /**
   * "CLEAR CONTENT…" — THE door for an Activity-log entry (2026-09-28). Each ref
   * (a P- id or an entry's ms `at`) is looked up, asked `allow(entry)` (the
   * caller's PURE clearVerdict — this store knows no callers) and cleared IN
   * PLACE through src/record-clear.js applyClear: the note becomes the ONE
   * sentence, the detail goes, `clearedAt`/`clearedBy` are stamped; the id,
   * time, author and position stay. ONE atomic save for the whole batch —
   * `_save()` is also what regenerates every context folder's TASK.md — and ONE
   * `tasks-updated` broadcast. `updatedAt` moves, `contentUpdatedAt` does NOT:
   * the injected context re-renders from this store on every call, so the next
   * injection already shows the sentence, and nothing would be news to a member
   * agent (the diff snapshot keys activity by `lastProgressAt`, which a clear
   * keeps). Returns {cleared: [ids], already: [ids], unknown: [refs],
   * ambiguous: [refs], refused: [{ref, id, code, why, status}]}.
   */
  clearProgress(id, refs, { by = 'owner', at = Date.now(), allow = null } = {}) {
    this._refuseUnread('clearing activity-log lines'); // THE STORE HELD UNREAD: refused BY NAME before anything moves
    const t = this.get(id);
    const out = { cleared: [], already: [], unknown: [], ambiguous: [], refused: [] };
    const targets = [];
    const months = new Map(); // archive month → the ids a clear looks for there
    for (const ref of Array.isArray(refs) ? refs : [refs]) {
      let hits = this.findProgress(id, ref), live = true;
      if (!hits.length) { hits = this._archiveFind(id, ref); live = false; }   // 2.369.204: an entry the live list no longer holds
      if (!hits.length) { out.unknown.push(String(ref)); continue; }
      if (hits.length > 1) { out.ambiguous.push(String(ref)); continue; }
      const p = hits[0];
      const v = allow ? allow(p) : { ok: true };
      if (!v || !v.ok) { out.refused.push({ ref: String(ref), id: p.id, code: (v && v.code) || 'not_yours', why: (v && v.why) || '', status: (v && v.status) || 403 }); continue; }
      targets.push({ p, live });
      // every archive copy too — a live entry's (a crash between the archive append and the trim leaves one)
      const m = monthOf(p.at);
      if (!months.has(m)) months.set(m, new Set());
      months.get(m).add(p.id);
    }
    // ARCHIVE FIRST: each month file a target may sit in is rewritten once — a failed write changes nothing live
    const archived = new Set();
    if (archivableId(id) && months.size) { const why = this._archiveSettle([...months.keys()].map((m) => path.join(this._archiveRoot, id, m + '.ndjson'))); if (why) throw ARCHIVE_BUSY(why); }   // B-0248 step 3 (c): every month this clear rewrites is settled, or nothing moves
    for (const [m, ids] of archivableId(id) ? months : []) for (const x of this._archiveClear(id, m, ids, { by, at })) archived.add(x);
    for (const { p, live } of targets) {
      const r = live ? applyClear(p, { kind: 'activity', by, at }) : { changed: false };
      (r.changed || archived.has(p.id) ? out.cleared : out.already).push(p.id);
    }
    if (archived.size) t.archiveClearedAt = Date.now(); // the Task log window re-reads the archive rows it holds
    if (out.cleared.length) {
      t.updatedAt = Date.now();
      this._save();
      this._notify(id);
    }
    return out;
  }

  // ── Repo task files (P4): a task ⇄ a self-contained committable markdown
  // file with YAML frontmatter for the structured fields + human body. The
  // structured store stays authoritative; the file is a projection (export)
  // or a seed (import), never a live-parsed source of truth. ──

  renderRepoFile(t) {
    const esc = (v) => (v == null ? '' : String(v));
    const fm = [
      '---',
      'vibespace_task: ' + t.id,
      'title: ' + JSON.stringify(t.title),
      'kind: ' + t.kind,
      'archived: ' + (t.archived ? 'true' : 'false'),
      'color: ' + (t.color ? JSON.stringify(t.color) : 'null'),
      'backlog_priority: markers',
      '---',
      '',
    ];
    const body = [
      '# ' + esc(t.title),
      '',
      '## Objective',
      '',
      (t.objective && t.objective.trim()) || '_(none)_',
    ];
    const bl = t.backlog || [];
    if (bl.length) {
      body.push('', '## Backlog', '');
      // [ ] open · [x] done · [-] dropped; the [B-xxxx] id round-trips — parsed back on import;
      // a priority marker after the id (`!` high · `↓` low · none = normal) round-trips too, and a
      // text that itself begins "! "/"↓ " is backslash-escaped (markedText) so it never reads back
      // as one. The frontmatter's `backlog_priority: markers` tells the reader to parse markers.
      for (const b of bl) {
        body.push(`- [${b.status === 'done' ? 'x' : b.status === 'dropped' ? '-' : ' '}]${b.id ? ` [${b.id}]` : ''} ${markedText(b)}`);
        if (b.detail) for (const dl of b.detail.split('\n')) body.push(`  > ${dl}`);
      }
    }
    const prog = (t.progress || []).slice(-30);
    if (prog.length) {
      body.push('', '## Activity log', '');
      for (const p of prog) body.push(`- ${new Date(p.at).toISOString().slice(0, 16).replace('T', ' ')} ${p.note}${p.session ? ` _(${p.session})_` : ''}`);
    }
    body.push('');
    return fm.join('\n') + body.join('\n');
  }

  // Write a task to an absolute file path (creating parent dirs). → Promise<path>. B-ddf3 (lane bl-vault, r4361): OFF THE HUB's LOOP
  // (the path is any folder the person names, a slow or network one too) — the folder made, the file written, SYNCED and renamed
  // through the thread pool; a failed write or sync is a failed export, said by name (nothing renamed, the temp removed)
  async exportToFile(id, absPath) {
    const t = this.get(id);
    if (typeof absPath !== 'string' || !path.isAbsolute(absPath)) throw new Error('an absolute file path is required');
    const text = this.renderRepoFile(t);
    await fs.promises.mkdir(path.dirname(absPath), { recursive: true });
    const tmp = absPath + '.tmp';
    let h = null, fault = null;
    try { h = await fs.promises.open(tmp, 'w'); await h.writeFile(text); await h.sync(); } catch (e) { fault = e; }
    if (h) { const c = await h.close().then(() => null, (x) => x); if (!fault && c) fault = c; }
    if (fault) { await fs.promises.unlink(tmp).catch(() => { }); throw new Error(`${path.basename(absPath)} could not be put on disk (${(fault && fault.code) || 'failed'}) — not exported, nothing was replaced`); }
    await fs.promises.rename(tmp, absPath);
    return absPath;
  }

  // Parse a repo task file (frontmatter is authoritative for id/title/kind/
  // status/color; body parsed leniently for objective + plan). Creates a new
  // task or updates the existing one with the same id. One-shot at import —
  // after this the structured store is the truth (never re-parsed live).
  importFromFile(absPath) {
    this._refuseUnread('an import'); // THE STORE HELD UNREAD: refused BY NAME before anything moves
    { const no = this._archiveImportSettle(); if (no) throw no; }   // B-0248 step 3 (c), r2292: what the archive is owed is WRITTEN before a group is replaced (else NEITHER place) — or nothing moves, refused by name
    if (typeof absPath !== 'string' || !path.isAbsolute(absPath)) throw new Error('an absolute file path is required');
    let text;
    try { text = fs.readFileSync(absPath, 'utf-8'); } catch (e) { if (e && e.code === 'EVSMOUNTSYNC') throw e; throw new Error('cannot read ' + absPath); } // lane hub-fuse-sync-guard: a refusal is said by name, never as a missing file
    text = text.replace(/\r\n/g, '\n'); // tolerate CRLF (Windows / git autocrlf checkouts)
    const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!m) throw new Error('not a VibeSpace task file (missing frontmatter)');
    const fm = {};
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const key = line.slice(0, i).trim();
      let val = line.slice(i + 1).trim();
      if (val.startsWith('"')) { try { val = JSON.parse(val); } catch { } }
      fm[key] = val;
    }
    const id = fm.vibespace_task;
    if (typeof id !== 'string' || !/^T-[\w-]{1,60}$/.test(id)) throw new Error('missing/invalid vibespace_task id in frontmatter');
    const body = text.slice(m[0].length);
    // Objective = text under "## Objective". Stop only at a KNOWN next section
    // (legacy Plan/Checklist headings still recognized as STOPS so an old
    // file's checklist text is never absorbed into the objective — the
    // checklist content itself is dropped on import, feature removed 2.121.0)
    // or EOF, so an objective that itself contains a markdown heading
    // (e.g. "## Constraints") is preserved, not truncated.
    let objective = '';
    const objM = body.match(/##\s+Objective\s*\n([\s\S]*?)(?=\n##\s+(?:Backlog|Plan|Checklist|Progress|Activity log)\b|$)/i);
    if (objM) { objective = objM[1].trim(); if (objective === '_(none)_') objective = ''; }
    // Backlog = "- [ |x|-] text" lines under "## Backlog" (open/done/dropped);
    // blockquote continuations = the preceding item's detail (export round-trip)
    const backlog = [];
    const markersOn = fm.backlog_priority === 'markers';
    const blM = body.match(/##\s+Backlog\s*\n([\s\S]*?)(?=\n##\s+(?:Plan|Checklist|Progress|Activity log)\b|$)/i);
    if (blM) {
      for (const line of blM[1].split('\n')) {
        // optional priority marker after the id: `!` high · `↓` low — read ONLY
        // in a file whose frontmatter says `backlog_priority: markers` (written
        // since priorities exist; there a marker-like text is `\`-escaped). A
        // file without it (every file written before priorities) is taken
        // VERBATIM: its lines are normal and "! text" stays text.
        const bm = markersOn
          ? line.match(/^\s*-\s*\[([ xX-])\]\s+(?:\[(B-[0-9a-fA-F]{4,8})\]\s+)?(?:([!↓])\s+)?(.+)$/)
          : line.match(/^\s*-\s*\[([ xX-])\]\s+(?:\[(B-[0-9a-fA-F]{4,8})\]\s+)?()(.+)$/);
        if (bm) {
          const mark = bm[1].toLowerCase();
          const txt = markersOn ? unescapeItemText(bm[4].trim()) : bm[4].trim();
          backlog.push({ ...(bm[2] ? { id: bm[2] } : {}), text: txt.slice(0, CAPS.backlogItem), status: mark === 'x' ? 'done' : mark === '-' ? 'dropped' : 'open', priority: bm[3] === '!' ? 'high' : bm[3] === '↓' ? 'low' : 'normal' });
          continue;
        }
        const dm = line.match(/^\s*>\s?(.*)$/);
        if (dm && backlog.length) {
          const it = backlog[backlog.length - 1];
          it.detail = ((it.detail ? it.detail + '\n' : '') + dm[1]).slice(0, CAPS.detail);
        }
      }
    }
    // Progress = "- <ISO date> <note> _(session)_" lines under "## Progress".
    // Round-trip fidelity: on a machine without the task yet, the FILE is the
    // only source of the progress log, so parse it rather than dropping it.
    const parsedProgress = [];
    const progM = body.match(/##\s+(?:Activity log|Progress)\s*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/i);
    if (progM) {
      for (const line of progM[1].split('\n')) {
        const gm = line.match(/^\s*-\s+(\d{4}-\d\d-\d\d[ T]\d\d:\d\d)\s+(.+)$/);
        if (!gm) continue;
        let note = gm[2].trim();
        let session = null;
        const sm = note.match(/\s*_\(([^)]+)\)_\s*$/);
        if (sm) { session = sm[1]; note = note.slice(0, sm.index).trim(); }
        const at = Date.parse(gm[1].replace(' ', 'T') + 'Z');
        parsedProgress.push({ at: Number.isNaN(at) ? Date.now() : at, note: note.slice(0, CAPS.note), session });
      }
    }
    const now = Date.now();
    const existing = this._state.tasks[id];
    this._state.tasks[id] = {
      id,
      title: String(fm.title || existing?.title || id).slice(0, CAPS.title),
      kind: KINDS.includes(fm.kind) ? fm.kind : (existing?.kind || 'task'),
      archived: existing?.archived ?? (String(fm.archived) === 'true'),
      attention: existing?.attention || null,
      objective: objective.slice(0, CAPS.objective),
      // file wins when it carries a backlog; else keep the store's (an absent
      // section is indistinguishable from an empty one — prefer not to wipe).
      // Ids round-trip via the [B-xxxx] prefix; items matching an existing id
      // keep their claims/attribution (the file doesn't carry those).
      backlog: (() => {
        const prevById = new Map((existing?.backlog || []).filter((b) => b.id).map((b) => [b.id, b]));
        const taken = new Set();
        return (backlog.length ? backlog : (existing?.backlog || [])).map((b) => {
          const prev = b.id ? prevById.get(b.id) : null;
          return {
            ...(prev || {}),
            ...b,
            id: (b.id && BACKLOG_ID_RE.test(b.id) && !taken.has(b.id)) ? (taken.add(b.id), b.id) : mintBacklogId(taken),
            priority: normalizePriority(b.priority),
            claimedBy: Array.isArray(b.claimedBy) && b.claimedBy.length ? b.claimedBy : (prev?.claimedBy || []),
          };
        });
      })(),
      // a dormant stored checklist survives re-import untouched
      ...(existing?.plan?.length ? { plan: existing.plan } : {}),
      // prefer the store's live log if the task already exists (it's fuller —
      // the file caps at the last 30); otherwise seed from the file.
      progress: (() => {
        // every entry keeps (or gets) its stable P- id — a file-seeded log is minted here
        const list = this._keepLive(id, existing?.progress?.length ? existing.progress : parsedProgress);
        const taken = new Set();
        return list.map((p) => ({ ...p, id: (typeof p.id === 'string' && PROGRESS_ID_RE.test(p.id) && !taken.has(p.id)) ? (taken.add(p.id), p.id) : mintProgressId(taken) }));
      })(),
      sessions: existing?.sessions || [],
      ctx: existing ? this._ctxRows(existing) : [],   // lane task-group-context: the table is the store's, never the file's
      ...(existing && Array.isArray(existing.parents) ? { parents: [...existing.parents] } : {}),   // lane lg-group-parents (the U2 read, 5): the lineage too
      color: (typeof fm.color === 'string' && fm.color !== 'null' && !/[{};]/.test(fm.color)) ? fm.color.slice(0, 40) : (existing?.color || null),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this._save();
    this._notify(id);
    return { ...this._state.tasks[id] };
  }

  // ── Config transfer (same contract as hosts/mounts) ──
  // 2.369.204: the archived Activity log rides along — { <taskId>: { <YYYY-MM>: ndjson } } (Backup & migrate)
  exportBundle() {
    this._refuseUnread('a backup of Task Groups'); // THE STORE HELD UNREAD: never a backup that silently holds no groups
    const archive = {};
    // B-0248 step 3 (c) follow (r1821 (3)): an entry sits in both places while its append is owed or after a crash between the append and
    // the trim — the bundle carries it ONCE: a month's lines deduped by id (a cleared copy wins), an id still live left to the live list
    for (const id of Object.keys(this._state.tasks)) {
      const live = new Set(((this._state.tasks[id] && this._state.tasks[id].progress) || []).map((p) => p && p.id).filter(Boolean));
      for (const f of this._archiveMonths(id)) {
        const kept = this._monthEntries(id, f).filter((p) => !live.has(p.id)).sort((a, b) => a.at - b.at);
        if (kept.length) (archive[id] = archive[id] || {})[f.slice(0, 7)] = kept.map((p) => JSON.stringify(p) + '\n').join('');
      }
    }
    return { version: 1, tasks: Object.values(this._state.tasks), ...(Object.keys(archive).length ? { archive } : {}) };
  }
  /** an imported group's archive months, MERGED into this instance's (B-0248 step 3 (c): the imports settle every owed append first) (by id, a cleared copy wins, time order), one tmp + rename per month */
  _importArchive(id, months, read = null) {
    if (!archivableId(id) || !months || typeof months !== 'object') return;
    const have = read instanceof Map ? read : new Map(); // every month read FIRST (strict): one that could not be read refuses the import before any month is written — importBundle hands the months it read for ALL groups (never read twice)
    if (!(read instanceof Map)) for (const [m, text] of Object.entries(months)) if (/^\d{4}-\d{2}$/.test(m) && typeof text === 'string') have.set(m, this._monthEntries(id, m + '.ndjson', { strict: true }));
    for (const [m, text] of Object.entries(months)) {
      if (!/^\d{4}-\d{2}$/.test(m) || typeof text !== 'string') continue;
      const byId = new Map(have.get(m).map((p) => [p.id, p]));
      for (const ln of text.split('\n')) {
        const p = parseLine(ln);
        if (!p || !PROGRESS_ID_RE.test(p.id) || !Number(p.at) || monthOf(p.at) !== m) continue;
        const e = { id: p.id, at: Number(p.at), note: String(p.note || '').slice(0, CAPS.note), ...(typeof p.detail === 'string' && p.detail && !p.clearedAt ? { detail: p.detail.slice(0, CAPS.detail) } : {}), session: typeof p.session === 'string' ? p.session.slice(0, 200) : null, ...(Number(p.clearedAt) ? { clearedAt: Number(p.clearedAt), clearedBy: String(p.clearedBy || 'owner').slice(0, 200) } : {}) };
        if (!byId.has(e.id) || (e.clearedAt && !byId.get(e.id).clearedAt)) byId.set(e.id, e);
      }
      const dir = path.join(this._archiveRoot, id), f = path.join(dir, m + '.ndjson');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(f + '.tmp', [...byId.values()].sort((a, b) => a.at - b.at).map((p) => JSON.stringify(p) + '\n').join(''));
      fs.renameSync(f + '.tmp', f);
    }
  }

  importBundle(bundle, { bearer = false, log = (m) => console.log(m) } = {}) {
    this._refuseUnread('an import'); // THE STORE HELD UNREAD: refused BY NAME before anything moves
    { const no = this._archiveImportSettle(); if (no) throw no; }   // B-0248 step 3 (c), r2292: what the archive is owed is WRITTEN before a group is replaced (else NEITHER place) — or nothing moves, refused by name
    const items = Array.isArray(bundle?.tasks) ? bundle.tasks : [];
    // every group's archived months read STRICTLY first (主开发 00:41Z (e)): one that could not be read refuses the import before ANY group is applied — and what was read is what the loop merges (never a second read that could fail half-way)
    const pre = new Map();
    for (const raw of items) { if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !/^T-[\w-]{1,60}$/.test(raw.id) || !archivableId(raw.id)) continue; const months = bundle.archive && bundle.archive[raw.id]; if (!months || typeof months !== 'object') continue; const have = new Map(); for (const [m, text] of Object.entries(months)) if (/^\d{4}-\d{2}$/.test(m) && typeof text === 'string') have.set(m, this._monthEntries(raw.id, m + '.ndjson', { strict: true })); pre.set(raw.id, have); }
    let n = 0;
    const late = new Set();   // lane lg-group-parents: the bundle's groups — their edges are judged after the store's own
    for (const raw of items) {
      if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !/^T-[\w-]{1,60}$/.test(raw.id)) continue;
      const now = Date.now();
      { const rd = pre.get(raw.id); pre.delete(raw.id); this._importArchive(raw.id, bundle.archive && bundle.archive[raw.id], rd); }   // taken ONCE: the same id twice reads again after the first wrote
      this._legacy.delete(raw.id);   // the imported record is whole — no held old fields of a replaced one
      this._state.tasks[raw.id] = {
        id: raw.id,
        title: String(raw.title || raw.id).slice(0, CAPS.title),
        kind: KINDS.includes(raw.kind) ? raw.kind : 'task',
        archived: !!raw.archived,
        attention: raw.attention && typeof raw.attention === 'object'
          ? { reason: String(raw.attention.reason || '').slice(0, CAPS.reason), since: Number(raw.attention.since) || now } : null,
        objective: typeof raw.objective === 'string' ? raw.objective.slice(0, CAPS.objective) : '',
        backlog: (() => {
          const taken = new Set();
          return Array.isArray(raw.backlog) ? raw.backlog.map((it) => ({
            id: (typeof it?.id === 'string' && BACKLOG_ID_RE.test(it.id) && !taken.has(it.id)) ? (taken.add(it.id), it.id) : mintBacklogId(taken),
            text: String(it?.text || '').slice(0, CAPS.backlogItem),
            status: BACKLOG_STATUSES.includes(it?.status) ? it.status : 'open',
            priority: normalizePriority(it?.priority),
            claimedBy: sanitizeStrArray(it?.claimedBy, 20),
            ...(typeof it?.detail === 'string' && it.detail ? { detail: it.detail.slice(0, CAPS.detail) } : {}),
            ...(it?.addedBy ? { addedBy: String(it.addedBy).slice(0, 120) } : {}),
            ...(Number(it?.addedAt) ? { addedAt: Number(it.addedAt) } : {}),
            ...(it?.resolvedBy ? { resolvedBy: String(it.resolvedBy).slice(0, 120) } : {}),
            ...(Number(it?.resolvedAt) ? { resolvedAt: Number(it.resolvedAt) } : {}),
          })).filter((it) => it.text) : [];
        })(),
        // dormant passthrough: a config bundle from an older instance may carry
        // a checklist — keep the data (never rendered), don't destroy it
        ...(Array.isArray(raw.plan) && raw.plan.length ? { plan: raw.plan.slice(0, 200) } : {}),
        // an entry keeps its P- id and, when it was cleared, its clear stamp (the sentence is its note)
        progress: (() => {
          const taken = new Set();
          return Array.isArray(raw.progress) ? this._keepLive(raw.id, raw.progress.map((p) => ({
            id: (typeof p?.id === 'string' && PROGRESS_ID_RE.test(p.id) && !taken.has(p.id)) ? (taken.add(p.id), p.id) : mintProgressId(taken),
            at: Number(p?.at) || now, note: String(p?.note || '').slice(0, CAPS.note), session: typeof p?.session === 'string' ? p.session.slice(0, 200) : null,
            ...(Number(p?.clearedAt) ? { clearedAt: Number(p.clearedAt), clearedBy: String(p?.clearedBy || 'owner').slice(0, 200) } : {}),
          }))) : [];
        })(),
        sessions: sanitizeStrArray(raw.sessions, 2000),
        // lane task-group-context: a bundle carries the table; an older instance's carries the old fields — their rows
        ctx: Array.isArray(raw.ctx) ? TC.sanitizeRows(raw.ctx, { selfId: raw.id })
          : TC.rowsFromLegacy({ folders: this._sanitizeFolders(raw.folders), contextDir: (typeof raw.contextDir === 'string' && path.isAbsolute(raw.contextDir)) ? raw.contextDir : null }).rows,
        color: (typeof raw.color === 'string' && !/[{};]/.test(raw.color)) ? raw.color.slice(0, 40) : null,
        // lane lg-group-parents: healed below, once every group is in (the cap AFTER the filter — the U2 read, 4); a BEARER's import
        // (the U2 read, 7) brings no lineage: an existing group keeps its own, a new one has none
        ...(bearer ? (this._state.tasks[raw.id] && Array.isArray(this._state.tasks[raw.id].parents) ? { parents: [...this._state.tasks[raw.id].parents] } : {})
          : Array.isArray(raw.parents) && raw.parents.length ? { parents: raw.parents.filter((p) => typeof p === 'string' && /^T-[\w-]{1,60}$/.test(p)).slice(0, 64) } : {}),
        createdAt: Number(raw.createdAt) || now,
        updatedAt: Number(raw.updatedAt) || now,
      };
      late.add(raw.id);
      n++;
    }
    if (n) { const dropped = this._healParents(late); if (dropped.length) log(`[task-groups] import: ${dropped.length} parent link(s) not taken (a gone group, itself, past ${PARENTS_MAX}, or one that would close a cycle): ${dropped.slice(0, 5).map(([child, parent]) => `${child} › ${parent}`).join(', ')}`); }
    // the deferred-save census (its Task Groups pass): the config import writes other stores (credentials, hosts, the password) right after
    // this section — the groups LAND first (bounded), as the release's synchronous save did
    if (n) {
      for (const id of late) if (this._state.tasks[id]) this._archRebound(this._state.tasks[id].sessions);   // B-0248 step 3: an imported member is a person's act — an owed archive unbind of it is not retried
      this._save(); const L = this._landNow('a config import'); this._notify();
      // the census cure ((b)): the groups land before the import writes the other stores — not on disk at the bound ⇒ THROWS by name
      // (the import stops there and says so; the groups stay in memory and the writer lands them)
      if (!L.ok) throw Object.assign(new Error(`the imported Task Groups are not on disk yet (${L.why}) — the import stopped before the other stores; import again once the storage answers`), { code: 'EVSNOTONDISK' });
    }
    return n;
  }
}

// B-31d7: the item's line + detail caps, for the route that REFUSES past them before a write (never a silent clip)
module.exports = { TaskGroupManager, PARENT_REFUSALS, BACKLOG_REFUSALS, backlogWithRow, oldPageAdd, MEMBER_RESULTS_MAX, DECIDE_BOUND_MS, BACKLOG_PRIORITIES, BACKLOG_CAPS: Object.freeze({ text: CAPS.backlogItem, detail: CAPS.detail }), CHANNELS_SECTION_LINES };
