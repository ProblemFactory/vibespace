import { escHtml, showConfirmDialog, showToast } from './utils.js';
import { setupDirAutocomplete } from './autocomplete.js';
import { TASK_STATUS_META } from './sidebar-tasks.js';

/**
 * Task detail window — the structured editor over data/tasks.json
 * (docs/design-task-system.md §5.3): status, objective, plan checklist,
 * progress log, bound sessions, auto-include folders, context folder, color.
 * Every edit PATCHes /api/tasks/:id; the tasks-updated broadcast keeps other
 * clients (and this window) in sync. The context folder is only DESIGNATED
 * here in P1 — injection (SessionStart hook) ships in P2.
 */

const SWATCHES = ['#e06c75', '#e5a04c', '#98c379', '#56b6c2', '#61afef', '#c678dd'];

export function openTaskDetail(app, taskId, { syncId } = {}) {
  const sidebar = app.sidebar;
  const existing = [...app.wm.windows.values()].find(w => w._taskDetailId === taskId);
  if (existing) { app.wm.focusWindow(existing.id); return existing; }

  let task = sidebar._taskById(taskId);
  if (!task && sidebar._tasksLoaded) { showToast('Task not found', { type: 'error' }); return null; }

  const openSpec = { action: 'openTaskDetail', taskId };
  const winInfo = app.wm.createWindow({ title: task?.title || 'Task', type: 'task', syncId, openSpec, width: 460, height: 560 });
  winInfo._taskDetailId = taskId;

  const root = document.createElement('div');
  root.className = 'task-detail';
  winInfo.content.appendChild(root);

  const patch = (p) => sidebar._taskUpdate(taskId, p);

  // Don't clobber a field the user is actively typing in when a remote
  // update re-renders — skip re-render and let the next update catch up.
  const render = () => {
    task = sidebar._taskById(taskId);
    if (!task) {
      // Layout restore can replay this window before the initial /api/tasks
      // fetch lands — show a placeholder and let tasks-updated re-render.
      if (!sidebar._tasksLoaded) { root.innerHTML = '<div class="empty-hint">Loading task…</div>'; return; }
      app.wm.closeWindow(winInfo.id); // deleted elsewhere
      return;
    }
    if (root.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    app.wm.setTitle(winInfo.id, task.title);
    root.innerHTML = '';

    // ── Header: status + kind ──
    const head = document.createElement('div');
    head.className = 'task-detail-head';
    const titleInput = document.createElement('input');
    titleInput.className = 'task-detail-title';
    titleInput.value = task.title;
    titleInput.title = 'Task title';
    titleInput.onchange = () => { if (titleInput.value.trim()) patch({ title: titleInput.value.trim() }); };
    head.appendChild(titleInput);
    if (task.kind === 'task') {
      const statusSel = document.createElement('select');
      statusSel.className = 'task-detail-status';
      for (const [status, meta] of Object.entries(TASK_STATUS_META)) {
        const o = document.createElement('option');
        o.value = status; o.textContent = meta.label; o.selected = task.status === status;
        statusSel.appendChild(o);
      }
      statusSel.onchange = () => patch({ status: statusSel.value });
      statusSel.style.setProperty('--chip-color', TASK_STATUS_META[task.status]?.color || 'var(--text-dim)');
      head.appendChild(statusSel);
    } else {
      const convert = document.createElement('button');
      convert.className = 'task-detail-btn';
      convert.textContent = 'Convert to task';
      convert.title = 'Groups are plain tags; a task adds status, objective, plan and progress';
      convert.onclick = () => patch({ kind: 'task' });
      head.appendChild(convert);
    }
    root.appendChild(head);

    const section = (label, hint) => {
      const s = document.createElement('div');
      s.className = 'task-detail-section';
      s.innerHTML = `<div class="task-detail-label">${escHtml(label)}${hint ? `<span class="task-detail-hint">${escHtml(hint)}</span>` : ''}</div>`;
      root.appendChild(s);
      return s;
    };

    if (task.kind === 'task') {
      // ── Objective ──
      const objSec = section('Objective', 'shared across all sessions of this task');
      const obj = document.createElement('textarea');
      obj.className = 'task-detail-objective';
      obj.placeholder = 'What is this task trying to achieve? Constraints, definition of done…';
      obj.value = task.objective || '';
      obj.onchange = () => patch({ objective: obj.value });
      objSec.appendChild(obj);

      // ── Checklist (was "Plan") ──
      const planSec = section('Checklist', 'steps toward the objective — you and agents tick them off');
      const planList = document.createElement('div');
      planList.className = 'task-detail-plan';
      (task.plan || []).forEach((item, i) => {
        const row = document.createElement('div');
        row.className = 'task-detail-plan-item' + (item.done ? ' done' : '');
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!item.done;
        cb.onchange = () => {
          const plan = task.plan.map((p, j) => j === i ? { ...p, done: cb.checked } : p);
          patch({ plan });
        };
        const txt = document.createElement('span'); txt.textContent = item.text;
        const del = document.createElement('button'); del.className = 'task-detail-x'; del.textContent = '×'; del.title = 'Remove step';
        del.onclick = () => patch({ plan: task.plan.filter((_, j) => j !== i) });
        row.append(cb, txt, del);
        planList.appendChild(row);
      });
      planSec.appendChild(planList);
      const planAdd = document.createElement('input');
      planAdd.className = 'task-detail-input';
      planAdd.placeholder = '+ Add checklist step (Enter)';
      planAdd.onkeydown = (e) => {
        if (e.key === 'Enter' && planAdd.value.trim()) {
          patch({ plan: [...(task.plan || []), { text: planAdd.value.trim(), done: false }] });
          planAdd.value = '';
        }
      };
      planSec.appendChild(planAdd);

      // ── Activity log (was "Progress") ──
      const progSec = section('Activity log', 'timestamped notes of what was done — agents append via vibespace-task, you can too');
      const progList = document.createElement('div');
      progList.className = 'task-detail-progress';
      const entries = (task.progress || []).slice(-30);
      if (!entries.length) progList.innerHTML = '<div class="empty-hint">No progress notes yet</div>';
      for (const p of entries) {
        const row = document.createElement('div');
        row.className = 'task-detail-progress-item';
        const when = new Date(p.at);
        row.innerHTML = `<span class="task-detail-progress-time">${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>${escHtml(p.note)}`;
        progList.appendChild(row);
      }
      progSec.appendChild(progList);
      progList.scrollTop = progList.scrollHeight;
      const progAdd = document.createElement('input');
      progAdd.className = 'task-detail-input';
      progAdd.placeholder = '+ Add activity note (Enter)';
      progAdd.onkeydown = async (e) => {
        if (e.key === 'Enter' && progAdd.value.trim()) {
          await sidebar._taskApi('POST', `/api/tasks/${encodeURIComponent(taskId)}/progress`, { note: progAdd.value.trim() });
          progAdd.value = '';
        }
      };
      progSec.appendChild(progAdd);
    }

    // ── Sessions ──
    const all = sidebar._allSessions || [];
    const byKey = new Map();
    for (const s of all) byKey.set(sidebar._getSessionStateKey(s), s);
    const explicit = task.sessions || [];
    const resolved = sidebar._getTaskSessionKeys(task, all);
    const sessSec = section('Sessions', `${resolved.size} total`);
    const sessList = document.createElement('div');
    sessList.className = 'task-detail-sessions';
    const addSessRow = (key, viaFolder) => {
      const s = byKey.get(key);
      const row = document.createElement('div');
      row.className = 'task-detail-session' + (viaFolder ? ' via-folder' : '');
      const name = s ? (sidebar.getCustomName(s) || s.name || key) : key;
      const status = s?.status || 'unknown';
      row.innerHTML = `<span class="task-detail-session-dot" data-status="${escHtml(status)}"></span>`
        + `<span class="task-detail-session-name" title="${escHtml(key)}">${escHtml(name)}</span>`
        + (viaFolder ? '<span class="task-detail-hint">via folder</span>' : '');
      if (!viaFolder) {
        const un = document.createElement('button');
        un.className = 'task-detail-x'; un.textContent = '×'; un.title = 'Remove from task';
        un.onclick = () => sidebar._taskUnbind(taskId, key);
        row.appendChild(un);
      }
      sessList.appendChild(row);
    };
    for (const key of explicit) addSessRow(key, false);
    for (const key of resolved) if (!explicit.includes(key)) addSessRow(key, true);
    if (!resolved.size) sessList.innerHTML = '<div class="empty-hint">Tag sessions from their card (Tasks row) or drag a card onto this task in the sidebar</div>';
    sessSec.appendChild(sessList);

    // ── Auto-include folders ──
    const foldSec = section('Auto-include folders', 'sessions in these folders join automatically');
    const foldList = document.createElement('div');
    for (const f of task.folders || []) {
      const rec = sidebar._folderRec(f);
      const row = document.createElement('div');
      row.className = 'task-detail-session';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'task-detail-session-name';
      nameSpan.title = rec.path;
      nameSpan.textContent = rec.path.replace(/^\/home\/[^/]+/, '~');
      row.appendChild(nameSpan);
      // Per-folder recursion toggle (#1): on = sessions in subfolders join too.
      const recLabel = document.createElement('label');
      recLabel.className = 'task-detail-folder-rec';
      recLabel.title = 'Include sessions in subfolders too. Off = only sessions whose cwd is exactly this folder.';
      const recCb = document.createElement('input'); recCb.type = 'checkbox'; recCb.checked = rec.recursive;
      recCb.onchange = () => sidebar._taskSetFolderRecursive(taskId, rec.path, recCb.checked);
      recLabel.append(recCb, document.createTextNode('subfolders'));
      row.appendChild(recLabel);
      const un = document.createElement('button');
      un.className = 'task-detail-x'; un.textContent = '×'; un.title = 'Unlink folder';
      un.onclick = () => sidebar._taskRemoveFolder(taskId, rec.path);
      row.appendChild(un);
      foldList.appendChild(row);
    }
    foldSec.appendChild(foldList);
    const foldAddWrap = document.createElement('div');
    foldAddWrap.className = 'task-detail-acwrap';
    const foldAdd = document.createElement('input');
    foldAdd.className = 'task-detail-input';
    foldAdd.placeholder = '+ Link folder path (Enter)';
    const foldDrop = document.createElement('div');
    foldDrop.className = 'autocomplete-dropdown hidden';
    foldAddWrap.append(foldAdd, foldDrop);
    setupDirAutocomplete(foldAdd, foldDrop);
    foldAdd.onkeydown = (e) => {
      if (e.key === 'Enter' && foldAdd.value.trim() && !foldDrop.querySelector('.autocomplete-item.active')) {
        sidebar._taskAddFolder(taskId, foldAdd.value.trim().replace(/\/+$/, ''));
        foldAdd.value = '';
      }
    };
    foldSec.appendChild(foldAddWrap);

    // ── Context folder ──
    const ctxSec = section('Context folder', 'a shared folder for this task — its TASK.md and a file index are injected into every session bound to this task');
    const ctxWrap = document.createElement('div');
    ctxWrap.className = 'task-detail-acwrap task-detail-ctxrow';
    const ctxInput = document.createElement('input');
    ctxInput.className = 'task-detail-input';
    ctxInput.placeholder = 'Absolute path, e.g. ~/tasks/' + taskId;
    ctxInput.value = task.contextDir || '';
    const ctxDrop = document.createElement('div');
    ctxDrop.className = 'autocomplete-dropdown hidden';
    setupDirAutocomplete(ctxInput, ctxDrop);
    ctxInput.onchange = () => {
      const v = ctxInput.value.trim().replace(/\/+$/, '');
      patch({ contextDir: v || null });
    };
    const browse = document.createElement('button');
    browse.className = 'task-detail-btn';
    browse.textContent = 'Browse';
    browse.title = 'Open the context folder in the file explorer';
    browse.disabled = !task.contextDir;
    browse.onclick = () => { if (task.contextDir) app.openFileExplorer(task.contextDir); };
    ctxWrap.append(ctxInput, ctxDrop, browse);
    ctxSec.appendChild(ctxWrap);

    // ── Color ──
    const colorSec = section('Color');
    const swatchRow = document.createElement('div');
    swatchRow.className = 'task-detail-swatches';
    for (const c of SWATCHES) {
      const sw = document.createElement('button');
      sw.className = 'task-detail-swatch' + (task.color === c ? ' active' : '');
      sw.style.background = c;
      sw.onclick = () => patch({ color: task.color === c ? null : c });
      swatchRow.appendChild(sw);
    }
    const noColor = document.createElement('button');
    noColor.className = 'task-detail-swatch none' + (!task.color ? ' active' : '');
    noColor.title = 'No color';
    noColor.onclick = () => patch({ color: null });
    swatchRow.appendChild(noColor);
    colorSec.appendChild(swatchRow);

    // ── Export / Import (P4): a task ⇄ a committable markdown file ──
    const repoSec = section('Export / Import', 'a self-contained markdown file (frontmatter + objective + checklist) — commit it into a git repo so the task travels with the code, or move it between machines');
    const repoWrap = document.createElement('div');
    repoWrap.className = 'task-detail-acwrap task-detail-ctxrow';
    const repoInput = document.createElement('input');
    repoInput.className = 'task-detail-input';
    repoInput.placeholder = 'Absolute path for the .md file';
    repoInput.value = task.contextDir ? `${task.contextDir}/${task.id}.md` : '';
    const repoDrop = document.createElement('div');
    repoDrop.className = 'autocomplete-dropdown hidden';
    setupDirAutocomplete(repoInput, repoDrop);
    const exportBtn = document.createElement('button');
    exportBtn.className = 'task-detail-btn';
    exportBtn.textContent = 'Export';
    exportBtn.onclick = async () => {
      const p = repoInput.value.trim();
      if (!p) { showToast('Enter a file path first', { type: 'error' }); return; }
      try {
        const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/export`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }),
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok) showToast('Exported to ' + d.path);
        else showToast(d.error || 'Export failed', { type: 'error' });
      } catch { showToast('Export failed — server unreachable', { type: 'error' }); }
    };
    const importBtn = document.createElement('button');
    importBtn.className = 'task-detail-btn';
    importBtn.textContent = 'Import';
    importBtn.title = 'Read a task markdown file back into the store (its frontmatter id/title/status are authoritative; existing sessions/folders/progress are preserved)';
    importBtn.onclick = async () => {
      const p = repoInput.value.trim();
      if (!p) { showToast('Enter the .md file path first', { type: 'error' }); return; }
      try {
        const res = await fetch('/api/tasks/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }),
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok) showToast('Imported ' + (d.task?.id || ''));
        else showToast(d.error || 'Import failed', { type: 'error' });
      } catch { showToast('Import failed — server unreachable', { type: 'error' }); }
    };
    repoWrap.append(repoInput, repoDrop, exportBtn, importBtn);
    repoSec.appendChild(repoWrap);

    // ── Danger ──
    const del = document.createElement('button');
    del.className = 'task-detail-btn task-detail-delete';
    del.textContent = 'Delete task';
    del.onclick = async () => {
      if (await showConfirmDialog({ title: 'Delete Task', message: `Delete "${task.title}"? Sessions will not be deleted.`, confirmText: 'Delete', danger: true })) {
        sidebar._taskDelete(taskId);
      }
    };
    root.appendChild(del);
  };

  render();

  const onTasksMsg = (msg) => { if (msg.type === 'tasks-updated') render(); };
  app.ws.onGlobal(onTasksMsg);
  const prevClose = winInfo.onClose;
  winInfo.onClose = () => { app.ws.offGlobal(onTasksMsg); prevClose?.(); };

  return winInfo;
}
