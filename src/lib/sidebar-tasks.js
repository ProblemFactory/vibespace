import { escHtml, createPopover, showContextMenu, showInputDialog, showConfirmDialog, showToast } from './utils.js';
import { t as tr } from './i18n.js';

/**
 * Sidebar tasks mixin — the task system's client (docs/design-task-system.md).
 *
 * Tasks ⊃ Groups: the old Groups tab grew into the task board. kind:'group'
 * tasks render exactly like the old groups; kind:'task' adds status /
 * objective / attention. Data lives in data/tasks.json on the server
 * (AUTHORITATIVE — never derived from agent output); this mixin holds a
 * client mirror (`_tasks`), synced via `tasks-updated` WS broadcasts, and
 * writes through /api/tasks (granular bind/unbind so concurrent clients
 * can't clobber each other).
 */

// Task Groups (岗位) have NO status — a persistent role, only `archived`.
// (Removed TASK_STATUS_META; task STATUS lives on the session — SESSION_STATE_META.)

const ICON_DETAIL = '<svg style="width:10px;height:10px" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M5 6h6M5 9h6M5 12h3"/></svg>';

// Session-level status indicators — set by the AGENT itself (vibespace-status
// CLI in its env) or by the user (card popover). User overrides of agent-set
// values are relayed to the agent on the next message (server-side).
const _si = (d) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const SESSION_STATE_META = {
  working: { label: tr('working'), color: 'var(--green)', icon: _si('<path d="M1.5 8h3l1.5-4 2 8 1.5-4h3.5"/>') },
  'needs-input': { label: tr('needs input'), color: 'var(--yellow, #e5c07b)', icon: _si('<path d="M6 6a2 2 0 113 1.7c-.6.5-1 .9-1 1.8"/><circle cx="8" cy="12" r=".7" fill="currentColor" stroke="none"/>') },
  blocked: { label: tr('blocked'), color: 'var(--red, #e55)', icon: _si('<circle cx="8" cy="8" r="6"/><path d="M4 4l8 8"/>') },
  review: { label: tr('review'), color: 'var(--blue, #61afef)', icon: _si('<path d="M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4-6.5-4-6.5-4z"/><circle cx="8" cy="8" r="1.7"/>') },
  done: { label: tr('done'), color: 'var(--text-dim)', icon: _si('<path d="M2.5 8.5l3.5 3.5 7.5-9"/>') },
};
export const SESSION_URGENCY_META = {
  low: { label: tr('low'), mark: '', color: 'var(--text-dim)' },
  normal: { label: tr('normal'), mark: '', color: 'var(--blue, #61afef)' },
  high: { label: tr('high'), mark: '!', color: 'var(--yellow, #e5c07b)' },
  urgent: { label: tr('urgent'), mark: '!!', color: 'var(--red, #e55)' },
};

