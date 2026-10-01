// THE TOP TOOLBAR'S FOLD — the DOM half (lane toolbar-fold, 2026-09-30; the owner: "the top-right cluster of green
// buttons takes too much width on a low-resolution screen and overlaps other chrome"). The rule is lane I's
// (live-bar-layout.js barLadder: the words go first, one button at a time, then the fold into ONE ⋯ by priority);
// the table is src/lib/toolbar-fold-model.js; the machinery (ruler, ResizeObserver, MutationObserver, ONE layout per
// frame) is src/lib/bar-fold.js createBarFold — this file only names the toolbar's items, its zones and its ⋯.
//
//   · THE BAR is #toolbar; its three zones (☰ + title · the center · the right cluster) are barLayout GROUPS, each
//     with its own gap; the items are read from the zones in the ARRANGED order (Customize mode moves them) at every
//     layout; a hidden element never counts; the title is the flexible item (it shrinks with an ellipsis first).
//   · THE ⋯ is a direct child of #toolbar AFTER the zones — never a zone child, so Customize's arrangement never
//     touches it — shown only while something is folded. Its menu is the registry menu 'toolbar-overflow': one row per
//     folded element in the bar's order, running the SAME command the button's own click runs (the layout presets:
//     a head over their own buttons). Plugins may contribute rows to it.
//   · THE ICON STEP: a `.toolbar-action` in its compact form (`tb-compact`) hides its words; its words become its
//     accessible name and (with its own tooltip) its tooltip — set here after every layout, undone when it is full again.
//   · CUSTOMIZE MODE suspends the fold: every element full and shown (the toolbar may take two rows while editing —
//     style.css) so each one can be dragged; Done re-folds.
import { createBarFold, FOLDED } from './bar-fold.js';
import { registerCommand, registerMenuItem, menuItems, runCommand, hasCommand } from './contributions.js';
import { showContextMenu, fetchJson } from './utils.js';
import { t } from './i18n.js';
import { UI_ICONS } from './icons.js';
import { TOOLBAR_ITEMS, TOOLBAR_COMPACT, TITLE_MIN_PX, toolbarSpec, overflowRows, compactTitle } from './toolbar-fold-model.js';

export const TOOLBAR_MENU = 'toolbar-overflow';

const shownEl = (el) => !!(el && el.isConnected && el.getClientRects().length > 0);

/** Terminal, host-aware (like Files): with remote hosts registered, a menu at the pressed control picks where the
 *  shell runs; with none, a local shell at once. ONE implementation — the button and its ⋯ row. */
async function openTerminalFrom(app, anchor) {
  let hostsList = [];
  try { const d = await fetchJson('/api/hosts'); hostsList = d?.hosts || []; } catch { }
  if (!hostsList.length) return app.openShellTerminal();
  const at = shownEl(anchor) ? anchor : document.getElementById('toolbar-more');
  const r = shownEl(at) ? at.getBoundingClientRect() : { left: 8, bottom: 40 };
  showContextMenu(r.left, r.bottom + 4, [
    { label: t('Local'), action: () => app.openShellTerminal() },
    ...hostsList.map((h) => ({ label: h.name, action: () => app.openShellTerminal(undefined, { hostId: h.id }) })),
  ]);
}

/** The toolbar's verbs that had no command yet (New Session / Files / Web view / Apps already have one — the table
 *  names them). Registered at module load, like command-mode's. */
export function registerToolbarCommands() {
  if (!hasCommand('toolbar.terminal')) registerCommand({ id: 'toolbar.terminal', title: 'Terminal', run: (c) => openTerminalFrom(c.app, c.anchor) });
  if (!hasCommand('desktop.open')) registerCommand({ id: 'desktop.open', title: 'Desktop', run: (c) => c.app.openDesktop() });
  if (!hasCommand('layout.savedPresets')) registerCommand({ id: 'layout.savedPresets', title: 'Saved presets', run: (c) => c.app._showPresetsDialog() });
}
registerToolbarCommands();

/** The ⋯ rows for what is folded (ctx.folded, the bar's order): a row per element running its command, the layout
 *  presets a head over their own buttons (each row = that button's own click). */
export function foldedMenuRows(ctx) {
  const out = [];
  for (const r of overflowRows(ctx && ctx.folded)) {
    if (r.submenu) {
      const el = document.getElementById(r.key);
      const kids = el ? [...el.querySelectorAll('button')].filter((b) => b.style.display !== 'none').map((b) => ({ label: b.title || b.textContent.trim(), action: () => b.click() })) : [];
      if (kids.length) out.push({ id: `${TOOLBAR_MENU}/${r.key}`, label: t(r.submenu), children: kids });
    } else out.push({ id: `${TOOLBAR_MENU}/${r.key}`, label: t(r.label), command: r.command, action: () => runCommand(r.command, { app: ctx.app, anchor: ctx.anchor }) });
  }
  return out;
}
registerMenuItem({ menu: TOOLBAR_MENU, id: `${TOOLBAR_MENU}/folded`, group: '1_folded', expand: (c) => foldedMenuRows(c) });

