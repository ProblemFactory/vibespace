import { escHtml, showConfirmDialog, showToast } from './utils.js';
import { setupDirAutocomplete } from './autocomplete.js';
import { t } from './i18n.js';

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
  if (!task && sidebar._tasksLoaded) { showToast(t('Task Group not found'), { type: 'error' }); return null; }

  const openSpec = { action: 'openTaskDetail', taskId };
  const winInfo = app.wm.createWindow({ title: task?.title || t('Task Group'), type: 'task', syncId, openSpec, width: 460, height: 560 });
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
      if (!sidebar._tasksLoaded) { root.innerHTML = `<div class="empty-hint">${escHtml(t('Loading task…'))}</div>`; return; }
      app.wm.closeWindow(winInfo.id); // deleted elsewhere
      return;
    }
    // Skip re-render only while the user is ACTIVELY typing (a non-empty field).
    // An emptied add-field (right after adding a folder/step) must re-render so
    // the new item shows immediately; remember it to re-focus after the rebuild.
    const _ae = document.activeElement;
    const _typing = root.contains(_ae) && /^(INPUT|TEXTAREA)$/.test(_ae.tagName);
    if (_typing && _ae.value) return;
    const _refocusPlaceholder = _typing ? _ae.placeholder : null;
    // Rebuilding wipes root's scroll position — a color/toggle edit at the
    // bottom of the window must not yank the view back to the top.
    const _scrollTop = root.scrollTop;
    app.wm.setTitle(winInfo.id, task.title);
    root.innerHTML = '';

    // ── Header: status + kind ──
    const head = document.createElement('div');
    head.className = 'task-detail-head';
    const titleInput = document.createElement('input');
    titleInput.className = 'task-detail-title';
    titleInput.value = task.title;
    titleInput.title = t('Task Group title');
    titleInput.onchange = () => { if (titleInput.value.trim()) patch({ title: titleInput.value.trim() }); };
    head.appendChild(titleInput);
    // A Task Group (岗位) has NO status — persistent role; only archive. Task
    // status lives on the session (reported via vibespace-status).
    const archBtn = document.createElement('button');
    archBtn.className = 'task-detail-btn';
    archBtn.textContent = task.archived ? t('Unarchive') : t('Archive');
    archBtn.title = task.archived ? t('Restore this group') : t('Archive this group (hide it; it stops auto-including new sessions)');
    archBtn.onclick = () => patch({ archived: !task.archived });
    head.appendChild(archBtn);
    if (task.kind !== 'task') {
      const convert = document.createElement('button');
      convert.className = 'task-detail-btn';
      convert.textContent = t('Convert to task');
      convert.title = t('Groups are plain tags; a task adds an objective, checklist and activity log');
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
      const objSec = section(t('Objective'), t('shared across all sessions of this task'));
      const obj = document.createElement('textarea');
      obj.className = 'task-detail-objective';
      obj.placeholder = t('What is this task trying to achieve? Constraints, definition of done…');
      obj.value = task.objective || '';
      obj.onchange = () => patch({ objective: obj.value });
      objSec.appendChild(obj);

      // ── Checklist (was "Plan") ──
      const planSec = section(t('Checklist'), t("the group's backlog of work items — you queue them, any session picks one up and ticks it off (agents keep their own working steps in their session TODO, shown on each card)"));
      const planList = document.createElement('div');
      planList.className = 'task-detail-plan';
      (task.plan || []).forEach((item, i) => {
        const row = document.createElement('div');
        row.className = 'task-detail-plan-item' + (item.done ? ' done' : '');
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!item.done;
        cb.onchange = () => {
          const plan = task.plan.map((p, j) => {
            if (j !== i) return p;
            const np = { ...p, done: cb.checked };
            if (!cb.checked) delete np.by; // P5: unticking clears the "done by" link
            return np;
          });
          patch({ plan });
        };
        const txt = document.createElement('span'); txt.textContent = item.text;
        const del = document.createElement('button'); del.className = 'task-detail-x'; del.textContent = '×'; del.title = t('Remove step');
        del.onclick = () => patch({ plan: task.plan.filter((_, j) => j !== i) });
        row.append(cb, txt);
        if (item.done && item.by) {
          // P5: loose, informational link — which session ticked this step.
          const by = document.createElement('span');
          by.className = 'task-detail-plan-by';
          by.textContent = item.by.replace(/^(\w+):(.{6}).*/, '$1:$2…');
          by.title = t('Ticked by session {by}', { by: item.by });
          row.append(by);
        }
        row.append(del);
        planList.appendChild(row);
      });
      planSec.appendChild(planList);
      const planAdd = document.createElement('input');
      planAdd.className = 'task-detail-input';
      planAdd.placeholder = t('+ Add checklist step (Enter)');
      planAdd.onkeydown = (e) => {
        if (e.key === 'Enter' && planAdd.value.trim()) {
          patch({ plan: [...(task.plan || []), { text: planAdd.value.trim(), done: false }] });
          planAdd.value = '';
        }
      };
      planSec.appendChild(planAdd);

      // ── Activity log (was "Progress") ──
      const progSec = section(t('Activity log'), t('timestamped notes of what was done — agents append via vibespace-task, you can too'));
      const progList = document.createElement('div');
      progList.className = 'task-detail-progress';
      const entries = (task.progress || []).slice(-30);
      if (!entries.length) progList.innerHTML = `<div class="empty-hint">${escHtml(t('No progress notes yet'))}</div>`;
      for (const p of entries) {
        const when = new Date(p.at);
        const stamp = `<span class="task-detail-progress-time">${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
        if (p.detail) {
          // summary+detail entries expand on click — the summary is the log
          // line, the detail is the full context the agent filed with it
          const row = document.createElement('details');
          row.className = 'task-detail-progress-item task-detail-progress-exp';
          row.innerHTML = `<summary>${stamp}${escHtml(p.note)}</summary><div class="task-detail-progress-detail">${escHtml(p.detail)}</div>`;
          progList.appendChild(row);
        } else {
          const row = document.createElement('div');
          row.className = 'task-detail-progress-item';
          row.innerHTML = `${stamp}${escHtml(p.note)}`;
          progList.appendChild(row);
        }
      }
      progSec.appendChild(progList);
      progList.scrollTop = progList.scrollHeight;
      const progAdd = document.createElement('input');
      progAdd.className = 'task-detail-input';
      progAdd.placeholder = t('+ Add activity note (Enter)');
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
    const sessSec = section(t('Sessions'), t('{n} total', { n: resolved.size }));
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
        + (viaFolder ? `<span class="task-detail-hint">${escHtml(t('via folder'))}</span>` : '');
      if (!viaFolder) {
        const un = document.createElement('button');
        un.className = 'task-detail-x'; un.textContent = '×'; un.title = t('Remove from task');
        un.onclick = () => sidebar._taskUnbind(taskId, key);
        row.appendChild(un);
      }
      sessList.appendChild(row);
    };
    for (const key of explicit) addSessRow(key, false);
    for (const key of resolved) if (!explicit.includes(key)) addSessRow(key, true);
    if (!resolved.size) sessList.innerHTML = `<div class="empty-hint">${escHtml(t('Tag sessions from their card (Tasks row) or drag a card onto this task in the sidebar'))}</div>`;
    sessSec.appendChild(sessList);

    // ── Auto-include folders ──
    const foldSec = section(t('Auto-include folders'), t('sessions in these folders join automatically'));
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
      recLabel.title = t('Include sessions in subfolders too. Off = only sessions whose cwd is exactly this folder.');
      const recCb = document.createElement('input'); recCb.type = 'checkbox'; recCb.checked = rec.recursive;
      recCb.onchange = () => sidebar._taskSetFolderRecursive(taskId, rec.path, recCb.checked);
      recLabel.append(recCb, document.createTextNode(t('subfolders')));
      row.appendChild(recLabel);
      const un = document.createElement('button');
      un.className = 'task-detail-x'; un.textContent = '×'; un.title = t('Unlink folder');
      un.onclick = () => sidebar._taskRemoveFolder(taskId, rec.path);
      row.appendChild(un);
      foldList.appendChild(row);
    }
    foldSec.appendChild(foldList);
    const foldAddWrap = document.createElement('div');
    foldAddWrap.className = 'task-detail-acwrap';
    const foldAdd = document.createElement('input');
    foldAdd.className = 'task-detail-input';
    foldAdd.placeholder = t('+ Link folder path (Enter)');
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
    const ctxSec = section(t('Context folder'), t('a shared folder for this task — its TASK.md and a file index are injected into every session bound to this task'));
    const ctxWrap = document.createElement('div');
    ctxWrap.className = 'task-detail-acwrap task-detail-ctxrow';
    const ctxInput = document.createElement('input');
    ctxInput.className = 'task-detail-input';
    ctxInput.placeholder = t('Absolute path, e.g. ~/tasks/{id}', { id: taskId });
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
    browse.textContent = t('Browse');
    browse.title = t('Open the context folder in the file explorer');
    browse.disabled = !task.contextDir;
    browse.onclick = () => { if (task.contextDir) app.openFileExplorer(task.contextDir); };
    ctxWrap.append(ctxInput, ctxDrop, browse);
    ctxSec.appendChild(ctxWrap);
    // Context injection toggle (P6) — off = sessions still belong (board /
    // vibespace-task / status keep working) but this group's context is NOT
    // injected into them.
    const injWrap = document.createElement('label');
    injWrap.className = 'task-detail-folder-rec task-detail-inject';
    injWrap.title = t("When off, this group's objective / checklist / file index is NOT injected into its sessions. They still belong to it — the board, vibespace-task and status keep working.");
    const injCb = document.createElement('input'); injCb.type = 'checkbox'; injCb.checked = task.injectContext !== false;
    injCb.onchange = () => patch({ injectContext: injCb.checked });
    injWrap.append(injCb, document.createTextNode(t("Inject this group's context into its sessions")));
    ctxSec.appendChild(injWrap);

    // ── Color ──
    const colorSec = section(t('Color'));
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
    noColor.title = t('No color');
    noColor.onclick = () => patch({ color: null });
    swatchRow.appendChild(noColor);
    colorSec.appendChild(swatchRow);

    // ── Export / Import (P4): a task ⇄ a committable markdown file ──
    const repoSec = section(t('Export / Import'), t('a self-contained markdown file (frontmatter + objective + checklist) — commit it into a git repo so the task travels with the code, or move it between machines'));
    const repoWrap = document.createElement('div');
    repoWrap.className = 'task-detail-acwrap task-detail-ctxrow';
    const repoInput = document.createElement('input');
    repoInput.className = 'task-detail-input';
    repoInput.placeholder = t('Absolute path for the .md file');
    repoInput.value = task.contextDir ? `${task.contextDir}/${task.id}.md` : '';
    const repoDrop = document.createElement('div');
    repoDrop.className = 'autocomplete-dropdown hidden';
    setupDirAutocomplete(repoInput, repoDrop);
    const exportBtn = document.createElement('button');
    exportBtn.className = 'task-detail-btn';
    exportBtn.textContent = t('Export');
    exportBtn.onclick = async () => {
      const p = repoInput.value.trim();
      if (!p) { showToast(t('Enter a file path first'), { type: 'error' }); return; }
      try {
        const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/export`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }),
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok) showToast(t('Exported to {path}', { path: d.path }));
        else showToast(d.error || t('Export failed'), { type: 'error' });
      } catch { showToast(t('Export failed — server unreachable'), { type: 'error' }); }
    };
    const importBtn = document.createElement('button');
    importBtn.className = 'task-detail-btn';
    importBtn.textContent = t('Import');
    importBtn.title = t('Read a task markdown file back into the store (its frontmatter id/title/status are authoritative; existing sessions/folders/progress are preserved)');
    importBtn.onclick = async () => {
      const p = repoInput.value.trim();
      if (!p) { showToast(t('Enter the .md file path first'), { type: 'error' }); return; }
      try {
        const res = await fetch('/api/tasks/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }),
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok) showToast(t('Imported {id}', { id: d.task?.id || '' }));
        else showToast(d.error || t('Import failed'), { type: 'error' });
      } catch { showToast(t('Import failed — server unreachable'), { type: 'error' }); }
    };
    repoWrap.append(repoInput, repoDrop, exportBtn, importBtn);
    repoSec.appendChild(repoWrap);

    // ── Danger ──
    const del = document.createElement('button');
    del.className = 'task-detail-btn task-detail-delete';
    del.textContent = t('Delete Task Group');
    del.onclick = async () => {
      if (await showConfirmDialog({ title: t('Delete Task Group'), message: t('Delete "{name}"? Sessions will not be deleted.', { name: task.title }), confirmText: t('Delete'), danger: true })) {
        sidebar._taskDelete(taskId);
      }
    };
    root.appendChild(del);

    // Re-focus the emptied add-field so adding folders/steps in a row keeps
    // focus after the list re-renders.
    if (_refocusPlaceholder) {
      const inp = [...root.querySelectorAll('input, textarea')].find((i) => i.placeholder === _refocusPlaceholder);
      if (inp) inp.focus();
    }
    root.scrollTop = _scrollTop;
  };

  render();

  const onTasksMsg = (msg) => { if (msg.type === 'tasks-updated') render(); };
  app.ws.onGlobal(onTasksMsg);
  const prevClose = winInfo.onClose;
  winInfo.onClose = () => { app.ws.offGlobal(onTasksMsg); prevClose?.(); };

  return winInfo;
}
