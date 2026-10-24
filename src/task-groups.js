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
const crypto = require('crypto');
const os = require('os');
const TC = require('./task-context.js'); // PURE: the Context table's rows, resolution, derivations, budget plan (lane task-group-context)
const { pickColorSeq } = require('./task-color-seq');
const { folderOf, insideFolder } = require('./task-membership.js'); // PURE (lane open-task-binds): THE folder rule (a folder includes itself; a glob tail is the recursive switch) — the bundle's panel asks the same one
const belt = require('./agent-output-belt.js'); // lane agent-output-sinks: the sink belt — a progress note / detail a reader sees never carries a credential in the clear
// lane cli-call-timeouts: one TASK.md mirror write's bound (each op through SafeFs / fs.promises) and the retry after a miss
const MIRROR_BOUND_MS = 10000;
const MIRROR_RETRY_MS = 30000;
// Backlog PRIORITY + the ownership-aware selection every READ uses (TASK.md,
// the per-turn reminders, the show/backlog listing) — the store keeps every
// item; which ones a read shows is decided there (2026-09-22).
const { PRIORITIES: BACKLOG_PRIORITIES, normalizePriority, markedText, escapeItemText, unescapeItemText, sortBacklog, selectReminders, nudgeThreshold, backlogNudge, nudgeTextAll } = require('./backlog-select');
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
// a told file is read up to this many bytes (a bigger one never fits a budget whole — it steps down)
const READ_CAP = 64 * 1024;
// the four depths in the agent's words (a stepped row's line names both)
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
// (the entry's own `at`, UTC month), one JSON line per entry, by _archiveProgress (THE one writer) BEFORE the live
// list is trimmed: a crash between the two leaves the entry twice (every reader dedups by id), never nowhere. A month
// file is only ever appended to, except by a clear and a config import (each rewrites ONE month file, tmp + rename);
// a Task Group delete removes its directory. Reads page backwards by `before` (readProgress), bounded per request.
const LIVE_PROGRESS = 500;
const ARCHIVE_DIR = 'task-groups-archive';
const MONTH_FILE_RE = /^(\d{4}-\d{2})\.ndjson$/;
const ARCHIVE_CHUNK = 128 * 1024;          // ≥ one entry's line (note 2000 + detail 6000 chars, JSON-escaped)
const ARCHIVE_READ_BUDGET = 4 * 1024 * 1024; // bytes one page may read from the archive
const monthOf = (at) => { const d = new Date(Number(at) || 0); return isNaN(d) ? '1970-01' : d.toISOString().slice(0, 7); };
const archivableId = (id) => typeof id === 'string' && /^[\w-]{1,80}$/.test(id);
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

class TaskGroupManager {
  constructor({ dataDir, onChange, readUserState, getSetting, isPathShadowed, mirrorFs, mirrorBoundMs, grants = null, homeDir }) {
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
    this._mirror = new Map(); // groupId → { want: {dir, content}|null, inflight, since, startedAt, failedAt, why, retry }
    this._mirrorBoundMs = Number(mirrorBoundMs) > 0 ? Number(mirrorBoundMs) : MIRROR_BOUND_MS;   // (a suite shortens it)
    this._getSetting = getSetting || null; // tasks.autoStyleOrder for the allocator
    this._home = homeDir || os.homedir(); // a Context row's ~ and its last relative base
    // lane task-group-context: the OLD folder fields (folders[] / contextDir) — held aside per group, written back
    // into the file by _save (an older build still reads them, one release), read ONLY by migrateContextRows
    this._legacy = new Map();
    const existed = this._load();
    for (const t of Object.values(this._state.tasks)) this._holdLegacy(t);
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
    if (!existed && typeof readUserState === 'function') {
      // One-time legacy Groups migration (file existence is the guard: once the
      // store exists, legacy sessionGroups in user-state stay dormant).
      try { this._migrateGroups(readUserState()); } catch { /* fresh install */ }
      this._save();
    } else if (migrated) {
      this._save();
    }
    // Regenerate every context folder's TASK.md at boot (state may have
    // changed while a previous server was down; the program is the ONLY
    // writer of .vibespace/, so regenerating is always safe).
    for (const t of Object.values(this._state.tasks)) this._syncTaskMd(t);
  }

  _load() {
    // Prefer the current file; fall back to the legacy tasks.json ONCE and
    // migrate it forward (write the new file). The legacy file is left in place
    // (harmless) so an older server build could still read it if rolled back.
    for (const [f, legacy] of [[this._file, false], [this._legacyFile, true]]) {
      let parsed;
      try { parsed = timedSync('task-groups.read', () => JSON.parse(fs.readFileSync(f, 'utf-8'))); } catch { continue; }
      if (!parsed || typeof parsed.tasks !== 'object') continue;
      this._state = parsed;
      if (legacy) this._save(); // migrate tasks.json → task-groups.json
      return true;
    }
    this._state = { version: 1, tasks: {} };
    return false;
  }

  // the old fields leave the live record (nothing can read them by accident) and wait in _legacy for the file
  _holdLegacy(t) {
    if (!t || typeof t !== 'object' || !('folders' in t || 'contextDir' in t)) return;
    this._legacy.set(t.id, { folders: t.folders, contextDir: t.contextDir });
    delete t.folders; delete t.contextDir;
  }

