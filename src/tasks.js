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

const STATUSES = ['active', 'paused', 'blocked', 'done'];
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
    const existed = this._load();
    if (!existed && typeof readUserState === 'function') {
      // One-time Groups → tasks migration (file existence is the guard: once
      // tasks.json exists, legacy sessionGroups in user-state stay dormant).
      try { this._migrateGroups(readUserState()); } catch { /* fresh install */ }
      this._save();
    }
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
        kind: 'group',
        status: 'active',
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
      .map((t) => ({ ...t, plan: [...(t.plan || [])], progress: [...(t.progress || [])], sessions: [...(t.sessions || [])], folders: [...(t.folders || [])] }))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  get(id) {
    const t = this._state.tasks[id];
    if (!t) throw new Error('task not found');
    return t;
  }

  create({ title, kind, status, objective, sessions, folders, contextDir, color } = {}) {
    const cleanTitle = String(title || '').trim().slice(0, CAPS.title);
    if (!cleanTitle) throw new Error('title required');
    const id = this._genId(cleanTitle);
    const now = Date.now();
    const t = {
      id,
      title: cleanTitle,
      kind: KINDS.includes(kind) ? kind : 'task',
      status: STATUSES.includes(status) ? status : 'active',
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

  _sanitizeFolders(folders) {
    return sanitizeStrArray(folders, 100).filter((p) => path.isAbsolute(p) || /^[^:]+::\//.test(p)); // plain abs path or host::path
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
    if (patch.status !== undefined) {
      if (!STATUSES.includes(patch.status)) throw new Error('invalid status');
      t.status = patch.status;
    }
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
        status: STATUSES.includes(raw.status) ? raw.status : 'active',
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
