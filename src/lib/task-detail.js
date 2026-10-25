import { escHtml, showConfirmDialog, showToast, autoTaskColor, showContextMenu } from './utils.js';
import { t, tc } from './i18n.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { mountTaskLog } from './task-log.js'; // the Backlog / 活动记录 tabs ARE the log viewer
import { touches, metaChanged } from '../task-delta.js'; // PURE (lane task-group-fanout): what a tasks-updated delta moved
import { blurCommits, afterPointerUp } from './blur-commit.js'; // a box saves when left, after the release
import { pathField } from './path-field.js'; // lane path-field's component — the Context table's path cells, the export file
import { KEY_FILES } from '../task-context.js'; // PURE: the Context table's default key files (the store's rules)
import { principalPicker, rosterFromApp } from './principal-picker.js'; // lane grants-unify: the «除了» row of the visibility
import { rowToPick, pickToRow } from './principal-picker-model.js';

/**
 * THE TASK GROUP WINDOW (lane task-group-context — the POC v2.2 Group board + the owner's fourth level, 2026-10-23).
 * Tabs 设置 · Backlog (N) · 活动记录 · 成员 (N). 设置, top to bottom: 名称 → 说明 / 常驻指令 (told word for word to every
 * member — the ONE home of the group's rules) → the CONTEXT TABLE (path · note · 告诉 agent in four levels · verbs · ×;
 * ＋ 添加路径… / ＋ 引用另一个任务组…; the budget bar) → 「新对话会收到」 (the renderer's EXACT output, GET
 * /api/tasks/:id/context — never an imitation) → 更多选项 (通知 · 对外可见性 · 浏览器档案 · 颜色 · 导出/导入, their
 * values on the fold's chips). Backlog and 活动记录 are the full viewers (task-log.js mountTaskLog); 成员 = the member
 * rows (★ = the session star — a standing conversation sorts first in the sidebar; 移出; 「在这里开始对话」).
 * Every edit PATCHes /api/tasks/:id (改动即时保存) and the tasks-updated broadcast repaints every client. BLUR COMMITS:
 * a typed path takes effect on blur / Enter only when it resolves — otherwise it keeps its text and says 未生效.
 */

