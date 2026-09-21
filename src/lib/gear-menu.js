// ⚙ GEAR MENU (the `.gs-menu` block of the global-settings popover). Split
// out of app.js with the Plugin Ph1 registry-ization: the rows are 'gear'
// MENU CONTRIBUTIONS (contributions.js) and buildGearMenu() renders them in
// registry order. Mobile and desktop share this ONE menu (mobile-nav's gear
// calls _showGlobalSettings); the MODE is chosen here, at build time.
//
// THE TREE (2.369.124, docs/design-gear-menu-hierarchy.md — owner: the flat
// popover had grown to ~28 elements): five HEADS + three direct rows.
//   Appearance ▸   the quick per-device prefs (src/lib/appearance-panel.js,
//                  the head's `panel`) + Customize UI… + Language ▸ (four
//                  choice rows, ✓ on the current one via `checked`)
//   Manage agents… direct — the most-clicked admin row
//   Tools ▸        Usage… · Background Work… · Desktop apps… · Plugins… ·
//                  rule · plugin-contributed windows (`expand`)
//   Communication ▸ Channels… · Outbox… · Integrations… — registered by
//                  their OWNING modules with parent:'comm' (this block never
//                  learns their names)
//   System ▸       Report a problem… (first: the panic action) ·
//                  Diagnostics report… · rule · Restore a previous layout… ·
//                  Backup & migrate… · Change/Set password…
//   Update VibeSpace… direct — its two-line "vX → vY" label IS the update
//                  indicator, a submenu would hide it
//   All Settings… direct — the settings window is a destination, not a preference (2.369.131)
//   Help ▸         Welcome tour
//   rule, Sign out direct, danger, auth only
// A plugin adds a row with registerMenuItem({ menu:'gear', parent?:'tools'|
// 'comm'|'system'|'help'|'appearance', order, label, icon, command | run });
// a row with NO parent keeps the old behaviour (top level, group-sorted).
//
// ONE RENDERER, TWO MODES (§2b): desktop = a cascading FLYOUT that opens to
// the LEFT (the popover is right-anchored) on 120 ms hover intent AND on
// click / Enter / ArrowLeft — click never toggles closed (the showContextMenu
// lesson: emulated mouseenter on tap may already have opened it), one flyout
// per level at a time, the flyout carries data-popover so utils.js's
// outside-mousedown logic treats it as ours; phones / hover:none = an inline
// ACCORDION (a head toggles its members under it, one open per level, the
// Appearance panel inline). Keyboard: roving tabindex + role=menu/menuitem,
// ArrowDown/Up wrap, Home/End, ArrowLeft opens a head, ArrowRight / Esc
// closes the deepest open flyout and returns focus to its head — Esc is
// handled HERE with stopPropagation while a flyout is open (layer by layer);
// with none open it reaches app.js's global handler, which closes the popover
// as before. Every plain row closes the popover then runs its action, as it
// always did; a `keepOpen` row (and every control inside the Appearance
// panel) leaves it open.
//
// Item shape beyond showContextMenu's: `icon` (inline SVG string — ours or a
// plugin's, always SVG), `danger` (red row), `decorate(el, ctx)` for rows that
// need more than [icon][label]→onClick (the Update row: two-line label +
// async version fetch), `panel(ctx)` / `caption(ctx)` on a head (the registry
// hands the function through as `captionOf`; the head re-evaluates it on every
// click / change / input bubbling out of its members — a LIVE caption),
// `checked` on a choice row. ctx = { app, pop }.
import { registerMenuItem, menuItems } from './contributions.js';
import { escHtml, fetchJson, uiScale } from './utils.js';
import { t, getLangPref, setLang } from './i18n.js';
import { PLUGIN_ICON } from './plugin-client.js';
import { buildAppearancePanel, appearanceCaption } from './appearance-panel.js';

/** Hover-intent delay before a head's flyout opens / another swaps in (ms). */
export const HOVER_INTENT_MS = 120;

