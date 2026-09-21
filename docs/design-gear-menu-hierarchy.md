# Design — the ⚙ menu hierarchy (review 2026-09-21; implementation lane feat-gear-menu-hierarchy)

## 1. What exists today (evidence)

**Renderer.** `buildGearMenu` (src/lib/gear-menu.js:141-157) is a FLAT renderer: it walks `menuItems('gear', ctx)` and emits one `.gs-menu-item` per row; every click does `pop.remove(); onClick()` (gear-menu.js:146). It reads `icon`, `danger`, `decorate` and nothing else — the `children` and `keepOpen` hints that contributions.js documents as "the gear renderer reads them" (contributions.js:170-183) are **ignored** by the gear renderer (no occurrence of either word in gear-menu.js). The popover itself is built in `App._showGlobalSettings` (src/lib/app.js:1014-1143): 11 quick-pref elements (Theme select + ✎, Font size A-/n/A+, Font select, UI scale −/%/+, UI font size −/%/+, "All Settings...") appended first, then the gear block.

**Registry.** contributions.js has NO tree concept: `menuItems` sorts by `group` → `order` → `seq` (contributions.js:229-236) and returns a flat array; a one-level `children` submenu exists for showContextMenu consumers (contributions.js:281-285, "an empty submenu is not shown"), plus `expand` for spliced dynamic rows (contributions.js:261-266). No `parent`/`submenu` field.

**The real row list** (every `menu:'gear'` registration):

| group/order | label | file:line | `when` |
|---|---|---|---|
| 0_prefs/10 | Customize UI… | gear-menu.js:52 | !isMobile |
| 0_prefs/20 | Language: … (decorate → showContextMenu at click point) | gear-menu.js:55-76 | — |
| 1_admin/10 | Manage agents… | gear-menu.js:78 | — |
| 1_admin/20 | Plugins… | gear-menu.js:79 | — |
| 1_admin/25 | Integrations… | src/lib/integrations-window.js:373-377 | — |
| 1_admin/30 | Usage… | gear-menu.js:80 | — |
| 1_admin/40 | Background Work… | gear-menu.js:81 | — |
| 1_admin/45 | Desktop apps… | src/lib/desktop-app-launcher.js:97 | `_desktopAppsAvailable` |
| 1_admin/45 | Channels… | src/lib/channels-panel.js:461-468 | rail exists |
| 1_admin/46 | Outbox… | src/lib/channel-outbox.js:276-281 | — |
| 1_admin/50-70 | Diagnostics report…, Report a problem…, Restore a previous layout… | gear-menu.js:82-84 | — |
| 2_maint/10-30 | Backup & migrate…, Change/Set password…, Update VibeSpace… (decorate → two-line version) | gear-menu.js:86-114 | Update: `_repoDir` |
| 2p_plugins/10 | `expand` → one row per plugin window | gear-menu.js:118-122 | — |
| 3_help/10-20 | Welcome tour, Sign out (danger) | gear-menu.js:124-131 | Sign out: `_authEnabled` |

Two rows share `1_admin/45` (desktop-app-launcher.js:97 vs channels-panel.js:462) — their relative order is module import sequence, a latent fragility a re-grouping should fix with explicit orders.

**Quick prefs are NOT duplicates of the Settings window.** Theme/termFontSize/termFontFamily/uiScale/uiFontScale are per-device localStorage keys (`CLIENT_PREF_KEYS`, app.js:159-163); `SETTINGS_CATEGORIES` (src/lib/settings-schema.js:1038-1053) has no Appearance category. The ⚙ popover is their ONLY entry point — they cannot be "collapsed into All settings"; they must stay reachable within the popover.

**Rail twins.** Plugins, Background Work, Channels, Agents and System are also rail panels (src/lib/sidebar-rail.js:112-120; `openPluginsDialog` redirects to the rail, scripts/test-sidebar-rail.mjs:175-180). So several gear rows are second entry points, which argues for demoting them into submenus.

**Mobile.** mobile-nav.js:23-24 calls the same `_showGlobalSettings`; ≤768px CSS makes the popover full-width with `overflow-y:auto` (public/style.css:1886-1890). `.gs-menu-item` is `padding:6px 8px; font-size:12px` (style.css:2251-2255) ≈ 27 px tall and the `@media (hover:none)` finger-size rule covers only `.context-menu-item` (style.css:1988-1992) — **gear rows are already below a 44 px touch target today**.

