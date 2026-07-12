/**
 * TaskGroupManager — the structured store for Task Groups (岗位; the persistent
 * role a session belongs to). docs/design-task-system.md + design-task-refactor.md.
 *
 * A Task Group is a TAG above sessions and a SUPERSET of the old user groups:
 * kind:'group' entries are exactly the old groups, kind:'task' adds
 * objective/checklist/activity/attention. `data/task-groups.json` (migrated
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
 * NOTE: internal identifiers still say `task`/`plan`/`progress` in places — the
 * user-facing concept is Task Group / Checklist / Activity log; wire names
 * (JSON fields, API paths, the `tasks-updated` event, CLI commands) are kept
 * for data + contract compatibility.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Task Groups (岗位) have NO status — they are persistent roles; only an
// `archived` flag. Task STATUS lives on the session (session-status.js STATES,
// which now includes `done`).
const KINDS = ['task', 'group'];
const CAPS = { title: 120, objective: 20000, note: 2000, detail: 6000, planItem: 500, planItems: 200, reason: 500 };

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
  renderTaskMd(t, cap = 50, { planDetail = cap > 0 } = {}) {
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
    if (t.plan?.length) {
      lines.push('', '## Checklist', '');
      // Injection (cap 0) stays dense: items mark detail with † (read via
      // `vibespace-task show --full`); TASK.md carries it as a blockquote.
      for (const p of t.plan) {
        lines.push(`- [${p.done ? 'x' : ' '}] ${p.text}${p.detail && !planDetail ? ' †' : ''}`);
        if (planDetail && p.detail) for (const dl of p.detail.split('\n')) lines.push(`  > ${dl}`);
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
    const sig = this._listContextFiles(dir, 200)
      .map((f) => `${f.path}:${f.size}:${Math.round(f.mtime || 0)}`)
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
  // and simply didn't use them. Now: identity/objective/checklist → TOOL RULES
  // → context folder → Activity log LAST, with the log byte-budgeted so the
  // whole payload stays inline (< ~8KB) in the common case.
  // Newest-first byte-budgeted Activity-log picker (≥3, ≤12 entries).
  _pickLogLines(t, room) {
    const total = (t.progress || []).length;
    const picked = [];
    for (let i = total - 1; i >= 0 && picked.length < 12; i--) {
      const p = t.progress[i];
      const line = `- ${this._tsShort(p.at)} ${p.note}${p.detail ? ' †' : ''}${p.session ? ` _(${p.session})_` : ''}`;
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
  _toolsSectionParts(gid, multi) {
    // DISCOVERY layer only (2.111.22): name each tool + its trigger. Detailed
    // syntax, caveats and enums live in each CLI's OWN output (run with no
    // args, or read the success line) — point-of-use teaching sticks better
    // and keeps this per-session injection lean. The behaviors that must be
    // known BEFORE first use (when to reach for a tool) stay here.
    const g = gid ? `\`${gid.trim()}\` ` : '';
    return ['', '### Reporting back — three CLIs are on your PATH (run any with no args for full usage)', '',
      multi
        ? `You belong to MORE THAN ONE Task Group; pass \`--group <id>\` to \`vibespace-task\` (each block below names its id). \`vibespace-status\`/\`vibespace-ask\` always mean THIS session.`
        : `They're bound to THIS session — you never pass a group id.`,
      '',
      `- \`vibespace-task\` ${g}— update the SHARED Task Group everyone sees: \`progress\` (log what you finished), \`plan-check\`/\`plan-add\` (the group's backlog), \`show\`. Run bare for syntax.`,
      `- \`vibespace-status <working|needs-input|blocked|review|done>\` — YOUR session's live state on the board. Set \`blocked\`/\`needs-input\` the moment you're stuck or waiting on the user; \`done\` when finished. Keep it honest.`,
      `- \`vibespace-ask "question"\` — the user's global inbox. **Whenever you ask the user anything or end a turn waiting on them, file it here AND write the full question (options + your recommendation) in your CHAT REPLY — the inbox is only a notification mirror, never the sole copy.** Resolve it yourself (\`vibespace-ask resolve\`) the moment they answer.`,
      '',
      'In chat replies use ABSOLUTE file paths (e.g. /home/user/out/final.wav) — the UI makes them clickable; bare/relative names may not resolve.'];
  }

  renderContext(id, { multi = false, ctxBase = null, logBudget = 8000, skipTools = false } = {}) {
    const t = this.get(id);
    const parts = [
      `<vibespace-task-context>`,
      `This session belongs to VibeSpace Task Group "${t.title}" (${t.id}). The state below is shared across ALL sessions of this group.`,
      this._persistRescueLine(),
      '',
      // cap=0: meta/objective/checklist only — the log is appended LAST below.
      this.renderTaskMd(t, 0).replace(/\n---\n[\s\S]*$/, '').trim(),
    ];
    // ── How to report back — self-documenting + scoped + enum-disambiguated ──
    // In multi-group payloads the tools section is emitted ONCE by
    // renderMultiContext (skipTools) — repeating ~2.3KB per group is what blew
    // a 2-group payload to 9.8KB / 3-group to 15.7KB, past the hook persist
    // threshold (agents then see only a ~2KB head preview and never learn the
    // tools — the same fleet-wide failure 2.68.0 fixed for the single-group case).
    if (!skipTools) parts.push(...this._toolsSectionParts(multi ? `--group ${t.id} ` : '', multi));
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
  renderMultiContext(groupIds, { ctxBaseFor = null } = {}) {
    const ids = (groupIds || []).filter((id) => this._state.tasks[id] && !this._state.tasks[id].archived);
    if (!ids.length) return '';
    const baseOf = (id) => (ctxBaseFor ? ctxBaseFor(id) : null);
    if (ids.length === 1) return this.renderContext(ids[0], { ctxBase: baseOf(ids[0]) });
    // LAYERED, not per-group blocks (user directive): tools → ALL identities →
    // ALL shared folders → ALL activity logs. Truncation then degrades by
    // LAYER — the first group's bulk can no longer erase the very EXISTENCE of
    // groups 2..N from a persisted payload's 2KB preview.
    const ts = Object.fromEntries(ids.map((id) => [id, this.get(id)]));
    const titles = ids.map((id) => `"${ts[id].title}" (${id})`).join(', ');
    const head = [
      `<vibespace-task-context>`,
      `This session belongs to ${ids.length} VibeSpace Task Groups (岗位): ${titles}. Their shared state follows in LAYERS (all groups' identities → shared folders → recent activity); use \`vibespace-task --group <id> …\` to act on a specific group.`,
      this._persistRescueLine(),
    ];
    head.push(...this._toolsSectionParts('--group <id> ', true));
    head.push('', '## Your Task Groups');
    for (const id of ids) {
      // renderTaskMd's H1/H2 demoted one level so groups nest under the layer heading
      const md = this.renderTaskMd(ts[id], 0).replace(/\n---\n[\s\S]*$/, '').trim().replace(/^(#{1,2}) /gm, '#$1 ');
      head.push('', md);
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
        plan: [],
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
      .map((t) => ({ ...t, plan: [...(t.plan || [])], progress: [...(t.progress || [])], sessions: [...(t.sessions || [])], folders: this._sanitizeFolders(t.folders) }))
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
      plan: [],
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
    if (patch.plan !== undefined) {
      if (!Array.isArray(patch.plan)) throw new Error('plan must be an array');
      t.plan = patch.plan.slice(0, CAPS.planItems).map((it) => ({
        text: String(it?.text || '').slice(0, CAPS.planItem),
        done: !!it?.done,
        // P5: loose, informational link — which session ticked this step
        // (recorded by vibespace-task plan-check; never enforced).
        ...(it?.by ? { by: String(it.by).slice(0, 120) } : {}),
        // 2.86.0: optional full context per item (acceptance criteria, paths,
        // background) — same summary+detail split as Activity entries.
        ...(typeof it?.detail === 'string' && it.detail.trim() ? { detail: it.detail.trim().slice(0, CAPS.detail) } : {}),
        // 2.85.0 attribution: who queued the item / when, when it was ticked.
        // ('user' = added from the UI.) Older items simply lack these.
        ...(it?.addedBy ? { addedBy: String(it.addedBy).slice(0, 120) } : {}),
        ...(Number(it?.addedAt) ? { addedAt: Number(it.addedAt) } : {}),
        ...(Number(it?.doneAt) ? { doneAt: Number(it.doneAt) } : {}),
      })).filter((it) => it.text);
    }
    if (patch.attention !== undefined) {
      t.attention = patch.attention
        ? { reason: String(patch.attention.reason || '').slice(0, CAPS.reason), since: Number(patch.attention.since) || Date.now() }
        : null;
    }
    t.updatedAt = Date.now();
    // contentUpdatedAt gates AGENT re-injection: only what the injected context
    // actually renders (title/objective/checklist/contextDir) counts. Cosmetic
    // patches (color, injectContext, archived, kind, folders, binds) bump only
    // updatedAt — they used to trigger a full "was UPDATED" re-injection to
    // every member agent.
    if (['title', 'objective', 'plan', 'contextDir'].some((k) => patch[k] !== undefined)) {
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
    if (t.plan?.length) {
      body.push('', '## Checklist', '');
      for (const p of t.plan) {
        body.push(`- [${p.done ? 'x' : ' '}] ${p.text}`);
        if (p.detail) for (const dl of p.detail.split('\n')) body.push(`  > ${dl}`);
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
    // (Plan/Progress) or EOF, so an objective that itself contains a markdown
    // heading (e.g. "## Constraints") is preserved, not truncated.
    let objective = '';
    const objM = body.match(/##\s+Objective\s*\n([\s\S]*?)(?=\n##\s+(?:Plan|Checklist|Progress|Activity log)\b|$)/i);
    if (objM) { objective = objM[1].trim(); if (objective === '_(none)_') objective = ''; }
    // Checklist = checkbox lines under "## Checklist" (or legacy "## Plan")
    const plan = [];
    const planM = body.match(/##\s+(?:Checklist|Plan)\s*\n([\s\S]*?)(?=\n##\s+(?:Progress|Activity log)\b|$)/i);
    if (planM) {
      for (const line of planM[1].split('\n')) {
        const pm = line.match(/^\s*-\s*\[([ xX])\]\s+(.+)$/);
        if (pm) { plan.push({ text: pm[2].trim().slice(0, CAPS.planItem), done: pm[1].toLowerCase() === 'x' }); continue; }
        // blockquote continuation = the preceding item's detail (round-trip of export)
        const dm = line.match(/^\s*>\s?(.*)$/);
        if (dm && plan.length) {
          const it = plan[plan.length - 1];
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
      plan: plan.slice(0, CAPS.planItems),
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
        plan: Array.isArray(raw.plan) ? raw.plan.slice(0, CAPS.planItems).map((it) => ({ text: String(it?.text || '').slice(0, CAPS.planItem), done: !!it?.done })).filter((it) => it.text) : [],
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