/** A compact button names itself: its words are its accessible name, its tooltip keeps its own longer title. */
function nameCompact(el, on) {
  if (!el || !el.classList.contains('toolbar-action')) return;
  if (el.dataset.tbTitle === undefined) el.dataset.tbTitle = el.getAttribute('title') || '';
  const words = (el.querySelector('span')?.textContent || '').trim();
  if (on) {
    const tip = compactTitle(words, el.dataset.tbTitle);
    if (el.getAttribute('title') !== tip) el.setAttribute('title', tip);
    if (words && el.getAttribute('aria-label') !== words) el.setAttribute('aria-label', words);
  } else {
    if (el.dataset.tbTitle) { if (el.getAttribute('title') !== el.dataset.tbTitle) el.setAttribute('title', el.dataset.tbTitle); } else el.removeAttribute('title');
    el.removeAttribute('aria-label');
  }
}

export function installToolbarFold(app) {
  const bar = document.getElementById('toolbar');
  if (!bar || bar._tbFold) return bar?._tbFold || null;
  const more = document.createElement('button');
  more.type = 'button';
  more.id = 'toolbar-more';
  more.className = 'icon-btn toolbar-more ' + FOLDED;
  more.innerHTML = UI_ICONS.more;
  more.title = t('More');
  more.setAttribute('aria-label', t('More'));
  more.setAttribute('aria-haspopup', 'menu');
  bar.appendChild(more);
  const zones = () => [bar.querySelector('.toolbar-left'), bar.querySelector('[data-zone="toolbar-center"]'), bar.querySelector('[data-zone="toolbar-right"]')].filter(Boolean);
  const zoneKey = (z) => z.dataset.zone || 'toolbar-left';
  const fold = createBarFold(bar, {
    more,
    rulerIn: bar, // `#toolbar …` rules and the toolbar's own zoom reach the clones
    groups: () => zones().map((z) => ({ key: zoneKey(z), gapPx: parseFloat(getComputedStyle(z).columnGap) || 0 })),
    items: () => {
      const out = [];
      for (const z of zones()) {
        let anon = 0;
        for (const el of z.children) {
          if (el.classList.contains('cz-drop-marker')) continue;
          const spring = el.classList.contains('chrome-spring') ? (el.classList.contains('spring-fixed') ? 'fixed' : 'flex') : null;
          const key = el.id || (el.classList.contains('toolbar-title') ? 'toolbar-title' : `${zoneKey(z)}#${anon++}`);
          const s = toolbarSpec(key, { spring });
          out.push({ key, el, priority: s.priority, live: s.live, flexMin: s.flexMin == null ? undefined : s.flexMin, compactClass: s.compact ? TOOLBAR_COMPACT : undefined, group: zoneKey(z) });
        }
      }
      return out;
    },
    suspended: () => !!app._customize?.active,
    onLayout: (v) => {
      // Customize mode: the unfolded bar may now wrap to more rows — its alignment chip moves below the whole bar
      if (v && v.suspended) { try { app._customize?._positionAlignChips?.(); } catch { /* not editing */ } }
      for (const el of bar.querySelectorAll('.toolbar-action')) nameCompact(el, el.classList.contains(TOOLBAR_COMPACT));
      // the flexible title squeezed below a readable width shows a sliver of a glyph: it hides instead (its box kept —
      // a data attribute, never a class, so the fold's observer is not woken by it)
      const title = bar.querySelector('.toolbar-title');
      if (title) {
        const squeezed = title.scrollWidth > title.clientWidth + 1 && title.clientWidth < TITLE_MIN_PX;
        if (squeezed !== (title.dataset.squeezed === '1')) { if (squeezed) title.dataset.squeezed = '1'; else delete title.dataset.squeezed; }
      }
      // an element Customize (or another client's arrangement) moved OUT of the toolbar sheds the fold's classes
      for (const id of Object.keys(TOOLBAR_ITEMS)) {
        const el = document.getElementById(id);
        if (!el || bar.contains(el)) continue;
        if (el.classList.contains(FOLDED)) el.classList.remove(FOLDED);
        if (el.classList.contains(TOOLBAR_COMPACT)) { el.classList.remove(TOOLBAR_COMPACT); nameCompact(el, false); }
      }
    },
  });
  more.addEventListener('click', (e) => {
    e.stopPropagation();
    const rows = menuItems(TOOLBAR_MENU, { app, folded: fold.folded(), anchor: more });
    if (!rows.length) return;
    const r = more.getBoundingClientRect();
    showContextMenu(r.left, r.bottom + 2, rows).classList.add('toolbar-more-menu');
  });
  bar._tbFold = fold;
  return fold;
}