  _save() {
    const tmp = this._file + '.tmp';
    // the held old fields ride back into the file beside each record (one release — see _holdLegacy)
    const doc = !this._legacy.size ? this._state : { ...this._state, tasks: Object.fromEntries(Object.entries(this._state.tasks).map(([id, t]) => [id, this._legacy.has(id) ? { ...t, ...this._legacy.get(id) } : t])) };
    timedSync('task-groups.write', () => { fs.writeFileSync(tmp, JSON.stringify(doc, null, 2)); fs.renameSync(tmp, this._file); });
    // Keep every context folder's generated TASK.md in lockstep with the
    // store (content-compare guard makes this a no-op for unchanged tasks)
    for (const t of Object.values(this._state.tasks)) this._syncTaskMd(t);
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
    if (SP.storageRootOf(dir)) { const f = this._facts.get('contextFiles', { path: dir, cap }); return f.ok && Array.isArray(f.result) ? f.result : []; }
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
  contextDirSignature(dir) {
    if (!dir) return '';
    if (!this._sigCache) this._sigCache = new Map();
    const hit = this._sigCache.get(dir);
    if (hit && Date.now() - hit.at < 4000) return hit.sig;
    // Path is escaped (% then |) so renderContextDiff can parse entries back
    // out of the joined string — a raw '|' in a filename would shear the entry.
    const sig = this._listContextFiles(dir, 200)
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
      const f = this._facts.get('stat', { path: abs });
      if (f.pending) return 'reading';
      if (f.ok) return f.result.isDirectory ? 'dir' : f.result.isFile ? 'file' : 'missing';
      return f.code === 'ENOENT' || f.code === 'ENOTDIR' ? 'missing' : 'blocked';
    }
    try { const st = fs.statSync(abs); return st.isDirectory() ? 'dir' : st.isFile() ? 'file' : 'missing'; } catch { return 'missing'; }
  }

  /** Where each row points (TC.resolveRows over the store's stat): [{ abs, kind, via }] in table order. Cached 4 s per
   *  table — membership asks it on every prompt of every session. `rows` = resolve these instead (a probe). */
  _res(t, rows = null) {
    const list = rows || this._ctxRows(t);
    if (!list.length) return [];
    const key = JSON.stringify(list.map((r) => (r.ref ? '@' + r.ref : r.path)));
    if (!this._resCache) this._resCache = new Map();
    const hit = this._resCache.get(key);
    if (hit && Date.now() - hit.at < 4000) return hit.res;
    const res = TC.resolveRows(list, { home: this._home, kindOf: (a) => this._kindOf(a) });
    if (this._resCache.size > 256) this._resCache.clear();
    this._resCache.set(key, { res, at: Date.now() });
    return res;
  }

  /** The old folders[], derived: every 'discover' row's folder [{ path, recursive: true }] (membership by cwd). */
  foldersOf(tOrId) { const t = this._groupOf(tOrId); return t ? TC.discoverFolders(this._ctxRows(t), this._res(t)) : []; }
  /** The old contextDir, derived: the 'notes' row's absolute folder or null (the .vibespace/TASK.md mirror lives there). */
  contextDirOf(tOrId) { const t = this._groupOf(tOrId); return t ? TC.notesDir(this._ctxRows(t), this._res(t)) : null; }

  // a row's stat, behind the mount door (B-afc4: a blocked mount is answered, never read) — null when blocked / gone
  _stat(abs) {
    if (DOOR.blocked(abs)) return null;
    if (SP.storageRootOf(abs)) { const f = this._facts.get('stat', { path: abs }); return f.ok ? { size: f.result.size, mtimeMs: f.result.mtimeMs, isDirectory: () => !!f.result.isDirectory, isFile: () => !!f.result.isFile } : null; }
    try { return fs.statSync(abs); } catch { return null; }
  }

  // a listed folder's files, path order (≤ WALK_DEPTH deep, ≤ WALK_CAP; `over` = more were there) — cached 4 s per folder;
  // a folder on a blocked mount lists nothing (asked BEFORE the walk)
  _walk(dir, { fresh = false } = {}) {
    if (DOOR.blocked(dir)) return { files: [], over: false };
    if (!this._walkCache) this._walkCache = new Map();
    const hit = this._walkCache.get(dir);
    if (hit && !fresh && Date.now() - hit.at < 4000) return hit.w;
    const files = this._listContextFiles(dir, WALK_CAP + 1);
    const w = { files: files.slice(0, WALK_CAP), over: files.length > WALK_CAP };
    if (this._walkCache.size > 256) this._walkCache.clear();
    this._walkCache.set(dir, { w, at: Date.now() });
    return w;
  }