export function installSidebarTasks(SidebarClass) {
  const proto = SidebarClass.prototype;

  // ── State + sync ──

  proto._initTasks = function() {
    this._tasks = [];
    this._tasksLoaded = false; // gates "task not found" decisions during startup
    // Tasks-tab view: 'groups' = Task Groups (岗位) with member sessions;
    // 'tasks' = a FLAT list of every session (活儿) — tagged sorted on top by
    // status+urgency, untagged sunk to the bottom. The default comes from the
    // SETTING sidebar.defaultBoardView (applied one-shot after async load in
    // sidebar.js); in-session toggling is transient (no localStorage — the
    // setting IS the persistence, synced across clients).
    const ls = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
    this._boardView = this.app.settings?.get('sidebar.defaultBoardView') || 'groups';
    this._taskViewSortMode = ls('vibespace.taskViewSort', 'urgency'); // urgency|status|recent|name
    try { this._taskViewStatusFilter = JSON.parse(localStorage.getItem('vibespace.taskViewFilter') || 'null'); } catch { this._taskViewStatusFilter = null; }
    this._sessionStatuses = {}; // sessionKey → {state, urgency, reason, setBy, at}
    this._pendingTaskBinds = new Map(); // webuiId → taskId (new-session-in-task, bound once the backend id appears)
    this._fetchTasks();
    fetch('/api/session-status').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.statuses) {
        this._sessionStatuses = d.statuses;
        this._render();
        this._lastAttnSig = null;
        this.refreshTaskAttention();
      }
    }).catch(() => { });
    this.app.ws.onGlobal((msg) => {
      if (msg.type === 'tasks-updated' && Array.isArray(msg.tasks)) {
        this._tasks = msg.tasks;
        this._tasksLoaded = true;
        if (this._activeTab === 'tasks') this._render();
        this._lastAttnSig = null; // declared attention may have changed
        this.refreshTaskAttention();
        this.app.onTasksUpdated?.(msg.tasks);
      } else if (msg.type === 'session-status-updated' && msg.statuses) {
        // Change-guard (audit round-2): every agent's vibespace-status call
        // broadcasts to every client — identical snapshots must not trigger a
        // full sidebar rebuild (folder grouping over ~5k sessions).
        const sig = JSON.stringify(msg.statuses);
        const changed = sig !== this._statusSig;
        this._statusSig = sig;
        this._sessionStatuses = msg.statuses;
        if (changed) {
          this._render();
          this._lastAttnSig = null; // blocked counts feed task attention
          this.refreshTaskAttention();
        }
      }
    });
  };

  // ── Session status (state/urgency chips on cards) ──

  proto._sessionStatusKeyFor = function(sessionOrKey) {
    // Write to the key an EXISTING record lives under — the agent keys its
    // record webui:<serverId> until the backend id exists, and a user
    // override must land on THAT record (a second record under the state key
    // would silently skip override detection).
    const sts = this._sessionStatuses || {};
    const key = this._getSessionStateKey(sessionOrKey);
    if (key && sts[key]) return key;
    const webuiId = sessionOrKey && typeof sessionOrKey === 'object' ? (sessionOrKey.webuiId || sessionOrKey.id) : null;
    if (webuiId && sts['webui:' + webuiId]) return 'webui:' + webuiId;
    return key || (webuiId ? 'webui:' + webuiId : null);
  };

  proto.getSessionStatus = function(sessionOrKey) {
    const sts = this._sessionStatuses || {};
    const key = this._getSessionStateKey(sessionOrKey);
    if (key && sts[key]) return sts[key];
    const webuiId = sessionOrKey && typeof sessionOrKey === 'object' ? (sessionOrKey.webuiId || sessionOrKey.id) : null;
    return (webuiId && sts['webui:' + webuiId]) || null;
  };

  proto.setSessionStatusUser = async function(sessionOrKey, fields) {
    const sessionKey = this._sessionStatusKeyFor(sessionOrKey);
    if (!sessionKey) return;
    try {
      const res = await fetch('/api/session-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey, ...fields }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || tr('Failed to set status'), { type: 'error' });
      }
    } catch { showToast(tr('Failed to set status — server unreachable'), { type: 'error' }); }
  };

  proto._showSessionStatusPopover = function(anchor, sessionRef) {
    const pop = createPopover(anchor, 'groups-popover session-status-pop');
    const cur = this.getSessionStatus(sessionRef) || {};
    const mkSel = (label, options, value) => {
      const row = document.createElement('label');
      row.className = 'session-status-pop-row';
      row.appendChild(document.createTextNode(label));
      const sel = document.createElement('select');
      const none = document.createElement('option');
      none.value = ''; none.textContent = '—';
      sel.appendChild(none);
      for (const [v, meta] of Object.entries(options)) {
        const o = document.createElement('option');
        o.value = v; o.textContent = meta.label; o.selected = value === v;
        sel.appendChild(o);
      }
      row.appendChild(sel);
      pop.appendChild(row);
      return sel;
    };
    const stateSel = mkSel(tr('State'), SESSION_STATE_META, cur.state);
    const urgSel = mkSel(tr('Urgency'), SESSION_URGENCY_META, cur.urgency);
    const reasonRow = document.createElement('label');
    reasonRow.className = 'session-status-pop-row';
    reasonRow.appendChild(document.createTextNode(tr('Reason')));
    const reasonInp = document.createElement('input');
    reasonInp.type = 'text'; reasonInp.value = cur.reason || ''; reasonInp.placeholder = tr('optional');
    reasonRow.appendChild(reasonInp);
    pop.appendChild(reasonRow);
    if (cur.setBy === 'agent') {
      const hint = document.createElement('div');
      hint.className = 'session-status-pop-hint';
      hint.textContent = tr('Set by the agent — if you change it, the agent is told on your next message.');
      pop.appendChild(hint);
    }
    const btnRow = document.createElement('div');
    btnRow.className = 'session-status-pop-btns';
    const apply = document.createElement('button');
    apply.className = 'task-detail-btn'; apply.textContent = tr('Apply');
    apply.onclick = (e) => {
      e.stopPropagation();
      this.setSessionStatusUser(sessionRef, { state: stateSel.value || null, urgency: urgSel.value || null, reason: reasonInp.value });
      pop.remove();
    };
    const clearB = document.createElement('button');
    clearB.className = 'task-detail-btn'; clearB.textContent = tr('Clear');
    clearB.onclick = (e) => { e.stopPropagation(); this.setSessionStatusUser(sessionRef, { clear: true }); pop.remove(); };
    btnRow.append(apply, clearB);
    pop.appendChild(btnRow);
  };

  // ── New-session-in-task binding (backend id unknown at creation) ──

  proto._registerPendingTaskBind = function(webuiId, taskId) {
    this._pendingTaskBinds.set(webuiId, taskId);
  };

  proto._processPendingTaskBinds = function() {
    if (!this._pendingTaskBinds?.size) return;
    for (const [webuiId, taskId] of [...this._pendingTaskBinds]) {
      const live = (this._webuiSessions || []).find(s => s.id === webuiId);
      if (!live) continue; // not in the list yet (or died — retried until sweep below)
      const bsid = live.backendSessionId || live.claudeSessionId;
      if (!bsid) continue; // id not adopted yet
      this._pendingTaskBinds.delete(webuiId);
      this._taskBind(taskId, `${live.backend || 'claude'}:${bsid}`);
    }
    // sweep entries whose session vanished without ever getting an id
    if (this._pendingTaskBinds.size > 20) {
      for (const [webuiId] of [...this._pendingTaskBinds]) {
        if (!(this._webuiSessions || []).some(s => s.id === webuiId)) this._pendingTaskBinds.delete(webuiId);
      }
    }
  };

  proto._fetchTasks = async function() {
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const data = await res.json();
        this._tasks = Array.isArray(data.tasks) ? data.tasks : [];
        this._tasksLoaded = true;
        if (this._activeTab === 'tasks') this._render();
        this._lastAttnSig = null;
        this.refreshTaskAttention();
        this.app.onTasksUpdated?.(this._tasks);
      }
    } catch { }
  };

  proto._taskById = function(id) { return (this._tasks || []).find(t => t.id === id) || null; };

  // Board order: attention first, then working tasks, then plain groups,
  // done last; newest first within a bucket.
  proto._taskBoardOrder = function() {
    const bucket = (t) => (this._taskAttention(t).waiting ? 0 : t.archived ? 3 : 1);
    return [...(this._tasks || [])].sort((a, b) => bucket(a) - bucket(b) || (b.createdAt || 0) - (a.createdAt || 0));
  };

  // ── API write-through (broadcast echoes back to all clients incl. us) ──

  proto._taskApi = async function(method, url, body) {
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || tr('Task Group operation failed'), { type: 'error' }); return null; }
      return data;
    } catch {
      showToast(tr('Task Group operation failed — server unreachable'), { type: 'error' });
      return null;
    }
  };

  proto._taskCreate = async function(fields) {
    const data = await this._taskApi('POST', '/api/tasks', fields);
    return data?.task || null;
  };
  proto._taskUpdate = function(id, patch) { return this._taskApi('PATCH', `/api/tasks/${encodeURIComponent(id)}`, patch); };
  proto._taskDelete = function(id) { return this._taskApi('DELETE', `/api/tasks/${encodeURIComponent(id)}`); };
  proto._taskBind = function(id, sessionOrKey) {
    const sessionKey = this._getSessionStateKey(sessionOrKey);
    if (!sessionKey) return;
    return this._taskApi('POST', `/api/tasks/${encodeURIComponent(id)}/bind`, { sessionKey });
  };
  proto._taskUnbind = function(id, sessionOrKey) {
    const sessionKey = this._getSessionStateKey(sessionOrKey);
    if (!sessionKey) return;
    return this._taskApi('POST', `/api/tasks/${encodeURIComponent(id)}/unbind`, { sessionKey });
  };
  // Folders are {path, recursive} records; tolerate legacy bare strings.
  proto._folderRec = (f) => (typeof f === 'string' ? { path: f, recursive: true } : { path: f.path, recursive: f.recursive !== false });
  proto._folderPaths = function(task) { return (task?.folders || []).map((f) => this._folderRec(f).path); };
  proto._taskAddFolder = function(id, folderPath, recursive = true) {
    const t = this._taskById(id);
    if (!t || !folderPath) return;
    const recs = (t.folders || []).map(this._folderRec);
    if (recs.some((f) => f.path === folderPath)) return;
    return this._taskUpdate(id, { folders: [...recs, { path: folderPath, recursive: !!recursive }] });
  };
  proto._taskRemoveFolder = function(id, folderPath) {
    const t = this._taskById(id);
    if (!t) return;
    return this._taskUpdate(id, { folders: (t.folders || []).map(this._folderRec).filter((f) => f.path !== folderPath) });
  };
  proto._taskSetFolderRecursive = function(id, folderPath, recursive) {
    const t = this._taskById(id);
    if (!t) return;
    const folders = (t.folders || []).map(this._folderRec).map((f) => (f.path === folderPath ? { ...f, recursive: !!recursive } : f));
    return this._taskUpdate(id, { folders });
  };

  // ── Resolvers ──

  // All session state keys of a task: explicit tags + auto-include by folder.
  // recursive:true → a session whose cwd is UNDER the folder counts; false →
  // only an exact cwd match (the old behavior was always recursive).
  // THE folder-match rule — the single client-side implementation (mirrors the
  // server's groupsForSession): a session matches a folder by cwd OR its
  // symlink-resolved realCwd (stamped by discovery). Board, Task View and the
  // expanded card must all agree, so they all call this.
  proto._sessionFolderMatch = function(s, folderRecs) {
    const cwds = [s.cwd, s.realCwd].filter(Boolean);
    for (const f of folderRecs) {
      for (const c of cwds) {
        if (c === f.path || (f.recursive && c.startsWith(f.path + '/'))) return true;
      }
    }
    return false;
  };

  proto._getTaskSessionKeys = function(task, allSessions) {
    const result = new Set(task.sessions || []);
    const folders = (task.folders || []).map(this._folderRec);
    for (const s of allSessions || []) {
      const sessionKey = this._getSessionStateKey(s);
      if (result.has(sessionKey) || result.has(s.sessionId)) continue;
      if (this._sessionFolderMatch(s, folders)) result.add(sessionKey);
    }
    return result;
  };

  // Tasks this session is EXPLICITLY tagged with (folder-derived membership is
  // dynamic and not toggleable from the bind popover).
  proto._getSessionTasks = function(sessionOrKey) {
    const stateKey = this._getSessionStateKey(sessionOrKey);
    const legacyId = this._getLegacySessionId(sessionOrKey);
    return (this._tasks || []).filter(t =>
      (t.sessions || []).includes(stateKey) || (legacyId && (t.sessions || []).includes(legacyId)));
  };

  // Task Groups this session BELONGS to — explicit tag OR auto-include folder
  // match (cwd or its symlink-resolved realCwd). Mirrors the board's
  // _getTaskSessionKeys and the server's groupsForSession, so Task View
  // membership matches Group view. Excludes archived. (Distinct from
  // _getSessionTasks, which is tag-only for the toggleable bind popover.)
  proto._getSessionTaskGroups = function(s) {
    const stateKey = this._getSessionStateKey(s);
    const legacyId = this._getLegacySessionId(s);
    return (this._tasks || []).filter(t => {
      if (t.archived) return false;
      if ((t.sessions || []).includes(stateKey) || (legacyId && (t.sessions || []).includes(legacyId))) return true;
      return this._sessionFolderMatch(s, (t.folders || []).map(this._folderRec));
    });
  };

  // ── Attention (P1 backbone: VibeSpace's OWN idle detection — a bound
  // session's window blinking "waiting" makes the task need you; zero agent
  // cooperation required. Agent-declared attention arrives in P3.) ──

  proto._taskAttention = function(task, allSessions) {
    const waitingKeys = this.app.getWaitingSessionKeys?.() || new Set();
    const statuses = this._sessionStatuses || {};
    const anyStatus = Object.keys(statuses).length > 0;
    if (!waitingKeys.size && !task.attention && !anyStatus) return { waiting: 0, blocked: 0, declared: null };
    const keys = this._getTaskSessionKeys(task, allSessions || this._allSessions || []);
    // Declared-blocked keys: a brand-new session's status is keyed webui:<id>
    // until its backend id exists — resolve those onto state keys so the task
    // badge counts them too.
    const blockedKeys = new Set();
    for (const [k, r] of Object.entries(statuses)) {
      if (r?.state !== 'blocked') continue;
      if (k.startsWith('webui:')) {
        // resolve against the MERGED list — _getTaskSessionKeys derives its
        // keys from the same objects, so this is the matching key space
        const id = k.slice(6);
        const merged = (allSessions || this._allSessions || []).find(s => s.webuiId === id || s.id === id);
        const sk = merged && this._getSessionStateKey(merged);
        blockedKeys.add(sk || k);
      } else blockedKeys.add(k);
    }
    let waiting = 0, blocked = 0;
    for (const k of keys) {
      if (waitingKeys.has(k)) waiting++;
      if (blockedKeys.has(k)) blocked++; // agent/user-declared blocked feeds the task badge
    }
    return { waiting, blocked, declared: task.attention || null };
  };

  proto.anyTaskAttention = function() {
    return (this._tasks || []).some(t => {
      const a = this._taskAttention(t);
      return a.waiting > 0 || (a.blocked || 0) > 0 || !!a.declared;
    });
  };

  // Called (debounced) from app.updateTaskbar — the funnel every waiting-blink
  // toggle passes through. Signature guard: only touch the DOM when the set of
  // waiting sessions actually changed, since updateTaskbar also fires on
  // focus/layout churn.
  proto.refreshTaskAttention = function() {
    const waiting = this.app.getWaitingSessionKeys?.() || new Set();
    // Signature covers everything the badges derive from: waiting windows,
    // declared statuses, AND the session list (blocked-key resolution + folder
    // auto-include both depend on it — the initial status fetch races the
    // first session poll, so a session-list change must re-evaluate).
    const sig = [...waiting].sort().join(',')
      + '|' + Object.entries(this._sessionStatuses || {}).map(([k, v]) => k + ':' + v.state).sort().join(',')
      + '|' + (this._sessionDigest || '');
    if (sig === this._lastAttnSig) return;
    this._lastAttnSig = sig;
    const tab = this.el?.querySelector('.sidebar-tab[data-tab="tasks"]');
    if (tab) {
      const has = this.anyTaskAttention();
      let badge = tab.querySelector('.task-attn-badge');
      if (has && !badge) {
        badge = document.createElement('span');
        badge.className = 'task-attn-badge';
        badge.textContent = '⚠';
        tab.appendChild(badge);
      } else if (!has && badge) badge.remove();
    }
    if (this._activeTab === 'tasks') this._render();
  };

  // ── Popovers / menus (shared by board, session cards, file explorer) ──

  proto._showTaskBindPopover = function(anchor, isCheckedFn, onToggleFn) {
    const pop = createPopover(anchor, 'groups-popover');
    const tasks = this._taskBoardOrder();
    for (const t of tasks) {
      const row = document.createElement('label'); row.className = 'session-detail-group-item';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = isCheckedFn(t);
      cb.onchange = (e) => { e.stopPropagation(); onToggleFn(t, cb.checked, pop); };
      const lbl = document.createElement('span'); lbl.textContent = t.title;
      row.append(cb, lbl);
      row.onclick = (e) => e.stopPropagation();
      pop.appendChild(row);
    }
    if (!tasks.length) {
      const hint = document.createElement('div'); hint.className = 'empty-hint'; hint.textContent = tr('No Task Groups yet');
      pop.appendChild(hint);
    }
    const createRow = document.createElement('div'); createRow.className = 'session-detail-group-create';
    createRow.textContent = tr('+ New task');
    createRow.onclick = async (e) => {
      e.stopPropagation();
      const name = await showInputDialog({ title: tr('New Task Group'), label: tr('Task Group title'), confirmText: tr('Create') });
      if (name && name.trim()) {
        const t = await this._taskCreate({ title: name.trim() });
        if (t) { onToggleFn(t, true, pop); pop.remove(); }
      }
    };
    pop.appendChild(createRow);
  };

  proto._showTaskFoldersPopover = function(anchor, taskId) {
    const pop = createPopover(anchor, 'groups-popover');
    const folders = this._taskById(taskId)?.folders || [];
    if (folders.length === 0) {
      const hint = document.createElement('div'); hint.className = 'empty-hint';
      hint.textContent = tr('No linked folders. Sessions under a linked folder join this task automatically. Link via the file explorer right-click menu or drag a folder onto the task.');
      pop.appendChild(hint);
    } else {
      for (const f of folders) {
        const rec = this._folderRec(f);
        const row = document.createElement('div'); row.className = 'session-detail-group-item';
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;padding:4px 8px;cursor:default';
        const pathSpan = document.createElement('span');
        pathSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px';
        pathSpan.textContent = rec.path.replace(/^\/home\/[^/]+/, '~') + (rec.recursive ? '' : tr(' (this folder only)')); pathSpan.title = rec.path;
        const removeBtn = document.createElement('button');
        removeBtn.className = 'task-detail-x'; // shared red × (was an inline clone of it)
        removeBtn.style.flexShrink = '0';
        removeBtn.textContent = '×'; removeBtn.title = tr('Unlink folder');
        removeBtn.onclick = (e) => { e.stopPropagation(); this._taskRemoveFolder(taskId, rec.path); pop.remove(); };
        row.append(pathSpan, removeBtn);
        pop.appendChild(row);
      }
    }
  };

  proto._showTaskContextMenu = function(x, y, taskId) {
    const t = this._taskById(taskId);
    if (!t) return;
    const items = [
      { label: tr('Details…'), action: () => this.app.openTaskDetail(taskId) },
      { label: tr('Activity log…'), action: () => this.app.openTaskLog(taskId) },
      { label: tr('New session in this task…'), action: () => this.app.showNewSessionDialog({ cwd: this._folderPaths(t)[0], taskId }) },
      { label: tr('Rename'), action: async () => {
        const n = await showInputDialog({ title: tr('Rename Task Group'), label: tr('Title'), value: t.title, confirmText: tr('Rename') });
        if (n && n.trim() && n.trim() !== t.title) this._taskUpdate(taskId, { title: n.trim() });
      } },
    ];
    // A Task Group (岗位) has no status — only archive.
    items.push({ label: t.archived ? tr('Unarchive') : tr('Archive'), action: () => this._taskUpdate(taskId, { archived: !t.archived }) });
    if (t.kind !== 'task') {
      items.push({ label: tr('Convert to task'), action: () => this._taskUpdate(taskId, { kind: 'task' }) });
    }
    items.push(
      { label: tr('Linked folders'), action: () => {
        const anchor = document.createElement('span');
        anchor.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;width:0;height:0';
        document.body.appendChild(anchor);
        this._showTaskFoldersPopover(anchor, taskId);
        anchor.remove();
      } },
      { separator: true },
      { label: tr('Delete Task Group'), style: 'color:var(--red,#e55)', action: async () => {
        if (await showConfirmDialog({ title: tr('Delete Task Group'), message: tr('Delete "{title}"? Sessions will not be deleted.', { title: t.title }), confirmText: tr('Delete'), danger: true })) this._taskDelete(taskId);
      } },
    );
    showContextMenu(x, y, items);
  };

  // ── Desktop board (the old Groups tab, grown up) ──

  // Groups | Tasks sub-tabs at the top of the Task Groups tab (same visual
  // language as the Folders/Task Groups/Remote tabs, one level down).
  proto._buildBoardViewTabs = function() {
    const wrap = document.createElement('div');
    wrap.className = 'sidebar-subtabs';
    for (const [view, label, tip] of [
      ['groups', tr('Groups'), tr('Task Groups (岗位) with their member sessions')],
      ['tasks', tr('Tasks'), tr('Every session (活儿) flat, sorted by status + urgency; untagged at the bottom')],
    ]) {
      const b = document.createElement('button');
      b.className = 'sidebar-subtab' + (this._boardView === view ? ' active' : '');
      b.textContent = label;
      b.title = tip;
      b.onclick = () => {
        if (this._boardView === view) return;
        this._boardViewTouched = true; // manual choice wins over the async default
        this._boardView = view;
        this._updateTabs(); // sort button shows only in the flat Tasks view
        this._render();
      };
      wrap.appendChild(b);
    }
    return wrap;
  };

  // Synthesized display state — declared (agent/user) > OSC-idle ⇒ needs-input
  // > live ⇒ working; null for a non-live session with nothing declared.
  // STALE DECAY: a stopped session's declared working/needs-input describes a
  // process that no longer runs — drop it (a dead card advertising "working"
  // is misinformation). Result-like states (done/review/blocked) persist.
  proto._synthSessionState = function(s, waiting) {
    const st = this.getSessionStatus(s) || {};
    const isLive = s.status === 'live' || s.status === 'tmux';
    if (st.state) {
      if (!isLive && (st.state === 'working' || st.state === 'needs-input')) return null;
      return st.state;
    }
    if (!isLive) return null;
    const sKey = `${s.backend || 'claude'}:${s.backendSessionId || s.claudeSessionId || ''}`;
    return waiting.has(sKey) ? 'needs-input' : 'working';
  };

  // Task View sort rank: urgency dominates (mode 'urgency'), or status dominates
  // (mode 'status'). The status weight floats blocked/needs-input up, sinks done.
  proto._taskViewRank = function(s, waiting, mode) {
    const st = this.getSessionStatus(s) || {};
    const dstate = this._synthSessionState(s, waiting);
    const urgency = st.urgency || (dstate ? 'normal' : null); // default normal (#4)
    const urg = { urgent: 4, high: 3, normal: 2, low: 1 }[urgency] || 0;
    const stateW = { blocked: 5, 'needs-input': 5, review: 3, working: 2, done: 1 }[dstate] || 0;
    return mode === 'status' ? stateW * 10 + urg : urg * 10 + stateW;
  };

  proto._taskViewSortFn = function(waiting) {
    const mode = this._taskViewSortMode;
    // Starred = tiebreaker right after the primary key (same precedence as the
    // Folders sort: urgency/attention first, then ★, then recency). 'name'
    // stays purely alphabetical — star-jumping would break scanning.
    const star = (s) => (this._stateSetHas(this._starredIds, s) ? 1 : 0);
    const recent = (a, b) => (b.lastActivity || b.startedAt || 0) - (a.lastActivity || a.startedAt || 0);
    if (mode === 'recent') return (a, b) => star(b) - star(a) || recent(a, b);
    if (mode === 'name') return (a, b) => String(a.name || a.webuiName || a.sessionId || '').localeCompare(String(b.name || b.webuiName || b.sessionId || ''));
    return (a, b) => this._taskViewRank(b, waiting, mode) - this._taskViewRank(a, waiting, mode)
      || star(b) - star(a)
      || recent(a, b);
  };

  proto._taskViewMatch = function(s, waiting) {
    const f = this._taskViewStatusFilter;
    if (!f || !f.length) return true;
    return f.includes(this._synthSessionState(s, waiting));
  };

  proto._taskViewRow = function(s, withGroups) {
    const row = document.createElement('div');
    row.className = 'task-view-row';
    // Group membership as LEFT color bars (one per group) instead of a badge
    // row below — saves vertical space. Hover a bar for the group name/objective,
    // click to open it.
    const groups = withGroups ? this._getSessionTaskGroups(s) : [];
    if (groups.length) {
      const bars = document.createElement('div');
      bars.className = 'task-view-colorbars';
      for (const g of groups) {
        const bar = document.createElement('span');
        bar.className = 'task-view-colorbar';
        bar.style.setProperty('--g-color', g.color || 'var(--text-dim)');
        bar.dataset.tip = g.title + (g.objective ? ' — ' + g.objective.slice(0, 100) : '');
        bar.onclick = (e) => { e.stopPropagation(); this.app.openTaskDetail(g.id); };
        // Right-click (long-press on touch) = the group's full action menu —
        // incl. "New session in this task…" — so the flat view can act on a
        // group without switching to the Groups board.
        bar.addEventListener('contextmenu', (e) => {
          e.preventDefault(); e.stopPropagation();
          this._showTaskContextMenu(e.clientX, e.clientY, g.id);
        });
        bars.appendChild(bar);
      }
      row.appendChild(bars);
    }
    row.appendChild(this._buildSessionCard(s, { showCwd: true }));
    return row;
  };

  // Task View: every session (活儿) flat. Tagged sessions (in ≥1 Task Group)
  // sort to the top by status+urgency; untagged sink to a labeled section at the
  // bottom. Each card shows its cwd; tagged cards show their group badge(s).
  proto._renderTaskViewFlat = function(sessions) {
    const waiting = (this._waitingSet && this._waitingSet()) || new Set();
    const match = (s) => this._taskViewMatch(s, waiting);
    const sortFn = this._taskViewSortFn(waiting);
    const tagged = sessions.filter(s => this._getSessionTaskGroups(s).length > 0 && match(s)).sort(sortFn);
    // Untagged sink to the bottom — but only LIVE/tmux (active, unorganized
    // work). The (often thousands of) historical STOPPED untagged sessions live
    // in Folders (paginated); piling them here would be useless + slow, so we
    // surface just a count + pointer.
    const untaggedAll = sessions.filter(s => this._getSessionTaskGroups(s).length === 0 && match(s));
    const untagged = untaggedAll.filter(s => s.status === 'live' || s.status === 'tmux').sort(sortFn);
    const untaggedStopped = untaggedAll.length - untagged.length;
    const list = document.createElement('div');
    list.className = 'task-view-list';
    // "+ New session" with a Task-Group picker — the flat view's equivalent of
    // the Groups board's per-header + button (this view has no group headers).
    const addCard = document.createElement('div');
    addCard.className = 'session-item-card new-session-card';
    addCard.innerHTML = `<div class="session-card-name" style="color:var(--accent-hover)">${tr('+ New session in a Task Group…')}</div>`;
    addCard.onclick = (e) => {
      const groupsAll = (this._taskBoardOrder?.() || []).filter(g => !g.archived);
      showContextMenu(e.clientX, e.clientY, [
        ...groupsAll.map(g => ({
          label: g.title,
          style: g.color ? `box-shadow: inset 3px 0 0 ${g.color}` : '',
          action: () => this.app.showNewSessionDialog({ taskId: g.id, cwd: this._folderPaths(g)[0] }),
        })),
        ...(groupsAll.length ? [{ separator: true }] : []),
        { label: tr('No group'), action: () => this.app.showNewSessionDialog({}) },
      ]);
    };
    list.appendChild(addCard);
    if (!tagged.length && !untagged.length && !untaggedStopped) {
      const empty = document.createElement('div');
      empty.className = 'empty-hint task-view-empty';
      empty.textContent = (this._taskViewStatusFilter && this._taskViewStatusFilter.length)
        ? tr('No sessions match the current status filter.')
        : tr('No sessions yet. Sessions tagged into a Task Group sort to the top here.');
      list.appendChild(empty);
      this.listEl.appendChild(list);
      return;
    }
    for (const s of tagged) list.appendChild(this._taskViewRow(s, true));
    if (untagged.length || untaggedStopped) {
      const h = document.createElement('div');
      h.className = 'task-view-untagged-header';
      h.innerHTML = `<span>${tr('Untagged')}</span>`
        + (untaggedStopped ? `<span class="tv-untagged-note">${tr('{n} stopped · see Folders', { n: untaggedStopped })}</span>` : '')
        + `<span class="folder-count">${untagged.length}</span>`;
      list.appendChild(h);
      for (const s of untagged) list.appendChild(this._taskViewRow(s, false));
    }
    this.listEl.appendChild(list);
  };

  proto._renderTaskBoard = function(sessions) {
    // View toggle: Groups (岗位, member-session board) | Tasks (活儿, flat list).
    this.listEl.appendChild(this._buildBoardViewTabs());
    if (this._boardView === 'tasks') { this._renderTaskViewFlat(sessions); return; }
    // Observer must exist before _observeFolder calls (see _renderGrouped)
    this._setupLazyFolders();
    const sessionById = new Map();
    for (const s of sessions) {
      sessionById.set(this._getSessionStateKey(s), s);
      if (s.sessionId) sessionById.set(s.sessionId, s);
      const legacyId = this._getLegacySessionId(s);
      if (legacyId) sessionById.set(legacyId, s);
    }

    const assignedIds = new Set();

    const addRow = document.createElement('div');
    addRow.className = 'task-board-addrow';
    const addCard = document.createElement('div');
    addCard.className = 'session-item-card new-session-card';
    addCard.innerHTML = `<div class="session-card-name" style="color:var(--accent-hover)">${tr('+ New Task Group')}</div>`;
    addCard.onclick = async () => {
      const name = await showInputDialog({ title: tr('New Task Group'), label: tr('Task Group title'), confirmText: tr('Create') });
      if (name && name.trim()) {
        const t = await this._taskCreate({ title: name.trim() });
        if (t) this.app.openTaskDetail(t.id);
      }
    };
    // Import a task from a committable repo file (P4)
    const importCard = document.createElement('div');
    importCard.className = 'session-item-card new-session-card task-board-import';
    importCard.innerHTML = `<div class="session-card-name" style="color:var(--text-secondary)">${tr('Import…')}</div>`;
    importCard.title = tr('Import a task from a VibeSpace task markdown file');
    importCard.onclick = async () => {
      const p = await showInputDialog({ title: tr('Import Task Group'), label: tr('Absolute path to a VibeSpace task .md file'), placeholder: '/path/to/repo/T-xxxxxx.md', confirmText: tr('Import') });
      if (!p || !p.trim()) return;
      const data = await this._taskApi('POST', '/api/tasks/import', { path: p.trim() });
      if (data?.task) { showToast(tr('Imported: {title}', { title: data.task.title })); this.app.openTaskDetail(data.task.id); }
    };
    addRow.append(addCard, importCard);
    this.listEl.appendChild(addRow);

    for (const task of this._taskBoardOrder()) {
      const keys = this._getTaskSessionKeys(task, sessions);
      const taskSessions = [...keys].map(id => sessionById.get(id)).filter(Boolean);
      keys.forEach(id => assignedIds.add(id));
      const attn = this._taskAttention(task, sessions);

      const groupEl = document.createElement('div');
      groupEl.className = 'folder-group task-board-item';
      const collapseKey = 'group:' + task.id;
      groupEl._collapseKey = collapseKey; // for highlightSession to expand on jump
      if (this._collapsedFolders.has(collapseKey)) groupEl.classList.add('collapsed');
      if (task.color) { groupEl.style.setProperty('--task-color', task.color); groupEl.dataset.colored = '1'; }

      const hasLive = taskSessions.some(s => s.status === 'live' || s.status === 'tmux');
      const linkedFolders = task.folders || [];
      const folderHint = linkedFolders.length ? tr(' ({n} folders)', { n: linkedFolders.length }) : '';
      const statusChip = task.archived
        ? `<span class="task-status-chip" style="--chip-color:var(--text-dim)">${tr('archived')}</span>`
        : '';
      const attnCount = (attn.waiting || 0) + (attn.blocked || 0);
      const attnTip = attn.declared ? (attn.declared.reason || tr('needs attention'))
        : [attn.waiting ? tr('{n} waiting for input', { n: attn.waiting }) : '', attn.blocked ? tr('{n} blocked', { n: attn.blocked }) : ''].filter(Boolean).join(' · ');
      const attnBadge = (attnCount || attn.declared)
        ? `<span class="task-attn-badge" title="${escHtml(attnTip)}">⚠${attnCount ? ' ' + attnCount : ''}</span>`
        : '';

      const header = document.createElement('div');
      header.className = 'folder-header';
      header.innerHTML = `<span class="folder-chevron">▼</span>`
        + `<span class="folder-path" style="direction:ltr">${escHtml(task.title)}<span style="color:var(--text-dim);font-weight:400;font-size:10px">${folderHint}</span></span>`
        + statusChip + attnBadge
        + `<span class="folder-count">${taskSessions.length}</span>`;
      if (hasLive) {
        const dot = document.createElement('span');
        dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:var(--green);flex-shrink:0';
        header.insertBefore(dot, header.querySelector('.folder-count'));
      }

      const nameSpan = header.querySelector('.folder-path');
      if (nameSpan) {
        nameSpan.addEventListener('dblclick', async (e) => {
          e.stopPropagation();
          const newName = await showInputDialog({ title: tr('Rename Task Group'), label: tr('Title'), value: task.title, confirmText: tr('Rename') });
          if (newName && newName.trim() && newName.trim() !== task.title) this._taskUpdate(task.id, { title: newName.trim() });
        });
        nameSpan.title = tr('Double-click to rename');
      }

      const plusBtn = document.createElement('button');
      plusBtn.className = 'folder-add-btn';
      plusBtn.textContent = '+';
      plusBtn.title = tr('New session in this task') + (this._folderPaths(task)[0] ? ` (${this._folderPaths(task)[0]})` : '');
      plusBtn.onclick = (e) => {
        e.stopPropagation();
        // Reuse the normal dialog PRE-FILLED (user confirms all params):
        // cwd defaults to the first auto-include folder, task pre-selected.
        this.app.showNewSessionDialog({ cwd: this._folderPaths(task)[0], taskId: task.id });
      };
      header.appendChild(plusBtn);

      const detailBtn = document.createElement('button');
      detailBtn.className = 'folder-add-btn';
      detailBtn.innerHTML = ICON_DETAIL;
      detailBtn.title = tr('Task Group details (objective, activity log)');
      detailBtn.onclick = (e) => { e.stopPropagation(); this.app.openTaskDetail(task.id); };
      header.appendChild(detailBtn);

      const resumeAllBtn = document.createElement('button');
      resumeAllBtn.className = 'folder-add-btn';
      resumeAllBtn.textContent = '▶';
      resumeAllBtn.title = tr('Resume all sessions in "{title}"', { title: task.title });
      resumeAllBtn.onclick = (e) => {
        e.stopPropagation();
        for (const s of taskSessions) {
          const agentOpts = {
            backend: s.backend || 'claude', backendSessionId: s.backendSessionId || s.sessionId,
            agentKind: s.agentKind || 'primary', agentRole: s.agentRole || '',
            agentNickname: s.agentNickname || '', sourceKind: s.sourceKind || '',
            parentThreadId: s.parentThreadId || null,
          };
          if (s.status === 'stopped') {
            this.app.resumeSession(s.sessionId, s.cwd, this.getCustomName(s) || s.name, agentOpts);
          } else if (s.status === 'live' && s.webuiId) {
            this.app.attachSession(s.webuiId, s.webuiName || s.name, s.cwd, { mode: s.webuiMode, ...agentOpts });
          } else if (s.status === 'tmux') {
            this.app.attachTmuxSession(s.tmuxTarget, s.name, s.cwd);
          }
        }
      };
      header.appendChild(resumeAllBtn);

      header.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        this._showTaskContextMenu(e.clientX, e.clientY, task.id);
      });

      const _setupTaskDrop = (el) => {
        el.addEventListener('dragover', (e) => {
          if (e.dataTransfer.types.includes('application/x-folder-path') || e.dataTransfer.types.includes('application/x-session-id') || e.dataTransfer.types.includes('application/x-session-key')) {
            e.preventDefault(); e.stopPropagation(); header.classList.add('drop-target');
          }
        });
        el.addEventListener('dragleave', (e) => { if (!groupEl.contains(e.relatedTarget)) header.classList.remove('drop-target'); });
        el.addEventListener('drop', (e) => {
          e.preventDefault(); e.stopPropagation(); header.classList.remove('drop-target');
          const folderPath = e.dataTransfer.getData('application/x-folder-path');
          const sessionKey = e.dataTransfer.getData('application/x-session-key');
          const sessionId = e.dataTransfer.getData('application/x-session-id');
          if (folderPath) this._taskAddFolder(task.id, folderPath);
          else if (sessionKey || sessionId) this._taskBind(task.id, sessionKey || sessionId);
        });
      };
      _setupTaskDrop(groupEl);

      header.onclick = (e) => {
        if (e.target.closest('.folder-add-btn')) return;
        this._toggleCollapse(groupEl, collapseKey);
      };

      const sessionsDiv = document.createElement('div');
      sessionsDiv.className = 'folder-sessions';
      this._sortSessions(taskSessions);

      if (taskSessions.length === 0) {
        const empty = document.createElement('div'); empty.className = 'empty-hint';
        empty.textContent = tr('No sessions in this task');
        sessionsDiv.appendChild(empty);
      } else {
        this._observeFolder(groupEl, sessionsDiv, taskSessions, { showCwd: true });
      }

      groupEl.append(header, sessionsDiv);
      this.listEl.appendChild(groupEl);
    }

    // Untagged
    const untagged = sessions.filter(s => !assignedIds.has(this._getSessionStateKey(s)) && !assignedIds.has(s.sessionId));
    if (untagged.length > 0) {
      const groupEl = document.createElement('div'); groupEl.className = 'folder-group';
      const collapseKey = 'group:__ungrouped__';
      groupEl._collapseKey = collapseKey; // for highlightSession to expand on jump
      if (this._collapsedFolders.has(collapseKey)) groupEl.classList.add('collapsed');
      const header = document.createElement('div'); header.className = 'folder-header';
      header.innerHTML = `<span class="folder-chevron">▼</span><span class="folder-path" style="direction:ltr;font-style:italic">${tr('Untagged')}</span><span class="folder-count">${untagged.length}</span>`;
      header.onclick = () => this._toggleCollapse(groupEl, collapseKey);
      const sessionsDiv = document.createElement('div'); sessionsDiv.className = 'folder-sessions';
      this._sortSessions(untagged);
      this._observeFolder(groupEl, sessionsDiv, untagged, { showCwd: true });
      groupEl.append(header, sessionsDiv);
      this.listEl.appendChild(groupEl);
    }
  };

  // ── Mobile (two-level drill, same as folders) ──

  // Mobile Tasks tab: the same Groups | Tasks sub-views as desktop. Groups =
  // the two-level drill-down; Tasks = the SAME flat urgency-sorted Task View
  // renderer as desktop (cards are the shared renderer, already touch-ready).
  proto._renderMobileTaskBoard = function(sessions) {
    this.listEl.appendChild(this._buildBoardViewTabs());
    if (this._boardView === 'tasks') { this._renderTaskViewFlat(sessions); return; }
    this._renderMobileTaskList(sessions);
  };

  proto._renderMobileTaskList = function(sessions) {
    const MOBILE_ICON_TASK = '<svg class="mobile-folder-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M5 6h6M5 9h6M5 12h3"/></svg>';
    const sessionById = new Map();
    for (const s of sessions) {
      sessionById.set(this._getSessionStateKey(s), s);
      sessionById.set(s.sessionId, s);
    }
    const assignedIds = new Set();
    for (const task of this._taskBoardOrder()) {
      const keys = this._getTaskSessionKeys(task, sessions);
      const taskSessions = [...keys].map(id => sessionById.get(id)).filter(Boolean);
      keys.forEach(id => assignedIds.add(id));
      const liveCount = taskSessions.filter(s => s.status === 'live' || s.status === 'tmux').length;
      const attn = this._taskAttention(task, sessions);
      const card = document.createElement('div'); card.className = 'mobile-folder-card';
      card.innerHTML = MOBILE_ICON_TASK
        + `<span class="mobile-folder-path">${escHtml(task.title)}${attn.waiting || attn.declared ? ' <span class="task-attn-badge">⚠</span>' : ''}</span>`
        + `<span class="mobile-folder-meta">${task.archived ? tr('archived') + ' · ' : ''}${tr('{n} sessions', { n: taskSessions.length })}${liveCount ? ' · ' + tr('{n} live', { n: liveCount }) : ''}</span>`
        + `<span class="mobile-folder-arrow">›</span>`;
      if (liveCount) card.classList.add('has-live');
      card.onclick = () => { this._mobileDrilldown = { type: 'group', key: task.id, label: task.title }; this._renderMobileTaskDetail(task.title, taskSessions, sessions); };
      // Long-press — same task menu as desktop's header right-click
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        this._showTaskContextMenu(e.clientX, e.clientY, task.id);
      });
      this.listEl.appendChild(card);
    }
    // Untagged: list ACTIVE ones only — since 2.47 the tasks tab gets the
    // UNFILTERED session list (thousands of stopped) and the mobile drill-down
    // has no pagination; rendering them all would freeze the phone.
    const untaggedAll = sessions.filter(s => !assignedIds.has(this._getSessionStateKey(s)) && !assignedIds.has(s.sessionId));
    const untagged = untaggedAll.filter(s => s.status === 'live' || s.status === 'tmux');
    const untaggedStopped = untaggedAll.length - untagged.length;
    if (untagged.length > 0 || untaggedStopped > 0) {
      const card = document.createElement('div'); card.className = 'mobile-folder-card';
      card.innerHTML = MOBILE_ICON_TASK
        + `<span class="mobile-folder-path" style="font-style:italic">${tr('Untagged')}</span>`
        + `<span class="mobile-folder-meta">${tr('{n} active', { n: untagged.length })}${untaggedStopped ? ' · ' + tr('{n} stopped (see Folders)', { n: untaggedStopped }) : ''}</span>`
        + `<span class="mobile-folder-arrow">›</span>`;
      card.onclick = () => { this._mobileDrilldown = { type: 'group', key: '__ungrouped__' }; this._renderMobileTaskDetail(tr('Untagged'), untagged, sessions); };
      this.listEl.appendChild(card);
    }
  };

  proto._renderMobileTaskDetail = function(title, taskSessions, allSessions) {
    this.listEl.innerHTML = '';
    const back = document.createElement('div'); back.className = 'mobile-folder-back';
    back.innerHTML = `<span class="mobile-folder-back-arrow">‹</span> <span>${tr('All Task Groups')}</span>`;
    back.onclick = () => { this._mobileDrilldown = null; this._render(); }; // full re-render restores the sub-tab bar
    this.listEl.appendChild(back);
    const titleRow = document.createElement('div'); titleRow.className = 'mobile-folder-title';
    titleRow.innerHTML = `<span>${escHtml(title)}</span>`;
    this.listEl.appendChild(titleRow);
    this._sortSessions(taskSessions);
    for (const s of taskSessions) this.listEl.appendChild(this._buildSessionCard(s, { showCwd: true }));
  };
}