export const GEAR_ICONS = {
  key: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="11" r="3"/><path d="M7.5 8.5L13 3M11 5l2 2M9 7l1.5 1.5"/></svg>',
  puzzle: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h4v2.5a1.5 1.5 0 103 0V7h2v7H3V7h2V4.5a1.5 1.5 0 103 0z"/></svg>',
  brush: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 2.5c-2.5.5-5.5 3-7 5l2 2c2-1.5 4.5-4.5 5-7z"/><path d="M6.5 7.5c-1.5.3-2.5 1.5-2.5 3.5-1 .5-1.5.5-2.5.5 1 1.5 2.5 2 4 2s2.8-1.3 3-3"/></svg>',
  tour: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.5v3.5M8 5v.5"/></svg>',
  out: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2H3v12h3M10 11l3-3-3-3M13 8H6"/></svg>',
  exp: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10V2M5 5l3-3 3 3M3 10v3h10v-3"/></svg>',
  imp: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v8M5 7l3 3 3-3M3 10v3h10v-3"/></svg>',
  lock: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>',
  chart: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 13h12"/><rect x="3" y="8" width="2.4" height="4"/><rect x="6.8" y="5" width="2.4" height="7"/><rect x="10.6" y="2.5" width="2.4" height="9.5"/></svg>',
  pulse: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 8h3l1.5-4 3 8L10.5 8h4"/></svg>',
  globe: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M1.5 8h13M8 1.5c-1.8 1.8-2.7 4-2.7 6.5S6.2 12.7 8 14.5c1.8-1.8 2.7-4 2.7-6.5S9.8 3.3 8 1.5z"/></svg>',
  // heads (2.369.124)
  sliders: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7"/><circle cx="10.5" cy="4.5" r="1.5"/><circle cx="5.5" cy="11.5" r="1.5"/></svg>',
  wrench: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5a3.5 3.5 0 014 4l-6.5 6.5a1.4 1.4 0 01-2-2L11.5 4.5"/><path d="M9.5 2.5L12 5"/></svg>',
  chat: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/></svg>',
  cog: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg>',
  help: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M6 6.2a2 2 0 013.9.6c0 1.3-1.9 1.6-1.9 3M8 12v.3"/></svg>',
  check: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7"/></svg>',
};

