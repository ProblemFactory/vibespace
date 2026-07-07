/**
 * TaskManager — the task system's structured store (docs/design-task-system.md).
 *
 * A task is a TAG above sessions and a SUPERSET of the old user groups:
 * kind:'group' tasks are exactly the old groups (no goal/lifecycle shown),
 * kind:'task' adds status/objective/plan/attention. `data/tasks.json` is
 * AUTHORITATIVE for everything the board renders — the UI never parses
 * agent-authored text (agents are non-deterministic; see §3.2 of the design).
 *
 * - Groups migration: on first load with no tasks.json, sessionGroups +
 *   groupFolders from user-state.json become kind:'group' tasks (one-time,
 *   guarded by file existence). user-state keeps the legacy keys dormant.
 * - Two INDEPENDENT optional folder bindings per task: folders[] auto-include
 *   sessions by cwd (old groupFolders), contextDir = the shared context
 *   folder (P2 injection source; P1 just designates + browses it).
 * - Atomic writes + tasks-updated broadcast via onChange, same manager
 *   pattern as hosts.js/mounts.js. Export/import for config transfer.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Task Groups (岗位) have NO status — they are persistent roles; only an
// `archived` flag. Task STATUS lives on the session (session-status.js STATES,
// which now includes `done`).
const KINDS = ['task', 'group'];
const CAPS = { title: 120, objective: 20000, note: 2000, planItem: 500, planItems: 200, reason: 500 };

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

class TaskManager {
  constructor({ dataDir, onChange, readUserState }) {
    this._file = path.join(dataDir, 'tasks.json');
    this._onChange = onChange || (() => {});
    this._state = { version: 1, tasks: {} };
    this._lastMd = new Map(); // taskId → last written TASK.md content (skip no-op writes)
    const existed = this._load();
    // One-time migration: Task Groups lost their status (岗位 refactor) — a
    // `done` group becomes archived, others just drop the field.
    let migrated = false;
    for (const t of Object.values(this._state.tasks)) {
      if ('status' in t) { if (t.archived === undefined) t.archived = (t.status === 'done'); delete t.status; migrated = true; }
    }
    if (!existed && typeof readUserState === 'function') {
      // One-time Groups → tasks migration (file existence is the guard: once
      // tasks.json exists, legacy sessionGroups in user-state stay dormant).
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
    try {
      this._state = JSON.parse(fs.readFileSync(this._file, 'utf-8'));
      if (!this._state || typeof this._state.tasks !== 'object') this._state = { version: 1, tasks: {} };
      return true;
    } catch { return false; }
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

  // cap = how many Activity-log entries to include (TASK.md keeps 50; the
  // injected context passes 30). A truncation notice points to the full log.
  renderTaskMd(t, cap = 50) {
    const ts = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
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
      for (const p of t.plan) lines.push(`- [${p.done ? 'x' : ' '}] ${p.text}`);
    }
    const total = (t.progress || []).length;
    const prog = (t.progress || []).slice(-cap);
    if (prog.length) {
      lines.push('', '## Activity log', '');
      if (total > cap) lines.push(`_(showing the last ${cap} of ${total} entries — run \`vibespace-task show\` or read this file for the rest)_`, '');
      for (const p of prog) lines.push(`- ${ts(p.at)} ${p.note}${p.session ? ` _(${p.session})_` : ''}`);
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
          out.push({ path: r, size: st.size });
        }
      }
    };
    walk(dir, '', 0);
    return out;
  }

  // The SessionStart injection payload (design §4a): rendered task state +
  // Class-B file INDEX (names only, agents read what they need) + the rules.
  renderContext(id) {
    const t = this.get(id);
    const parts = [
      `<vibespace-task-context>`,
      `This session belongs to VibeSpace task "${t.title}" (${t.id}). The task state below is shared across ALL sessions of this task.`,
      '',
      // Injected copy shows the last 30 Activity-log entries (TASK.md keeps 50).
      this.renderTaskMd(t, 30).replace(/\n---\n[\s\S]*$/, '').trim(),
    ];
    if (t.contextDir) {
      parts.push('', `## Task context folder`, '', `\`${t.contextDir}\` — the task's shared workspace, visible to every session of this task.`);
      const files = this._listContextFiles(t.contextDir);
      if (files.length) {
        parts.push('', 'Files (read what you need with your normal file tools):');
        for (const f of files) parts.push(`- ${t.contextDir}/${f.path} (${f.size < 1024 ? f.size + ' B' : Math.round(f.size / 1024) + ' KB'})`);
      } else {
        parts.push('', '(No shared files yet.)');
      }
    }
    // ── How to report back — self-documenting + scoped + enum-disambiguated ──
    parts.push('', '### How to report back  (IMPORTANT — read this before using the tools)', '',
      `Two commands are already on your PATH and are already bound to THIS session's task. You NEVER pass a task id or any other task's name — they only ever act on your own task. If you forget the exact syntax, just run the command with NO arguments: it prints its usage AND the current state.`,
      '',
      '`vibespace-task` — update the SHARED TASK (every session of this task, and the user on the board, see it):',
      `- \`vibespace-task progress "what you did"\` — append to the Activity log after finishing a meaningful piece of work.`,
      `- \`vibespace-task plan-check <step# or unique text>\` (and \`plan-uncheck\`) — tick a Checklist step. If the Checklist above is empty, add steps first with \`plan-add\`.`,
      `- \`vibespace-task plan-add "new step"\` — add a Checklist step.`,
      `- \`vibespace-task show\` — reprint the objective / checklist / activity log.`,
      '',
      '`vibespace-status` — report the state of THIS SESSION (your own work) right now. A Task Group has no status; the SESSION does:',
      `- \`vibespace-status <working|needs-input|blocked|review|done> [--urgency low|normal|high|urgent] [--reason "why"]\``,
      `- \`vibespace-status clear\`  /  \`vibespace-status show\``,
      `- Keep it honest and current — the user reads it on the board. Set \`blocked\` or \`needs-input\` (with a higher urgency) the moment you are stuck or waiting on the user; \`done\` when this piece of work is finished.`);
    if (t.contextDir) {
      parts.push('',
        `Everything under \`${t.contextDir}/.vibespace/\` is GENERATED by VibeSpace and read-only for you — never create, edit, or delete anything there (\`TASK.md\` in it always mirrors the state above). Put findings, designs and artifacts that other sessions should see in the context folder itself, outside \`.vibespace/\`.`);
    }
    parts.push(`</vibespace-task-context>`);
    return parts.join('\n');
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

  create({ title, kind, archived, objective, sessions, folders, contextDir, color } = {}) {
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
      createdAt: now,
      updatedAt: now,
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
    if (patch.plan !== undefined) {
      if (!Array.isArray(patch.plan)) throw new Error('plan must be an array');
      t.plan = patch.plan.slice(0, CAPS.planItems).map((it) => ({
        text: String(it?.text || '').slice(0, CAPS.planItem),
        done: !!it?.done,
      })).filter((it) => it.text);
    }
    if (patch.attention !== undefined) {
      t.attention = patch.attention
        ? { reason: String(patch.attention.reason || '').slice(0, CAPS.reason), since: Number(patch.attention.since) || Date.now() }
        : null;
    }
    t.updatedAt = Date.now();
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
  addProgress(id, { note, session } = {}) {
    const t = this.get(id);
    const clean = String(note || '').trim().slice(0, CAPS.note);
    if (!clean) throw new Error('note required');
    t.progress.push({ at: Date.now(), note: clean, session: typeof session === 'string' ? session.slice(0, 200) : null });
    if (t.progress.length > 500) t.progress = t.progress.slice(-500);
    t.updatedAt = Date.now();
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
      for (const p of t.plan) body.push(`- [${p.done ? 'x' : ' '}] ${p.text}`);
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
        if (pm) plan.push({ text: pm[2].trim().slice(0, CAPS.planItem), done: pm[1].toLowerCase() === 'x' });
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

module.exports = { TaskManager };
