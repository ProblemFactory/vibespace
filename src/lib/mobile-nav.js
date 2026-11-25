import { titleMinText, billingPillForms, billingPillHtml } from './title-chips.js'; // lane phone-chip: the row's billing pill folds, never cuts
import { navBarFold, navTitleMinText, navMoreRows, navMoreLoud } from './title-chips.js'; // lane phone-titlebar-title: THE TITLE OWNS THE BAR — the chips beside it yield by measure
import { FOLDED } from './bar-fold.js';
import { t } from './i18n.js';
import { windowWords, windowKindWords, windowTitle } from './window-types.js';
import { escHtml, onOutsidePress, showContextMenu, showToast, uiScale } from './utils.js';
import { personDialogOf } from './form-yield.js'; // PURE (lane dialog-yield r2): the ONE dialog predicate set
import { showWindowContextMenu } from './taskbar.js';
import { UI_ICONS, FILE_ICONS } from './icons.js';
import { getCommand, runCommand } from './contributions.js';
import { openDesktopPicker } from './desktop-picker.js';
import { installNavFilesDoor, filesDoorWindow, filesDoorName } from './phone-files.js'; // lane phone-files-door: the nav's 文件 — one tap to the files
import { columnShape } from './side-column.js'; // B-78db: the bar in the system's side column (the outer display too)
import { installTrailingBar } from './trailing-bar.js'; // lane duo-build-1: the regular class's trailing bar (this nav, standing)
import { openDesktopSheet, untilGone, patchDesktopSheet, doorWaiting } from './desktop-switch-sheet.js'; // lane desktop-switch-phone: the desktops' sheet (the nav's Desktops door)
import { doorState, followDesktops, windowWaits } from '../desktop-switch.js';
import { paintSwitcherRow } from './warmth-chrome.js'; // lane cache-warmth-band (q-059 r1b): a switcher row's prompt-cache band
import { windowListMark } from './agent-meta.js'; // lane phone-take-photo: a row wears its conversation's harness mark
import { installPhoneSplit } from './phone-split-view.js'; // lane phone-six: side by side — two windows, left and right
import { headName, nameFits, barFits, stateForm, YIELD_LADDER, ROW_YIELD_LADDER, rowParts } from '../phone-head.js'; // lane phone-six r2: the head's name keeps its width (and the switcher row's)
import { windowTypeIcon } from './window-types.js';