**Popover protocol.** `createPopover` tags `data-popover` (src/lib/utils.js:329); outside-mousedown closes unless the click lands in any `[data-popover]` (utils.js:302-316) — a flyout that is itself `[data-popover]` keeps the parent open. The global Escape handler removes ALL `[data-popover]` at once (app.js:1443-1449), so layer-by-layer Esc for a flyout needs a popover-local keydown with `stopPropagation` (the createModalShell pattern, utils.js:41). showContextMenu's own submenu (utils.js:386-429) is hover/tap-open, one level, no keyboard.

**Pins.** scripts/test-contributions.mjs B3 (:460-507, fast tier, ci.mjs:218) replays `registerGearMenu` and diffs the flat row projection against a VERBATIM legacy list over 16 states (isMobile × repoDir × auth × plugin windows), then pins: Language+Update carry `decorate`, exactly one danger row, action→app-method map (:495-503), the globe SVG and the "✓ / figure-space" glyphs (:504-506); :580-584 pins `pop.append(buildGearMenu(this, pop))`, mobile sharing, and the escHtml'd label. test-ui-scale.mjs:196-209 (chrome) opens the popover and expects `label` elements matching /DPI/ and /font size/. test-integration-registry.mjs:807 regex-pins `menu: 'gear'` in integrations-window.js. test-window-menu is EXCLUDED as RED (ci.mjs:410).

**Ids.** Only `gear/plugin-windows` has an explicit id (gear-menu.js:120); the rest are `gear#<seq>`. Nothing references gear item ids: keybindings bind COMMAND ids (contributions.js:363-372), openSpecs/bookmarks never name menu rows. Plugin API passes `...spec` through (src/lib/plugin-client.js:230-235; docs/plugins.md:115), so a new field flows to plugins for free.

## 2. Design

### (a) Grouping — 5 submenus + 3 direct rows

Top level, in order (name EN / zh / ja):