  // a told file's text: { text, size, binary, big } — never past READ_CAP (a bigger file is `big`, never read whole)
  _readText(abs) {
    if (SP.storageRootOf(abs) && !DOOR.blocked(abs)) {
      const f = this._facts.get('textHead', { path: abs, cap: READ_CAP });
      if (f.ok) return f.result;
      return { text: '', size: 0, binary: false, big: false, reading: !!f.pending, missing: f.code === 'ENOENT', blocked: !f.pending && f.code !== 'ENOENT' };
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
  _toldRows(t) {
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
    const isDir = x && x.kind === 'dir';
    const where = x && x.abs ? agentLine(shown || x.abs) + (isDir ? '/' : '') : agentLine(r.path);
    const verbs = [];
    const tags = r.tags || [];
    if (tags.includes('discover')) verbs.push('conversations started here auto-join');
    if (tags.includes('notes')) verbs.push('agents keep the group\'s shared notes here');
    if (tags.includes('readonly')) verbs.push('read-only: never modify it');
    if (from) verbs.push(`from the Task Group "${agentLine(from.title)}"${tags.includes('readonly') ? '' : ', you may edit it'}`);
    let state = '';
    if (!x || (!x.abs && x.kind === 'missing')) state = ' — not there now';
    else if (x.kind === 'missing') state = ' — not there now';
    else if (x.kind === 'blocked') state = ' — its storage is not answering, not read';
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
      if (level === 'names') { const st = this._stat(x.abs); const l = `${head} — ${kb(st ? st.size : 0)}`; return { lines: [l], bytes: B([l]) }; }
      const f = this._readText(x.abs);
      if (f.big || f.missing || f.blocked || f.reading) return { lines: [head], bytes: Infinity };
      if (f.binary) { const l = `${head} — ${kb(f.size)}, binary (not shown)`; return { lines: [l], bytes: B([l]) }; }
      const ls = [`${head} — contents below (${kb(f.size)}):`, ...quote(f.text)];
      return { lines: ls, bytes: B(ls) };
    }
    const w = this._walk(x.abs);
    if (w.over) return { lines: [head], bytes: Infinity, over: true };
    const names = w.files.map((f) => `  - ${agentLine(f.path)} (${kb(f.size)})`);
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
  _ctxPlan(t, budget, { ctxBase = null, gid = '', only = null } = {}) {
    const told = this._toldRows(t).filter((it) => !only || only.has(it.k));
    const notesAbs = this.contextDirOf(t);
    const kb = (n) => (n < 1024 ? n + ' B' : (n / 1024).toFixed(1).replace(/\.0$/, '') + ' KB');
    // each told row asks TC.planRows (THE step-down rule) through a lazy cost: a level is rendered only when the plan asks
    // it, at the bytes left then (a contents walk stops reading past them and answers what it WOULD need)
    const items = told.map((it) => {
      if (it.head || it.gone) {
        const line = this._rowHead(it.row, null, { from: it.from }) + (it.gone ? ' — that group no longer exists' : it.n ? ` — ${it.n} row${it.n === 1 ? '' : 's'} it shares, below:` : ' — it shares no rows yet');
        return { it, kind: 'ref', chosen: 'note', shown: null, cache: new Map([['note', { lines: [line], bytes: Buffer.byteLength(line, 'utf-8') + 1 }]]) };
      }
      const shown = this._shown(it.x, ctxBase, notesAbs);
      return { it, kind: it.x && it.x.kind, chosen: TC.chosenTell(it.row, it.x && it.x.kind), shown, cache: new Map() };
    });
    const at = (m, lvl, cap) => {
      if (!m.cache.has(lvl)) m.cache.set(lvl, this._rowAt(m.it.row, m.it.x, lvl, { cap, shown: m.shown, from: m.it.from }));
      return m.cache.get(lvl);
    };
    const plan = TC.planRows(items.map((m) => ({ kind: m.kind, chosen: m.chosen, cost: (lvl, left) => { const r = at(m, lvl, left); return Number.isFinite(r.bytes) ? r.bytes : r.need != null ? r.need : Infinity; } })), budget);
    const out = [], rowsOut = [];
    items.forEach((m, i) => {
      const p = plan[i];
      const { row, x, from } = m.it;
      const r = at(m, p.level, p.left);
      let lines = r.lines;
      if (p.from && (m.kind === 'dir' || m.kind === 'file')) {
        const over = m.kind === 'dir' && this._walk(x.abs).over;
        const why = p.need != null ? `${TELL_WORDS[p.from]} need ${kb(p.need)}, ${kb(p.left)} was left` : `${TELL_WORDS[p.from]} ${over ? `cover more than ${WALK_CAP} files` : 'cannot be told whole'}`;
        const said = ` [over the injection budget: ${why} — told as ${TELL_WORDS[p.level]} instead${p.level === 'note' ? `; \`vibespace-task ${gid}show --full\` lists every file` : ''}]`;
        lines = [lines[0].replace(/:$/, '') + said + (lines.length > 1 ? ':' : ''), ...lines.slice(1)];
      }
      out.push(...lines);
      rowsOut.push({ row, x, from, level: p.level, chosen: m.chosen, need: p.need, left: p.left, files: r.files == null ? null : r.files, bytes: Buffer.byteLength(lines.join('\n'), 'utf-8') + 1, ...(m.kind === 'ref' ? { ref: true } : {}) });
    });
    const used = rowsOut.reduce((n, r) => n + r.bytes, 0);
    return { lines: out, used, rows: rowsOut };
  }

  /** The Context block as the injection prints it (heading + plan lines), or [] (no rows). */
  _ctxBlock(t, budget, { ctxBase = null, gid = '', heading = '## Context' } = {}) {
    if (!this._ctxRows(t).length) return { lines: [], plan: null };
    const plan = this._ctxPlan(t, budget, { ctxBase, gid });
    return { lines: ['', `${heading} (each row: path — note (what it is for); told at the depth the group chose, within ${(budget / 1024).toFixed(1).replace(/\.0$/, '')} KB)`, '', ...plan.lines], plan };
  }

  /** Every told file's state (path:size:mtime, % and | escaped, absolute paths): detects USER-written changes under the
   *  rows — files added / edited / removed outside the store, which bump nothing — so the next turn re-tells them. Rows
   *  told at 只说明 are not walked. TTL-cached 4 s (it runs on EVERY prompt for every belonged group). */
  contextSignature(tOrId) {
    const t = this._groupOf(tOrId);
    if (!t || !this._ctxRows(t).length) return '';
    if (!this._sigCache) this._sigCache = new Map();
    const key = 'ctx:' + t.id + ':' + JSON.stringify(this._ctxRows(t).map((r) => [r.path || '@' + r.ref, r.tell || '']));
    const hit = this._sigCache.get(key);
    if (hit && Date.now() - hit.at < 4000) return hit.sig;
    const esc = (p) => p.replace(/%/g, '%25').replace(/\|/g, '%7C');
    const parts = [];
    for (const it of this._toldRows(t)) {
      if (it.head || it.gone || !it.x) continue;
      const lvl = TC.chosenTell(it.row, it.x.kind);
      if (lvl === 'note') continue;
      if (it.x.kind === 'file') { const st = this._stat(it.x.abs); if (st) parts.push(`${esc(it.x.abs)}:${st.size}:${Math.round(st.mtimeMs || 0)}`); }
      // a FRESH walk (it refreshes the render's cache too — a re-delivery this signature causes lists what it saw)
      else if (it.x.kind === 'dir') for (const f of this._walk(it.x.abs, { fresh: true }).files) parts.push(`${esc(it.x.abs + '/' + f.path)}:${f.size}:${Math.round(f.mtime || 0)}`);
    }
    const sig = parts.join('|');
    if (this._sigCache.size > 256) this._sigCache.clear();
    this._sigCache.set(key, { sig, at: Date.now() });
    return sig;
  }

  /** The WHOLE listing behind `vibespace-task show --full` (where a stepped-down row points): the notes folder (dir +
   *  files, the old answer's shape) and every row's files. Paths as the agent reads them (a remote session's synced copy). */
  contextIndexOf(id, ctxBase = null) {
    const t = this.get(id);
    if (!t || !this._ctxRows(t).length) return null;
    const notesAbs = this.contextDirOf(t);
    const rows = [];
    for (const it of this._toldRows(t)) {
      if (it.head || it.gone || !it.x || !it.x.abs) continue;
      const shown = this._shown(it.x, ctxBase, notesAbs);
      if (it.x.kind === 'dir') rows.push({ path: shown, note: it.row.note || '', files: this._walk(it.x.abs).files.map((f) => ({ path: shown + '/' + f.path, size: f.size })) });
      else if (it.x.kind === 'file') { const st = this._stat(it.x.abs); rows.push({ path: shown, note: it.row.note || '', files: [{ path: shown, size: st ? st.size : 0 }] }); }
    }
    const base = notesAbs ? (ctxBase || notesAbs) : null;
    return { dir: base, files: notesAbs ? this._walk(notesAbs).files.map((f) => ({ path: base + '/' + f.path, size: f.size })) : [], rows };
  }

  /** ONE migration (2026-10-task-group-context-rows, src/server/migrations.js): every group that has no table yet gets
   *  its rows from its held old fields (TC.rowsFromLegacy — folders[] → 文件名 + 自动发现会话, contextDir → 文件名 +
   *  记笔记). The old fields stay in the file one release, no longer read. Idempotent (a group with `ctx` is skipped). */
  migrateContextRows() {
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
    if (rep.groups) { this._save(); this._notify(); }
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
  _pickLogLines(t, room, now = null) {
    const MAX_ENTRIES = 12;   // how many history lines at most
    const PER_NOTE = 200;     // per-entry char cap so long notes don't hog the budget
    const total = (t.progress || []).length;
    const picked = [];
    for (let i = total - 1; i >= 0 && picked.length < MAX_ENTRIES; i--) {
      const p = t.progress[i];
      const raw = String(p.note || '');
      const clipped = raw.length > PER_NOTE;
      // clean char-slice (no word-boundary regex — that gutted CJK notes, which
      // have no spaces: /\s+\S*$/ stripped back to the first space); the belt cuts BEFORE it judges (verify r4 F1)
      const note = agentLine(raw, clipped ? PER_NOTE : 0);
      const line = `- ${this._tsShort(p.at, now)} ${note}${(p.detail || clipped) ? ' †' : ''}${p.session ? ` _(${p.session})_` : ''}`;
      const len = Buffer.byteLength(line, 'utf-8') + 1;
      if (picked.length >= 3 && len > room) break;
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
      path: r.row.ref ? null : r.row.path, ref: r.row.ref || null, note: r.row.note || '',
      abs: r.x && r.x.abs ? r.x.abs : null, kind: r.x ? (r.x.ref ? 'ref' : r.x.kind) : null, via: r.x && r.x.via ? r.x.via : null,
      level: r.level, chosen: r.chosen, need: r.need, left: r.left, files: r.files, bytes: r.bytes || 0,
    })) : [];
    const block = [this.renderTaskMd(t, 0, { now }).replace(/\n---\n[\s\S]*$/, '').trim(), ...lines].join('\n');
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

  renderContext(id, { multi = false, ctxBase = null, logBudget = 8000, skipTools = false, sessionKey = null, tools = null, isLiveClaim = null, fileTools = undefined, now: nowAt = null } = {}) {
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
    // Activity log LAST — the one section that can safely lose its tail to the
    // hook-preview truncation. Newest entries win the byte budget (≥3, ≤12).
    const totalLog = (t.progress || []).length;
    if (totalLog) {
      const used = Buffer.byteLength(parts.join('\n'), 'utf-8');
      const { picked } = this._pickLogLines(t, Math.max(1200, logBudget - used), now);
      parts.push('', '## Activity log' + (picked.length < totalLog ? `  _(last ${picked.length} of ${totalLog} — \`vibespace-task show\` prints more)_` : '') + (picked.some(l => l.includes(' †')) ? `  _(† = has detail — \`vibespace-task show --full\`)_` : ''), '');
      parts.push(...picked);
    }
    parts.push(`</vibespace-task-context>`);
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
    return this._toldRows(t).map((it) => ({ k: it.k, h: this._h(JSON.stringify([it.row, it.n == null ? null : it.n, it.gone ? 1 : 0])), path: it.row.ref ? '@' + it.row.ref : it.row.path }));
  }
  _ctxHash(t) { return this._h(JSON.stringify(this._ctxKeys(t).map((r) => [r.k, r.h]))); }

  /** The instant agent-routes' injection gate compares: the group's own content instant, or a REFERENCED group's table
   *  instant when later (its shared rows are told here — an edit there must reach this group's members). */
  contentAtOf(tOrId) {
    const t = this._groupOf(tOrId);
    if (!t) return 0;
    let at = t.contentUpdatedAt || t.updatedAt || 0;
    for (const r of this._ctxRows(t)) if (r.ref) { const g = this._state.tasks[r.ref]; if (g && (g.ctxUpdatedAt || 0) > at) at = g.ctxUpdatedAt; }
    return at;
  }

  snapshotForDiff(id) {
    const t = this.get(id);
    const prog = t.progress || [];
    return {
      title: t.title,
      objHash: this._h(t.objective || ''),
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
  diffChanges(id, snap, { gid = '', ctxBase = null, oldSig = '', newSig = '', sessionKey = null } = {}) {
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
    for (const b of t.backlog || []) {
      const o = b.id ? oldById.get(b.id) : null;
      const st = b.status || 'open';
      if (!o) {
        // brand-new items: only OPEN ones are worth announcing (a new item
        // already resolved is history, not a pending parked thing)
        if (st === 'open' && relevant(b)) blCh.push(`- Backlog PARKED [${b.id}]: ${agentLine(b.text)}${b.detail ? ' †' : ''}${b.addedBy ? `  _(by ${b.addedBy})_` : ''}`);
        continue;
      }
      oldById.delete(b.id); // remaining at the end = removed items
      if (!relevant(b) && !relevant(o)) continue; // not this session's item — the count line covers it
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
    // ── the Context table (lane task-group-context): rows removed are named; rows added or changed are re-told at their
    // depths within a slice of the update's room (the same plan the full context prints)
    if (rowsChanged) {
      const keys = this._ctxKeys(t);
      const was = new Map(snap.ctxRows.map((r) => [r.k, r]));
      const now = new Set(keys.map((r) => r.k));
      for (const r of snap.ctxRows) if (!now.has(r.k)) ch.push(`- Context row REMOVED: ${agentLine(r.path)}`);
      const touched = keys.filter((r) => !was.has(r.k) || was.get(r.k).h !== r.h);
      if (touched.length) {
        const plan = this._ctxPlan(t, 2400, { ctxBase, gid, only: new Set(touched.map((r) => r.k)) });
        ch.push(`- Context row${touched.length > 1 ? 's' : ''} ${touched.every((r) => !was.has(r.k)) ? 'ADDED' : 'ADDED or CHANGED'} — as told now:`, ...plan.lines.map((l) => '  ' + l));
      }
      bits.push('context table changed');
    }
    if (oldSig !== newSig && this._ctxRows(t).length) {
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
    if (fresh.length) {
      const picked = [];
      let room = 2200;
      for (let i = fresh.length - 1; i >= 0 && picked.length < 8; i--) {
        const p = fresh[i];
        const raw = String(p.note || '');            // per-entry cap so one long
        const clipped = raw.length > 200;            // note can't starve the diff
        const note = agentLine(raw, clipped ? 200 : 0); // clean slice (CJK has no spaces); the belt cuts BEFORE it judges (verify r4 F1)
        const line = `  - ${this._tsShort(p.at)} ${note}${(p.detail || clipped) ? ' †' : ''}${p.session ? ` _(${p.session})_` : ''}`;
        const len = Buffer.byteLength(line, 'utf-8') + 1;
        if (picked.length >= 1 && len > room) break;
        picked.unshift(line); room -= len;
      }
      ch.push(`- New activity${fresh.length > picked.length ? ` _(last ${picked.length} of ${fresh.length} new)_` : ` (${fresh.length})`}:${picked.some((l) => l.includes(' †')) ? '  _(† = has detail)_' : ''}`);
      ch.push(...picked);
      bits.push(`${fresh.length} new activity`);
    }
    return { lines: ch, bits };
  }

  // ONE group's delta as a standalone <vibespace-task-update> block.
  // Back-compat single-group API: computes + renders. Returns null (fall back
  // to full) / '' (no-op change, skip) / the block.
  renderContextDiff(id, snap, { multi = false, ctxBase = null, oldSig = '', newSig = '', sessionKey = null } = {}) {
    const gid = multi ? `--group ${id} ` : '';
    const r = this.diffChanges(id, snap, { gid, ctxBase, oldSig, newSig, sessionKey });
    if (r === null) return null;
    if (!r.lines.length) return '';
    return this.renderDiffBlock(id, r, { multi, ctxBase });
  }

  // Render a single group's precomputed diffChanges result as a block.
  renderDiffBlock(id, changes, { multi = false, ctxBase = null } = {}) {
    const t = this.get(id);
    const notesAbs = this.contextDirOf(t);
    const gid = multi ? `--group ${t.id} ` : '';
    const ch = changes.lines.slice(); // cap loop mutates
    const head = [
      '<vibespace-task-update>',
      // TASK.md pointer is LOCAL-only: the remote ctx rsync excludes
      // .vibespace/, so <ctxBase>/.vibespace/TASK.md never exists on a host.
      `Task Group "${agentLine(t.title)}" (${t.id}) changed since your last update — DELTAS ONLY below; everything else you already know still stands. Full current state: \`vibespace-task ${gid}show --full\`${notesAbs && !ctxBase ? ` (or \`${agentLine(notesAbs)}/.vibespace/TASK.md\`)` : ''}.`,
      '',
    ];
    // Hard cap ~5KB — drop change lines from the END (activity sits last = the
    // safest to lose; the full-state pointer in the header always survives).
    let dropped = 0;
    let lines = [...head, ...ch, '</vibespace-task-update>'];
    while (Buffer.byteLength(lines.join('\n'), 'utf-8') > 5000 && ch.length > 1) {
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
  renderContextDiffMulti(items) {
    const metas = items
      .map((it) => ({ ...it, t: this.get(it.id), size: Buffer.byteLength(it.changes.lines.join('\n'), 'utf-8') }))
      .sort((a, b) => a.size - b.size);
    const enumStr = metas.map((m) => `"${agentLine(m.t.title)}" (${m.t.id}): ${m.changes.bits.join(' + ') || 'changed'}`).join(' · ');
    const head = [
      '<vibespace-task-update>',
      `${metas.length} of your Task Groups changed since your last update — DELTAS ONLY below; everything else you already know still stands. Changed: ${enumStr}. Full state per group: \`vibespace-task --group <id> show --full\`.`,
    ];
    const body = [];
    for (const m of metas) body.push('', `## "${agentLine(m.t.title)}" (${m.t.id})`, ...m.changes.lines);
    let lines = [...head, ...body, '</vibespace-task-update>'];
    // Cap ~6.5KB total — drop body lines from the END (the biggest group sits
    // last); a section emptied down to its heading loses the heading too. The
    // enumeration header always survives, so no group's update can vanish.
    let over = false;
    while (Buffer.byteLength(lines.join('\n'), 'utf-8') > 6500 && body.length > 3) {
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
  groupsForSession({ sessionKey, cwd, realCwd, initialGroupId, initialGroupIds } = {}) {
    const spawnedInto = new Set([...(Array.isArray(initialGroupIds) ? initialGroupIds : []), initialGroupId].filter((x) => typeof x === 'string' && x));
    // Match a folder against the cwd AND its symlink-resolved realpath (a session
    // opened under claude-code-webui → vibespace must match a folder on either).
    // realpath is cached (this runs per prompt; same scheme as routes/sessions.js).
    let real = realCwd;
    if (!real && cwd) {
      if (!this._realCache) this._realCache = new Map();
      if (this._realCache.has(cwd)) real = this._realCache.get(cwd);
      else if (DOOR.blocked(cwd)) real = null;   // B-afc4: a sync realpath into a dead FUSE — not cached, resolved once it answers
      else if (SP.storageRootOf(cwd)) real = null;   // lane hub-fuse-sync-guard: never a sync walk into a storage mount — the cwd itself matches
      else {
        try { real = fs.realpathSync(cwd); } catch { real = null; }
        this._realCache.set(cwd, real);
      }
    }
    const cwds = [cwd, real && real !== cwd ? real : null].filter(Boolean);
    const out = [];
    for (const t of Object.values(this._state.tasks)) {
      if (t.archived) continue;
      let member = false;
      if (sessionKey && Array.isArray(t.sessions) && t.sessions.includes(sessionKey)) member = true;
      if (!member && spawnedInto.has(t.id)) member = true;
      if (!member && cwds.length) {
        for (const f of this.foldersOf(t)) {   // lane task-group-context: the 自动发现会话 rows (recursive)
          if (cwds.some((c) => insideFolder(c, f))) { member = true; break; }
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
  renderMultiContext(groupIds, { ctxBaseFor = null, sessionKey = null, tools = null, isLiveClaim = null, fileTools = undefined } = {}) {
    const ids = (groupIds || []).filter((id) => this._state.tasks[id] && !this._state.tasks[id].archived);
    if (!ids.length) return '';
    const baseOf = (id) => (ctxBaseFor ? ctxBaseFor(id) : null);
    if (ids.length === 1) return this.renderContext(ids[0], { ctxBase: baseOf(ids[0]), sessionKey, tools, isLiveClaim, fileTools });
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
    for (const id of ids) {
      // renderTaskMd's H1/H2 demoted one level so groups nest under the layer heading
      const md = this.renderTaskMd(ts[id], 0, { now }).replace(/\n---\n[\s\S]*$/, '').trim().replace(/^(#{1,2}) /gm, '#$1 ');
      head.push('', md);
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
    const withRows = ids.filter((id) => this._ctxRows(ts[id]).length);
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
        const plan = this._ctxPlan(ts[id], budget, { ctxBase: baseOf(id), gid: `--group ${id} ` });
        head.push('', `### "${agentLine(ts[id].title)}"`, ...plan.lines);   // its id is in the identities layer above
      });
    }
    head.push(...teach);
    const withLog = ids.filter((id) => (ts[id].progress || []).length);
    const build = (roomPer) => {
      const parts = [...head];
      if (withLog.length) {
        parts.push('', `## Recent activity  _(newest last; \`vibespace-task --group <id> show --full\` prints more; † = has detail)_`);
        for (const id of withLog) {
          const { picked, total } = this._pickLogLines(ts[id], roomPer, now);
          parts.push('', `### "${agentLine(ts[id].title)}"` + (picked.length < total ? `  _(last ${picked.length} of ${total})_` : ''), ...picked);
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
    return out;
  }

  _notify() { try { this._onChange(this.list()); } catch { } }

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
    return Object.values(this._state.tasks)
      .map((t) => this._view(t))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
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
  /** THE ONE WRITER of a group's outside visibility: `{externalVisibility?, externalVisibilityExcept?}` (each absent ⇒ kept). */
  _setVisibility(id, patch) {
    const g = this._grants();
    if (!g) throw new Error('the grants store is not available — the visibility was not changed');
    const cur = this.visibilityOf(id);
    const level = patch.externalVisibility !== undefined ? (['visible', 'messageable'].includes(patch.externalVisibility) ? patch.externalVisibility : null) : cur.externalVisibility;
    const except = patch.externalVisibilityExcept !== undefined ? (Array.isArray(patch.externalVisibilityExcept) ? patch.externalVisibilityExcept : null) : cur.externalVisibilityExcept;
    if (except === null) throw new Error('externalVisibilityExcept must be a list of conversations ({kind:"conversation", key}) and Task Groups');
    const w = g.set('group-visibility', String(id), level ? { to: [{ kind: 'group', id: String(id), level }], except } : { to: [], except: [] }, 'user');
    if (!w.ok) throw new Error(w.error || w.code);
  }

  // ONE group as the wire carries it (list() / view()) — copies, never the live record.
  // lane task-group-context: the table + where each row points (`ctxRes`, derived); `folders` / `contextDir` are the
  // DERIVED old names (the 'discover' rows, the 'notes' row) — every reader of the wire keeps working, nothing stores them
  _view(t) {
    const rows = this._ctxRows(t), res = this._res(t);
    return {
      ...t, plan: undefined, backlog: (t.backlog || []).map((b) => ({ ...b })), progress: [...(t.progress || [])], sessions: [...(t.sessions || [])],
      ctx: rows.map((r) => ({ ...r, ...(r.tags ? { tags: [...r.tags] } : {}) })),
      ctxRes: res.map((x) => (x.ref ? { ref: true } : { abs: x.abs || null, kind: x.kind, via: x.via || null, ...(x.host ? { host: x.host } : {}) })),
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

  create({ title, kind, archived, objective, sessions, ctx, folders, contextDir, color, pattern, injectContext, browserProfileId, browserCap } = {}) {
    const cleanTitle = String(title || '').trim().slice(0, CAPS.title);
    if (!cleanTitle) throw new Error('title required');
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
      createdAt: now,
      updatedAt: now,
      contentUpdatedAt: now,
    };
    this._state.tasks[id] = t;
    this._save();
    this._notify();
    return { ...t };
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

  update(id, patch = {}) {
    const t = this.get(id);
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
    if (patch.sessions !== undefined) t.sessions = sanitizeStrArray(patch.sessions, 2000);
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
    t.updatedAt = Date.now();
    // contentUpdatedAt gates AGENT re-injection: only what the injected context
    // actually renders (title/objective/backlog/the Context table) counts.
    // Cosmetic patches (color, injectContext, archived, kind, binds) bump only
    // updatedAt — they used to trigger a full "was UPDATED" re-injection to
    // every member agent. The table's own instant (ctxUpdatedAt) also reaches
    // every group that REFERENCES this one (contentAtOf).
    if (['title', 'objective', 'backlog'].some((k) => patch[k] !== undefined) || ctxChanged) {
      t.contentUpdatedAt = t.updatedAt;
    }
    if (ctxChanged) t.ctxUpdatedAt = t.updatedAt;
    this._save();
    this._notify();
    return { ...t };
  }

  remove(id) {
    this.get(id); // throws if missing
    // its archived Activity log goes with it (first: a failed delete keeps the group, never orphaned words)
    if (archivableId(id)) fs.rmSync(path.join(this._archiveRoot, id), { recursive: true, force: true });
    delete this._state.tasks[id];
    try { const g = this._grants(); if (g) g.remove('group-visibility', String(id), 'user'); } catch { /* the row of a gone group admits nobody */ }   // lane grants-unify
    this._legacy.delete(id);
    this._save();
    this._notify();
  }

  // Granular tag add/remove — atomic server-side so two clients binding
  // different sessions never clobber each other's sessions array.
  bind(id, sessionKey) {
    const t = this.get(id);
    const key = String(sessionKey || '');
    if (!key) throw new Error('sessionKey required');
    if (!t.sessions.includes(key)) {
      t.sessions.push(key);
      t.updatedAt = Date.now();
      this._save();
      this._notify();
    }
    return { ...t };
  }

  unbind(id, sessionKey) {
    const t = this.get(id);
    const key = String(sessionKey || '');
    const idx = t.sessions.indexOf(key);
    if (idx >= 0) {
      t.sessions.splice(idx, 1);
      t.updatedAt = Date.now();
      this._save();
      this._notify();
    }
    return { ...t };
  }

  // User-visible progress note (P1: from the detail UI; P3: vibespace-task CLI).
  // note = the ONE-LINE summary everyone sees inline (board, injected context);
  // detail = optional full context, retrieved on demand (TASK.md, show --full,
  // the board's expandable rows). Keeping them separate is what lets the
  // injected Activity log stay dense without losing information.
  addProgress(id, { note, detail, session } = {}) {
    const t = this.get(id);
    const dataDir = path.dirname(this._file);   // the belt finds the vault from here
    const clean = belt.maskForSink(String(note || '').trim(), { dataDir }).slice(0, CAPS.note);   // agent-output-sinks: mask BEFORE it lands
    if (!clean) throw new Error('note required');
    const cleanDetail = typeof detail === 'string' && detail.trim() ? belt.maskForSink(detail.trim(), { dataDir }).slice(0, CAPS.detail) : null;
    const taken = new Set((t.progress || []).map((p) => p && p.id).filter(Boolean));
    t.progress.push({ id: mintProgressId(taken), at: Date.now(), note: clean, ...(cleanDetail ? { detail: cleanDetail } : {}), session: typeof session === 'string' ? session.slice(0, 200) : null });
    t.progress = this._keepLive(id, t.progress);
    t.updatedAt = Date.now();
    t.contentUpdatedAt = t.updatedAt; // progress is injected content
    this._save();
    this._notify();
    return { ...t };
  }

  /** THE archive writer: `entries` (oldest first) appended to their month files. Throws on a failed write. */
  _archiveProgress(id, entries) {
    if (!archivableId(id)) throw new Error('no archive for this group id');
    const byMonth = new Map();
    for (const p of entries) if (p && typeof p === 'object') { const m = monthOf(p.at); byMonth.set(m, (byMonth.get(m) || '') + JSON.stringify(p) + '\n'); }
    if (!byMonth.size) return;
    const dir = path.join(this._archiveRoot, id);
    fs.mkdirSync(dir, { recursive: true });
    for (const [m, text] of byMonth) fs.appendFileSync(path.join(dir, m + '.ndjson'), text);
  }
  /** `list` capped to the live LIVE_PROGRESS: the overflow MOVES to the archive first; a failed archive write keeps it live. */
  _keepLive(id, list) {
    if (list.length <= LIVE_PROGRESS) return list;
    try { this._archiveProgress(id, list.slice(0, list.length - LIVE_PROGRESS)); }
    catch (e) { console.error(`[task-groups] ${id}: the Activity-log archive write failed (${(e && e.code) || 'error'}) — the overflow stays live`); return list; }
    return list.slice(-LIVE_PROGRESS);
  }
  _archiveMonths(id) {
    if (!archivableId(id)) return [];
    try { return fs.readdirSync(path.join(this._archiveRoot, id)).filter((f) => MONTH_FILE_RE.test(f)).sort().reverse(); } catch { return []; }
  }
  /** one month file's entries (deduped by id, a cleared copy wins), or [] */
  _monthEntries(id, file) {
    let text = '';
    try { text = fs.readFileSync(path.join(this._archiveRoot, id, file), 'utf8'); } catch { return []; }
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
    const f = path.join(this._archiveRoot, id, m + '.ndjson');
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
    for (const [m, ids] of archivableId(id) ? months : []) for (const x of this._archiveClear(id, m, ids, { by, at })) archived.add(x);
    for (const { p, live } of targets) {
      const r = live ? applyClear(p, { kind: 'activity', by, at }) : { changed: false };
      (r.changed || archived.has(p.id) ? out.cleared : out.already).push(p.id);
    }
    if (archived.size) t.archiveClearedAt = Date.now(); // the Task log window re-reads the archive rows it holds
    if (out.cleared.length) {
      t.updatedAt = Date.now();
      this._save();
      this._notify();
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

  // Write a task to an absolute file path (creating parent dirs). Returns path.
  exportToFile(id, absPath) {
    const t = this.get(id);
    if (typeof absPath !== 'string' || !path.isAbsolute(absPath)) throw new Error('an absolute file path is required');
    const dir = path.dirname(absPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = absPath + '.tmp';
    fs.writeFileSync(tmp, this.renderRepoFile(t));
    fs.renameSync(tmp, absPath);
    return absPath;
  }

  // Parse a repo task file (frontmatter is authoritative for id/title/kind/
  // status/color; body parsed leniently for objective + plan). Creates a new
  // task or updates the existing one with the same id. One-shot at import —
  // after this the structured store is the truth (never re-parsed live).
  importFromFile(absPath) {
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
      color: (typeof fm.color === 'string' && fm.color !== 'null' && !/[{};]/.test(fm.color)) ? fm.color.slice(0, 40) : (existing?.color || null),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this._save();
    this._notify();
    return { ...this._state.tasks[id] };
  }

  // ── Config transfer (same contract as hosts/mounts) ──
  // 2.369.204: the archived Activity log rides along — { <taskId>: { <YYYY-MM>: ndjson } } (Backup & migrate)
  exportBundle() {
    const archive = {};
    for (const id of Object.keys(this._state.tasks)) for (const f of this._archiveMonths(id)) {
      try { (archive[id] = archive[id] || {})[f.slice(0, 7)] = fs.readFileSync(path.join(this._archiveRoot, id, f), 'utf8'); } catch { /* gone meanwhile */ }
    }
    return { version: 1, tasks: Object.values(this._state.tasks), ...(Object.keys(archive).length ? { archive } : {}) };
  }
  /** an imported group's archive months, MERGED into this instance's (by id, a cleared copy wins, time order), one tmp + rename per month */
  _importArchive(id, months) {
    if (!archivableId(id) || !months || typeof months !== 'object') return;
    for (const [m, text] of Object.entries(months)) {
      if (!/^\d{4}-\d{2}$/.test(m) || typeof text !== 'string') continue;
      const byId = new Map(this._monthEntries(id, m + '.ndjson').map((p) => [p.id, p]));
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

  importBundle(bundle) {
    const items = Array.isArray(bundle?.tasks) ? bundle.tasks : [];
    let n = 0;
    for (const raw of items) {
      if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !/^T-[\w-]{1,60}$/.test(raw.id)) continue;
      const now = Date.now();
      this._importArchive(raw.id, bundle.archive && bundle.archive[raw.id]);
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
        createdAt: Number(raw.createdAt) || now,
        updatedAt: Number(raw.updatedAt) || now,
      };
      n++;
    }
    if (n) { this._save(); this._notify(); }
    return n;
  }
}

// B-31d7: the item's line + detail caps, for the route that REFUSES past them before a write (never a silent clip)
module.exports = { TaskGroupManager, BACKLOG_PRIORITIES, BACKLOG_CAPS: Object.freeze({ text: CAPS.backlogItem, detail: CAPS.detail }), CHANNELS_SECTION_LINES };