const SHOWN_KEY = 'vibespace.phoneShown'; // { [desktopId]: winId } — this tab's window on show per desktop (§6b guard 10)
function readShown() {
  try { const v = JSON.parse(sessionStorage.getItem(SHOWN_KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}

/** THE SWITCHER ROW YIELDS (主开发 2026-11-17, the owner's ruling B on the row — PURE phone-head.js ROW_YIELD_LADDER / rowParts):
 *  each step is tried in the REAL layout until the name keeps its readable minimum (titleMinText: six CJK or twelve Latin glyphs
 *  + «…», or its whole width when shorter) AND the name's box holds the row's centre (phone-six's ⑥c law, 主开发 09:33Z: a thumb
 *  on the row's middle opens the window, never the chip); the chip's long form, its compact form, the Split door, the chip itself yield in
 *  that order — the ⋯ and the ✕ never. The step lands on item.dataset.yield: the window's menu lists what yielded (it was
 *  lane phone-chip's chip-only fit by chipMode — which left a long name 0 px once the doors grew). */
function fitSwitcherRow(item, label, chip, split) {
  if (!item.isConnected || !label.isConnected) return '';
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:inherit';
  label.appendChild(probe);
  const text = label.firstChild && label.firstChild.nodeType === 3 ? label.firstChild.nodeValue : label.textContent;
  probe.textContent = text; const fullPx = probe.getBoundingClientRect().width;
  probe.textContent = titleMinText(text); const minPx = probe.getBoundingClientRect().width;
  probe.remove();
  const hasCompact = !!chip?.querySelector('.pill-compact');
  const centreIn = () => { const lb = label.getBoundingClientRect(), rb = item.getBoundingClientRect(), c = rb.left + rb.width / 2; return lb.left <= c && lb.right >= c; };
  let step = '';
  for (const s of ROW_YIELD_LADDER) {
    if ((s === 'compact' && !hasCompact) || (s === 'chip' && !chip) || (s === 'split' && !split)) continue;   // nothing of it to yield
    const p = rowParts(s);
    if (chip) { chip.style.display = p.chip ? '' : 'none'; chip.dataset.mode = p.chip === 'compact' && hasCompact ? 'compact' : 'full'; }
    if (split) split.style.display = p.split ? '' : 'none';
    step = s;
    if (nameFits(label.getBoundingClientRect().width, fullPx, 0, minPx) && centreIn()) break;
  }
  item.dataset.yield = step;
  return step;
}

/**
 * MobileNav — mobile navigation bar controller.
 *
 * Manages: hamburger menu, window switcher (tap title), close button,
 * new session button, title updates, edge-swipe gestures.
 *
 * Constructed by App when isMobile is true. Receives app reference
 * for sidebar/window/session access.
 */

/** THE BAR'S CHIPS by key (lane phone-titlebar-title): title-chips.js navBarFold's NAV_FOLD_ORDER / NAV_NEVER_FOLD name them;
 *  any other visible child of the bar is measured as a door that stands. */
const NAV_KEYS = Object.freeze({ 'mobile-nav-menu': 'menu', 'mobile-nav-desktops': 'desktops', 'mobile-nav-usage': 'usage', 'mobile-nav-vault': 'vault', 'mobile-nav-todos': 'todos', 'mobile-nav-gear': 'gear', 'mobile-nav-close': 'close', 'mobile-nav-new': 'new' });

/** THE PHONE'S SURFACES UNDER THE BAR (lane phone-titlebar-title r4): every sheet and popup the bar or its ⋯ rows open — the «+»
 *  sheet, the ⋯ menu, the Desktops sheet (.mobile-sheet), the Usage popup and the For-you tray (.usage-popup), the Settings
 *  popover, the mini inbox — each placed by its style.css rule at `top: var(--phone-sheet-top)`, the ONE variable _publishUnder
 *  writes. A press on the bar or on one of them is held (_installPressHold). r5 (the r4 acceptance): its ROOM from the same
 *  variable (max-height = the screen − it − 12 px, every rule — a tall sheet under the lock strip ran off the screen), and the
 *  bar's own title switcher (_showWindowSwitcher) is one of them — it hangs flush from the bar and follows it too. */
const PHONE_SURFACES = '.mobile-sheet, .usage-popup, .global-settings-popover, .ut-mini-popover, .mobile-win-switcher';

/** Is `w` minimized? A tab group is minimized as ONE frame — the HOST carries the flag, its guests are hidden with it. */
const minimizedOf = (wm, w) => !!((w._tabChain && wm.windows.get(w._tabChain.tabs[0])) || w).isMinimized;


export class MobileNav {
  constructor(app) {
    this.app = app;
    this._titleEl = document.getElementById('mobile-nav-title');
    // THE PHONE'S WINDOW ON SHOW IS ITS OWN (§6b guard 10): per tab, per desktop (sessionStorage), read once before the
    // boot's restore focuses anything — a reload shows the same window; a record from another client never changes it
    this._shown = readShown();
    this._shownAtBoot = Object.keys(this._shown).length > 0; // lane foryou-honest: this tab showed a window before — a RELOAD (the phone's first screen never hijacks it)
    this._shownBooted = false;

    // ☰: the phone's drawer; in the regular class (the Duo's inner portrait) the list COLUMN's show / hide (lane duo-build-1)
    document.getElementById('mobile-nav-menu').onclick = () => (app.viewportClass?.() === 'regular' ? app.sidebar.toggleList() : app.sidebar.toggle(true));
    // 文件 (lane phone-files-door): the explorer this phone showed last, else a new one at home. lane phone-titlebar-title (the
    // owner: «最左边那个文件浏览器的图标也很容易误认为是当前窗口的图标»): the compact bar shows no folder icon — its press is the
    // «+» sheet's 文件 row (and the For-you page's 文件 card); the regular class's trailing bar keeps the button
    this._pressFiles = installNavFilesDoor(app);
    const newBtn = document.getElementById('mobile-nav-new');
    // «+» IS THE CREATE MENU (lane phone-titlebar-title r6 — the r5 acceptance: the owner put Files INTO «+», 「应该放进 + 菜单里」,
    // but its sheet opened only on a 500 ms press and the tap opened New Session; with nothing waiting there is no For-you page,
    // so no 文件 card, and NO door on the screen said Files): a TAP opens the sheet. New session — what the tap opened before —
    // is its first row, accented; Files is two rows down (after Terminal). A second tap closes it (the sheet's outside-press closer leaves «+» to
    // its toggle: _showCreateSheet).
    newBtn.setAttribute('aria-haspopup', 'menu');
    newBtn.onclick = (e) => { e.stopPropagation(); if (this._createMenu?.isConnected) { this._createMenu.remove(); return; } this._showCreateSheet(); };
    // "+" SHEET (docs/design-mobile-gaps.md #3): #toolbar is
    // display:none ≤768px and with it the Terminal / Files / Browser / Desktop
    // entry points — a plain shell was reachable only through the dialog's
    // Backend=shell, the browser not at all. installLongPressContextMenu
    // synthesizes `contextmenu` on a 500 ms press (a mouse right-click lands
    // here too) and swallows the press's click: a long press opens the same sheet.
    newBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); if (!this._createMenu?.isConnected) this._showCreateSheet(); });
    // ⚙ — the taskbar (and its gear-adjacent chrome) is hidden on phones, so
    // without this the gs-menu (Usage/Manage agents/Diagnostics/Settings…)
    // has no entry point at all on mobile.
    const gear = document.getElementById('mobile-nav-gear');
    if (gear) gear.onclick = (e) => { e.stopPropagation(); app._pressGlobalSettings(gear); };   // lane vault-locked-loud: a locked vault unlocks first

    document.getElementById('mobile-nav-close').onclick = () => {
      const activeId = app.wm.activeWindowId;
      if (activeId) app.wm.requestClose(activeId);
    };

    // the title = the window switcher with its desktop tabs — in the regular class too (lane desktop-switch-phone: SPEC-v3
    // §2.2 had turned it off there, «the list IS the switcher» — but the list lists conversations, never desktops, and a
    // person with many desktops could reach none but the one the page booted on); in its landscape the conversation's
    // head is the window's own title bar, so a tap on it opens the same switcher
    this._titleEl.onclick = () => this._showWindowSwitcher();
    // a split's pane that was NOT the one on show when the finger came down: that tap only makes it the one on show (lane
    // phone-six r2 — the press focuses it before the click, and the click then opened the switcher too: one tap, two acts)
    let pressedAside = false;
    document.getElementById('workspace')?.addEventListener('pointerdown', (e) => { const w = e.target.closest?.('.window.phone-pane'); pressedAside = !!w && !w.classList.contains('window-active'); }, true);
    document.getElementById('workspace')?.addEventListener('click', (e) => {
      if (app.viewportClass?.() !== 'regular' || getComputedStyle(document.getElementById('mobile-nav')).flexDirection !== 'column') return;
      const head = e.target.closest?.('.window.window-active > .window-titlebar');
      if (pressedAside) { pressedAside = false; return; }
      if (head && !e.target.closest('button, input, textarea, select, .window-controls, .tab-bar-tabs')) this._showWindowSwitcher(head); // a tab in the head is its own (lane phone-six)
    });
    // B-78db slice 1b (主开发 r3948 2): on the OUTER display's column the bar stands in the system's column and the window's own head
    // is the name's row (style.css) — a tap on it opens the same switcher, as the inner display's head does
    document.getElementById('workspace')?.addEventListener('click', (e) => {
      if (columnShape() !== 'outer') return;
      const head = e.target.closest?.('.window.window-active > .window-titlebar');
      if (head && !e.target.closest('button, input, textarea, select, .window-controls, .tab-bar-tabs')) this._showWindowSwitcher(head);
    });
    // THE SEARCH'S HOME (lane mask-value-shape, the strip's step two — page §4 «search → the window's title bar»; the design's
    // author 2026-11-17: search lives where the conversation's NAME lives, never on the strip): a ≥ 36 px magnifier at the bar's
    // right end, before the ⋯ — shown while the window on show is a conversation with a search bar; the compact class never folds
    // it (no row of NAV_FOLD_ORDER), the title gives up its room first; the regular class's ladder folds it into ⋯ once the head yields
    const searchBtn = document.getElementById('mobile-nav-search');
    if (searchBtn) { searchBtn.innerHTML = UI_ICONS.search; searchBtn.title = t('Search this conversation'); searchBtn.setAttribute('aria-label', searchBtn.title); searchBtn.onclick = (e) => { e.stopPropagation(); this._shownChat()?._search?.open?.(); }; }
    this._setupGestures();
    this.split = installPhoneSplit(app); // lane phone-six: the switcher's «Split» — two windows side by side where they fit
    try { new ResizeObserver(() => this._paintHead()).observe(document.getElementById('mobile-nav')); } catch { } // the column's width moved (☰, a fold): the name re-fits
    this.desktopsBtn = this._buildDesktopsDoor();
    this.bar = installTrailingBar(app); // the regular class's buttons (shown by the stylesheet there only)
    // the regular class's landscape: the list column's ☰ at the conversation's head (the owner 2026-10-25, 与原文不同 —
    // SPEC-v3 §4 kept the landscape list static; userW wants the conversation to take the width) — the portrait ☰'s act
    const listBtn = document.createElement('button');
    listBtn.id = 'list-column-toggle'; listBtn.type = 'button'; listBtn.textContent = '\u2630';
    listBtn.title = t('Sessions'); listBtn.setAttribute('aria-label', listBtn.title);
    listBtn.onclick = (e) => { e.stopPropagation(); app.sidebar.toggleList(); };
    document.body.appendChild(listBtn);
    this.listBtn = listBtn;
    this._installBarFold();
  }

  /** THE TITLE OWNS THE BAR (lane phone-titlebar-title — the owner 2026-11-06: 「手机端的标题栏被挤压得根本看不到聊天标题了」). On the
   *  compact class the chips beside the title yield by MEASURE (PURE title-chips.js navBarFold: the fixed order, each chip's
   *  forms, the ⋯) until the whole title fits; what folds lives in ONE «⋯» with its live value. Re-decided on the title's change
   *  (updateTitle), a chip's change (a For-you arrival, the ring, the desktops' badge, the vault chip — the bar's subtree), the
   *  bar's width (ResizeObserver) and the tier (vs-viewport-class); every watcher on the controller the bar owns. The regular
   *  class and the desktop take every fold off: the base's bar. */
  _installBarFold() {
    const nav = document.getElementById('mobile-nav');
    if (!nav) return;
    const ctl = this._barCtl = new AbortController();
    const more = document.createElement('button');
    more.id = 'mobile-nav-overflow'; more.type = 'button'; more.className = 'mnav-overflow';
    more.innerHTML = UI_ICONS.more;
    more.title = t('More'); more.setAttribute('aria-label', more.title); more.setAttribute('aria-haspopup', 'menu');
    // the ⋯ is its menu's ANCHOR (r2): exempt from the menu's outside-press closer (_openMore), so its second press — a finger's
    // or a mouse's — finds the menu open and closes it
    more.addEventListener('click', (e) => { e.stopPropagation(); if (this._moreMenu?.isConnected) { this._moreMenu.remove(); return; } this._openMore(); }, { signal: ctl.signal });
    const close = document.getElementById('mobile-nav-close');
    if (close && close.parentNode === nav) nav.insertBefore(more, close); else nav.appendChild(more);
    this.moreBtn = more;
    this._folded = [];
    const fit = () => this._scheduleFit();
    this._barMo = new MutationObserver(fit);
    this._barMo.observe(nav, { subtree: true, childList: true, characterData: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    ro?.observe(nav);
    // r4: what stands ABOVE the bar moves it (the vault's lock strip, the maintenance banner — #main-wrapper's children before it,
    // put in, taken out, re-worded): every surface under it follows (_publishUnder)
    const above = () => { for (let el = nav.previousElementSibling; el; el = el.previousElementSibling) ro?.observe(el); fit(); };
    const wrapMo = new MutationObserver((recs) => { for (const r of recs) for (const n of r.removedNodes) if (n.nodeType === 1) ro?.unobserve(n); above(); });
    if (nav.parentNode) wrapMo.observe(nav.parentNode, { childList: true });
    above();
    window.addEventListener('vs-viewport-class', fit, { signal: ctl.signal });
    document.fonts?.ready?.then(() => { if (!ctl.signal.aborted) fit(); });
    this._installPressHold(ctl);
    ctl.signal.addEventListener('abort', () => { this._barMo.disconnect(); wrapMo.disconnect(); ro?.disconnect(); if (this._fitRaf) cancelAnimationFrame(this._fitRaf); }, { once: true });
    fit();
  }

  /** A PRESS HOLDS THE BAR AND WHAT HANGS UNDER IT (r4 — the r3 acceptance: r3 held the ⋯ menu's rows, ended only by the menu's own
   *  lift, click or cancel — a MOUSE released off the menu, no implicit capture, left the hold on for the menu's life: rows stale,
   *  the menu never following the bar; and a press on the ⋯ ITSELF was not held — another client's rename emptied the fold under a
   *  finger on ⋯ and the lift ran ⚙, slid under it). From a pointerdown on the bar or a phone surface until the press ENDS — its
   *  click there, its lift anywhere else (a lift on it: + 600 ms, a finger's click lands after its lift), a pointercancel, the
   *  page's blur or hiding — the bar's folds, the ⋯'s rows and every surface's place stand still: the lift does what the press
   *  began on, never what slid under it. Then ONE pass catches up. On the controller the bar owns. */
  _installPressHold(ctl) {
    const o = { signal: ctl.signal };
    let root = null, press = null;
    const end = () => {
      clearTimeout(this._heldT); press?.abort(); press = null; root = null;
      if (!this._held) return;
      this._held = false;
      if (this._heldMissed) { this._heldMissed = false; this._fitBar(); } // what changed meanwhile, in ONE pass
    };
    ctl.signal.addEventListener('abort', () => { clearTimeout(this._heldT); press?.abort(); this._held = this._heldMissed = false; }, { once: true });
    document.addEventListener('pointerdown', (e) => {
      const r = e.target?.closest?.(`#mobile-nav, ${PHONE_SURFACES}`);
      if (!r) return;
      clearTimeout(this._heldT);
      this._held = true;
      if (r === root) return;
      press?.abort(); press = new AbortController(); root = r;
      // its click ends it — after every handler of that click ran (a chip's own press stops its propagation)
      r.addEventListener('click', () => { clearTimeout(this._heldT); this._heldT = setTimeout(end, 0); }, { capture: true, signal: press.signal });
    }, { capture: true, passive: true, signal: ctl.signal });
    document.addEventListener('pointerup', (e) => {
      if (!this._held) return;
      clearTimeout(this._heldT);
      if (root?.isConnected && root.contains(e.target)) this._heldT = setTimeout(end, 600); else end();
    }, { capture: true, signal: ctl.signal });
    document.addEventListener('pointercancel', end, { capture: true, signal: ctl.signal });
    window.addEventListener('blur', end, o);
    document.addEventListener('visibilitychange', end, o);
  }

  /** ONE PLACE FOR EVERY PHONE SURFACE (r4 — the r3 acceptance: r3's sheetUnderNav lived in _sheet only; the Desktops sheet, the
   *  Usage popup — the ⋯ rows' own doors, the only road on a locked phone — and the Settings popover still opened at the
   *  stylesheet's 48 px OVER a bar the vault's lock strip had moved to 114–158, and an open «+» sheet never followed a lock or an
   *  unlock): the bar's MEASURED bottom + the base's 4 px, written to the ONE variable every phone surface's rule reads — an open
   *  one follows at once; never under a held press. The compact class only (the regular class's bar is a column: the stylesheet's
   *  own 48); fixed body children take layout px (/uiScale). r5: each surface's ROOM is read from it too (style.css). */
  _publishUnder() {
    if (this._held) { this._heldMissed = true; return; }
    const nav = document.getElementById('mobile-nav'), root = document.documentElement;
    const nb = nav && this.app.viewportClass?.() === 'compact' && nav.getClientRects().length ? nav.getBoundingClientRect().bottom : 0;
    const v = nb > 0 && !columnShape() ? `${Math.round(nb / (uiScale() || 1)) + 4}px` : '';   // B-78db: in the side column the bar is no top row — the stylesheet's 48 (the head's 44 + 4)
    if (root.style.getPropertyValue('--phone-sheet-top') === v) return;
    if (v) root.style.setProperty('--phone-sheet-top', v); else root.style.removeProperty('--phone-sheet-top');
  }

  _scheduleFit() {
    if (this._fitRaf || this._barCtl?.signal.aborted) return;
    this._fitRaf = requestAnimationFrame(() => { this._fitRaf = 0; this._fitBar(); });
  }

  /** ONE pass: every chip at its widest, measured (layout px as the page draws them), the verdict applied. */
  _fitBar() {
    const nav = document.getElementById('mobile-nav'), more = this.moreBtn, title = this._titleEl;
    if (!nav || !more || !title) return;
    if (this._held) { this._heldMissed = true; return; } // a press is on the bar or under it: the pass waits for its end (r4)
    const todos = document.getElementById('mobile-nav-todos');
    const kids = [...nav.children].filter((el) => el !== title && el !== more);
    for (const el of kids) el.classList.remove(FOLDED);
    if (todos?.dataset.badges) delete todos.dataset.badges;
    more.classList.remove('on');
    let folded = [];
    if (this.app.isMobile && this.app.viewportClass?.() === 'compact' && !columnShape() && nav.getClientRects().length) {   // B-78db: the side column folds by HEIGHT (trailing-bar.js fitColumn), never by width
      const w = (el) => el.getBoundingClientRect().width;
      const items = kids.filter((el) => el.getClientRects().length).map((el) => {
        const key = NAV_KEYS[el.id] || el.id || el.className;
        if (el !== todos) return { key, el, forms: [w(el)] };
        const full = w(el); el.dataset.badges = 'one'; const one = w(el); delete el.dataset.badges;
        return { key, el, forms: [full, one] };
      });
      more.classList.add('on'); const moreW = w(more); more.classList.remove('on');
      const cs = getComputedStyle(nav), ts = getComputedStyle(title);
      const k = nav.offsetWidth ? nav.getBoundingClientRect().width / nav.offsetWidth : 1; // computed px → drawn px (a zoomed page)
      const roomPx = (nav.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) * k;
      const text = title.textContent;
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:inherit';
      title.appendChild(probe);
      const pad = (parseFloat(ts.paddingLeft) + parseFloat(ts.paddingRight)) * k;
      probe.textContent = text; const titlePx = w(probe) + pad;
      probe.textContent = navTitleMinText(text); const titleMinPx = w(probe) + pad;
      probe.remove();
      const v = navBarFold({ roomPx, gapPx: (parseFloat(cs.columnGap) || 0) * k, moreW, titlePx, titleMinPx, items: items.map(({ key, forms }) => ({ key, forms })) });
      for (const it of items) if (v.folded.includes(it.key)) it.el.classList.add(FOLDED);
      if (todos && v.forms.todos === 1) todos.dataset.badges = 'one';
      if (v.folded.length) more.classList.add('on');
      folded = v.folded;
      this._barVerdict = v;
    }
    this._folded = folded;
    // the regular class's state word (主开发 r1344): a button that changed its width (a For-you tier, a badge) moved the room
    // its box takes — re-decide whole or dot (its own attributes only: the bar's observer does not watch attributes)
    if (this.app.viewportClass?.() === 'regular') this._paintState();
    // THE LOCK STAYS LOUD (r3, PURE navMoreLoud — lane vault-locked-loud's law: «the vault is locked» is said wherever Settings is
    // reached from): ⚙ folded while the vault is locked ⇒ the ⋯ that stands in for it wears ⚙'s red lock — vault-unlock.js
    // drawGearMark's mark, the same colour, its name says it; an unlock (any client's broadcast) takes it off at the next pass
    const loud = navMoreLoud(folded, { vaultLocked: !!document.getElementById('mobile-nav-gear')?.classList.contains('vault-locked') });
    if (more.classList.contains('vault-locked') !== loud) {
      more.classList.toggle('vault-locked', loud);
      more.querySelector(':scope > .vault-gear-mark')?.remove();
      if (loud) { const m = document.createElement('span'); m.className = 'vault-gear-mark'; m.setAttribute('aria-hidden', 'true'); m.innerHTML = UI_ICONS.lock || ''; more.appendChild(m); }
      more.title = loud ? t('More — Vault locked') : t('More'); more._name = more.title; more.setAttribute('aria-label', more.title);
    }
    this._paintWaitingMore(); // lane phone-take-photo: ⋯ standing in for a folded Desktops door says what it would say
    this._barMo?.takeRecords(); // the pass's own writes are no change of the bar's inputs
    this._publishUnder(); // r4: every phone surface under the bar as it stands now
    this.bar?.fitColumn?.(); // B-78db: a button that came or left (Desktops, a lock): the side column's law runs again (trailing-bar.js)
    this._barMo?.takeRecords(); // …and its yields are no change of the bar's inputs either
    if (this._moreMenu?.isConnected) this._syncMore(); // r3: an open ⋯ is PATCHED by key — never rebuilt under a finger
  }

  /** The ⋯ menu: the folded chips in bar order (PURE navMoreRows), each a 44 px row with its glyph, its label and its LIVE value in
   *  the chip's own words — read from the chip itself at every repaint (the ring's arc and its %, ⚙'s lock), its press the chip's
   *  own — the phone's sheet under the nav, like the «+» sheet. The ⋯ is the menu's anchor: exempt from its closer. Its rows are
   *  KEYED (r3, _syncMore): a fold change while it is open patches them — and never while a press is on them. A PRESS ENDS ON THE
   *  ROW IT BEGAN ON (r3 — measured by the r2 acceptance: Chrome sends a tap's click to whatever is under the finger at the lift,
   *  so a row that moved there mid-press took it; another client's lock put «Vault locked» above «设置» and the UNLOCK ran): the
   *  bar's press hold (_installPressHold, r4) keeps the rows still until the press ends, wherever it is lifted. */
  _openMore() {
    if (!this._moreRows().length) return;
    const menu = this._sheet([]);
    menu.classList.add('mnav-more-menu');
    menu._closeExclude?.push(this.moreBtn); // attachPopoverClose's LIVE exclusion list: a press on the ⋯ is the toggle's, not «elsewhere»
    this._moreMenu = menu;
    const ctl = new AbortController();
    untilGone(menu, ctl);
    menu._paintMo = new MutationObserver(() => this._paintMore());
    ctl.signal.addEventListener('abort', () => menu._paintMo.disconnect(), { once: true });
    this._syncMore();
  }

  /** THE ⋯'S ROWS BY KEY (r3 — kb-patterns «keyed-row reconciliation», «live card: patch in place»; the r2 acceptance: a fold change
   *  while the menu was open REBUILT it, and a finger already on «设置» lifted on the «Vault locked» row inserted above it). A row
   *  that stays keeps its element (its listener, its value); a gone one leaves first, then a new one is built in its place in the
   *  bar's order — a staying row is never moved; the menu closes only when nothing is folded. A press on the bar or under it holds
   *  the row set (its values still repaint) until it ends (_installPressHold) — a menu opened by a held press is built at once. */
  _syncMore() {
    const menu = this._moreMenu;
    if (!menu?.isConnected) return;
    if (this._held && menu.children.length) { this._heldMissed = true; this._paintMore(); return; }
    const rows = this._moreRows();
    if (!rows.length) { menu.remove(); return; }
    const keys = new Set(rows.map((r) => r.key));
    for (const el of menu.querySelectorAll(':scope > .context-menu-item')) if (!keys.has(el.dataset.key)) el.remove();
    rows.forEach((r, i) => {
      let el = menu.querySelector(`:scope > .context-menu-item[data-key="${r.key}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'context-menu-item'; el.dataset.key = r.key;
        el.innerHTML = '<span class="mnav-more-icon"></span><span class="mnav-more-label"></span><span class="mnav-more-value"></span>';
        el.onclick = () => { menu.remove(); this._moreDoor(el.dataset.key).run?.(); };
      }
      if (menu.children[i] !== el) menu.insertBefore(el, menu.children[i] || null);
    });
    menu._paintMo.disconnect();
    for (const r of rows) menu._paintMo.observe(r.el, { subtree: true, childList: true, characterData: true, attributes: true });
    this._paintMore(rows);
  }

  /** The ⋯ rows as the chips say them NOW: PURE navMoreRows over the fold and the chips' own facts, each with its door. */
  _moreRows() {
    const facts = { desktops: this.desktopsBtn?._door || null, usage: document.querySelector('#mobile-nav-usage .usage-donut-label')?.textContent || '', vaultLocked: !!document.getElementById('mobile-nav-gear')?.classList.contains('vault-locked') };
    return navMoreRows(this._folded, facts).map((r) => ({ ...r, ...this._moreDoor(r.key) })).filter((r) => r.el);
  }

  /** Each row's glyph, words and value from its chip as it draws them now (ONE source at every repaint — r2) and ⚙'s lock (r3: the
   *  mark rides ⚙'s glyph, the colour the row). */
  _paintMore(rows = this._moreRows()) {
    const menu = this._moreMenu;
    if (!menu?.isConnected) return;
    for (const r of rows) {
      const row = menu.querySelector(`:scope > .context-menu-item[data-key="${r.key}"]`);
      const icon = row?.querySelector('.mnav-more-icon'), label = row?.querySelector('.mnav-more-label'), val = row?.querySelector('.mnav-more-value'), g = r.glyph();
      if (!icon || !label || !val) continue;
      if (icon._glyph !== g) { icon.innerHTML = g; icon._glyph = g; }
      icon.classList.toggle('mnav-more-ring', r.key === 'usage');
      row.classList.toggle('vault-locked', r.loud);
      row.classList.toggle('mnav-more-waiting', !!r.waiting); this._waitDot(row, !!r.waiting); // r2 (主开发 ④): the Desktops row says what its door says
      if (label.textContent !== r.label) label.textContent = r.label;
      if (val.textContent !== r.value) val.textContent = r.value;
    }
  }

  /** A folded chip's ⋯ door: { el, glyph, label, run } — `glyph()` the chip's glyph as it draws it NOW, its words, its own press
   *  ANCHORED AT ITS OWN DOOR (the folded chip — a menu keyed to the ⋯ would toggle shut on the ⋯'s next press, r2). ⚙'s glyph is
   *  the whole chip (r3): the cog and, while the vault is locked, its lock mark (vault-unlock.js drawGearMark). */
  _moreDoor(key) {
    const app = this.app;
    const el = document.getElementById(Object.keys(NAV_KEYS).find((id) => NAV_KEYS[id] === key) || '');
    if (!el) return {};
    const svg = () => el.querySelector('svg')?.outerHTML || '';
    if (key === 'desktops') return { el, glyph: svg, label: t('Desktops'), run: () => openDesktopSheet(app, el, { onSwitch: (id, o) => this.switchDesktop(id, o) }) };
    if (key === 'usage') return { el, glyph: () => el.innerHTML, label: t('Usage'), run: () => el.click() };
    if (key === 'gear') return { el, glyph: () => el.innerHTML, label: t('Settings'), run: () => app._pressGlobalSettings(el) };
    if (key === 'vault') return { el, glyph: svg, label: t('Vault locked'), run: () => el.click() };
    return {};
  }

  /** THE DESKTOPS DOOR (lane desktop-switch-phone, 2026-10-25 — userW on the Duo's inner display: «如何在这个界面下切换桌面？»).
   *  The virtual-desktop switcher lives in the taskbar's corner (desktop-manager.js _renderSwitcher) and neither phone class
   *  shows the taskbar: the regular class had no way to another desktop, the compact one only a tap on the title nobody
   *  finds. One button on this nav — the compact bar beside the title, the regular class's trailing bar first in its bottom
   *  section (the stylesheet orders it) — with the active desktop's number as its badge when there are two or more. */
  _buildDesktopsDoor() {
    const nav = document.getElementById('mobile-nav');
    if (!nav) return null;
    const b = document.createElement('button');
    b.id = 'mobile-nav-desktops'; b.type = 'button'; b.className = 'mnav-dest mnav-desktops';
    b.innerHTML = UI_ICONS.desktops;
    const badge = document.createElement('span'); badge.className = 'mnav-badge hidden'; b.appendChild(badge);
    b.onclick = (e) => { e.stopPropagation(); openDesktopSheet(this.app, b, { onSwitch: (id, o) => this.switchDesktop(id, o) }); };
    const usage = document.getElementById('mobile-nav-usage');
    if (usage && usage.parentNode === nav) nav.insertBefore(b, usage); else nav.appendChild(b);
    return b;
  }

  /** The door's words and badge follow the desktops: every switch / create / rename / delete / remote change (they all
   *  re-render the taskbar's switcher — desktop-manager.js _renderSwitcher calls this) and every window change. */
  updateDesktopsDoor() {
    const b = this.desktopsBtn, dm = this.app.desktopManager;
    // lane phone-six: EVERY desktop change comes through here (desktop-manager.js _renderSwitcher) — the title follows it the
    // same instant, whichever road switched (the door, a switch queued behind another, a jump to another desktop's window)
    const desk = dm?.activeDesktopId || '';
    if (this._titleDesk !== desk) { this._titleDesk = desk; this.updateTitle(); return; }
    if (!b) return;
    // a desktop's name through THE door (dm.nameOf — «Desktop 1» in the reader's words), read once where the list is read
    const s = doorState((dm?.desktops || []).map((d) => ({ id: d.id, name: dm.nameOf ? dm.nameOf(d) : d.name, active: d.id === dm.activeDesktopId })));
    // THE WAITING DOORS (lane phone-take-photo, the owner 2026-11-10 17:10Z: «我并不能看出来现在有消息在等我»): something waits for
    // the person somewhere they are not looking ⇒ the closed door says it — a yellow dot and its words — so they need not open
    // the sheet to find out; the conversation ON SHOW is never counted (it says it itself). THE waiting fact (windowWaits).
    const waiting = doorWaiting(this.app); // r2 (主开发 ⑤): THE door's count — its exclusion of the one on show pinned on its own
    // ui-words: s.name is the desktop's name through dm.nameOf (the list above is read once, through the door)
    const label = (s.k ? t('Desktops — {name} ({k}/{n})', { name: s.name, k: s.k, n: s.n }) : t('Desktops')) + (waiting ? ' · ' + t('{n} waiting for input', { n: waiting }) : '');
    b._door = { k: s.k, n: s.n, name: s.name, waiting, waitingWords: waiting ? t('{n} waiting for input', { n: waiting }) : '' }; // the ⋯ row's words (r3): the PLACE of the total and the name, as the label says them
    this._waitDot(b, waiting > 0);
    this._paintWaitingMore();
    // …and every OPEN list that names a waiting conversation follows — patched in place, on the taskbar's own funnel
    patchDesktopSheet(this.app);
    this._patchSwitcherWaiting();
    if (b.title !== label) { b.title = label; b.setAttribute('aria-label', label); }
    const badge = b.querySelector('.mnav-badge');
    if (badge && badge.textContent !== s.badge) { badge.textContent = s.badge; badge.classList.toggle('hidden', !s.badge); }
  }

  /** A door's waiting mark (lane phone-take-photo): the class and ONE yellow dot (aria-hidden — the door's label says it). */
  _waitDot(el, on) {
    if (!el) return;
    el.classList.toggle('mnav-waiting', !!on);
    const dot = el.querySelector(':scope > .mnav-wait-dot');
    if (on && !dot) { const d = document.createElement('span'); d.className = 'mnav-wait-dot'; d.setAttribute('aria-hidden', 'true'); el.appendChild(d); }
    else if (!on && dot) dot.remove();
  }

  /** ⋯ stands in for a FOLDED Desktops door ⇒ it says what that door would say (navMoreLoud's sibling): the dot while something
   *  waits elsewhere; never while Desktops stands on the bar (it says it itself). */
  _paintWaitingMore() {
    const more = document.getElementById('mobile-nav-overflow');
    if (!more) return;
    const n = (this._folded || []).includes('desktops') ? (this.desktopsBtn?._door?.waiting || 0) : 0;
    this._waitDot(more, n > 0);
    // r2 (主开发 ④): the dot is aria-hidden — ⋯'s NAME says the words, after the name the lock pass gave it (`_name`: the ONE
    // site that says «More — Vault locked»; never re-derived here)
    const base = more._name || t('More'), title = n ? base + ' · ' + t('{n} waiting for input', { n }) : base;
    if (more.title !== title) { more.title = title; more.setAttribute('aria-label', title); }
    if (this._moreMenu?.isConnected) this._paintMore(); // an open ⋯ menu's Desktops row follows (patched by key)
  }

  /** REACHING A CONVERSATION THROUGH A DOOR THAT SAID «IT WAITS» IS SEEING IT (lane phone-take-photo r2 (主开发 ②)): the landing
   *  acknowledges it on THIS device exactly as a press inside it does — through the view's own road (chat-view _clearWaiting,
   *  terminal _setWaiting(false, { seen })). Another device keeps its own mark (the rule, per device). */
  _seen(id) {
    const v = this.app.sessions && typeof this.app.sessions.get === 'function' ? this.app.sessions.get(id) : null;
    if (v && typeof v._clearWaiting === 'function') v._clearWaiting();
    else if (v && typeof v._setWaiting === 'function') v._setWaiting(false, { seen: true });
  }

  /** The open title switcher follows the waiting fact IN PLACE (lane phone-take-photo): a conversation row, a desktop tab. */
  _patchSwitcherWaiting() {
    const p = document.querySelector('.mobile-win-switcher');
    if (!p) return;
    const wm = this.app.wm, shown = wm.activeWindowId, waits = (w) => !!w && w.id !== shown && windowWaits(w);
    for (const row of p.querySelectorAll('.mobile-win-row[data-win-id]')) { const on = waits(wm.windows.get(row.dataset.winId)); row.classList.toggle('waiting', on); this._waitDot(row, on); }
    for (const tab of p.querySelectorAll('.mobile-desk-tab[data-desktop-id]')) { const on = [...wm.windows.values()].some((w) => w._desktopId === tab.dataset.desktopId && waits(w)); tab.classList.toggle('waiting', on); this._waitDot(tab, on); }
  }

  /** THE PHONE's PART OF AN ID CHANGED IN PLACE (主开发 r1793 / r1958 — B-1d87 lets a window take another page's id): window.js
   *  followIdChange, THE one rule both roads call (rekeyWindow, layout.js's restore remap), re-stamps every open list's rows and then
   *  calls this: the open title switcher's row of that window, now under the new stamp, has its waiting mark read again
   *  (_patchSwitcherWaiting reads the stamp), and this tab's own notes by id follow — the window on show per desktop (§6b guard 10,
   *  saved for the tab) and the split's pair (phone-split-view rekey: a pane re-keyed is never «closed»). The rows' taps read the
   *  window's id live, and late-focus knows a row by its window's instance (`item._win`). → whether an open row names it now */
  followRekey(oldId, newId) {
    const o = String(oldId), n = String(newId);
    let moved = 0;
    const p = document.querySelector('.mobile-win-switcher');
    if (p) for (const row of p.querySelectorAll('.mobile-win-row[data-win-id]')) if (row.dataset.winId === n) moved++;
    if (moved) this._patchSwitcherWaiting();
    let noted = false;
    for (const d of Object.keys(this._shown || {})) if (this._shown[d] === o) { this._shown[d] = n; noted = true; }
    if (noted) this._saveShown();
    this.split?.rekey?.(o, n);
    return moved > 0;
  }

  /** Switch this tab to desktop `id` by the manager's road (the Stage left first, as the taskbar's preview does), then show
   *  that desktop's window on show (§6b guard 10): the one this tab showed there, else its topmost — a lazy replay lands
   *  later, so it looks again for a few seconds unless the person picked a window meanwhile. */
  switchDesktop(id, { show = null, seeing = false } = {}) { // `show` (lane phone-take-photo): a waiting row's conversation — the switch lands on it; `seeing` (r3): a door that said «it waits» (the switcher's tab) — landing on a waiting one is seeing it
    const app = this.app, dm = app.desktopManager;
    if (!dm || !id) return Promise.resolve();
    const go = app.stage?.isActive ? app.stage.leave(id) : id === dm.activeDesktopId ? null : dm.switchTo(id);
    return Promise.resolve(go).then(() => this._showOnDesk(id, show, seeing), () => this._showOnDesk(id, show, seeing));
  }

  _showOnDesk(desk, show = null, seeing = false) {
    const app = this.app, wm = app.wm, dm = app.desktopManager;
    // the window to show HELD when it stands, its id read at each look (r2355: a switch takes kept rows back by re-keying them —
    // rekeyWindow); one not built yet is waited for by its id (a held record's: it is built under it)
    const firstId = show || this._shown[desk], wantWin = firstId ? wm.windows.get(firstId) || null : null, since = app.layoutManager?._lastUserInputAt || 0;
    const wantNow = () => (wantWin ? wantWin.id : firstId);
    const here = (w) => !!w && w._desktopId === desk && !w._hiddenByDesktop && !w._hiddenByStage;
    let tries = 0;
    const look = () => {
      // another switch since — or this one queued behind a switch still settling (desktop-manager.js: a switch inside the
      // last one's second waits its turn, then lands with nobody showing its window: lane phone-six)
      if (dm.activeDesktopId !== desk) { if (dm._pendingSwitch === desk && ++tries < 16) setTimeout(look, 250); return; }
      const wantId = wantNow(), want = wantId && wm.windows.get(wantId);
      if (here(want)) { if (wm.activeWindowId !== wantId) wm.focusWindow(wantId); if (show) this._seen(wantId); else if (seeing && windowWaits(want)) this._seen(wantId); this.updateTitle(); return; } // r2 (主开发 ②): a landing on a waiting conversation is seeing it
      if (!here(wm.windows.get(wm.activeWindowId))) wm._focusMostRecent();
      this.updateTitle();
      if ((wantNow() || !here(wm.windows.get(wm.activeWindowId))) && ++tries < 16 && (app.layoutManager?._lastUserInputAt || 0) === since) setTimeout(look, 250);
    };
    look();
  }

  /** A context menu laid out as a full-width sheet under the nav bar (the
   *  .mobile-sheet stylesheet rule beats showContextMenu's inline x/y — the
   *  same !important-over-inline shape the usage popup uses). */
  _sheet(items) {
    // ONE class name to showContextMenu (it derives the row class from it —
    // a two-word name would strip every row of .context-menu-item); the
    // sheet modifier is added afterwards.
    const menu = showContextMenu(0, 0, items, 'context-menu', { placesItself: true });   // a sheet: its CSS places it
    menu.classList.add('mobile-sheet'); // under the bar as it stands: style.css --phone-sheet-top (_publishUnder, r4)
    return menu;
  }

  _showCreateSheet() {
    const app = this.app;
    const row = (icon, label, action, hint = '') => ({ labelHtml: hint ? `${icon}<span class="mnav-sheet-words"><span>${escHtml(label)}</span>${hint}</span>` : `${icon}<span>${escHtml(label)}</span>`, action });
    // the 文件 row IS the nav door's press (lane phone-titlebar-title — the owner: the icon goes into «+»; r3: ONE act per row, said):
    // with an explorer open its hint names the one it brings back; none ⇒ it opens one at home. A second explorer is that
    // explorer's own «Open in new window» on any folder row. r4 (the r3 acceptance: the hint was the window's title — a path
    // front-cut to 40, its END then cut by the line — «Back to …e/userW/workspace/AIWorkspace/vib…»): it names the FOLDER (PURE
    // doorName — the explorer's last breadcrumb), the sentence's own words never cut; a name too long for the line loses its START
    // («…», its end — the part a person knows — stays). r5 (the r4 acceptance: a long Hebrew / Arabic name lost its END): the START
    // in READING order, whichever way the name runs — the part read last stays, as the explorer's title keeps a path's end
    // (frontTruncate): the FOLDER's direction (filesDoorName → PURE doorNameDir, its first strong letter — never the «host: »'s) on
    // the <bdi>, its box the other way (style.css)
    const back = filesDoorWindow(app);
    const named = ({ name, dir }) => {
      const [pre, post = ''] = t('Back to {name}').split('{name}');
      const d = name && dir === 'rtl' ? 'rtl' : 'ltr';
      return `<span class="mnav-sheet-hint">${pre ? `<span class="mnav-sheet-said">${escHtml(pre)}</span>` : ''}<span class="mnav-sheet-name" data-dir="${d}"><bdi dir="${d}">${escHtml(name || t('Files'))}</bdi></span>${post ? `<span class="mnav-sheet-said">${escHtml(post)}</span>` : ''}</span>`;
    };
    const items = [
      row(UI_ICONS.robot, t('Agent session'), () => app.showNewSessionDialog()),
      row(UI_ICONS.terminal, t('Terminal'), () => app.openShellTerminal()),
      row(FILE_ICONS.folder, t('Files'), () => this._pressFiles(), back ? named(filesDoorName(app, back)) : ''),
      row(UI_ICONS.globe, t('Web view'), () => app.openBrowser()),
    ];
    // gated exactly like the toolbar button (app._vncAvailable = /api/vnc/status)
    if (app._vncAvailable) items.push(row(UI_ICONS.monitor, t('Desktop'), () => openDesktopPicker(app))); // lane desktop-v2-entry: recent / local / remote
    // THE THREE BROWSER FACES on the phone (design-browser-faces direction B, D5):
    // the web view above, then the desktop-app launcher (gated like its ⚙ row on
    // the /api/desktop/apps probe; the ONE command, its own icon) and the AGENT
    // browser (gated like its ⚙ row on the profile digest)
    const APPS_ICON = getCommand('desktopApps.open')?.icon || UI_ICONS.monitor;
    if (app._desktopAppsAvailable) items.push(row(APPS_ICON, t('Apps…'), () => runCommand('desktopApps.open', { app }))); // design 009 §B6: one word — Apps
    if (app._browserProfiles) items.push(row(UI_ICONS.browserLive, t('Agent browser'), () => this._openAgentBrowser()));
    const menu = this._sheet(items);
    menu.querySelector(':scope > .context-menu-item')?.classList.add('mnav-sheet-lead'); // r6: New session leads, accented (style.css)
    menu._closeExclude?.push(document.getElementById('mobile-nav-new')); // attachPopoverClose's LIVE exclusion list: a press on «+» is its toggle's
    this._createMenu = menu;
    return menu;
  }

  /** The phone's Agent browser row. The agent browser is SESSION-scoped (a live
   *  view belongs to one conversation's browser), the "+" sheet is not — so:
   *  the ACTIVE window's session when it holds a browser ⇒ its live view; else a
   *  session picker over every live local session holding a browser (one row
   *  each, then the Agent browser window itself); none ⇒ the Agent browser
   *  window (profiles, ephemeral browsers, housekeeping). */
  _openAgentBrowser() {
    const app = this.app;
    const rows = (app.sidebar?._allSessions || []).filter((s) => s && s.status === 'live' && s.webuiId && s.browserKey && !s.host);
    const term = app.sessions?.get?.(app.wm.activeWindowId);
    const here = term && rows.find((s) => s.webuiId === term.sessionId);
    if (here) { app.openBrowserLive({ sessionId: here.webuiId }); return; }
    if (!rows.length) { app.openBrowserProfiles(); return; }
    const row = (icon, label, action) => ({ labelHtml: `${icon}<span>${escHtml(label)}</span>`, action });
    this._sheet([
      ...rows.map((s) => row(UI_ICONS.browserLive, s.webuiName || s.name || s.webuiId, () => app.openBrowserLive({ sessionId: s.webuiId }))),
      row(UI_ICONS.browserLive, t('Agent browser…'), () => app.openBrowserProfiles()),
    ]);
  }

  /** Did this tab show a window before this boot (a reload, not a cold open)? — user-todos-panel.js's bootHome reads it. */
  shownAtBoot() { return this._shownAtBoot; }

  /** The window on show, noted for this tab once the boot's restore is over (every window change ends here). */
  _noteShown() {
    const desk = this.app.desktopManager?.activeDesktopId || '', id = this.app.wm.activeWindowId;
    if (!this._shownBooted || !id || this._shown[desk] === id) return;
    const w = this.app.wm.windows.get(id);
    if (desk && w?._desktopId && w._desktopId !== desk) return; // a switch's in-between: the old desktop's window is still the active one
    this._shown[desk] = id;
    this._saveShown();
  }
  /** The tab's note of the window on show per desktop, saved — its ONE write (the note and a re-key's move, followRekey). */
  _saveShown() { try { sessionStorage.setItem(SHOWN_KEY, JSON.stringify(this._shown)); } catch { } }

  /** After the boot's restore (layout.js loadAutoSave): show the window this tab showed before the reload, once it is
   *  built (a lazy replay lands later) — unless the person picked another one meanwhile. */
  restoreShown() {
    const desk = this.app.desktopManager?.activeDesktopId || '', want = this._shown[desk], wm = this.app.wm;
    const since = this.app.layoutManager?._lastUserInputAt || 0;
    let tries = 0;
    const go = () => {
      if (want && (this.app.layoutManager?._lastUserInputAt || 0) === since && wm.windows.has(want)) {
        if (wm.activeWindowId !== want) wm.focusWindow(want);
      } else if (want && (this.app.layoutManager?._lastUserInputAt || 0) === since && ++tries < 24) { setTimeout(go, 250); return; }
      this._shownBooted = true;
      this._noteShown();
    };
    go();
  }

  updateTitle() {
    this._noteShown();
    if (!this._titleEl) return;
    const wm = this.app.wm;
    const win = this._titleWin();
    const count = [...wm.windows.values()].filter(w => !w._hiddenByDesktop && !minimizedOf(wm, w)).length;
    // lane phone-first-screen: the attention page covers the window area — the bar names the page, never a window it hides
    // (a tap on the title still lists the windows; the ✕ that closes the active one is hidden meanwhile — style.css)
    // the regular class (lane duo-build-1): the conversation's NAME (never its folder, never a window count — its list is beside it)
    // lane phone-six (userW 2026-10-26: 「session 标题有时是空白；每次切完桌面就会变成空白，必须切一次 session 才显示」): the title
    // NAMES the window on show of the active desktop, never the window a switch just hid; in the regular class its NAME
    // («No window» on a desktop with none — never empty; style.css keeps it a width), the compact class its title + the count
    // as the base drew them (lane phone-titlebar-title's fold gives the title the room there)
    // lane phone-six r2: a PATH-shaped name (a files window's folder) is its last segment, the whole title in the title attribute
    this._head = { win, count };
    // THE SEARCH's DOOR IS SET BEFORE THE HEAD IS PAINTED (row 381, 主开发 r3875 — the phone-six restack's cure, its product half): the
    // head's ladder measures the bar AS DRAWN, so the magnifier must already stand in it. In the regular class it is a 44 px door that
    // FOLDS into ⋯ once the head yields (style.css: data-yield with ⋯ shown hides it); set after the paint, a head measured at the
    // FIRST rung without it (a very short name, under 44 px to spare) took the door's 44 px when it appeared: the bar's last button
    // stood past its right edge until the next change (box row 716 at 735 × 867: 770.3 of 735; at 669 no first rung has room at all)
    { const sb = document.getElementById('mobile-nav-search'); if (sb) sb.classList.toggle('on', !this.app.phoneHome?.shown?.() && !!this._shownChat()?._search); }
    this._paintHead();
    this._titleEl.classList.toggle('arrived', [...wm.windows.values()].some((w) => w.element.classList.contains('window-arrived'))); // an agent placed a window (never shown in front of this one)
    this.bar?.update?.();
    this.updateDesktopsDoor();
    this.split?.apply(); // lane phone-six: the side by side follows every window change (a pane gone, another window shown)
    this._scheduleFit?.();
  }

  /** THE HEAD'S NAME, drawn (lane phone-six r2 — the integrator's pass at 669 px: «/tm…», three glyphs of a files window's
   *  path). The name is PURE src/phone-head.js headName; in the regular class's portrait bar it keeps ≥ 8 em (or its whole
   *  width): the bar's buttons yield before it, a step of YIELD_LADDER at a time, each tried in the real layout — the
   *  window's own extras leave first (the switcher row's ✕ closes, the chat's status bar holds Artifacts, ⋯ the live view),
   *  then ⚙ folds into ⋯ (trailing-bar.js), then the head shows the window's type icon + the count and the name lives in
   *  the switcher. Never a fragment under four glyphs. */
  _paintHead() {
    const lastRight = (bar) => Math.max(0, ...[...((bar && bar.children) || [])].filter((b) => b.offsetWidth > 0).map((b) => b.getBoundingClientRect().right));   // the row's last drawn button
    const el = this._titleEl, h = this._head;
    if (!el || !h) return;
    const { win, count } = h, regular = this.app.viewportClass?.() === 'regular', home = !!this.app.phoneHome?.shown?.();
    // lane ui-plain-words closure F13, on phone-six's painter: a title-less window is named by its kind's words, never «Window»
    const full = win ? windowWords(win) : t('No window');
    const name = win ? (headName(win.title) || windowKindWords(win.type)) : t('No window');
    // the COMPACT class keeps the base's words (the recovery port onto .397: its bar is THE TITLE OWNS THE BAR's — lane
    // phone-titlebar-title folds every chip beside it by measure, so the window's own title + the count stay as they were)
    this._titleEl.textContent = this.app.phoneHome?.shown?.() ? t('For you')
      : regular ? name
      : win ? (win.title || 'VibeSpace') + (count > 1 ? ` (${count})` : '') : t('No window');
    if (regular) el.title = !home && full !== name ? full : t('Switch window');
    el.removeAttribute('aria-label');
    const nav = document.getElementById('mobile-nav');
    if (!nav) return;
    const row = regular && !home && !!win && getComputedStyle(nav).flexDirection !== 'column';
    if (!row) { delete nav.dataset.yield; this._paintState(); return; }
    // the state word's least room — its dot — is held while the ladder measures the name (a name that fits beside the dot fits
    // beside the whole word too: the word's box only takes the room the name leaves); then the word is tried whole
    const st = this.bar?.state;
    if (st) { if ((st.textContent || '').trim()) st.dataset.form = 'dot'; else delete st.dataset.form; }
    const em = parseFloat(getComputedStyle(el).fontSize) || 14;
    // the release's readable minimum (lane phone-titlebar-title's navTitleMinText), measured in the head's own font
    const probe = document.createElement('span'); probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:inherit';
    probe.textContent = navTitleMinText(name); el.appendChild(probe); const minPx = probe.getBoundingClientRect().width; probe.remove();
    for (const step of YIELD_LADDER.slice(0, -1)) {
      if (step) nav.dataset.yield = step; else delete nav.dataset.yield;
      if (nameFits(el.getBoundingClientRect().width, el.scrollWidth, em, minPx) && barFits(lastRight(nav), nav.getBoundingClientRect ? nav.getBoundingClientRect().right : Infinity)) { this._paintState(); return; }   // the name AND every button (a button past the bar's edge is a yield too)
    }
    nav.dataset.yield = YIELD_LADDER[YIELD_LADDER.length - 1];
    this._paintState();
    el.innerHTML = `<span class="mnav-title-icon" aria-hidden="true">${windowTypeIcon(win.type) || ''}</span><span class="mnav-title-count">${Number(count) || 1}</span>`;
    el.setAttribute('aria-label', full);
  }

  /** THE STATE WORD, WHOLE OR ITS DOT ALONE (主开发 r1344's law — the release at 669 px drew «工…», 4 of its 43 px, beside a long
   *  name: its box took only the room the bar left and cut the word). Tried as its word (its flex box takes the room the bar
   *  leaves it), it is drawn whole when it fits there, else as its dot alone in the state's colour — the word then said by
   *  the dot's title and its accessible name (PURE phone-head.js stateForm). Never a cut word. Called when the head is
   *  painted and when trailing-bar.js writes a new word. */
  _paintState() {
    const s = this.bar?.state;
    if (!s) return;
    const word = (s.textContent || '').trim();
    delete s.dataset.form;
    const cs = getComputedStyle(s);
    let form = 'none';
    if (word && cs.display !== 'none') {
      // FRACTIONAL (the word's run against the box's room less its padding — an ellipsis is drawn on any overflow, and the
      // whole-px clientWidth / scrollWidth can round a sub-pixel cut to equality)
      const rg = document.createRange(); rg.selectNodeContents(s);
      form = stateForm(s.getBoundingClientRect().width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0), rg.getBoundingClientRect().width);
    }
    if (form === 'dot') { s.dataset.form = 'dot'; s.setAttribute('role', 'img'); s.setAttribute('aria-label', word); s.title = word; }
    else { s.removeAttribute('role'); s.removeAttribute('aria-label'); s.removeAttribute('title'); }
  }

  /** The window the title names (lane phone-six): the active one while the active desktop shows it, else the window this
   *  tab shows there (a switch's in-between: the old desktop's window is still the active one), else none. */
  _titleWin() {
    const wm = this.app.wm, desk = this.app.desktopManager?.activeDesktopId || '';
    const here = (w) => !!w && !w._hiddenByDesktop && !(desk && w._desktopId && w._desktopId !== desk);
    const a = wm.windows.get(wm.activeWindowId);
    if (here(a)) return a;
    const s = this._shown[desk] && wm.windows.get(this._shown[desk]);
    return here(s) ? s : null;
  }

  /** The conversation on show (its chat view), or null — the search's door asks it. */
  _shownChat() {
    const id = this.app.wm?.activeWindowId;
    if (id == null) return null;
    for (const v of (this.app.sessions?.values?.() || [])) if (v && v.winInfo && v.winInfo.id === id && v._messageList) return v;
    return null;
  }

  _showWindowSwitcher(anchor = this._titleEl) {
    if (!anchor) return;
    const existing = document.querySelector('.mobile-win-switcher');
    if (existing) { existing._close(); return; } // the title tapped again: THE close (r3 ①)

    const pop = document.createElement('div');
    pop.className = 'mobile-win-switcher';
    pop.style.cssText = 'position:fixed;left:0;right:0;z-index:90001;background:var(--bg-dialog);border-bottom:1px solid var(--border);box-shadow:0 4px 16px rgba(0,0,0,0.3);max-height:60vh;overflow-y:auto;-webkit-overflow-scrolling:touch';
    const navRect = (anchor.closest('#mobile-nav') || anchor).getBoundingClientRect();
    // at the regular class's landscape the nav is the VERTICAL trailing bar (full height) — its bottom is the viewport's bottom;
    // the sheet then hangs from the top (HOTFIX 2.369.356), and from the conversation's head when that is the anchor
    const top = navRect.height > navRect.width ? 0 : navRect.bottom;
    pop.style.top = top + 'px'; // the compact class: style.css places it — flush under the bar as it stands, the phone sheets' room (r5)
    // the regular class: over the conversation column only (the list column and the trailing bar stay)
    const col = this.app.viewportClass?.() === 'regular' && document.getElementById('workspace')?.getBoundingClientRect();
    if (col && col.width) { pop.style.left = col.left + 'px'; pop.style.right = Math.max(0, innerWidth - col.right) + 'px'; pop.style.top = Math.max(top, col.top) + 'px'; }

    const wm = this.app.wm;
    const dm = this.app.desktopManager;
    let tabsDrawn = []; // the desktop tabs this list shows — a remote change redraws them from it (r2 ①)
    // THE ONE CLOSE (r3 ①): the title's toggle, an outside tap and a row's tap call it — the list leaves the page and its
    // listeners go with it (the remote-change redraw, the outside-press watch); a road that only removes the node (the
    // phone's Back, a class change) aborts them too (untilGone). 25151f0b kept one listener + its detached list per open.
    const ctl = new AbortController();
    const close = () => { ctl.abort(); pop.remove(); };
    pop._close = close;

    // Window list container (rebuilt on desktop switch)
    const winList = document.createElement('div');

    // `follow` = a redraw by a REMOTE change (the manager's `vs-desktops`): a desktop deleted elsewhere keeps its tab, greyed
    // with its why (PURE followDesktops); every other redraw — the person's own act — draws the list as it is
    const renderContent = (follow = false) => {
      // FRESH each render (inc-mtfici94: a stale open-time snapshot showed
      // nothing after a switch materialized the lazy-replayed windows — the
      // popup had to be reopened to see them)
      const allWindows = [...wm.windows.values()].filter(w => !minimizedOf(wm, w));
      // not-yet-materialized windows live only in the desktop's saved state
      // until its first switchTo — count them or fresh-load desktops read 0
      const savedCount = (deskId) => ((dm._savedStates?.get(deskId)?.windows) || [])
        .filter((ws) => ws.openSpec && !wm.windows.has(ws.winId || ws.id)).length;
      const rerender = () => { if (pop.isConnected) renderContent(); };
      const afterSwitch = () => {
        rerender();
        // lazy-replayed windows materialize on a ~500ms timer inside
        // switchTo — render once more after they land
        setTimeout(rerender, 700);
      };
      // Desktop tabs — ALWAYS rendered now (design-mobile-gaps #7): the "+"
      // tab is the phone's only way to create a desktop (the taskbar previews
      // are hidden ≤768px), and a long-press on a tab opens the desktop's doors
      // (lane desktop-doors-table: THE table's, through the manager's ONE builder
      // on the phone tier — Rename… · Delete · Move up · Move down, a shut one
      // greyed with its why; was a hand-written Rename · Delete, no order).
      if (dm) {
        const oldTabs = pop.querySelector('.mobile-desk-tabs');
        if (oldTabs) oldTabs.remove();
        const tabBar = document.createElement('div');
        tabBar.className = 'mobile-desk-tabs';
        tabBar.style.cssText = 'display:flex;gap:0;border-bottom:2px solid var(--border);overflow-x:auto;-webkit-overflow-scrolling:touch;flex-shrink:0';
        const tabCss = (isActive) => `flex-shrink:0;min-height:40px;padding:10px 14px;border:none;background:none;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;color:${isActive ? 'var(--accent)' : 'var(--text-dim)'};border-bottom:2px solid ${isActive ? 'var(--accent)' : 'transparent'};margin-bottom:-2px`;
        // the list as it is NOW, every render (it read the list once, at open: a desktop deleted elsewhere kept its tab)
        tabsDrawn = followDesktops({ drawn: follow ? tabsDrawn : [], desktops: dm.desktops });
        for (const desk of tabsDrawn) {
          const tab = document.createElement('button');
          tab.className = 'mobile-desk-tab';
          tab.dataset.desktopId = desk.id;
          const isActive = !desk.gone && desk.id === dm.activeDesktopId;
          const deskWindows = allWindows.filter(w => w._desktopId === desk.id);
          const shown = dm.nameOf ? dm.nameOf(desk) : desk.name;   // THE door for a desktop's name (lane ui-language)
          tab.textContent = desk.gone ? shown : `${shown} (${deskWindows.length + savedCount(desk.id)})`;
          if (!desk.gone && [...wm.windows.values()].some((w) => w._desktopId === desk.id && w.id !== wm.activeWindowId && windowWaits(w))) { tab.classList.add('waiting'); this._waitDot(tab, true); } // the roll-up (lane phone-take-photo) — r2: a standing dot too, drawn AFTER the words (textContent wipes children)
          tab.title = dm._doorLabel('switch', desk.id, desk.name); // the tab IS the switch door: the table's words (a gone one's: its why, by the name it showed)
          tab.style.cssText = tabCss(isActive) + (desk.gone ? ';opacity:0.5' : '');
          tab.onclick = desk.gone ? () => dm._doorRefused(desk, 'switch') : () => { this.switchDesktop(desk.id, { seeing: true }).then(afterSwitch); }; // a gone one: the table's why (r3 ④); the window on show follows the desktop (§6b guard 10)
          tab.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            // once an act is done (never after a cancel): a delete re-shows the desktop on show, any other re-draws the tabs
            const after = () => (dm.desktops.some((d) => d.id === desk.id) ? rerender() : afterSwitch());
            showContextMenu(e.clientX, e.clientY, dm._deskItems(desk, { tier: 'phone', after }), 'context-menu', { extraClass: 'mdesk-doors' });
          });
          tabBar.appendChild(tab);
        }
        const addTab = document.createElement('button');
        addTab.className = 'mobile-desk-tab mobile-desk-add';
        addTab.textContent = '+';
        addTab.title = dm._doorLabel('new'); // THE 'new' door's words (the sheet's «New desktop»)
        addTab.style.cssText = tabCss(false) + ';font-size:16px;padding:6px 14px';
        addTab.onclick = () => { const id = dm.createDesktop(); this.switchDesktop(id).then(afterSwitch); };
        tabBar.appendChild(addTab);
        pop.insertBefore(tabBar, winList);
      }
      // Window list for current desktop
      winList.innerHTML = '';
      const windows = allWindows.filter(w => !w._hiddenByDesktop);
      if (!windows.length) {
        winList.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-dim);font-size:13px">${escHtml(t('No windows on this desktop'))}</div>`;
      } else {
        for (const win of windows) {
          winList.appendChild(this._buildWindowItem(win, wm, close, rerender));
        }
      }
      // Minimized windows (design-mobile-gaps #10): WindowManager.minimize is a
      // no-op ≤768px now, but a window minimized on a desktop client before
      // this phone joined would otherwise vanish from every list — a tap
      // restores it.
      // a tab group is minimized as ONE frame (the host carries the flag) — its guests are listed here too
      const minimized = [...wm.windows.values()].filter(w => minimizedOf(wm, w) && !w._hiddenByDesktop);
      if (minimized.length) {
        const head = document.createElement('div');
        head.className = 'mobile-win-minimized-head';
        head.style.cssText = 'padding:8px 16px 2px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim)';
        head.textContent = t('Minimized');
        winList.appendChild(head);
        for (const win of minimized) {
          const item = this._buildWindowItem(win, wm, close, rerender);
          item.classList.add('mobile-win-minimized');
          item.onclick = () => this._openRow(win, wm, close, rerender); // restores the group AND shows this tab (a host too) — the rows' ONE road
          winList.appendChild(item);
        }
      }
    };

    pop.appendChild(winList);
    renderContent();

    document.body.appendChild(pop);
    untilGone(pop, ctl);
    // a remote change redraws the tabs while the list is open (r2 ①: the manager's _followOpenLists says when)
    window.addEventListener('vs-desktops', () => renderContent(true), { signal: ctl.signal });
    // An outside tap closes the list — THE ONE closer (utils.js onOutsidePress: capture phase, a touch counts as a
    // TAP, so a scroll outside the list no longer dismisses it). Chained-popover rule (same as attachPopoverClose): a
    // context menu or dialog opened FROM a row (billing switcher + its confirm) is a child interaction, not a
    // dismissal of the list; a press ON the nav button itself is its toggle's.
    onOutsidePress(pop, close, { ignore: (t) => t === anchor || !!anchor.contains?.(t) || !!personDialogOf(t), signal: ctl.signal });
  }

  /** A ROW's TAP — the title switcher's ONE road to a window (its window rows and its Minimized rows): the list's one close, then
   *  the window revealed. A row whose window is GONE — no window stands under its id any more (closed by a record or any other road
   *  while the list stood open — r1793: the tap used to close the list and reveal nothing, a person's tap that did nothing,
   *  silently) — says so in words and the list is drawn again with what is open now. A window rebuilt under the same id (a dead
   *  view rebuilt live, a re-opened row) IS that row's window: the tap reveals it. `win.id` is read live (a re-key keeps the
   *  instance). → whether it opened */
  _openRow(win, wm, close, rerender) {
    if (!win || !wm.windows.has(win.id)) {
      showToast(t('That window is no longer open — the list now shows what is open.'), { type: 'info' });
      if (typeof rerender === 'function') rerender();
      return false;
    }
    close();
    wm.revealWindow(win.id);
    return true;
  }

  _buildWindowItem(win, wm, close, rerender) {
    const item = document.createElement('div');
    item.className = 'mobile-win-row';
    item.dataset.winId = win.id;
    item._win = win;   // r1793: the row's window by INSTANCE (late-focus insideWindow) — a row its tap took off the page keeps naming it across a re-key
    // the waiting fact (lane phone-take-photo): a conversation that waits for the person blinks here as on the desk's chooser —
    // never the one on show; _patchSwitcherWaiting keeps it live while the list is open
    if (win.id !== wm.activeWindowId && windowWaits(win)) { item.classList.add('waiting'); this._waitDot(item, true); } // r2: a standing dot too (reduced motion keeps it)
    // r2 (主开发 ②): a tap on a row that SAID «it waits» is seeing it (the row's own tap stays the switcher's one close + reveal)
    item.addEventListener('click', () => { if (item.classList.contains('waiting')) this._seen(win.id); });
    item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.1s';
    if (win.id === wm.activeWindowId) item.style.background = 'var(--accent-dim)';
    // Long-press → the window's own menu (design-mobile-gaps #7/#22): the
    // registered 'window' contributions — rename / restart / terminate /
    // locate / properties / Move to Desktop / close — the title-bar menu the
    // phone has no title bar for. The list stays open underneath (its
    // outside-tap close exempts [data-popover]).
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      showWindowContextMenu(this.app, win.id, e.clientX, e.clientY, { onAction: () => setTimeout(() => rerender?.(), 50), rowYielded: yielded() });
    });

    // the window's mark (lane phone-take-photo, the owner 2026-11-09 «手机上对话列表的图标也match一下harness»): an agent
    // conversation wears ITS HARNESS'S mark — the one the desk's title bar, taskbar and lists show (agent-meta
    // windowListMark); any other window its type glyph. The row's press target and words keep their size.
    const icon = document.createElement('span');
    icon.style.cssText = 'flex-shrink:0;font-size:16px';
    icon.appendChild(windowListMark(win));

    const label = document.createElement('span');
    label.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:var(--text)';
    label.textContent = windowTitle(win);

    // Billing identity chip — mirrors the desktop title-bar badge (which has
    // no home on mobile). setAuthBadge stashes the auth object on the window.
    let billChip = null, forms = null;
    const auth = win._authBadge;
    if (auth) {
      const isApi = auth.source === 'api-key' || auth.source === 'api-console' || auth.source === 'api-other';
      billChip = document.createElement('span');
      billChip.className = 'mobile-win-billing' + (isApi ? ' api' : '');
      // pooled parity with the desktop badge: name the pool AND its current real target (2.267.1). lane phone-chip
      // (B-e5ff): the three forms, never cut — the row's title and the chip share the row (fitSwitcherRow — ruling B on the row, fitted
      // once the row is laid out); the full words in title + aria-label
      forms = billingPillForms({ kind: auth.source === 'unknown' ? 'unknown' : auth.source === 'pooled' ? 'pooled' : isApi ? 'api' : 'subscription',
        name: auth.source === 'pooled' ? (auth.name || t('pool')) : (auth.name || (isApi ? (auth.source === 'api-console' ? 'Console' : 'API') : t('CLI login'))),
        target: auth.source === 'pooled' ? (auth.poolTarget || '') : '' });
      billChip.innerHTML = billingPillHtml(forms, escHtml);
      billChip.title = forms.tip + ' — ' + t('Click to switch billing');
      billChip.setAttribute('aria-label', forms.tip);
      billChip.onclick = (e) => {
        // Keep the window list open underneath — closing it left the switcher
        // menu floating context-less (real report). The list's outside-tap
        // close exempts [data-popover]/dialogs, same as attachPopoverClose.
        e.stopPropagation();
        this.app.showBillingSwitcher?.(win.id, billChip);
      };
    }

    // lane phone-six: «Split» — this window beside the one on show (side by side, left and right). Where two panes do not
    // fit the row KEEPS the door and says why («Rotate to split» on a portrait phone) — a press says it again; never greyed
    const sv = this.split?.offer(win.id);
    let splitBtn = null;
    if (sv) {
      splitBtn = document.createElement('button');
      splitBtn.type = 'button';
      splitBtn.className = 'mobile-win-split' + (sv.ok ? '' : ' refused');
      splitBtn.dataset.why = sv.why;
      splitBtn.textContent = t(sv.words);
      // THE ROW'S CENTRE IS ITS NAME (主开发's ruling 09:33Z, measured: the refused door's 106 px of words pushed the billing chip
      // under the row's centre — a thumb on the row opened the chip): the refused door is a 44 px icon at the row's end, its
      // words its name, its tip and what its press says
      if (!sv.ok) { splitBtn.innerHTML = UI_ICONS.columns; splitBtn.setAttribute('aria-label', t(sv.words)); splitBtn.title = t(sv.words); }
      splitBtn.onclick = (e) => { e.stopPropagation(); if (!sv.ok) { showToast(t(sv.words)); return; } close(); this.split.open(win.id); }; // the switcher's own close (the row builder's — .397)
    }

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'background:none;border:none;color:var(--text-dim);font-size:16px;padding:4px 8px;cursor:pointer;flex-shrink:0;min-width:36px;min-height:36px;display:flex;align-items:center;justify-content:center';
    closeBtn.textContent = '\u2715';
    closeBtn.title = t('Close'); closeBtn.setAttribute('aria-label', t('Close'));   // its word (the ✕ is a glyph — lane ui-controls-and-bugs)
    // a window that asks first (requestClose answered false — a «Session unavailable» tile's confirm, a desktop app's own ask)
    // closes LATER: the list redraws when it does (r4: its row stayed, and a tap revealed a window that was gone)
    // …ONE wait per WINDOW (B-54d9 N3): a ✕ cancelled again, or the list opened again, replaces the wait (its own signal ends the old one)
    closeBtn.onclick = (e) => { e.stopPropagation(); if (wm.requestClose(win.id)) item.remove(); else { win._switcherWait?.abort?.(); const wait = win._switcherWait = new AbortController(); win._listenerCtl?.signal?.addEventListener?.('abort', () => setTimeout(() => rerender?.(), 0), { once: true, signal: wait.signal }); } };

    // lane ui-controls-and-bugs (the walk's window-manager-3: the window's menu hid behind a long press nobody guesses): a
    // visible ⋯ opens THE SAME menu (the For-you row's ⋯ is the precedent); the long press stays
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'mobile-win-more';
    moreBtn.style.cssText = 'background:none;border:none;color:var(--text-secondary);padding:4px 6px;cursor:pointer;flex-shrink:0;min-width:36px;min-height:36px;display:flex;align-items:center;justify-content:center';
    moreBtn.innerHTML = UI_ICONS.more;   // the library's own static SVG
    moreBtn.title = t('More'); moreBtn.setAttribute('aria-label', t('More')); moreBtn.setAttribute('aria-haspopup', 'menu');
    moreBtn.onclick = (e) => { e.stopPropagation(); const r = moreBtn.getBoundingClientRect(); showWindowContextMenu(this.app, win.id, r.left, r.bottom + 2, { onAction: () => setTimeout(() => rerender?.(), 50), rowYielded: yielded() }); };
    // lane phone-six (主开发 2026-11-17, ruling B on the row): what the row YIELDED (fitSwitcherRow → item.dataset.yield) is in the
    // window's menu, first, under the words the row showed — the Split door (a refused one OFF with its why on its row) and the
    // billing row (the chip's own words, the same switch door); the long press opens the same menu with the same rows
    const yielded = () => {
      const p = rowParts(item.dataset.yield || ''), out = [];
      if (splitBtn && !p.split) out.push(sv.ok ? { label: t(sv.words), action: () => { close(); this.split.open(win.id); } } : { label: t('Split'), off: t(sv.words) });
      if (billChip && !p.chip) out.push({ label: t('Billing: {name}', { name: forms.tip }), action: () => this.app.showBillingSwitcher?.(win.id, moreBtn) });
      return out;
    };

    item.append(...[icon, label, billChip, splitBtn, moreBtn, closeBtn].filter(Boolean));
    paintSwitcherRow(this.app, item, win); // lane cache-warmth-band: the row's warmth band + «N min left» (one row per tab)
    requestAnimationFrame(() => fitSwitcherRow(item, label, billChip, splitBtn));   // ruling B on the row: the name keeps its readable minimum
    item.addEventListener('pointerdown', () => { item.style.background = 'var(--bg-hover)'; });
    // THE ROW NAMES THE WINDOW — reveal it as itself (inc-muiq348r-jwb5: a tab group's HOST row, tapped while the group
    // showed a guest, only raised the frame — the guest stayed on screen under the host's title and highlight)
    item.onclick = () => this._openRow(win, wm, close, rerender);
    return item;
  }

  _setupGestures() {
    const app = this.app;
    let startX = 0, startY = 0;
    document.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
      if (!app.isMobile) return; // built at a fold (lane duo-build-1): unfolded to the desktop, an edge swipe is no drawer
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 80 && Math.abs(dy) < 50 && app.viewportClass?.() === 'regular') { // the list column (SPEC-v3 §4): the left edge shows it, a swipe left FROM it hides it
        if (dx > 0 && startX < 30) app.sidebar.setListHidden(false);
        else if (dx < 0 && startX < 320 && matchMedia('(orientation: portrait)').matches) app.sidebar.setListHidden(true);
        return;
      }
      if (Math.abs(dx) > 80 && Math.abs(dy) < 50) {
        if (dx > 0 && startX < 30) app.sidebar.toggle(true);
        else if (dx < 0 && app.sidebar.isOpen) app.sidebar.toggle(false);
      }
    }, { passive: true });
  }
}