// ── 'gear' menu contributions (extracted + replayed by the gate suite: keep
//    the block self-contained — only the names it closes over: registerMenuItem,
//    t, getLangPref, setLang, fetchJson, GEAR_ICONS, PLUGIN_ICON,
//    buildAppearancePanel, appearanceCaption) ──
export function registerGearMenu() {
  const M = 'gear';
  const I = GEAR_ICONS;
  // ── Appearance ▸ — the per-DEVICE quick prefs as a PANEL head; every
  //    control inside keeps the popover open (keepOpen) ──
  registerMenuItem({
    menu: M, id: 'appearance', submenu: true, group: '0_prefs', order: 10, icon: I.sliders, keepOpen: true,
    label: () => t('Appearance'),
    caption: (c) => appearanceCaption(c.app),
    panel: (c) => buildAppearancePanel(c.app, c.pop),
  });
  registerMenuItem({ menu: M, parent: 'appearance', order: 10, when: (c) => !c.app.isMobile, icon: I.brush, label: () => t('Customize UI…'), run: (c) => c.app._customize.enter() });
  // Language is PER-DEVICE (localStorage, not a synced setting) — names shown
  // in their own language, never translated. Switching reloads the page. A
  // nested head (the two-level ceiling) with four choice rows; ✓ on the
  // current one through `checked`.
  registerMenuItem({
    menu: M, id: 'language', submenu: true, parent: 'appearance', order: 20, icon: I.globe,
    label: () => {
      const pref = getLangPref();
      const cur = { auto: t('Auto (system)'), en: 'English', zh: '中文', ja: '日本語' }[pref] || pref;
      return `${t('Language')}: ${cur}`;
    },
  });
  [['auto', () => t('Auto (system)')], ['en', 'English'], ['zh', '中文'], ['ja', '日本語']].forEach(([code, name], i) => {
    registerMenuItem({ menu: M, id: `language/${code}`, parent: 'language', order: 10 * (i + 1), label: name, checked: () => getLangPref() === code, run: () => setLang(code) });
  });
  registerMenuItem({ menu: M, group: '1_admin', order: 0, separator: true });
  registerMenuItem({ menu: M, group: '1_admin', order: 10, icon: I.key, label: () => t('Manage agents…'), run: (c) => c.app._showAgentsDialog() });
  // All Settings… is a DIRECT row (2.369.131, owner "所有设置为啥放在外观里"): 2.369.124 had
  // carried it over verbatim as the Appearance panel's footer link (and a Help child) —
  // the settings window is a primary destination, not an appearance preference.
  registerMenuItem({ menu: M, id: 'all-settings', group: '1_admin', order: 15, icon: I.cog, label: () => t('All Settings...'), run: (c) => c.app._settingsUI.open() });
  // ── Tools ▸ ──
  registerMenuItem({ menu: M, id: 'tools', submenu: true, group: '1_admin', order: 20, icon: I.wrench, label: () => t('Tools') });
  registerMenuItem({ menu: M, parent: 'tools', order: 10, icon: I.chart, label: () => t('Usage…'), run: (c) => c.app.openUsage() });
  registerMenuItem({ menu: M, parent: 'tools', order: 20, icon: I.chart, label: () => t('Background Work…'), run: (c) => c.app.openJobs() });
  // (order 30 = Desktop apps…, registered by desktop-app-launcher.js with parent:'tools')
  registerMenuItem({ menu: M, parent: 'tools', order: 40, icon: I.puzzle, label: () => t('Plugins…'), run: (c) => c.app.openPluginsDialog() });
  // Plugin-contributed windows (Ph2): one row per enabled iframe window,
  // spliced in dynamically under Tools — an empty list leaves no rule behind
  registerMenuItem({ menu: M, parent: 'tools', order: 50, separator: true });
  registerMenuItem({
    menu: M, parent: 'tools', order: 60, id: 'gear/plugin-windows',
    expand: (c) => (c.app.pluginClient?.contributedWindows?.() || []).map((w) => ({ label: w.title, icon: PLUGIN_ICON, action: () => c.app.pluginClient.open(w.pluginId, w.windowId) })),
  });
  // ── Communication ▸ — members come from their owners (channels-panel.js,
  //    channel-outbox.js, integrations-window.js: parent:'comm'); with none
  //    visible the head drops itself ──
  registerMenuItem({ menu: M, id: 'comm', submenu: true, group: '1_admin', order: 30, icon: I.chat, label: () => t('Communication') });
  // ── System ▸ ──
  registerMenuItem({ menu: M, id: 'system', submenu: true, group: '1_admin', order: 40, icon: I.cog, label: () => t('System') });
  registerMenuItem({ menu: M, parent: 'system', order: 10, icon: I.alert || I.pulse, label: () => t('Report a problem…'), run: (c) => c.app.captureIncident?.() });
  registerMenuItem({ menu: M, parent: 'system', order: 20, icon: I.pulse, label: () => t('Diagnostics report…'), run: (c) => c.app._openDiagnostics() });
  registerMenuItem({ menu: M, parent: 'system', order: 30, separator: true });
  registerMenuItem({ menu: M, parent: 'system', order: 40, icon: I.exp || I.pulse, label: () => t('Restore a previous layout…'), run: (c) => c.app._showLayoutHistory() });
  registerMenuItem({ menu: M, parent: 'system', order: 50, icon: I.exp, label: () => t('Backup & migrate…'), run: (c) => c.app._showTransferDialog() });
  registerMenuItem({ menu: M, parent: 'system', order: 60, icon: I.lock, label: (c) => (c.app._authEnabled ? t('Change password…') : t('Set password…')), run: (c) => c.app._showPasswordDialog() });
  // Self-update: runs scripts/update.sh visibly in a shell terminal (same
  // pattern as Manage Agents' CLI updates). The dtach terminal survives the
  // service restart at the end, so the log stays readable throughout.
  // The item also shows the running version and — when the canonical repo
  // has a newer one — "vX → vY" highlighted (user request). Clicking Update
  // opens the changelog-confirm dialog first (user directive) — the actual
  // update runs only after the user confirms. DIRECT row: the version label
  // is the update indicator, a submenu would hide it.
  registerMenuItem({
    menu: M, group: '1_admin', order: 50, when: (c) => !!c.app._repoDir, icon: I.key, label: () => t('Update VibeSpace…'),
    run: (c) => { c.app._showUpdateConfirmDialog(); },
    decorate: (upd, c) => {
      // Two-line button (user request): label on top, "vCURRENT → vLATEST"
      // below. Restructure item()'s [icon][label] into [icon][column].
      const labelSpan = upd.children[1];
      const col = document.createElement('div');
      col.className = 'gs-item-col';
      upd.appendChild(col);
      col.appendChild(labelSpan);
      const vspan = document.createElement('span');
      vspan.className = 'gs-ver';
      col.appendChild(vspan);
      fetchJson('/api/version?fresh=1').then((v) => {
        if (!v?.version || !vspan.isConnected) return;
        const newer = v.latest && c.app._versionNewer(v.latest, v.version);
        vspan.textContent = newer ? `v${v.version} → v${v.latest}` : `v${v.version}`;
        if (newer) vspan.classList.add('gs-ver-new');
        vspan.title = newer ? t('Update available') : (v.latest ? t('Up to date') : '');
      }).catch(() => {});
    },
  });
  // ── Help ▸ ──
  registerMenuItem({ menu: M, id: 'help', submenu: true, group: '1_admin', order: 60, icon: I.help, label: () => t('Help') });
  registerMenuItem({ menu: M, parent: 'help', order: 10, icon: I.tour, label: () => t('Welcome tour'), run: (c) => c.app._showOnboarding(true) });
  registerMenuItem({ menu: M, group: '3_help', order: 0, separator: true });
  registerMenuItem({
    menu: M, group: '3_help', order: 10, when: (c) => !!c.app._authEnabled, icon: I.out, danger: true, label: () => t('Sign out'),
    run: async () => {
      try { await fetch('/api/logout', { method: 'POST' }); } catch {}
      location.href = '/login';
    },
  });
}
registerGearMenu();
// end registerGearMenu (scripts/test-contributions.mjs extracts the block above)