// Quick-pick palette (expanded 6→18 in 2.230.0). The REAL scalability answer
// for many groups is the Auto swatch (deterministic distinct hue per group id,
// see utils.taskGroupColor) + the native custom picker (any color); these are
// just convenient presets.
const SWATCHES = [
  '#e06c75', '#e5533d', '#e5a04c', '#e5c07b', '#b8bb26', '#98c379',
  '#2ea043', '#56b6c2', '#39c5bb', '#61afef', '#4078f2', '#7c7cf0',
  '#c678dd', '#d33682', '#e56399', '#a0522d', '#8a919e', '#5c6370',
];
const TABS = ['settings', 'backlog', 'activity', 'members'];
const foldOpen = new Map();   // taskId → the 更多选项 fold was left open (this page's memory)
const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1).replace(/\.0$/, '')} KB`);
const tilde = (p, home) => (home && p && (p === home || p.startsWith(home + '/')) ? '~' + p.slice(home.length) : p);

export function openTaskDetail(app, taskId, { syncId, tab, full } = {}) {
  const sidebar = app.sidebar;
  const existing = [...app.wm.windows.values()].find(w => w._taskDetailId === taskId);
  if (existing) { app.wm.revealWindow(existing.id, { replay: !!syncId }); if (tab && existing._taskDetailSetTab) existing._taskDetailSetTab(tab); return existing; }

  let task = sidebar._taskById(taskId);
  if (!task && sidebar._tasksLoaded) { showToast(t('Task Group not found'), { type: 'error' }); return null; }

  const openSpec = { action: 'openTaskDetail', taskId };
  const state = { tab: TABS.includes(tab) ? tab : 'settings', full: !!full };   // full = the preview shows everything (kept in the layout)
  if (state.tab !== 'settings') openSpec.tab = state.tab;
  if (state.full) openSpec.full = true;
  const winInfo = app.wm.createWindow({ title: task?.title || t('Task Group'), type: 'task', syncId, openSpec, width: 860, height: 780 });
  winInfo._taskDetailId = taskId;

  const root = document.createElement('div');
  root.className = 'task-detail';
  winInfo.content.appendChild(root);
  const tabsBar = document.createElement('div');
  tabsBar.className = 'sidebar-subtabs task-detail-tabs';
  const body = document.createElement('div');
  body.className = 'task-detail-body';
  const footer = document.createElement('div');
  footer.className = 'task-detail-footer';
  root.append(tabsBar, body, footer);
  // the phone / a narrow window: the Context table's rows become one card each (POC Phone.html)
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => root.classList.toggle('narrow', root.clientWidth < 620)) : null;
  ro?.observe(root);

  const patch = (p) => sidebar._taskUpdate(taskId, p);
  const home = () => app._localHome || null;   // the local home (app.js reads it once at boot) — paths show as ~/…

  // ── tabs ──
  let viewer = null;          // the mounted Backlog / Activity viewer (it repaints itself on tasks-updated)
  const counts = () => {
    const bl = task.backlog || [];
    const members = sidebar._getTaskSessionKeys ? sidebar._getTaskSessionKeys(task, sidebar._allSessions || []).size : (task.sessions || []).length;
    return { settings: '', backlog: `${bl.filter((b) => b.status === 'open').length}`, activity: '', members: String(members) };
  };
  const tabLabel = { settings: () => t('Settings'), backlog: () => t('Backlog'), activity: () => tc('tab', 'Activity log'), members: () => t('Members') };
  const paintTabs = () => {
    const c = counts();
    if (!tabsBar.children.length) {
      for (const key of TABS) {
        const b = document.createElement('button');
        b.className = 'sidebar-subtab';
        b.dataset.tab = key;
        b.onclick = () => setTab(key);
        tabsBar.appendChild(b);
      }
    }
    for (const b of tabsBar.children) {
      const key = b.dataset.tab;
      const want = escHtml(tabLabel[key]()) + (c[key] ? ` <span class="task-log-count">(${escHtml(c[key])})</span>` : '');
      if (b.innerHTML !== want) b.innerHTML = want;
      b.classList.toggle('active', state.tab === key);
    }
  };
  const setTab = (key) => {
    if (!TABS.includes(key)) return;
    state.tab = key;
    if (key === 'settings') delete openSpec.tab; else openSpec.tab = key;
    mountTab();
  };
  winInfo._taskDetailSetTab = setTab;

  // ── 设置 ──
  let fields = [];            // the path fields of the current paint (each holds document listeners — destroyed per paint)
  const unresolved = new Map(); // row key → the typed text that did not take (it stays in its box, saying 未生效)
  let preview = null;         // the last GET /api/tasks/:id/context answer
  let previewSeq = 0, previewTimer = null;
  let settingsDirty = false;

  const destroyFields = () => { for (const f of fields) { try { f.destroy(); } catch { } } fields = []; };
  const section = (parent, label, hint, cls = '') => {
    const s = document.createElement('div');
    s.className = 'task-detail-section' + (cls ? ' ' + cls : '');
    s.innerHTML = `<div class="task-detail-label">${escHtml(label)}${hint ? `<span class="task-detail-hint">${escHtml(hint)}</span>` : ''}</div>`;
    parent.appendChild(s);
    return s;
  };
  const rowsOf = () => (task.ctx || []).map((r) => (r.ref ? { ...r } : { ...r, tags: [...(r.tags || [])], ...(r.keys ? { keys: [...r.keys] } : {}) }));
  const resOf = (i) => (task.ctxRes || [])[i] || null;
  const kindOf = (i) => { const x = resOf(i); return x ? x.kind : 'missing'; };
  const effTell = (r, kind) => { const lvl = r.tell || (kind === 'file' ? 'contents' : 'index'); return kind === 'file' && lvl === 'index' ? 'contents' : lvl; };
  const writeRows = (rows) => patch({ ctx: rows });
  const TELL_LABEL = { note: () => t('Note only'), names: () => t('File names'), index: () => t('Names + key files'), contents: () => t('Contents') };
  const VIA = { prev: () => t('resolved against the row above'), first: () => t("resolved against the group's first folder (the row above's folder does not have it)"), homerel: () => t('resolved against home'), home: () => '', abs: () => '' };

  // the row above's folder, then the group's first folder — the bases a relative path resolves against (home last, the field's own)
  const basesFor = (i) => {
    const out = [];
    for (let j = Math.min(i, (task.ctx || []).length) - 1; j >= 0; j--) {
      const r = task.ctx[j], x = resOf(j);
      if (!r || r.ref || !x || !x.abs) continue;
      if (x.kind === 'dir') out.push({ path: x.abs, label: t('the row above') });
      else if (x.kind === 'file') out.push({ path: x.abs.replace(/\/[^/]*$/, '') || '/', label: t('the row above') });
      break;
    }
    const first = (task.ctx || []).findIndex((r, j) => r && !r.ref && /^(\/|~)/.test(r.path) && kindOf(j) === 'dir');
    if (first >= 0 && !out.some((b) => b.path === resOf(first).abs)) out.push({ path: resOf(first).abs, label: t("the group's first folder") });
    return out;
  };
  const groupEntry = () => ({ id: task.id, name: task.title, color: sidebar.getTaskColor ? sidebar.getTaskColor(task) : null, folders: sidebar._folderPaths(task), context: task.contextDir || null, selected: false });

  const makePathField = (input, { at, onCommit }) => {
    const pf = pathField(input, {
      bases: () => basesFor(at), groupsOf: () => [groupEntry()], host: () => null,
      kind: 'file', create: 'never', picker: true, id: 'task-context-row', onCommit,
      onState: (v) => { if (v.status === 'unresolved') unresolved.set(input.dataset.rowKey || '', input.value); else if (v.status === 'ok') unresolved.delete(input.dataset.rowKey || ''); },
    });
    fields.push(pf);
    return pf;
  };

  const rowKeyOf = (r) => (r.ref ? '@' + r.ref : r.path);

  /** ONE path row of the table. */
  const pathRow = (table, r, i) => {
    const x = resOf(i), kind = kindOf(i);
    const row = document.createElement('div');
    row.className = 'ctx-row';
    row.dataset.row = String(i);
    row.dataset.kind = kind;
    // ① 路径 — the shared path field (files as well as folders); under it: where it resolved, then the plan's words
    const pc = document.createElement('div'); pc.className = 'ctx-cell ctx-path';
    const input = document.createElement('input');
    input.className = 'task-detail-input ctx-path-input';
    input.dataset.rowKey = rowKeyOf(r);
    input.value = unresolved.has(rowKeyOf(r)) ? unresolved.get(rowKeyOf(r)) : r.path;
    input.title = r.path;
    pc.appendChild(input);
    const res = document.createElement('div'); res.className = 'ctx-res';
    const resWords = [];
    if (x && x.abs && x.abs !== r.path && x.kind !== 'remote') resWords.push('= ' + tilde(x.abs, home()));
    if (x && VIA[x.via] && VIA[x.via]()) resWords.push(VIA[x.via]());
    if (kind === 'missing') resWords.push(t('Not found right now'));
    else if (kind === 'blocked') resWords.push(t('Its storage is not answering'));
    else if (kind === 'remote') resWords.push(t('On the machine {host}: told only to conversations opened there', { host: x.host || '' }));
    res.textContent = resWords.join(' · ');
    if (unresolved.has(rowKeyOf(r))) { res.textContent = t('Not applied: {path} was not found — the row keeps {old}', { path: unresolved.get(rowKeyOf(r)), old: r.path }); res.classList.add('ctx-warn'); }
    const plan = document.createElement('div'); plan.className = 'ctx-plan';
    pc.append(res, plan);
    row.appendChild(pc);
    const pf = makePathField(input, {
      at: i,
      onCommit: (info) => {
        const text = String(info.text || '').trim() || info.path;
        if (text === r.path) return;
        unresolved.delete(rowKeyOf(r));
        const rows = rowsOf();
        rows[i] = { ...rows[i], path: text };
        // the verbs follow the kind (POC v2.1): a file never auto-joins nor holds the notes
        if (info.isFile) rows[i].tags = (rows[i].tags || []).filter((g) => g !== 'discover' && g !== 'notes');
        writeRows(rows);
      },
    });
    pc.insertBefore(pf.el, res);
    // ② 说明 — for people AND the agent (it is the row's line)
    const nc = document.createElement('div'); nc.className = 'ctx-cell ctx-note';
    const note = document.createElement('input');
    note.className = 'task-detail-input ctx-note-input';
    note.placeholder = t('What this path is for (one line)');
    note.value = r.note || '';
    note.onchange = () => { const rows = rowsOf(); rows[i] = { ...rows[i], note: note.value.trim() }; writeRows(rows); };
    nc.appendChild(note);
    row.appendChild(nc);
    // ③ 告诉 agent — four levels (a file has no separate key-file level)
    const tc_ = document.createElement('div'); tc_.className = 'ctx-cell ctx-tell';
    const seg = document.createElement('div'); seg.className = 'ctx-seg';
    const eff = effTell(r, kind);
    for (const lvl of (kind === 'file' ? ['note', 'names', 'contents'] : ['note', 'names', 'index', 'contents'])) {
      const b = document.createElement('button');
      b.className = 'ctx-seg-btn' + (eff === lvl ? ' active' : '');
      b.dataset.tell = lvl;
      b.textContent = TELL_LABEL[lvl]();
      b.setAttribute('aria-pressed', eff === lvl ? 'true' : 'false');
      b.onclick = () => { if (eff === lvl && r.tell) return; const rows = rowsOf(); rows[i] = { ...rows[i], tell: lvl }; writeRows(rows); };
      seg.appendChild(b);
    }
    tc_.appendChild(seg);
    if (eff === 'index' && kind !== 'file') {
      // the key files whose CONTENTS ride along — a small chip list, the default set unless edited
      const keys = r.keys || KEY_FILES;
      const kc = document.createElement('div'); kc.className = 'ctx-keys';
      kc.innerHTML = `<span class="task-detail-hint">${escHtml(t('Key files:'))}</span>`;
      for (const k of keys) {
        const chip = document.createElement('span'); chip.className = 'ctx-key';
        chip.textContent = k;
        const x_ = document.createElement('button'); x_.className = 'ctx-key-x'; x_.textContent = '×'; x_.title = t('Remove {name} from the key files', { name: k });
        x_.onclick = () => { const rows = rowsOf(); rows[i] = { ...rows[i], keys: keys.filter((v) => v !== k) }; writeRows(rows); };
        chip.appendChild(x_);
        kc.appendChild(chip);
      }
      const add = document.createElement('input');
      add.className = 'ctx-key-add';
      add.placeholder = t('+ file name');
      blurCommits(add, () => {
        const v = add.value.trim();
        if (!v || v.includes('/')) { add.value = ''; return; }
        const rows = rowsOf(); rows[i] = { ...rows[i], keys: [...keys.filter((k) => k !== v), v] }; add.value = ''; writeRows(rows);
      });
      kc.appendChild(add);
      tc_.appendChild(kc);
    }
    row.appendChild(tc_);
    // ④ 标签 — plain verbs (a file: only 不许改 / 可引用)
    const gc = document.createElement('div'); gc.className = 'ctx-cell ctx-tags';
    const tags = r.tags || [];
    const chip = (key, label, on, { disabled = false, title = '' } = {}) => {
      const b = document.createElement('button');
      b.className = 'ctx-tag' + (on ? ' on' : '');
      b.dataset.tag = key;
      b.textContent = label;
      b.disabled = disabled;
      if (title) b.title = title;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      gc.appendChild(b);
      return b;
    };
    const isFile = kind === 'file';
    const toggle = (key) => {
      const rows = rowsOf();
      const cur = new Set(rows[i].tags || []);
      if (cur.has(key)) cur.delete(key);
      else {
        cur.add(key);
        if (key === 'notes') { cur.delete('readonly'); rows.forEach((o, j) => { if (j !== i && !o.ref) o.tags = (o.tags || []).filter((g) => g !== 'notes'); }); }   // ONE notes row
        if (key === 'readonly') { cur.delete('notes'); if (rows[i].share === 'rw') rows[i].share = 'ro'; }
      }
      rows[i] = { ...rows[i], tags: [...cur] };
      writeRows(rows);
    };
    chip('discover', t('Discover sessions'), tags.includes('discover'), { disabled: isFile, title: t('Conversations started in this folder (or below it) join this group') }).onclick = () => toggle('discover');
    chip('notes', t('Agents keep notes here'), tags.includes('notes'), { disabled: isFile, title: t("This group's shared memory: agents write their notes here (one row); its .vibespace/TASK.md mirrors the group") }).onclick = () => toggle('notes');
    chip('readonly', t('Agents may not change it'), tags.includes('readonly')).onclick = () => toggle('readonly');
    const share = chip('share', t('Other groups may reference it'), !!r.share, { title: t('Another Task Group can take this row into its own Context table') });
    share.onclick = () => { const rows = rowsOf(); rows[i] = { ...rows[i], share: r.share ? null : 'ro' }; writeRows(rows); };
    if (r.share) {
      const sw = document.createElement('span'); sw.className = 'ctx-seg ctx-share';
      for (const [v, label] of [['ro', t('Read-only')], ['rw', t('Read-write')]]) {
        const b = document.createElement('button');
        b.className = 'ctx-seg-btn' + (r.share === v ? ' active' : '');
        b.dataset.share = v;
        b.textContent = label;
        b.disabled = v === 'rw' && tags.includes('readonly');
        b.onclick = () => { if (r.share === v) return; const rows = rowsOf(); rows[i] = { ...rows[i], share: v }; writeRows(rows); };
        sw.appendChild(b);
      }
      gc.appendChild(sw);
    }
    row.appendChild(gc);
    // ⑤ ×
    const del = document.createElement('button');
    del.className = 'task-detail-x ctx-del'; del.textContent = '×'; del.title = t('Remove this row');
    del.onclick = () => { const rows = rowsOf(); rows.splice(i, 1); writeRows(rows); };
    row.appendChild(del);
    table.appendChild(row);
  };

  /** A 引用任务组「X」的 Context 表 row. */
  const refRow = (table, r, i) => {
    const g = sidebar._taskById(r.ref);
    const row = document.createElement('div');
    row.className = 'ctx-row ctx-ref';
    row.dataset.row = String(i);
    const pc = document.createElement('div'); pc.className = 'ctx-cell ctx-path';
    const head = document.createElement('div'); head.className = 'ctx-ref-head';
    head.textContent = g ? t('The Context table of the Task Group 「{name}」', { name: g.title }) : t('A Task Group that no longer exists ({id})', { id: r.ref });
    if (g) { head.classList.add('clickable'); head.onclick = () => app.openTaskDetail(g.id); }
    const n = g ? (g.ctx || []).filter((o) => !o.ref && o.share).length : 0;
    const sub = document.createElement('div'); sub.className = 'ctx-res';
    sub.textContent = g ? t('The rows it marked 「Other groups may reference it」: {n} — read-only here unless it shares them read-write', { n }) : '';
    pc.append(head, sub);
    row.appendChild(pc);
    const nc = document.createElement('div'); nc.className = 'ctx-cell ctx-note';
    const note = document.createElement('input');
    note.className = 'task-detail-input ctx-note-input';
    note.placeholder = t('What this group brings (one line)');
    note.value = r.note || '';
    note.onchange = () => { const rows = rowsOf(); rows[i] = { ...rows[i], note: note.value.trim() }; writeRows(rows); };
    nc.appendChild(note);
    row.appendChild(nc);
    const tcell = document.createElement('div'); tcell.className = 'ctx-cell ctx-tell';
    tcell.innerHTML = `<span class="task-detail-hint">${escHtml(t('As that group set them'))}</span>`;
    row.appendChild(tcell);
    const gc = document.createElement('div'); gc.className = 'ctx-cell ctx-tags';
    gc.innerHTML = `<span class="ctx-tag on ctx-tag-ref">${escHtml(t('Reference · read-only / read-write as shared'))}</span>`;
    row.appendChild(gc);
    const del = document.createElement('button');
    del.className = 'task-detail-x ctx-del'; del.textContent = '×'; del.title = t('Stop referencing this group');
    del.onclick = () => { const rows = rowsOf(); rows.splice(i, 1); writeRows(rows); };
    row.appendChild(del);
    table.appendChild(row);
  };

  const paintPlan = () => {
    if (!preview || state.tab !== 'settings') return;
    const host = body.querySelector('.task-detail-settings');
    if (!host) return;
    // each own row's plan words (what it is told; a stepped row says so)
    for (const pr of preview.rows || []) {
      if (pr.i == null || pr.i < 0) continue;
      const el = host.querySelector(`.ctx-row[data-row="${pr.i}"] .ctx-plan`);
      if (!el) continue;
      let words = '';
      if (pr.kind === 'dir' && pr.files != null) words = '✓ ' + t('{n} files', { n: pr.files });
      else if (pr.kind === 'file') words = '✓ ' + t('a file');
      if (pr.level !== pr.chosen && (pr.kind === 'dir' || pr.kind === 'file')) {
        words += (words ? ' · ' : '') + (pr.need != null
          ? t('Over the injection budget (「{chosen}」 needs {need}, {left} left) — this row is told as 「{level}」', { chosen: TELL_LABEL[pr.chosen](), need: kb(pr.need), left: kb(pr.left), level: TELL_LABEL[pr.level]() })
          : t('Too big to tell as 「{chosen}」 — this row is told as 「{level}」', { chosen: TELL_LABEL[pr.chosen](), level: TELL_LABEL[pr.level]() }));
        el.classList.add('ctx-warn');
      } else el.classList.remove('ctx-warn');
      if (el.textContent !== words) el.textContent = words;
    }
    // the budget bar
    const bar = host.querySelector('.ctx-budget');
    if (bar) {
      const b = preview.budget || {};
      const eff = Math.max(1, b.effective || 1);
      const pct = Math.min(100, Math.round(((preview.used || 0) / eff) * 100));
      bar.querySelector('.ctx-budget-words').textContent = t('Injection budget {used} / {budget}', { used: kb(preview.used || 0), budget: kb(b.effective || 0) })
        + (b.own && b.room < b.own ? ' ' + t('({own} set; the tools and the standing instructions leave {room})', { own: kb(b.own), room: kb(b.room) }) : '');
      bar.querySelector('.ctx-budget-fill').style.width = pct + '%';
      const warn = bar.querySelector('.ctx-budget-warn');
      const stepped = (preview.rows || []).filter((pr) => pr.level !== pr.chosen && (pr.kind === 'dir' || pr.kind === 'file'));
      warn.textContent = stepped.map((pr) => (pr.need != null
        ? t('「{path}」 needs {need} for 「{chosen}」 → told as 「{level}」 (the agent still knows where it is and what it is for)', { path: tilde(pr.abs || pr.path || '', home()), need: kb(pr.need), chosen: TELL_LABEL[pr.chosen](), level: TELL_LABEL[pr.level]() })
        : t('「{path}」 is too big to tell as 「{chosen}」 → told as 「{level}」 (the agent still knows where it is and what it is for)', { path: tilde(pr.abs || pr.path || '', home()), chosen: TELL_LABEL[pr.chosen](), level: TELL_LABEL[pr.level]() }))).join('\n');
      warn.hidden = !stepped.length;
    }
    // 「新对话会收到」
    const pre = host.querySelector('.task-detail-preview');
    if (pre) {
      const text = state.full ? preview.text : preview.block;
      if (pre.textContent !== text) pre.textContent = text;
      const meta = host.querySelector('.task-detail-preview-meta');
      if (meta) meta.textContent = t('{n} in all', { n: kb(preview.bytes || 0) });
    }
  };
  const fetchPreview = () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      const seq = ++previewSeq;
      try {
        const r = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/context`);
        if (!r.ok || seq !== previewSeq) return;
        preview = await r.json();
        paintPlan();
      } catch { /* the next change asks again */ }
    }, 200);
  };

  const renderSettings = () => {
    const _ae = document.activeElement;
    const typing = body.contains(_ae) && /^(INPUT|TEXTAREA)$/.test(_ae.tagName) && _ae.value;
    if (typing) { settingsDirty = true; fetchPreview(); return; }   // never clobber a box being typed in — repainted when it is left
    settingsDirty = false;
    const refocus = body.contains(_ae) && /^(INPUT|TEXTAREA)$/.test(_ae.tagName) ? (_ae.dataset.rowKey ? `[data-row-key="${CSS.escape(_ae.dataset.rowKey)}"]` : _ae.placeholder ? `[placeholder="${CSS.escape(_ae.placeholder)}"]` : null) : null;
    const scrollTop = body.scrollTop;
    destroyFields();
    body.innerHTML = '';
    const host = document.createElement('div');
    host.className = 'task-detail-settings';
    body.appendChild(host);

    // 名称
    const nameSec = section(host, t('Name'));
    const title = document.createElement('input');
    title.className = 'task-detail-input task-detail-title';
    title.value = task.title;
    title.title = t('Task Group title');
    title.onchange = () => { if (title.value.trim() && title.value.trim() !== task.title) patch({ title: title.value.trim() }); };
    nameSec.appendChild(title);

    // 说明 / 常驻指令 — the ONE home of the group's rules
    const objSec = section(host, t('Description / standing instructions'), t("told word for word to every member conversation — the one home of this group's rules"));
    const obj = document.createElement('textarea');
    obj.className = 'task-detail-objective';
    obj.placeholder = t('What this group is for, and the rules every conversation in it follows…');
    obj.value = task.objective || '';
    obj.onchange = () => patch({ objective: obj.value, ...(task.kind !== 'task' ? { kind: 'task' } : {}) });
    objSec.appendChild(obj);

    // the CONTEXT TABLE
    const ctxSec = section(host, t('Context table'), t("every row tells the agent its path and note; 「Tell the agent」 sets only how deep. A relative path resolves against the row above's folder, then the group's first folder, then home."));
    const table = document.createElement('div');
    table.className = 'ctx-table';
    const headRow = document.createElement('div');
    headRow.className = 'ctx-row ctx-headrow';
    headRow.innerHTML = [t('Path'), t('Note (for people and the agent)'), t('Tell the agent'), t('Tags'), ''].map((l) => `<div class="ctx-cell">${escHtml(l)}</div>`).join('');
    table.appendChild(headRow);
    const rows = task.ctx || [];
    rows.forEach((r, i) => (r.ref ? refRow(table, r, i) : pathRow(table, r, i)));
    if (!rows.length) {
      const empty = document.createElement('div'); empty.className = 'empty-hint';
      empty.textContent = t('No rows yet — add the folders and files this group works in. A new conversation is told each one at the depth you choose.');
      table.appendChild(empty);
    }
    ctxSec.appendChild(table);
    // ＋ 添加路径…
    const addInput = document.createElement('input');
    addInput.className = 'task-detail-input ctx-add-input';
    addInput.placeholder = t('+ Add a path… (a folder or a file; relative = against the row above; takes effect when you leave the box or press Enter)');
    addInput.dataset.rowKey = '+add';
    if (unresolved.has('+add')) addInput.value = unresolved.get('+add');
    const addWrap = document.createElement('div'); addWrap.className = 'ctx-add';
    addWrap.appendChild(addInput);
    ctxSec.appendChild(addWrap);
    const addPf = makePathField(addInput, {
      at: rows.length,
      onCommit: (info) => {
        const text = String(info.text || '').trim() || info.path;
        unresolved.delete('+add');
        const next = rowsOf();
        next.push({ path: text, note: '', tell: null, tags: info.isFile ? [] : ['discover'], share: null });
        addInput.value = '';
        writeRows(next);
        showToast(t('Added row {n}: {path} · told 「{level}」{tags} (change it on the row)', { n: next.length, path: text, level: TELL_LABEL[info.isFile ? 'contents' : 'index'](), tags: info.isFile ? '' : ' · ' + t('Discover sessions') }));
      },
    });
    if (unresolved.has('+add')) { const w = document.createElement('div'); w.className = 'ctx-res ctx-warn'; w.textContent = t('Not applied: {path} was not found', { path: unresolved.get('+add') }); addWrap.appendChild(w); }
    void addPf;
    // ＋ 引用另一个任务组…
    const refBtn = document.createElement('button');
    refBtn.className = 'task-detail-link ctx-ref-add';
    refBtn.textContent = t('+ Reference another Task Group…');
    refBtn.title = t("Takes the rows another group marked 「Other groups may reference it」 into this group's table (read-only here unless shared read-write)");
    refBtn.onclick = (e) => {
      const taken = new Set(rows.filter((r) => r.ref).map((r) => r.ref));
      const others = (sidebar._tasks || []).filter((g) => g.id !== task.id && !taken.has(g.id));
      const items = others.length ? others.map((g) => ({ label: `${g.title} — ${t('{n} shared rows', { n: (g.ctx || []).filter((o) => !o.ref && o.share).length })}`, action: () => { const next = rowsOf(); next.push({ ref: g.id, note: '' }); writeRows(next); } }))
        : [{ label: t('No other Task Group to reference yet'), disabled: true, action: () => {} }];
      const rect = refBtn.getBoundingClientRect();
      showContextMenu(e.clientX || rect.left, e.clientY || rect.bottom, items);
    };
    ctxSec.appendChild(refBtn);
    // the budget bar
    const budget = document.createElement('div');
    budget.className = 'ctx-budget';
    budget.innerHTML = `<div class="ctx-budget-head"><span class="ctx-budget-words"></span><span class="task-detail-hint">${escHtml(t('rows go in table order; one that does not fit steps down a level: contents → names + key files → names → note only'))}</span></div><div class="ctx-budget-track"><div class="ctx-budget-fill"></div></div><div class="ctx-budget-warn ctx-warn" hidden></div>`;
    ctxSec.appendChild(budget);

    // 「新对话会收到」 — the renderer's exact output
    const pvSec = section(host, t('What a new conversation receives'), t('exactly what the agent reads — change anything above and it follows'));
    const pvBar = document.createElement('div'); pvBar.className = 'task-detail-preview-bar';
    const full = document.createElement('label'); full.className = 'task-detail-folder-rec';
    const fullCb = document.createElement('input'); fullCb.type = 'checkbox'; fullCb.checked = state.full;
    fullCb.onchange = () => { state.full = fullCb.checked; if (state.full) openSpec.full = true; else delete openSpec.full; paintPlan(); };
    full.append(fullCb, document.createTextNode(t('Show everything (with the tool instructions, backlog and activity)')));
    const meta = document.createElement('span'); meta.className = 'task-detail-hint task-detail-preview-meta';
    pvBar.append(full, meta);
    const pre = document.createElement('pre'); pre.className = 'task-detail-preview';
    pre.textContent = preview ? (state.full ? preview.text : preview.block) : t('Loading…');
    pvSec.append(pvBar, pre);

    // 更多选项 — folded, its values on the chips
    paintMore(host);

    if (refocus) { const el = body.querySelector(refocus); if (el) el.focus(); }
    body.scrollTop = scrollTop;
    paintPlan();
    fetchPreview();
  };

  const paintMore = (host) => {
    const fold = document.createElement('details');
    fold.className = 'task-detail-more';
    fold.open = !!foldOpen.get(taskId);
    fold.ontoggle = () => foldOpen.set(taskId, fold.open);
    const sum = document.createElement('summary');
    const v = (s) => `<span class="ctx-chip-v">${escHtml(s)}</span>`;
    const profile = (app.browserProfileOptions ? app.browserProfileOptions() : []).find((o) => o.value === task.browserProfileId);
    sum.innerHTML = `<span class="task-detail-more-title">${escHtml(t('More options'))}</span>`
      + `<span class="ctx-chip" data-more="notify">${escHtml(t('Notify'))} ${v(task.jobNotify === true ? t('On') : task.jobNotify === false ? t('Off') : t('Inherit'))}</span>`
      + `<span class="ctx-chip" data-more="visibility">${escHtml(t('External'))} ${v(task.externalVisibility === 'visible' ? t('Visible') : task.externalVisibility === 'messageable' ? t('Messageable') : t('Closed'))}</span>`
      + `<span class="ctx-chip" data-more="browser">${escHtml(t('Browser profile'))} ${v(profile ? profile.label : t('Default'))}</span>`
      + `<span class="ctx-chip" data-more="color">${escHtml(t('Color'))} ${v(!task.color ? t('Auto') : task.color === 'none' ? t('None') : t('Custom'))}</span>`
      + `<span class="ctx-chip" data-more="export">${escHtml(t('Export / Import'))}</span>`;
    // a chip opens the fold ON its row
    sum.addEventListener('click', (e) => {
      const c = e.target.closest('.ctx-chip');
      if (!c) return;
      e.preventDefault();
      fold.open = true; foldOpen.set(taskId, true);
      requestAnimationFrame(() => fold.querySelector(`[data-more-row="${c.dataset.more}"]`)?.scrollIntoView({ block: 'nearest' }));
    });
    fold.appendChild(sum);
    const inner = document.createElement('div'); inner.className = 'task-detail-more-body';
    fold.appendChild(inner);
    const labelled = (key, label, el, title = '') => {
      const w = document.createElement('label');
      w.className = 'task-detail-folder-rec task-detail-inject';
      w.dataset.moreRow = key;
      if (title) w.title = title;
      const l = document.createElement('span'); l.textContent = label + ': ';
      w.append(l, el);
      inner.appendChild(w);
      return w;
    };
    const select = (opts, value, onChange) => {
      const sel = document.createElement('select'); sel.className = 'toolbar-select';
      for (const [val, label] of opts) { const o = document.createElement('option'); o.value = val; o.textContent = label; sel.appendChild(o); }
      sel.value = value;
      sel.onchange = () => onChange(sel.value);
      return sel;
    };
    // Context injection toggle (P6) — off = sessions still belong but this group's context is NOT injected into them
    const injWrap = document.createElement('label');
    injWrap.className = 'task-detail-folder-rec task-detail-inject';
    injWrap.title = t("When off, this group's objective / file index is NOT injected into its sessions. They still belong to it — the board, vibespace-task and status keep working.");
    const injCb = document.createElement('input'); injCb.type = 'checkbox'; injCb.checked = task.injectContext !== false;
    injCb.onchange = () => patch({ injectContext: injCb.checked });
    injWrap.append(injCb, document.createTextNode(t("Inject this group's context into its sessions")));
    inner.appendChild(injWrap);
    // Background-job auto-notify tri-state (2.344.0) — an explicit Off here wins over any other group's On (quietest rule)
    labelled('notify', t('Job auto-notify'), select([['inherit', t('Inherit (global)')], ['on', t('On')], ['off', t('Off')]], task.jobNotify === true ? 'on' : task.jobNotify === false ? 'off' : 'inherit',
      (val) => patch({ jobNotify: val === 'on' ? true : val === 'off' ? false : null })),
    t('When a background job owned by one of this group\'s conversations finishes, fails, or asks for input, message that conversation (Claude Code cross-session messaging; stashed for resume when it is closed). "Inherit" follows the global Integration setting.'));
    // Channels v1 (2.362.0): reach for agent sessions OUTSIDE the group (inside, reach is always mutual)
    const evSel = select([['none', t('Closed (default)')], ['visible', t('Visible')], ['messageable', t('Messageable')]], task.externalVisibility || 'none',
      (val) => { patch({ externalVisibility: val === 'none' ? null : val }); syncEvExcept(); });
    labelled('visibility', t('External visibility'), evSel,
    t('Agent-to-agent messaging reach for sessions OUTSIDE this group. Closed (default): outsiders cannot list or message this group\'s sessions. Visible: outsiders can list them. Messageable: outsiders can also send them messages. Inside the group, sessions always see and message each other.'));
    // lane grants-unify — «除了»: the members of THIS group left out of what outsiders see / may message — THE picker's own
    // exception row (its main list is this group, picked and hidden), one PATCH per change through the ONE writer
    const evGroupKey = `group:${task.id}`;
    const evRows = () => rosterFromApp(app).filter((r) => r.kind === 'agent' || r.key === evGroupKey);
    const evPick = rowToPick({ to: [{ kind: 'group', id: task.id }], except: task.externalVisibilityExcept || [] }, evRows(), { notRunning: t('not running now'), deletedGroup: t('a deleted Task Group') });
    const evExcept = principalPicker({
      items: () => evRows(), app, multi: true, selected: [evGroupKey], cls: 'pp-except-only',
      label: t('External visibility'),
      except: { selected: evPick.except, extra: evPick.extra, onChange: (keys) => { const row = pickToRow([...evRows(), ...evPick.extra], [evGroupKey], keys); patch({ externalVisibilityExcept: row.except }); } },
    });
    evExcept.el.classList.add('task-detail-ev-except');
    evExcept.el.dataset.moreRow = 'visibility-except';
    inner.appendChild(evExcept.el);
    const syncEvExcept = () => { evExcept.el.style.display = evSel.value === 'none' ? 'none' : ''; };
    syncEvExcept();
    // agent browser P1 (§3.2.5 row 3) + MULTIVIEW D4 — only while the client holds the profile digest
    if (app._browserProfiles && Array.isArray(app._browserProfiles.profiles)) {
      const opts = app.browserProfileOptions().map((o) => [o.value, o.label]);
      labelled('browser', t('Default browser profile'), select(opts, task.browserProfileId && opts.some(([val]) => val === task.browserProfileId) ? task.browserProfileId : '', (val) => patch({ browserProfileId: val || null })),
        t('The default browser profile of NEW sessions in this group (never a retroactive edit of running ones)'));
      labelled('browser-cap', t('Browsers per conversation'), select([['', t('Instance default')], ...[1, 2, 3, 4, 5, 6].map((n) => [String(n), String(n)])], Number.isInteger(task.browserCap) ? String(task.browserCap) : '', (val) => patch({ browserCap: val ? Number(val) : null })),
        t('How many browsers a new conversation of this group may run at once (each conversation can change its own; one already running keeps the limit it started with)'));
    }
    // Color + texture
    const colorRow = document.createElement('div'); colorRow.className = 'task-detail-section'; colorRow.dataset.moreRow = 'color';
    colorRow.innerHTML = `<div class="task-detail-label">${escHtml(t('Color'))}</div>`;
    const swatchRow = document.createElement('div'); swatchRow.className = 'task-detail-swatches';
    const autoSw = document.createElement('button');
    autoSw.className = 'task-detail-swatch auto' + (!task.color ? ' active' : '');
    autoSw.style.background = (sidebar.getTaskColor && sidebar.getTaskColor({ ...task, color: null })) || autoTaskColor(task.id);
    autoSw.title = t('Auto (distinct per group)'); autoSw.textContent = 'A';
    autoSw.onclick = () => patch({ color: null });
    swatchRow.appendChild(autoSw);
    for (const c of SWATCHES) {
      const sw = document.createElement('button');
      sw.className = 'task-detail-swatch' + (task.color === c ? ' active' : '');
      sw.style.background = c;
      sw.onclick = () => patch({ color: task.color === c ? null : c });
      swatchRow.appendChild(sw);
    }
    const customWrap = document.createElement('label');
    const isCustom = !!task.color && task.color !== 'none' && !SWATCHES.includes(task.color);
    customWrap.className = 'task-detail-swatch custom' + (isCustom ? ' active' : '');
    customWrap.title = t('Custom color…');
    customWrap.style.background = isCustom ? task.color : 'transparent';
    const colorInput = document.createElement('input'); colorInput.type = 'color';
    colorInput.value = isCustom && /^#[0-9a-fA-F]{6}$/.test(task.color) ? task.color : '#61afef';
    colorInput.onchange = () => patch({ color: colorInput.value });
    customWrap.appendChild(colorInput);
    swatchRow.appendChild(customWrap);
    const noColor = document.createElement('button');
    noColor.className = 'task-detail-swatch none' + (task.color === 'none' ? ' active' : '');
    noColor.title = t('No color');
    noColor.onclick = () => patch({ color: 'none' });
    swatchRow.appendChild(noColor);
    colorRow.appendChild(swatchRow);
    // Texture (2.231.0): the chips preview the actual styles on the group's current color
    const texRow = document.createElement('div'); texRow.className = 'task-detail-swatches task-detail-textures';
    const curColor = (sidebar.getTaskColor && sidebar.getTaskColor(task)) || 'var(--text-secondary)';
    for (const tx of [{ v: null, label: t('Auto') }, { v: 'solid', label: t('Solid') }, { v: 'dash', label: t('Dashed') }, { v: 'dot', label: t('Dotted') }, { v: 'diag', label: t('Diagonal') }]) {
      const chip = document.createElement('button');
      chip.className = 'task-detail-texture' + ((task.pattern || null) === tx.v ? ' active' : '');
      chip.title = tx.label;
      const bar = document.createElement('span'); bar.className = 'task-detail-texture-bar';
      if (tx.v && tx.v !== 'solid') bar.dataset.pattern = tx.v;
      bar.style.setProperty('--g-color', curColor);
      if (tx.v === null) chip.appendChild(document.createTextNode('A')); else chip.appendChild(bar);
      chip.onclick = () => patch({ pattern: tx.v });
      texRow.appendChild(chip);
    }
    colorRow.appendChild(texRow);
    inner.appendChild(colorRow);
    // Export / Import (P4): a task ⇄ a committable markdown file — the path takes effect only when its folder is there
    const repoRow = document.createElement('div'); repoRow.className = 'task-detail-section'; repoRow.dataset.moreRow = 'export';
    repoRow.innerHTML = `<div class="task-detail-label">${escHtml(t('Export / Import'))}<span class="task-detail-hint">${escHtml(t('a self-contained markdown file (frontmatter + objective + activity) — commit it into a git repo so the task travels with the code, or move it between machines'))}</span></div>`;
    const repoWrap = document.createElement('div'); repoWrap.className = 'task-detail-acwrap task-detail-ctxrow';
    const repoInput = document.createElement('input'); repoInput.className = 'task-detail-input';
    repoInput.placeholder = t('Absolute path for the .md file');
    repoInput.value = task.contextDir ? `${task.contextDir}/${task.id}.md` : '';
    // lane path-field: the file field — a relative path resolves, a missing file is made only once ticked, and what does not
    // take is said under the field (「未生效：…」) — the export / import buttons read its resolution
    const repoPf = pathField(repoInput, { kind: 'file', create: 'ask', id: 'task-export-file', createWhen: t('Create this file when exporting') });
    const repoPath = async () => { const v = await repoPf.commit(); return v ? v.path : repoInput.value.trim(); }; // the field's resolution (a relative one too)
    const exportBtn = document.createElement('button'); exportBtn.className = 'task-detail-btn'; exportBtn.textContent = t('Export');
    exportBtn.onclick = async () => {
      const p = await repoPath();
      if (!p) { showToast(t('Enter a file path first'), { type: 'error' }); return; }
      try {
        const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }) });
        const d = await res.json().catch(() => ({}));
        if (res.ok) showToast(t('Exported to {path}', { path: d.path })); else showToast(d.error || t('Export failed'), { type: 'error' });
      } catch { showToast(t('Export failed — server unreachable'), { type: 'error' }); }
    };
    const importBtn = document.createElement('button'); importBtn.className = 'task-detail-btn'; importBtn.textContent = t('Import');
    importBtn.title = t('Read a task markdown file back into the store (its frontmatter id/title/status are authoritative; existing sessions/folders/progress are preserved)');
    importBtn.onclick = async () => {
      const p = await repoPath();
      if (!p) { showToast(t('Enter the .md file path first'), { type: 'error' }); return; }
      try {
        const res = await fetch('/api/tasks/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }) });
        const d = await res.json().catch(() => ({}));
        if (res.ok) showToast(t('Imported {id}', { id: d.task?.id || '' })); else showToast(d.error || t('Import failed'), { type: 'error' });
      } catch { showToast(t('Import failed — server unreachable'), { type: 'error' }); }
    };
    repoWrap.append(repoPf.el, exportBtn, importBtn);
    repoRow.append(repoWrap);
    inner.appendChild(repoRow);
    // Danger
    const del = document.createElement('button');
    del.className = 'task-detail-btn task-detail-delete';
    del.textContent = t('Delete Task Group');
    del.onclick = async () => {
      if (await showConfirmDialog({ title: t('Delete Task Group'), message: t('Delete "{name}"? Sessions will not be deleted.', { name: task.title }), confirmText: t('Delete'), danger: true })) sidebar._taskDelete(taskId);
    };
    inner.appendChild(del);
    host.appendChild(fold);
  };

  // ── 成员 ──
  const renderMembers = () => {
    body.innerHTML = '';
    const host = document.createElement('div'); host.className = 'task-detail-members';
    body.appendChild(host);
    const all = sidebar._allSessions || [];
    const byKey = new Map();
    for (const s of all) byKey.set(sidebar._getSessionStateKey(s), s);
    const explicit = task.sessions || [];
    const resolved = sidebar._getTaskSessionKeys(task, all);
    const keys = [...explicit, ...[...resolved].filter((k) => !explicit.includes(k))];
    const starred = (s) => !!(s && sidebar.isStarred && sidebar.isStarred(s));
    keys.sort((a, b) => Number(starred(byKey.get(b))) - Number(starred(byKey.get(a))));
    const head = document.createElement('div'); head.className = 'task-detail-label';
    head.innerHTML = `${escHtml(t('Members'))}<span class="task-detail-hint">${escHtml(t('{n} conversations · ★ = a standing conversation (it sorts first in the sidebar)', { n: keys.length }))}</span>`;
    host.appendChild(head);
    const startRow = document.createElement('div'); startRow.className = 'task-detail-member-start';
    const start = document.createElement('button'); start.className = 'task-detail-btn task-detail-primary';
    const firstFolder = sidebar._folderPaths(task)[0] || '';
    start.textContent = t('+ Start a conversation here');
    start.onclick = () => app.showNewSessionDialog({ taskId, cwd: firstFolder || undefined });
    const startHint = document.createElement('span'); startHint.className = 'task-detail-hint';
    startHint.textContent = firstFolder ? t('New Session with 「{name}」 selected, its folder = {path}', { name: task.title, path: tilde(firstFolder, home()) }) : t('New Session with 「{name}」 selected', { name: task.title });
    startRow.append(start, startHint);
    host.appendChild(startRow);
    const list = document.createElement('div'); list.className = 'task-detail-sessions';
    for (const key of keys) {
      const s = byKey.get(key);
      const via = !explicit.includes(key);
      const row = document.createElement('div');
      row.className = 'task-detail-session task-detail-member' + (via ? ' via-folder' : '');
      row.dataset.key = key;
      const name = s ? (sidebar.getCustomName(s) || s.name || key) : key;
      row.innerHTML = `<span class="task-detail-session-dot" data-status="${escHtml(s?.status || 'unknown')}"></span>`
        + `<span class="task-detail-session-name" title="${escHtml(key)}">${starred(s) ? '★ ' : ''}${escHtml(name)}</span>`
        + (s?.cwd ? `<span class="task-detail-member-cwd">${escHtml(tilde(s.cwd, home()))}</span>` : '')
        + (via ? `<span class="task-detail-hint">${escHtml(t('via folder'))}</span>` : '');
      const star = document.createElement('button');
      star.className = 'task-detail-btn task-detail-star' + (starred(s) ? ' active' : '');
      star.textContent = starred(s) ? t('★ Standing') : t('☆ Mark standing');
      star.disabled = !s;
      star.onclick = () => { if (s) { sidebar.toggleStar(s); renderMembers(); } };
      row.appendChild(star);
      const out = document.createElement('button');
      out.className = 'task-detail-btn task-detail-unbind';
      out.textContent = t('Remove from group');
      out.disabled = via;
      out.title = via ? t('It joined through a folder row (自动发现会话) — take the folder out, or the verb off the row') : t('Remove from task');
      out.onclick = () => sidebar._taskUnbind(taskId, key);
      row.appendChild(out);
      list.appendChild(row);
    }
    if (!keys.length) list.innerHTML = `<div class="empty-hint">${escHtml(t('Tag sessions from their card (Tasks row) or drag a card onto this task in the sidebar'))}</div>`;
    host.appendChild(list);
  };

  const paintFooter = () => {
    footer.innerHTML = `<span class="task-detail-saved">✓ ${escHtml(t('Changes save as you make them (a path row takes effect when you leave the box, or on Enter)'))}</span>`;
    const arch = document.createElement('button');
    arch.className = 'task-detail-btn';
    arch.textContent = task.archived ? t('Unarchive') : t('Archive');
    arch.title = task.archived ? t('Restore this group') : t('Archive this group (hide it; it stops auto-including new sessions)');
    arch.onclick = () => patch({ archived: !task.archived });
    footer.appendChild(arch);
  };

  const mountTab = () => {
    viewer?.destroy(); viewer = null;
    destroyFields();
    paintTabs();
    body.innerHTML = '';
    body.classList.toggle('task-detail-body-log', state.tab === 'backlog' || state.tab === 'activity');
    if (state.tab === 'settings') renderSettings();
    else if (state.tab === 'members') renderMembers();
    else {
      const host = document.createElement('div');
      body.appendChild(host);
      viewer = mountTaskLog(app, taskId, host, { tab: state.tab, embedded: true });
    }
  };

  // a tasks-updated broadcast: the tabs' counts, the footer and the open tab (a viewer repaints itself)
  const render = () => {
    task = sidebar._taskById(taskId);
    if (!task) {
      // Layout restore can replay this window before the initial /api/tasks
      // fetch lands — show a placeholder and let tasks-updated re-render.
      if (!sidebar._tasksLoaded) { body.innerHTML = `<div class="empty-hint">${escHtml(t('Loading task…'))}</div>`; return; }
      app.wm.closeWindow(winInfo.id); // deleted elsewhere
      return;
    }
    app.wm.setTitle(winInfo.id, task.title);
    paintTabs();
    paintFooter();
    if (!body.children.length || body.querySelector('.empty-hint:only-child')) { mountTab(); return; }
    if (state.tab === 'settings') renderSettings();
    else if (state.tab === 'members') renderMembers();
  };
  // a box being typed in held a repaint back — it comes the moment that box is left (after the click that left it)
  root.addEventListener('focusout', () => { if (settingsDirty) afterPointerUp(() => { if (settingsDirty && state.tab === 'settings') renderSettings(); }); });

  if (task) { paintTabs(); paintFooter(); mountTab(); } else render();

  // lane task-group-fanout: this group's own change, or another group's title / membership / table (a reference row, the
  // members) — never another group's Activity line
  const onTasksMsg = (msg) => { if (msg.type === 'tasks-updated' && (touches(msg, taskId) || metaChanged(msg))) render(); };
  app.ws.onGlobal(onTasksMsg);
  // tasks.autoStyleOrder is render-time-read (Auto swatch + texture chip
  // previews show the group's CURRENT auto style) — re-render on change
  // (2.112.4 rule), unsubscribe on close.
  const onOrderChange = () => { try { render(); } catch {} };
  app.settings?.on?.('tasks.autoStyleOrder', onOrderChange);
  const prevClose = winInfo.onClose;
  winInfo.onClose = () => { app.ws.offGlobal(onTasksMsg); app.settings?.off?.('tasks.autoStyleOrder', onOrderChange); viewer?.destroy(); destroyFields(); ro?.disconnect(); clearTimeout(previewTimer); prevClose?.(); };

  return winInfo;
}

// ── WINDOW-TYPE REGISTRATION (Plugin Ph1) ── the 'task' kind is shared with
// task-log.js (openTaskLog) and session-props.js (openSessionProps), which
// register their actions onto it via registerOpenAction.
registerWindowType({
  type: 'task', label: 'Task Group',
  icon: svgIcon16('<rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M5 6h6M5 9h6M5 12h3"/>'),
  action: 'openTaskDetail', replay: (app, spec, { syncId } = {}) => app.openTaskDetail(spec.taskId, { syncId, tab: spec.tab, full: spec.full }),
});