1. **Appearance ▸** 外观 / 外観 — a PANEL flyout holding the existing inline controls (Theme + ✎, Font size, Font, UI scale, UI font size), then a rule, then `Customize UI…` (desktop only) and `Language ▸` (its 4 choices become real children instead of a detached showContextMenu). The head row shows a live caption: `Appearance ▸  Dark · 14px · 100%` so the common state is visible without opening it.
2. **Manage agents…** — direct. Frequency: login expiry notices, pool switches, roster usage repaint every 8 s; it is the most-clicked admin row and the target of dozens of inbox messages ("in Manage agents first", i18n-zh.js:2358-2568).
3. **Tools ▸** 工具 / ツール — `Usage…`, `Background work…`, `Desktop apps…`, `Plugins…`, rule, plugin-contributed windows (`expand`). Plugin rows registered with `parent:'tools'` land here; rows with no `parent` keep today's behavior (top-level tail, group-sorted) so no plugin breaks.
4. **Communication ▸** 通讯 / コミュニケーション — `Channels…`, `Outbox…`, `Integrations & keys…` (registered by their owning modules with `parent:'comm'`, keeping gear-menu.js's block untouched — the same ownership rule channels-panel.js:455-459 already states).
5. **System ▸** 系统 / システム — `Report a problem…` (first: it is the panic action), `Diagnostics report…`, rule, `Restore a previous layout…`, `Backup & migrate…`, `Change password…`.
6. **Update VibeSpace…  v2.369.120 → v…** — direct. The row's two-line version label IS the update indicator (gear-menu.js:96-113); burying it in a submenu hides "vX → vY".
7. **Help ▸** 帮助 / ヘルプ — `Welcome tour`, `All settings…` (moved out of the quick-prefs block, now a Help child AND kept as the last quick row inside Appearance's panel, since it is the natural "more" of that panel).
8. rule, **Sign out** — direct, danger, `_authEnabled` (today's label is "Sign out", i18n-zh.js:714; "Log out" in the brief is the same row).

"Report a problem" stays inside System: it is rare, and its three panic surfaces (toasts, For-you inbox, Ctrl+K) are unaffected; making it top-level costs the row budget the owner is complaining about. Count: 8 top-level rows (5 heads) vs ~28 elements today.

### (b) Interaction model

ONE renderer, two modes chosen at build time by `app.isMobile || matchMedia('(hover: none)').matches`:

- **Desktop = cascading flyout to the LEFT.** The popover is right-anchored (`pop.style.right`, app.js:1019), so a flyout opens at `right:100%` (the flip showContextMenu already does at utils.js:414). Open on hover after a 120 ms intent delay AND on click/Enter/ArrowLeft (click never toggles closed — utils.js:423-428's lesson). Only one flyout open at a time; moving the pointer onto another head swaps it. The flyout element carries `data-popover` so outside-click logic (utils.js:310) treats it as a child. Appearance's flyout is a panel (selects/steppers, `keepOpen` semantics — finally honored); other flyouts are plain rows and close the whole popover on activation, as today.
- **Keyboard.** Roving `tabindex` (0 on the focused row, −1 elsewhere), `role="menu"/"menuitem"`, ArrowDown/Up wrap, ArrowLeft opens a head (the flyout is to the left) / ArrowRight or Esc closes it, Enter/Space activates, Home/End, Tab leaves. Esc is handled on the popover with `stopPropagation` while a flyout is open (layer-by-layer); with none open the global handler (app.js:1446) closes the popover as today. Focus returns to the head on flyout close.
- **Mobile = inline accordion, no hover.** A head row toggles its children rendered inline under it (indented, bordered); one open at a time; the full-width scrolling popover (style.css:1886) stays; a "Back" row is unnecessary because nothing navigates away (drill-in was rejected: it needs navigation state and breaks the outside-click/Esc protocol). New rule `@media (hover:none){.gs-menu-item{min-height:44px;padding:10px 12px}}` — fixes the existing sub-44 px rows too. Appearance's panel renders inline in accordion mode (the controls are already touch-sized 24 px buttons; bump to 32 px under hover:none).

### (c) Code

**contributions.js (+~60 LOC).** Two new spec fields, validated LOUDLY at registration like the rest (contributions.js:187-206):
- `submenu: true` marks a HEAD (requires an explicit `id`, `label`; forbids `command/run/expand`; `icon/when/group/order` as usual).
- `parent: '<head id>'` on any item (incl. separators and `expand`). Resolution is LAZY at `menuItems()` time, like `command` (contributions.js:154-155): an unknown or `when`-hidden parent warns once + telemetry `menu-unknown-parent` and the row **falls to top level — never dropped** (a lost row is the silent-failure class). `menuItems` builds heads' `children` from their members with the existing sort and the existing separator-collapse rules, reusing the `children` output field (contributions.js:281-285) so showContextMenu consumers and the "empty submenu drops itself" rule work unchanged; `expand` inside a head splices into that head. A head may not nest another head deeper than 2 levels (Appearance ▸ Language ▸ is the max; validated).

**gear-menu.js (+~150).** Register the five heads; add `parent` to the core rows; replace the Language `decorate` (gear-menu.js:63-75) with `submenu:true` + four `children` with `when` for the ✓ glyph; the `2p_plugins` expand gets `parent:'tools'`. `buildGearMenu` grows `renderRow / renderHead / openFlyout / openAccordion / keyNav(pop)`. A new renderer hint `panel:(ctx)=>HTMLElement` for Appearance; the quick-pref builders move VERBATIM from app.js:1021-1136 into `src/lib/appearance-panel.js` (exported `buildAppearancePanel(app, pop)`), and `_showGlobalSettings` shrinks to createPopover + `pop.append(buildGearMenu(this, pop))` (the :580 pin keeps matching).

**External owners (1 line each).** integrations-window.js:374, channels-panel.js:462, channel-outbox.js:277 → `parent:'comm'`; desktop-app-launcher.js:97 → `parent:'tools'`; give the two order-45 rows distinct orders.

**plugin-client.js (+~10).** Pass `parent`/`submenu` through (already `...spec`); namespace check: a plugin `parent` may name a core head (`appearance|tools|comm|system|help`) or its own `plugin:<id>:…` head; a plugin head id is prefixed like items (plugin-client.js:233). docs/plugins.md:115 gains the two fields. `RESERVED_CONTRIBUTIONS` `menus` (src/plugin-manifest.js:72) stays reserved — no declarative manifest menus yet, nothing to migrate.

**mobile-nav.js: 0 LOC** — it already shares `_showGlobalSettings`; the mode switch lives in the renderer.

**i18n.** New keys with zh+ja: `Appearance`, `Communication`, `Help`; `Tools`, `System`, `Account`, `Back` already exist (grep of i18n-zh.js); every current row label is present. `tc()` not needed (no same-spelling conflicts). i18n-check runs in build.

**CSS (+~40, theme vars only).** `.gs-menu-item.has-sub` (flex, `::after '▸'` — the viewers.css:498-499 pattern), `.gs-flyout{position:absolute;right:100%;top:-4px;min-width:200px;background:var(--bg-dialog);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 8px 24px rgba(0,0,0,.35);padding:4px}` (§17 popover chrome), `.gs-menu-item:focus-visible{border-color:var(--accent)}` (no rings), `.gs-acc .gs-sub{padding-left:22px;border-left:1px solid var(--border)}`, the hover:none touch rule, `.gs-head-caption{font-size:10px;color:var(--text-dim)}`.

### (d) Tests

- **scripts/test-contributions.mjs (fast).** Unit: `submenu`/`parent` validation throws; unknown parent → warn once + top level; `when`-hidden head → members surface top level; empty head dropped; `expand` inside a head; plugin-style parent; (r2) a function caption rides through as `captionOf` + a wiring pin on the renderer's refresh; plugin-client refuses a head without an explicit id slug. **Re-base B3** (:460-494): the byte-identical legacy list becomes a TREE FIXTURE over the same 16-state cartesian, plus a **tree-shape census**: flatten the tree and assert it equals (as a set) the legacy flat labels — every current row lands in exactly one head or top level, none twice, none lost; top-level row count ≤ 9; exactly one danger row (:497); the action→method map (:499-503) runs against the flattened tree. The "✓ / figure-space" glyph pin (:506) is retired with the Language decorate.
- **New scripts/test-gear-menu.mjs (heavy, chrome; worktree + freePorts pattern of test-sidebar-rail).** Desktop leg at 1280×800: open ⚙, count top-level rows, hover Tools → flyout visible and fully on-screen (gBCR), ArrowDown×2/ArrowLeft opens System, Enter on "Diagnostics report…" calls the stub, Esc closes only the flyout (popover still present), Esc again closes the popover, outside mousedown closes, a click inside the Appearance panel keeps it open and changes `termFontSize`. Mobile leg at 390×844 with touch emulation: accordion expands inline, every `.gs-menu-item` height ≥ 44 px, tap runs the action, no hover dependency (dispatch `touchstart/click` only). Register in ci.mjs (§43 census fails an unlisted suite). **Verifier r2 (2026-09-21):** the hover-intent leg measures on the page's own clock (mouseenter stamp + a MutationObserver on `aria-expanded`) and node polls until-style (≤ 2 s) instead of sleeping against the 120 ms timer; the A+ leg also asserts the head's LIVE caption (→ the new px, → back after A-).
- **scripts/test-ui-scale.mjs:196-209** must open Appearance before reading the `label`s (they now live in the panel) — a one-line change; otherwise the heavy tier goes red.
- test-integration-registry.mjs:807's `menu: 'gear'` regex still matches.

### (e) Effort and migration

~600 LOC: contributions.js +60, gear-menu.js +150, appearance-panel.js +120 (moved from app.js −120), plugin-client +10, four owner files +4, style.css +40, i18n +6 lines, docs/plugins.md + kb-patterns.md:18 + kb-file-structure (gear-menu entry) + CHANGELOG, test-contributions ±90, test-gear-menu ~220. One working day plus the gate.

Migration: none for data — gear ids are seq-generated (`gear#n`) and unreferenced; keybindings bind command ids (contributions.js:363); no openSpec/bookmark names a menu row; existing plugin `menu:'gear'` rows keep working at the top level. Behavior notes for the changelog: Language moves under Appearance; Customize UI moves under Appearance; the three comm rows and the four tool rows move into heads; the touch-row height changes on phones.

## 3. Mocks

Desktop (popover right-anchored; flyout opens left):

```
                          ┌──────────────────────────────┐
 ┌──────────────────────┐ │ ⚙                            │
 │ Theme  [Dark     ▾] ✎│ │ ◂ Appearance   Dark·14px·100%│
 │ Font size  [A-] 14 [A+]│ ├──────────────────────────────┤
 │ Font   [JetBrains  ▾]│ │ 🔑 Manage agents…            │
 │ UI scale  [−] 100% [+]│ │ ◂ Tools                      │
 │ UI font   [−]  90% [+]│ │ ◂ Communication              │
 │──────────────────────│ │ ◂ System                     │
 │ 🖌 Customize UI…      │ │ ⤴ Update VibeSpace…          │
 │ 🌐 Language: 中文   ▸│ │    v2.369.120 → v2.370.0     │
 │ All settings…        │ │ ◂ Help                       │
 └──────────────────────┘ ├──────────────────────────────┤
                          │ ⎋ Sign out                   │
                          └──────────────────────────────┘
```

Mobile accordion (full width, one head open, 44 px rows):

```
┌──────────────────────────────────┐
│ ▸ Appearance      Dark·14px·100% │
│ 🔑 Manage agents…                │
│ ▾ Tools                          │
│    📊 Usage…                     │
│    📊 Background work…           │
│    🖥 Desktop apps…              │
│    🧩 Plugins…                   │
│    ──────────────────────        │
│    🧩 My plugin window           │
│ ▸ Communication                  │
│ ▸ System                         │
│ ⤴ Update VibeSpace…  v2.369.120  │
│ ▸ Help                           │
│ ─────────────────────────────    │
│ ⎋ Sign out                       │
└──────────────────────────────────┘
```