/** Which mode the renderer picks for this device: an inline accordion on
 *  phones and on any hover-less pointer, a cascading flyout otherwise. */
export function gearMenuMode(app) {
  const hoverless = typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
  return (app?.isMobile || hoverless) ? 'accordion' : 'flyout';
}

/** Render the `.gs-menu` block for the global-settings popover `pop`. */
export function buildGearMenu(app, pop) {
  const menu = document.createElement('div');
  const accordion = gearMenuMode(app) === 'accordion';
  menu.className = 'gs-menu ' + (accordion ? 'gs-acc' : 'gs-fly');
  menu.setAttribute('role', 'menu');
  const ctx = { app, pop };
  const open = []; // open[level] = the head entry whose members are showing at that level
  let hoverTimer = null;

  // compact menu rows (matches context-menu look)
  const item = (svg, label, onClick, danger = false) => {
    const el = document.createElement('div');
    el.className = 'gs-menu-item' + (danger ? ' danger' : '');
    el.setAttribute('role', 'menuitem');
    el.tabIndex = -1;
    el.innerHTML = `<span class="gs-menu-icon">${svg}</span><span>${escHtml(label)}</span>`;
    el.onclick = () => { pop.remove(); onClick(); };
    return el;
  };
  const sep = () => { const s = document.createElement('div'); s.className = 'gs-menu-sep'; s.setAttribute('role', 'separator'); return s; };

  // ── focus: roving tabindex over the rows the user can reach right now ──
  const allRows = () => [...menu.querySelectorAll('.gs-menu-item')];
  const setFocus = (el) => {
    if (!el) return;
    for (const r of allRows()) r.tabIndex = -1;
    el.tabIndex = 0;
    try { el.focus({ preventScroll: true }); } catch { el.focus(); }
  };
  const rowsOf = (container) => [...container.children].filter((c) => c.classList?.contains('gs-menu-item'));
  const focusFirst = (container) => setFocus(rowsOf(container)[0]);
  // the list a focused row moves within: its own container's rows (a flyout
  // is its own list); the accordion is ONE inline list of the visible rows
  const listFor = (row) => (accordion ? allRows().filter((r) => r.getClientRects().length > 0) : rowsOf(row.parentElement));

  // ── open / close (one per level at a time; closing a level closes deeper ones) ──
  const closeFrom = (level, { focus = false } = {}) => {
    for (let l = open.length - 1; l >= level; l--) {
      const e = open[l];
      if (!e) continue;
      e.sub.classList.remove('open');
      e.head.setAttribute('aria-expanded', 'false');
      if (focus && l === level) setFocus(e.head);
    }
    open.length = Math.min(open.length, level);
  };
  const show = (entry) => {
    closeFrom(entry.level);
    entry.sub.classList.add('open');
    entry.head.setAttribute('aria-expanded', 'true');
    open[entry.level] = entry;
  };
  const openFlyout = (entry, { focus = false } = {}) => {
    if (open[entry.level] !== entry) {
      show(entry);
      // clamp into the viewport on EVERY open (the showContextMenu lesson):
      // measure in VIEWPORT px, write LAYOUT px (/uiScale — the popover is a
      // fixed body child under the body zoom)
      entry.sub.style.top = ''; entry.sub.style.left = ''; entry.sub.style.right = '';
      requestAnimationFrame(() => {
        if (!entry.sub.classList.contains('open')) return;
        const Z = uiScale();
        const r = entry.sub.getBoundingClientRect();
        if (r.left < 0) { entry.sub.style.right = 'auto'; entry.sub.style.left = '100%'; }
        const overflowY = r.bottom - window.innerHeight;
        if (overflowY > 0) entry.sub.style.top = `${-4 - (overflowY + 4) / Z}px`; // top is relative to the head row (initial -4px)
        else if (r.top < 0) entry.sub.style.top = `${-4 + (4 - r.top) / Z}px`;
      });
    }
    if (focus) focusFirst(entry.sub);
  };
  const openAccordion = (entry, { focus = false, toggle = true } = {}) => {
    if (open[entry.level] === entry) { if (toggle) closeFrom(entry.level); else if (focus) focusFirst(entry.sub); return; }
    show(entry);
    if (focus) focusFirst(entry.sub);
  };
  const armHover = (fn) => { cancelHover(); hoverTimer = setTimeout(() => { hoverTimer = null; fn(); }, HOVER_INTENT_MS); };
  const cancelHover = () => { if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; } };

  // ── rows ──
  const renderRow = (it, level) => {
    const svg = it.checked === undefined ? (it.icon || GEAR_ICONS.pulse) : (it.checked ? GEAR_ICONS.check : '');
    const el = item(svg, it.label, it.action || (() => {}), !!it.danger);
    if (it.id) el.dataset.id = it.id;
    el.dataset.level = String(level);
    if (it.checked !== undefined) { el.setAttribute('role', 'menuitemradio'); el.setAttribute('aria-checked', it.checked ? 'true' : 'false'); }
    if (it.keepOpen) el.onclick = () => { it.action?.(); };
    if (!accordion) el.addEventListener('mouseenter', () => armHover(() => closeFrom(level)));
    if (typeof it.decorate === 'function') it.decorate(el, ctx);
    return el;
  };
  const renderHead = (it, level, container) => {
    const el = document.createElement('div');
    el.className = 'gs-menu-item has-sub';
    el.setAttribute('role', 'menuitem');
    el.setAttribute('aria-haspopup', 'true');
    el.setAttribute('aria-expanded', 'false');
    el.tabIndex = -1;
    el.dataset.id = it.id;
    el.dataset.level = String(level);
    el.innerHTML = `<span class="gs-menu-icon">${it.icon || GEAR_ICONS.pulse}</span><span class="gs-menu-label">${escHtml(it.label)}</span>`;
    // the caption is LIVE (verifier r2): a change made inside the head's own
    // members / panel (A+, UI scale +, the theme select) re-evaluates it as
    // the event bubbles out of `sub` — before, the head kept its build-time
    // string and two numbers on one screen disagreed until the popover reopened
    let cap = null;
    if (it.caption || typeof it.captionOf === 'function') { cap = document.createElement('span'); cap.className = 'gs-head-caption'; cap.textContent = it.caption || ''; el.append(cap); }
    const refreshCaption = () => {
      if (!cap || typeof it.captionOf !== 'function') return;
      let v;
      try { v = it.captionOf(ctx); } catch (e) { try { console.warn('[gear-menu] caption of ' + it.id + ' threw', e); } catch { } return; } // a throwing caption warns and leaves the text
      cap.textContent = String(v ?? '');
    };
    const sub = document.createElement('div');
    sub.className = accordion ? 'gs-sub' : 'gs-flyout';
    sub.setAttribute('role', 'menu');
    if (!accordion) sub.dataset.popover = '1'; // a child popover: outside-mousedown logic keeps the parent open (utils.js attachPopoverClose)
    if (typeof it.panel === 'function') {
      try { sub.append(it.panel(ctx)); } catch (e) { try { console.warn('[gear-menu] panel of ' + it.id + ' threw', e); } catch { } }
      if (it.children.length) sub.append(sep());
    }
    renderList(it.children, sub, level + 1);
    for (const ev of ['click', 'change', 'input']) sub.addEventListener(ev, refreshCaption); // bubble phase: the control's own handler has already applied the change
    const entry = { head: el, sub, level, it };
    el._gsEntry = entry;
    if (accordion) container.append(el, sub); else { el.append(sub); container.append(el); }
    el.addEventListener('click', (e) => {
      if (sub.contains(e.target)) return; // a click inside the members / the panel is theirs
      e.stopPropagation();
      if (accordion) openAccordion(entry); else openFlyout(entry); // flyout: open, never toggle closed
    });
    if (!accordion) {
      el.addEventListener('mouseenter', () => armHover(() => openFlyout(entry)));
      el.addEventListener('mouseleave', cancelHover);
    }
    return el;
  };
  const renderList = (items, container, level) => {
    for (const it of items) {
      if (it.separator) { container.append(sep()); continue; }
      if (it.submenu && Array.isArray(it.children)) { renderHead(it, level, container); continue; }
      container.append(renderRow(it, level));
    }
  };

  // ── keyboard ──
  const keyNav = (e) => {
    const target = e.target;
    if (e.key === 'Escape') {
      if (!open.length) return; // nothing of ours to close: app.js's global handler closes the popover
      closeFrom(open.length - 1, { focus: true });
      e.preventDefault(); e.stopPropagation();
      return;
    }
    if (/^(SELECT|INPUT|BUTTON|TEXTAREA)$/.test(target.tagName || '')) return; // the Appearance controls keep their keys
    const row = target.closest?.('.gs-menu-item');
    if (!row || !menu.contains(row)) return;
    const list = listFor(row);
    const i = list.indexOf(row);
    const entry = row._gsEntry;
    const level = Number(row.dataset.level || 0);
    switch (e.key) {
      case 'ArrowDown': setFocus(list[(i + 1) % list.length]); break;
      case 'ArrowUp': setFocus(list[(i - 1 + list.length) % list.length]); break;
      case 'Home': setFocus(list[0]); break;
      case 'End': setFocus(list[list.length - 1]); break;
      case 'ArrowLeft':
        if (!entry) return;
        if (accordion) openAccordion(entry, { focus: true, toggle: false }); else openFlyout(entry, { focus: true });
        break;
      case 'ArrowRight':
        if (level > 0 && open[level - 1]) closeFrom(level - 1, { focus: true }); else return;
        break;
      case 'Enter': case ' ':
        if (entry) { if (accordion) openAccordion(entry, { focus: true, toggle: false }); else openFlyout(entry, { focus: true }); }
        else row.click();
        break;
      default: return;
    }
    e.preventDefault(); e.stopPropagation();
  };
  menu.addEventListener('keydown', keyNav);

  renderList(menuItems('gear', ctx), menu, 0);
  // the first row takes the roving tabindex so arrow keys work at once. The
  // focus move waits for the frame in which createPopover reveals the
  // popover (it is visibility:hidden until its clamp rAF runs, and nothing
  // inside a hidden subtree is focusable — a setTimeout(0) landed too early).
  const first = rowsOf(menu)[0];
  if (first) {
    first.tabIndex = 0;
    requestAnimationFrame(() => setTimeout(() => { if (menu.isConnected && !menu.contains(document.activeElement)) setFocus(first); }, 0));
  }
  return menu;
}
