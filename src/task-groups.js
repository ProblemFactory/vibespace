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
 * - Two INDEPENDENT optional folder bindings per group: folders[] auto-include
 *   sessions by cwd (old groupFolders), contextDir = the shared context
 *   folder (injection source).
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
const crypto = require('crypto');

// Task Groups (岗位) have NO status — they are persistent roles; only an
// `archived` flag. Task STATUS lives on the session (session-status.js STATES,
// which now includes `done`).
const KINDS = ['task', 'group'];
const CAPS = { title: 120, objective: 20000, note: 2000, detail: 6000, reason: 500, backlogItem: 500, backlogItems: 200 };
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

function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

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
  constructor({ dataDir, onChange, readUserState }) {
    // Authoritative store for Task Groups (岗位). Renamed from tasks.json in the
    // 岗位/活儿 refactor; _load migrates the old file once. The internal
    // `_state.tasks` map keeps its key (a wire/data structure — renaming it would
    // break existing files for no user-visible gain).
    this._file = path.join(dataDir, 'task-groups.json');
    this._legacyFile = path.join(dataDir, 'tasks.json');
    this._onChange = onChange || (() => {});
    this._state = { version: 1, tasks: {} };
    this._lastMd = new Map(); // groupId → last written TASK.md content (skip no-op writes)
    const existed = this._load();
    // One-time migration: Task Groups lost their status (岗位 refactor) — a
    // `done` group becomes archived, others just drop the field.
    let migrated = false;
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
      try { parsed = JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { continue; }
      if (!parsed || typeof parsed.tasks !== 'object') continue;
      this._state = parsed;
      if (legacy) this._save(); // migrate tasks.json → task-groups.json
      return true;
    }
    this._state = { version: 1, tasks: {} };
    return false;
  }

  _save() {
    const tmp = this._file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2));
    fs.renameSync(tmp, this._file);
    // Keep every context folder's generated TASK.md in lockstep with the
    // store (content-compare guard makes this a no-op for unchanged tasks)
    for (const t of Object.values(this._state.tasks)) this._syncTaskMd(t);
  }

  // ── Context folder: generated TASK.md + injection payload (P2) ──

  _tsShort(ms) { return new Date(ms).toISOString().slice(0, 16).replace('T', ' '); }

  // cap = how many Activity-log entries to include (TASK.md keeps 50).
  // cap = 0 omits the log entirely (renderContext appends its own budgeted log
  // section LAST instead — see the truncation note there).
  renderTaskMd(t, cap = 50) {
    const ts = (ms) => this._tsShort(ms);
    const lines = [
      `# ${t.title}`,
      '',
      `- Task ID: ${t.id}`,
      `- Updated: ${ts(t.updatedAt)} UTC`,
    ];
    const folders = this._sanitizeFolders(t.folders);
    if (folders.length) lines.push(`- Auto-include folders: ${folders.map((f) => f.path + (f.recursive ? '/**' : '')).join(', ')}`);
    lines.push('', '## Objective', '', t.objective?.trim() || '_(not set yet)_');
    // Backlog rides in the FULL renderings only (TASK.md / show) — the
    // injection payload (cap 0) deliberately omits it (user directive 2.122.0:
    // don't dump the backlog every hook; renderContext adds only a summary of
    // items THIS session parked + a one-line query pointer).
    const openBl = (t.backlog || []).filter((b) => b.status === 'open');
    if (cap > 0 && openBl.length) {
      lines.push('', '## Backlog  _(parked — deferred decisions / future work, NOT immediate tasks)_', '');
      for (const b of openBl) {
        lines.push(`- [${b.id || '?'}] ${b.text}${b.claimedBy?.length ? `  _(claimed by ${b.claimedBy.join(', ')})_` : ''}`);
        if (b.detail) for (const dl of b.detail.split('\n')) lines.push(`  > ${dl}`);
      }
    }
    const total = (t.progress || []).length;
    const prog = cap > 0 ? (t.progress || []).slice(-cap) : [];
    if (prog.length) {
      lines.push('', '## Activity log', '');
      if (total > cap) lines.push(`_(showing the last ${cap} of ${total} entries — run \`vibespace-task show\` or read this file for the rest)_`, '');
      for (const p of prog) {
        lines.push(`- ${ts(p.at)} ${p.note}${p.session ? ` _(${p.session})_` : ''}`);
        if (p.detail) for (const dl of p.detail.split('\n')) lines.push(`  > ${dl}`);
      }
    }
    lines.push('', '---', '_Generated by VibeSpace from the task store — do NOT edit (overwritten on every change). Update the task via the VibeSpace UI or the `vibespace-task` command._', '');
    return lines.join('\n');
  }

  _syncTaskMd(t) {
    if (!t.contextDir) return;
    try {
      const dir = path.join(t.contextDir, '.vibespace');
      const file = path.join(dir, 'TASK.md');
      const content = this.renderTaskMd(t);
      if (this._lastMd.get(t.id) === content) return;
      fs.mkdirSync(dir, { recursive: true });
      try { if (fs.readFileSync(file, 'utf-8') === content) { this._lastMd.set(t.id, content); return; } } catch { }
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, content);
      fs.renameSync(tmp, file);
      this._lastMd.set(t.id, content);
    } catch { /* contextDir may be missing/unwritable — never break task ops over it */ }
  }

  _listContextFiles(dir, cap = 100) {
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
  _pickLogLines(t, room) {
    const MAX_ENTRIES = 12;   // how many history lines at most
    const PER_NOTE = 200;     // per-entry char cap so long notes don't hog the budget
    const total = (t.progress || []).length;
    const picked = [];
    for (let i = total - 1; i >= 0 && picked.length < MAX_ENTRIES; i--) {
      const p = t.progress[i];
      let note = String(p.note || '');
      const clipped = note.length > PER_NOTE;
      // clean char-slice (no word-boundary regex — that gutted CJK notes, which
      // have no spaces: /\s+\S*$/ stripped back to the first space)
      if (clipped) note = note.slice(0, PER_NOTE - 1).trimEnd() + '…';
      const line = `- ${this._tsShort(p.at)} ${note}${(p.detail || clipped) ? ' †' : ''}${p.session ? ` _(${p.session})_` : ''}`;
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
  _toolsSectionParts(gid, multi, tools = null) {
    // DISCOVERY layer (2.111.22) with COPY-READY samples (2.111.25, user
    // directive): every line shows the COMPLETE correct invocation — waiting
    // states carry both --reason and --detail (enforced server-side), ask
    // carries --detail — so the first call an agent copies is already valid.
    // Syntax edge cases still live in each CLI's own no-args output.
    // Per-feature toggles (2.211.0): a disabled tool is OMITTED — teaching a
    // command whose endpoint refuses would train agents into dead ends.
    const T = tools || { status: true, ask: true, task: true };
    const n = [T.task, T.status, T.ask].filter(Boolean).length;
    if (!n) return [];
    const g = gid || '';
    const out = ['', `### Reporting back — ${n > 1 ? n + ' CLIs' : 'one CLI'} on your PATH (run ${n > 1 ? 'any' : 'it'} with no args for full usage)`, '',
      multi
        ? (T.task
          ? `You belong to MORE THAN ONE Task Group; pass \`--group <id>\` to \`vibespace-task\` (each block below names its id).${(T.status || T.ask) ? ` \`${[T.status && 'vibespace-status', T.ask && 'vibespace-ask'].filter(Boolean).join('`/`')}\` always mean${T.status && T.ask ? '' : 's'} THIS session.` : ''}`
          : `These are bound to THIS session.`)
        : `They're bound to THIS session — you never pass a group id.`];
    if (T.task) out.push(
      '',
      'After each meaningful piece of work, log it for the group:',
      `\`\`\``,
      `vibespace-task ${g}progress "one-line summary" --detail "specifics other agents may need"`,
      `\`\`\``,
      `(\`${g ? 'vibespace-task ' + g.trim() + ' ' : 'vibespace-task '}show --full\` re-reads the group's full state; keep your own working steps in your session todo list, not here)`,
      '',
      "When the user DEFERS something ('later' / 'let me think about it') — park it in the group's backlog so it isn't lost (backlog = NON-immediate items only: deferred decisions, future work; never start one unasked):",
      `\`\`\``,
      `vibespace-task ${g}backlog-add "one-line item" --detail "context for whoever picks it up later"`,
      `\`\`\``,
      `(parking auto-CLAIMS the item for you — claimed items are re-surfaced to you and their changes notify you. \`vibespace-task ${g}backlog\` lists; \`backlog <id>\` shows one in full; \`backlog-claim/-unclaim <id>\` take/hand back ownership — if the user hands you a backlog id, view it and claim it; \`backlog-done <id>\` once decided or finished)`);
    if (T.status) out.push(
      '',
      "Your session's live state on the board — set it the MOMENT it changes. Waiting states REQUIRE both flags:",
      `\`\`\``,
      `vibespace-status blocked --reason "what you're waiting on" --detail "context: options, what you tried, your recommendation" --urgency high`,
      `\`\`\``,
      '(states: working | needs-input | blocked | review | done — `done` when this piece of work is finished)');
    if (T.ask) out.push(
      '',
      'Whenever you ask the user anything or end a turn waiting on them — file it AND write the full question (options + recommendation) in your CHAT REPLY; the inbox only notifies, never the sole copy:',
      `\`\`\``,
      `vibespace-ask "the question" --detail "options + your recommendation" --urgency high`,
      `\`\`\``,
      'Resolve it YOURSELF the moment they answer (chat counts): `vibespace-ask resolve <id>`');
    out.push(
      '',
      'In chat replies use ABSOLUTE file paths (e.g. /home/user/out/final.wav) — the UI makes them clickable; bare/relative names may not resolve.');
    return out;
  }

  // Backlog note for INJECTION (user directive 2.122.0/2.123.0): never dump
  // the whole backlog per hook — show a summary reminder of the OPEN items
  // THIS session CLAIMED (the session that parks one auto-claims it), so the
  // responsible agent re-surfaces them; otherwise just one line saying how to
  // query/claim. Returns lines.
  _backlogNoteLines(t, { gid = '', sessionKey = null, tools = null } = {}) {
    if (tools && tools.task === false) return []; // backlog commands ride vibespace-task
    const open = (t.backlog || []).filter((b) => b.status === 'open');
    if (!open.length) return [];
    const mine = sessionKey ? open.filter((b) => (b.claimedBy || []).includes(sessionKey)) : [];
    const out = [''];
    if (mine.length) {
      out.push(`### Backlog reminders — items CLAIMED by THIS session, still open  _(surface them to the user when relevant; \`vibespace-task ${gid}backlog-done <id>\` once decided/finished; \`backlog-unclaim <id>\` to hand one back)_`);
      for (const b of mine.slice(0, 5)) {
        const clipped = b.text.length > 160;
        out.push(`- [${b.id || '?'}] ${clipped ? b.text.slice(0, 159).trimEnd() + '…' : b.text}${(b.detail || clipped) ? ' †' : ''}`);
      }
      if (mine.length > 5) out.push(`- … +${mine.length - 5} more claimed by you`);
      const others = open.length - mine.length;
      out.push(`(group backlog holds ${open.length} open parked item${open.length > 1 ? 's' : ''}${others ? ` incl. ${others} not claimed by you` : ''} — \`vibespace-task ${gid}backlog\` lists them)`);
    } else {
      out.push(`Group backlog: ${open.length} open parked item${open.length > 1 ? 's' : ''} (deferred decisions / future work — NOT immediate tasks; never start one unasked). \`vibespace-task ${gid}backlog\` lists them; \`backlog-claim <id>\` takes ownership of one.`);
    }
    return out;
  }

  renderContext(id, { multi = false, ctxBase = null, logBudget = 8000, skipTools = false, sessionKey = null, tools = null } = {}) {
    const t = this.get(id);
    const parts = [
      `<vibespace-task-context>`,
      `This session belongs to VibeSpace Task Group "${t.title}" (${t.id}). The state below is shared across ALL sessions of this group.`,
      this._persistRescueLine(),
      '',
      // cap=0: meta/objective only — the log is appended LAST below.
      this.renderTaskMd(t, 0).replace(/\n---\n[\s\S]*$/, '').trim(),
      ...this._backlogNoteLines(t, { gid: multi ? `--group ${t.id} ` : '', sessionKey, tools }),
    ];
    // ── How to report back — self-documenting + scoped + enum-disambiguated ──
    // In multi-group payloads the tools section is emitted ONCE by
    // renderMultiContext (skipTools) — repeating ~2.3KB per group is what blew
    // a 2-group payload to 9.8KB / 3-group to 15.7KB, past the hook persist
    // threshold (agents then see only a ~2KB head preview and never learn the
    // tools — the same fleet-wide failure 2.68.0 fixed for the single-group case).
    if (!skipTools) parts.push(...this._toolsSectionParts(multi ? `--group ${t.id} ` : '', multi, tools));
    if (t.contextDir) {
      const base = ctxBase || t.contextDir;
      parts.push('', `## Shared context folder (the group's shared memory)`, '',
        (ctxBase
          ? `\`${base}\` — a live-synced copy (newer file wins, ~1 min lag) of this group's shared context folder.`
          : `\`${base}\` — this group's shared context folder.`)
        + ` It is the group's SHARED MEMORY between agents: every session working this Task Group — now and in the future — reads it. It is NOT a place to publish deliverables for the user (put user-facing output wherever the user asked for it).`);
      const files = this._listContextFiles(t.contextDir);
      if (files.length) {
        parts.push('', 'Files (read what you need with your normal file tools):');
        for (const f of files) parts.push(`- ${base}/${f.path} (${f.size < 1024 ? f.size + ' B' : Math.round(f.size / 1024) + ' KB'})`);
      } else {
        parts.push('', '(No shared files yet.)');
      }
    }
    if (t.contextDir) {
      const cbase = ctxBase || t.contextDir;
      parts.push('', '### Using the shared context folder', '',
        `Whenever you learn something that OTHER agents working this group will likely need — conventions you discovered, gotchas, decisions and their reasons, or details another ROLE depends on (e.g. a compliance-focused session needs technical specifics that only a development session knows — the dev session should write them up) — organize it into a file in \`${cbase}\` yourself, without waiting to be asked. Write for a fellow agent starting cold: skimmable, factual, dated where it matters. Prefer updating/consolidating an existing file over piling up new ones.`,
        '',
        ctxBase
          ? `Files you write to \`${cbase}\` sync back to the group's shared folder (newer file wins, within ~1 minute). Do not create a \`.vibespace/\` subfolder there.`
          : `Everything under \`${t.contextDir}/.vibespace/\` is GENERATED by VibeSpace and read-only for you — never create, edit, or delete anything there (\`TASK.md\` in it always mirrors the state above). Write your shared files in the context folder itself, outside \`.vibespace/\`.`);
    }
    // Activity log LAST — the one section that can safely lose its tail to the
    // hook-preview truncation. Newest entries win the byte budget (≥3, ≤12).
    const totalLog = (t.progress || []).length;
    if (totalLog) {
      const used = Buffer.byteLength(parts.join('\n'), 'utf-8');
      const { picked } = this._pickLogLines(t, Math.max(1200, logBudget - used));
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
  // contentUpdatedAt (title/objective/contextDir) + progress. The
  // contextDir FILE state is deliberately absent: agent-routes already keeps
  // the folder signature separately (_ctxSig) and passes old/new to the diff.
  snapshotForDiff(id) {
    const t = this.get(id);
    const prog = t.progress || [];
    return {
      title: t.title,
      objHash: this._h(t.objective || ''),
      contextDir: t.contextDir || null,
      backlog: (t.backlog || []).map((b) => ({ id: b.id, text: b.text, status: b.status || 'open', d: b.detail ? this._h(b.detail) : '', addedBy: b.addedBy || null, claimedBy: [...(b.claimedBy || [])] })),
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
  // Returns null when the snapshot is unusable OR the change is STRUCTURAL
  // (contextDir designated/changed/cleared mid-session — the agent needs the
  // file index + shared-folder conventions only the full context teaches; a
  // one-line "folder is now X" left pre-existing files permanently invisible,
  // review-caught) → caller falls back to full delivery. Line order mirrors
  // renderContext (identity → objective → folder → activity LAST)
  // so tail-first truncation drops the safest section first.
  diffChanges(id, snap, { gid = '', ctxBase = null, oldSig = '', newSig = '', sessionKey = null } = {}) {
    const t = this.get(id);
    if (!snap || typeof snap !== 'object' || typeof snap.objHash !== 'string') return null;
    if ((snap.contextDir || null) !== (t.contextDir || null)) return null;
    const ch = [];
    const bits = []; // summary fragments, same order as the sections
    if (snap.title !== t.title) { ch.push(`- Renamed: "${snap.title}" → "${t.title}"`); bits.push('renamed'); }
    if (this._h(t.objective || '') !== snap.objHash) {
      bits.push('objective updated');
      const obj = (t.objective || '').trim();
      if (!obj) ch.push('- Objective CLEARED');
      else {
        ch.push('- Objective UPDATED to:');
        let room = 1800, cut = false; // bounded so a 20KB objective can't evict the sections below
        for (const l of obj.split('\n')) {
          const len = Buffer.byteLength(l, 'utf-8') + 4;
          if (len > room) { if (room > 200) ch.push('  > ' + l.slice(0, Math.floor(room / 2)) + '…'); cut = true; break; }
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
        if (st === 'open' && relevant(b)) blCh.push(`- Backlog PARKED [${b.id}]: ${b.text}${b.detail ? ' †' : ''}${b.addedBy ? `  _(by ${b.addedBy})_` : ''}`);
        continue;
      }
      oldById.delete(b.id); // remaining at the end = removed items
      if (!relevant(b) && !relevant(o)) continue; // not this session's item — the count line covers it
      if ((o.status || 'open') !== st) {
        const verb = st === 'done' ? 'RESOLVED' : st === 'dropped' ? 'DROPPED' : 'REOPENED';
        blCh.push(`- Backlog ${verb} [${b.id}]: ${b.text}${b.resolvedBy && st !== 'open' ? `  _(by ${b.resolvedBy})_` : ''}`);
        continue; // the status flip is the headline — skip lesser deltas
      }
      const oldClaims = o.claimedBy || [], newClaims = b.claimedBy || [];
      const gained = newClaims.filter((x) => !oldClaims.includes(x));
      const lost = oldClaims.filter((x) => !newClaims.includes(x));
      if (gained.length) blCh.push(`- Backlog CLAIMED [${b.id}]: ${b.text}  _(by ${gained.join(', ')})_`);
      if (lost.length) blCh.push(`- Backlog UNCLAIMED [${b.id}]: ${b.text}  _(${lost.join(', ')} handed it back)_`);
      if (st === 'open' && o.text !== b.text) blCh.push(`- Backlog item reworded [${b.id}]: ${b.text}`);
      else if (st === 'open' && (b.detail ? this._h(b.detail) : '') !== (o.d || '')) {
        blCh.push(`- Backlog item detail updated [${b.id}]: ${b.text}  _(† \`vibespace-task ${gid}show --full\`)_`);
      }
    }
    for (const [, o] of oldById) if ((o.status || 'open') === 'open' && relevant(o)) blCh.push(`- Backlog REMOVED [${o.id}]: ${o.text}`);
    const nBlChanges = blCh.length;
    if (blCh.length > 15) {
      const extra = blCh.length - 15;
      blCh.length = 15;
      blCh.push(`- … +${extra} more backlog changes  _(\`vibespace-task ${gid}backlog\`)_`);
    }
    ch.push(...blCh);
    if (nBlChanges) bits.push(`${nBlChanges} backlog change${nBlChanges > 1 ? 's' : ''}`);
    if (t.contextDir && oldSig !== newSig) {
      // Signature format is path:size:mtime joined by | (contextDirSignature;
      // path has % and | escaped there) — peel size:mtime off the END so paths
      // containing ':' stay intact, then unescape the path.
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
      const base = ctxBase || t.contextDir;
      const list = (arr) => arr.slice(0, 8).map((p) => `${base}/${p}`).join(', ') + (arr.length > 8 ? ` (+${arr.length - 8} more)` : '');
      const upd = [...b.keys()].filter((k) => a.has(k) && a.get(k) !== b.get(k));
      const add = [...b.keys()].filter((k) => !a.has(k));
      const del = [...a.keys()].filter((k) => !b.has(k));
      const fbits = [];
      if (upd.length) fbits.push(`updated ${list(upd)}`);
      if (add.length) fbits.push(`new ${list(add)}`);
      if (del.length) fbits.push(`removed ${list(del)}`);
      if (fbits.length) { ch.push(`- Shared context folder files — ${fbits.join('; ')}`); bits.push('shared files changed'); }
    }
    const fresh = (t.progress || []).filter((p) => p.at > (snap.lastProgressAt || 0));
    if (fresh.length) {
      const picked = [];
      let room = 2200;
      for (let i = fresh.length - 1; i >= 0 && picked.length < 8; i--) {
        const p = fresh[i];
        let note = String(p.note || '');            // per-entry cap so one long
        const clipped = note.length > 200;          // note can't starve the diff
        if (clipped) note = note.slice(0, 199).trimEnd() + '…'; // clean slice (CJK has no spaces)
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
    const gid = multi ? `--group ${t.id} ` : '';
    const ch = changes.lines.slice(); // cap loop mutates
    const head = [
      '<vibespace-task-update>',
      // TASK.md pointer is LOCAL-only: the remote ctx rsync excludes
      // .vibespace/, so <ctxBase>/.vibespace/TASK.md never exists on a host.
      `Task Group "${t.title}" (${t.id}) changed since your last update — DELTAS ONLY below; everything else you already know still stands. Full current state: \`vibespace-task ${gid}show --full\`${t.contextDir && !ctxBase ? ` (or \`${t.contextDir}/.vibespace/TASK.md\`)` : ''}.`,
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
    const enumStr = metas.map((m) => `"${m.t.title}" (${m.t.id}): ${m.changes.bits.join(' + ') || 'changed'}`).join(' · ');
    const head = [
      '<vibespace-task-update>',
      `${metas.length} of your Task Groups changed since your last update — DELTAS ONLY below; everything else you already know still stands. Changed: ${enumStr}. Full state per group: \`vibespace-task --group <id> show --full\`.`,
    ];
    const body = [];
    for (const m of metas) body.push('', `## "${m.t.title}" (${m.t.id})`, ...m.changes.lines);
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
  // Belonging is LIVE: a UI bind/drag or a folder change takes effect on the
  // agent's next turn with no respawn (fixes the old bind≠context gap). Returns
  // full task objects, stable order.
  groupsForSession({ sessionKey, cwd, realCwd, initialGroupId } = {}) {
    // Match a folder against the cwd AND its symlink-resolved realpath (a session
    // opened under claude-code-webui → vibespace must match a folder on either).
    // realpath is cached (this runs per prompt; same scheme as routes/sessions.js).
    let real = realCwd;
    if (!real && cwd) {
      if (!this._realCache) this._realCache = new Map();
      if (this._realCache.has(cwd)) real = this._realCache.get(cwd);
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
      if (!member && initialGroupId && t.id === initialGroupId) member = true;
      if (!member && cwds.length) {
        for (const f of this._sanitizeFolders(t.folders)) {
          if (cwds.some(c => c === f.path || (f.recursive && c.startsWith(f.path + '/')))) { member = true; break; }
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
  renderMultiContext(groupIds, { ctxBaseFor = null, sessionKey = null, tools = null } = {}) {
    const ids = (groupIds || []).filter((id) => this._state.tasks[id] && !this._state.tasks[id].archived);
    if (!ids.length) return '';
    const baseOf = (id) => (ctxBaseFor ? ctxBaseFor(id) : null);
    if (ids.length === 1) return this.renderContext(ids[0], { ctxBase: baseOf(ids[0]), sessionKey, tools });
    // LAYERED, not per-group blocks (user directive): tools → ALL identities →
    // ALL shared folders → ALL activity logs. Truncation then degrades by
    // LAYER — the first group's bulk can no longer erase the very EXISTENCE of
    // groups 2..N from a persisted payload's 2KB preview.
    const ts = Object.fromEntries(ids.map((id) => [id, this.get(id)]));
    const titles = ids.map((id) => `"${ts[id].title}" (${id})`).join(', ');
    const head = [
      `<vibespace-task-context>`,
      `This session belongs to ${ids.length} VibeSpace Task Groups (岗位): ${titles}. Their shared state follows in LAYERS (all groups' identities → shared folders → recent activity)${(!tools || tools.task !== false) ? '; use \`vibespace-task --group <id> …\` to act on a specific group' : ''}.`,
      this._persistRescueLine(),
    ];
    head.push(...this._toolsSectionParts('--group <id> ', true, tools));
    head.push('', '## Your Task Groups');
    for (const id of ids) {
      // renderTaskMd's H1/H2 demoted one level so groups nest under the layer heading
      const md = this.renderTaskMd(ts[id], 0).replace(/\n---\n[\s\S]*$/, '').trim().replace(/^(#{1,2}) /gm, '#$1 ');
      head.push('', md);
      // per-group backlog note (own-parked summary or a one-line pointer)
      const bl = this._backlogNoteLines(ts[id], { gid: `--group ${id} `, sessionKey, tools })
        .map((l) => l.replace(/^### /, '#### '));
      head.push(...bl);
    }
    const withDir = ids.filter((id) => ts[id].contextDir);
    if (withDir.length) {
      head.push('', `## Shared context folders (each group's shared memory)`, '',
        `Each folder below is that group's SHARED MEMORY between agents — every session working the group, now and future, reads it (NOT a place for user-facing deliverables). When you learn something other agents of a group will likely need (conventions, gotchas, decisions and their reasons, cross-role details), organize it into a file in that group's folder yourself, without waiting to be asked — skimmable, factual, dated; prefer updating existing files over piling up new ones. The \`.vibespace/\` subfolder inside each is GENERATED and read-only (its TASK.md mirrors the group state).`);
      for (const id of withDir) {
        const t = ts[id];
        const base = baseOf(id) || t.contextDir;
        head.push('', `### "${t.title}" → \`${base}\`` + (baseOf(id) ? ' _(live-synced copy, newer file wins, ~1 min lag)_' : ''));
        const files = this._listContextFiles(t.contextDir);
        if (files.length) for (const f of files) head.push(`- ${base}/${f.path} (${f.size < 1024 ? f.size + ' B' : Math.round(f.size / 1024) + ' KB'})`);
        else head.push('(no shared files yet)');
      }
    }
    const withLog = ids.filter((id) => (ts[id].progress || []).length);
    const build = (roomPer) => {
      const parts = [...head];
      if (withLog.length) {
        parts.push('', `## Recent activity  _(newest last; \`vibespace-task --group <id> show --full\` prints more; † = has detail)_`);
        for (const id of withLog) {
          const { picked, total } = this._pickLogLines(ts[id], roomPer);
          parts.push('', `### "${ts[id].title}"` + (picked.length < total ? `  _(last ${picked.length} of ${total})_` : ''), ...picked);
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
        folders: sanitizeStrArray(folders[name], 100),
        contextDir: null,
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
      .map((t) => ({ ...t, plan: undefined, backlog: (t.backlog || []).map((b) => ({ ...b })), progress: [...(t.progress || [])], sessions: [...(t.sessions || [])], folders: this._sanitizeFolders(t.folders) }))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  get(id) {
    const t = this._state.tasks[id];
    if (!t) throw new Error('task not found');
    return t;
  }

  create({ title, kind, archived, objective, sessions, folders, contextDir, color, injectContext } = {}) {
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
      folders: this._sanitizeFolders(folders),
      contextDir: this._sanitizeContextDir(contextDir),
      color: this._sanitizeColor(color),
      injectContext: injectContext !== false, // per-group context-injection toggle (default on)
      createdAt: now,
      updatedAt: now,
      contentUpdatedAt: now,
    };
    this._state.tasks[id] = t;
    this._save();
    this._notify();
    return { ...t };
  }

  // Folders are {path, recursive}. recursive:true (default) = sessions in any
  // SUBFOLDER auto-join; false = only sessions whose cwd is EXACTLY path.
  // Accepts legacy bare strings (→ {path, recursive:true}) so old data + old
  // callers keep working; dedup by path.
  _sanitizeFolders(folders) {
    if (!Array.isArray(folders)) return [];
    const seen = new Set();
    const out = [];
    for (const raw of folders) {
      let p, recursive = true;
      if (typeof raw === 'string') p = raw;
      else if (raw && typeof raw === 'object' && typeof raw.path === 'string') { p = raw.path; recursive = raw.recursive !== false; }
      else continue;
      p = p.trim().replace(/\/+$/, '');
      if (!p || seen.has(p)) continue;
      if (!(path.isAbsolute(p) || /^[^:]+::\//.test(p))) continue; // plain abs path or host::path
      seen.add(p);
      out.push({ path: p, recursive: !!recursive });
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
    if (patch.folders !== undefined) t.folders = this._sanitizeFolders(patch.folders);
    if (patch.contextDir !== undefined) t.contextDir = this._sanitizeContextDir(patch.contextDir);
    if (patch.color !== undefined) t.color = this._sanitizeColor(patch.color);
    if (patch.injectContext !== undefined) t.injectContext = !!patch.injectContext;
    // patch.plan is deliberately IGNORED (checklist removed 2.121.0) — an old
    // client bundle may still send it; a stored dormant t.plan stays untouched.
    if (patch.backlog !== undefined) {
      if (!Array.isArray(patch.backlog)) throw new Error('backlog must be an array');
      const taken = new Set(); // ids stay unique — a duplicated id gets re-minted
      t.backlog = patch.backlog.slice(0, CAPS.backlogItems).map((it) => ({
        // stable identity — survives text edits, referenced by CLI/diff/user
        id: (typeof it?.id === 'string' && BACKLOG_ID_RE.test(it.id) && !taken.has(it.id)) ? (taken.add(it.id), it.id) : mintBacklogId(taken),
        text: String(it?.text || '').slice(0, CAPS.backlogItem),
        status: BACKLOG_STATUSES.includes(it?.status) ? it.status : 'open',
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
    }
    if (patch.attention !== undefined) {
      t.attention = patch.attention
        ? { reason: String(patch.attention.reason || '').slice(0, CAPS.reason), since: Number(patch.attention.since) || Date.now() }
        : null;
    }
    t.updatedAt = Date.now();
    // contentUpdatedAt gates AGENT re-injection: only what the injected context
    // actually renders (title/objective/backlog/contextDir) counts. Cosmetic
    // patches (color, injectContext, archived, kind, folders, binds) bump only
    // updatedAt — they used to trigger a full "was UPDATED" re-injection to
    // every member agent.
    if (['title', 'objective', 'backlog', 'contextDir'].some((k) => patch[k] !== undefined)) {
      t.contentUpdatedAt = t.updatedAt;
    }
    this._save();
    this._notify();
    return { ...t };
  }

  remove(id) {
    this.get(id); // throws if missing
    delete this._state.tasks[id];
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
    const clean = String(note || '').trim().slice(0, CAPS.note);
    if (!clean) throw new Error('note required');
    const cleanDetail = typeof detail === 'string' && detail.trim() ? detail.trim().slice(0, CAPS.detail) : null;
    t.progress.push({ at: Date.now(), note: clean, ...(cleanDetail ? { detail: cleanDetail } : {}), session: typeof session === 'string' ? session.slice(0, 200) : null });
    if (t.progress.length > 500) t.progress = t.progress.slice(-500);
    t.updatedAt = Date.now();
    t.contentUpdatedAt = t.updatedAt; // progress is injected content
    this._save();
    this._notify();
    return { ...t };
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
      // [ ] open · [x] done · [-] dropped; the [B-xxxx] id round-trips — parsed back on import
      for (const b of bl) {
        body.push(`- [${b.status === 'done' ? 'x' : b.status === 'dropped' ? '-' : ' '}]${b.id ? ` [${b.id}]` : ''} ${b.text}`);
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
    try { text = fs.readFileSync(absPath, 'utf-8'); } catch { throw new Error('cannot read ' + absPath); }
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
    const blM = body.match(/##\s+Backlog\s*\n([\s\S]*?)(?=\n##\s+(?:Plan|Checklist|Progress|Activity log)\b|$)/i);
    if (blM) {
      for (const line of blM[1].split('\n')) {
        const bm = line.match(/^\s*-\s*\[([ xX-])\]\s+(?:\[(B-[0-9a-fA-F]{4,8})\]\s+)?(.+)$/);
        if (bm) {
          const mark = bm[1].toLowerCase();
          backlog.push({ ...(bm[2] ? { id: bm[2] } : {}), text: bm[3].trim().slice(0, CAPS.backlogItem), status: mark === 'x' ? 'done' : mark === '-' ? 'dropped' : 'open' });
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
        return (backlog.length ? backlog.slice(0, CAPS.backlogItems) : (existing?.backlog || [])).map((b) => {
          const prev = b.id ? prevById.get(b.id) : null;
          return {
            ...(prev || {}),
            ...b,
            id: (b.id && BACKLOG_ID_RE.test(b.id) && !taken.has(b.id)) ? (taken.add(b.id), b.id) : mintBacklogId(taken),
            claimedBy: Array.isArray(b.claimedBy) && b.claimedBy.length ? b.claimedBy : (prev?.claimedBy || []),
          };
        });
      })(),
      // a dormant stored checklist survives re-import untouched
      ...(existing?.plan?.length ? { plan: existing.plan } : {}),
      // prefer the store's live log if the task already exists (it's fuller —
      // the file caps at the last 30); otherwise seed from the file.
      progress: (existing?.progress?.length ? existing.progress : parsedProgress).slice(-500),
      sessions: existing?.sessions || [],
      folders: existing?.folders || [],
      contextDir: existing?.contextDir || null,
      color: (typeof fm.color === 'string' && fm.color !== 'null' && !/[{};]/.test(fm.color)) ? fm.color.slice(0, 40) : (existing?.color || null),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this._save();
    this._notify();
    return { ...this._state.tasks[id] };
  }

  // ── Config transfer (same contract as hosts/mounts) ──
  exportBundle() { return { version: 1, tasks: Object.values(this._state.tasks) }; }

  importBundle(bundle) {
    const items = Array.isArray(bundle?.tasks) ? bundle.tasks : [];
    let n = 0;
    for (const raw of items) {
      if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !/^T-[\w-]{1,60}$/.test(raw.id)) continue;
      const now = Date.now();
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
          return Array.isArray(raw.backlog) ? raw.backlog.slice(0, CAPS.backlogItems).map((it) => ({
            id: (typeof it?.id === 'string' && BACKLOG_ID_RE.test(it.id) && !taken.has(it.id)) ? (taken.add(it.id), it.id) : mintBacklogId(taken),
            text: String(it?.text || '').slice(0, CAPS.backlogItem),
            status: BACKLOG_STATUSES.includes(it?.status) ? it.status : 'open',
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
        progress: Array.isArray(raw.progress) ? raw.progress.slice(-500).map((p) => ({ at: Number(p?.at) || now, note: String(p?.note || '').slice(0, CAPS.note), session: typeof p?.session === 'string' ? p.session.slice(0, 200) : null })) : [],
        sessions: sanitizeStrArray(raw.sessions, 2000),
        folders: this._sanitizeFolders(raw.folders),
        contextDir: (typeof raw.contextDir === 'string' && path.isAbsolute(raw.contextDir)) ? raw.contextDir : null,
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

module.exports = { TaskGroupManager };
