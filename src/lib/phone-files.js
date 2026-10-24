// THE PHONE'S WAY TO THE FILES (lane phone-files-door, 2026-10-24 — the owner: 「我发现手机上好像不是很容易找到文件管理器」).
// The explorer's ONLY phone door was the «+» sheet's Files row, and that sheet opens on a 500 ms press of a button whose
// TAP opens New Session. PURE src/phone-doors.js names every desktop door's phone twin (test-phone-doors census), PURE
// src/files-door.js decides the card's chips and the breadcrumbs; here:
//   · the nav's 文件 button (#mobile-nav-files) — ONE tap from anywhere: the explorer this phone showed last, else a new
//     one at home; its word under the icon for the first week (the rail's own day-one record — sidebar-rail.js)
//   · the 文件 card on the For-you page, AFTER its bands (the first screen is the attention list's — test-mobile-gaps
//     measures it) — home, the last folder used, the home's folders with files, the mounts, the recent folders; one tap
//     opens the explorer THERE
//   · the explorer's phone furniture (built only when app.isMobile; CSS shows it ≤ 768 px): ‹ back to the phone's home
//     (the back gesture's own rule), breadcrumbs that scroll sideways, «New session here» at the top of the listing
//     (the New Session dialog opens with the folder — the dialog is not this module's)
import { t } from './i18n.js';
import { escHtml, fetchJson } from './utils.js';
import { FILE_ICONS, UI_ICONS } from './icons.js';
import { loadHomeFolders, recentLocalCwds, chipWords } from './folder-chips.js';
import { dayOneWords, dayOneUsed } from './sidebar-rail.js';
import { filesCardChips, crumbsOf } from '../files-door.js'; // PURE: the card's chips, the breadcrumbs

const DOOR = 'files'; // the nav door's id in the day-one record

/** THE PHONE'S HOME — the back gesture's own rule (mobile-back.js layersOf close.window): the For-you page when it has
 *  rows, else the conversation list. */
export function goPhoneHome(app) { if (!app.phoneHome?.show?.()) app.sidebar?.toggle?.(true); }

const explorersHere = (app) => [...app.wm.windows.values()].filter((w) => w.type === 'files' && w._explorer && !w._hiddenByDesktop && !w._explorer._host);
const z = (w) => Number(w.element?.style?.zIndex) || 0;

/** Open the files: `path` ⇒ an explorer showing that folder (the one already there, else a new one); no path ⇒ the
 *  explorer this phone showed last, else a new one at home. Every reveal goes through app.goToWinId (the door). */
export function openFilesDoor(app, { path = '' } = {}) {
  const mine = explorersHere(app);
  const there = path ? mine.find((w) => w._explorer.currentPath === path) : mine.sort((a, b) => z(b) - z(a))[0];
  if (there) { app.goToWinId(there.id); return there; }
  return app.openFileExplorer(path || undefined);
}

/** The nav's 文件 button: one tap opens the files; its word shows for the first week (or until it was used). */
export function installNavFilesDoor(app) {
  const btn = document.getElementById('mobile-nav-files');
  if (!btn) return null;
  const paint = () => btn.classList.toggle('labelled', dayOneWords([DOOR]));
  btn.onclick = () => { dayOneUsed(DOOR); paint(); openFilesDoor(app); };
  paint();
  return btn;
}

let mountsCache = { at: 0, p: null };
const loadMounts = () => {
  const now = Date.now();
  if (!mountsCache.p || now - mountsCache.at > 30e3) mountsCache = { at: now, p: fetchJson('/api/mounts').then((d) => (d && Array.isArray(d.mounts) ? d.mounts : [])).catch(() => []) };
  return mountsCache.p;
};
const tilde = (p, home) => (home && p.startsWith(home + '/') ? '~' + p.slice(home.length) : p === home ? '~' : p);
const chipText = (c) => (c.kind === 'home' ? t('Home') : c.kind === 'mount' ? c.name : chipWords(c));

/** THE 文件 CARD of the phone's For-you page: the header names it, the chips fill in when the home's folders answer. */
export function filesCard(app) {
  const card = document.createElement('section');
  card.className = 'ph-files';
  card.innerHTML = `<div class="ph-files-head">${FILE_ICONS.folder}<span>${escHtml(t('Files'))}</span></div><div class="ph-files-chips"></div>`;
  const box = card.querySelector('.ph-files-chips');
  const draw = (chips, home) => {
    box.replaceChildren(...chips.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ph-files-chip' + (c.kind === 'home' ? ' home' : '') + (c.kind === 'mount' ? ' mount' : '') + (c.last ? ' last' : '');
      b.dataset.path = c.path;
      b.dataset.kind = c.kind;
      b.textContent = chipText(c);
      b.title = tilde(c.path, home);
      b.onclick = (e) => { e.stopPropagation(); openFilesDoor(app, { path: c.path }); };
      return b;
    }));
  };
  const home = app._localHome || '';
  draw(filesCardChips({ home }), home); // the home chip at once — the rest when the hub answers
  Promise.all([loadHomeFolders(), loadMounts()]).then(([folders, mounts]) => {
    if (!card.isConnected) return;
    const h = app._localHome || home;
    draw(filesCardChips({ home: h, folders, recent: recentLocalCwds(app), mounts }), h);
  });
  return card;
}

/** The explorer's phone furniture: ‹ (the phone's home), the breadcrumbs, «New session here». → { back, crumbs, newHere,
 *  paint(dir) } — the explorer places them and paints the crumbs on every navigation. */
export function explorerPhoneBits(ex) {
  const app = ex.app;
  const back = document.createElement('button');
  back.className = 'file-tool-btn file-phone-back';
  back.title = t('Back');
  back.setAttribute('aria-label', t('Back'));
  back.innerHTML = UI_ICONS.chevronLeft;
  back.onclick = () => goPhoneHome(app);
  const crumbs = document.createElement('div');
  crumbs.className = 'file-crumbs';
  crumbs.addEventListener('click', (e) => {
    const c = e.target.closest('.file-crumb');
    if (c && c.dataset.path && c.dataset.path !== ex.currentPath) ex.navigate(c.dataset.path);
  });
  const newHere = document.createElement('button');
  newHere.className = 'file-new-here';
  newHere.innerHTML = `${UI_ICONS.robot}<span>${escHtml(t('New session here'))}</span>`;
  newHere.onclick = () => { if (ex.currentPath) app.showNewSessionDialog({ cwd: ex.currentPath, hostId: ex._host || undefined }); };
  const paint = (dir) => {
    const list = crumbsOf(dir, ex._host ? '' : (app._localHome || ''));
    crumbs.innerHTML = list.map((c, i) => `${i ? '<span class="file-crumb-sep" aria-hidden="true">›</span>' : ''}<button type="button" class="file-crumb${i === list.length - 1 ? ' here' : ''}" data-path="${escHtml(c.path)}">${escHtml(c.label)}</button>`).join('');
    crumbs.scrollLeft = crumbs.scrollWidth; // the folder itself in view; the way up scrolls in from the left
  };
  return { back, crumbs, newHere, paint };
}
