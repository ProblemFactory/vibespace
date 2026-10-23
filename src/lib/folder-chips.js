// THE FOLDER CHIPS (lane door-day-one-landing — the naive-user studies: the New Session box showed a grey /home/<user>, every
// later dialog pre-filled the PREVIOUS area's folder, and the folder holding the person's files was never offered; testers
// typed the path every time). The chips of the New Session dialog and of the welcome tour's start step: a Task Group's own
// folders, the home's folders WITH files first («work (23 files)»), «the last one you used», then the rest — PURE
// src/day-one.js folderChips decides the order. This module fetches the home's folders (GET /api/home-folders — this
// machine only; one answer kept 10 s here and on the hub) and paints the chips; a chip FILLS the folder field, nothing
// pre-fills it, and typing stays possible.
import { t } from './i18n.js';
import { fetchJson } from './utils.js';

let cache = { at: 0, p: null };
/** The home's folders ([{ name, path, files, more, mount }]) — [] when the hub cannot say. */
export function loadHomeFolders() {
  const now = Date.now();
  if (cache.p && now - cache.at < 10e3) return cache.p;
  cache = { at: now, p: fetchJson('/api/home-folders').then((d) => (d && Array.isArray(d.folders) ? d.folders : [])).catch(() => []) };
  return cache.p;
}

/** This machine's session folders, newest first (the sidebar's rows; a remote row's host-labelled cwd is skipped). */
export function recentLocalCwds(app, n = 8) {
  const seen = new Set();
  const out = [];
  for (const s of [...(app?.sidebar?._allSessions || [])].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))) {
    if (!s.cwd || s.host || seen.has(s.cwd)) continue;
    seen.add(s.cwd); out.push(s.cwd);
    if (out.length >= n) break;
  }
  return out;
}

const shortPath = (p) => String(p || '').replace(/^\/home\/[^/]+/, '~');

/** A chip's words: «work (23 files)», «Last used: ~/work/deal», a folder's name, a short path. */
export function chipWords(c) {
  if (c.kind === 'files') {
    if (c.files === 1 && !c.more) return t('{name} (1 file)', { name: c.name });
    return t('{name} ({n} files)', { name: c.name, n: c.more ? `${c.files}+` : String(c.files) });
  }
  if (c.kind === 'folder') return c.name;
  if (c.kind === 'last') return t('Last used: {path}', { path: shortPath(c.path) });
  return shortPath(c.path);
}

/** Paint `chips` (folderChips' answer) into `el`; `onPick(chip)` on a press; `selected` = the path shown as chosen. */
export function paintFolderChips(el, chips, { onPick = null, selected = null } = {}) {
  if (!el) return;
  el.replaceChildren();
  for (const c of chips) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cwd-recent-chip' + (c.kind === 'task' ? ' cwd-task-chip' : '') + (c.kind === 'files' ? ' cwd-files-chip' : '') + (c.last ? ' cwd-last-chip' : '') + (selected && c.path === selected ? ' selected' : '');
    chip.dataset.path = c.path;
    chip.dataset.kind = c.kind;
    if (c.kind === 'task') {
      if (c.color) { const dot = document.createElement('span'); dot.className = 'tvg-dot'; dot.style.setProperty('--g-color', c.color); chip.appendChild(dot); }
      const p = document.createElement('span'); p.className = 'cwd-chip-path'; p.textContent = shortPath(c.path); chip.appendChild(p);
    } else {
      chip.textContent = chipWords(c);
    }
    const tip = c.kind === 'task' ? c.tip : c.last && c.kind !== 'last' ? t('The last one you used') : '';
    chip.title = tip ? `${tip}\n${c.path}` : c.path;
    chip.onclick = () => {
      for (const x of el.querySelectorAll('.cwd-recent-chip.selected')) x.classList.remove('selected');
      chip.classList.add('selected');
      onPick?.(c);
    };
    el.appendChild(chip);
  }
}
