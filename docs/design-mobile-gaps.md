# Design — mobile gaps (desktop vs mobile feature-completeness review (2026-09-20, HEAD 0875cc6a)

## Method
Desktop inventory built from `public/index.html`, `src/lib/app.js`, `gear-menu.js` + every `registerMenuItem` site, `sidebar*.js`, `session-card.js`, `window.js`/`tab-group.js`/`taskbar.js`/`desktop-manager.js`/`command-mode.js`/`session-palette.js`, chat-*.js, file-explorer*.js, `docs/keyboard-shortcuts.md`. Mobile status from `mobile-nav.js`, `sidebar-render-mobile.js`, every `isMobile`/`isTouch` branch (34 hits), the 15 `@media (max-width: 768px)` blocks, `installLongPressContextMenu` (`utils.js:473`), kb-design-lessons §7a.

Measurement: throwaway worktree server (own empty `data/`, isolated `$HOME`, `VIBESPACE_SKIP_AGENT_HOOKS=1`, free port) + headless Chrome over CDP with `Emulation.setDeviceMetricsOverride 390×844 mobile:true dsf:2`, iPhone UA, touch emulation, `hover:none`/`pointer:coarse`. `app.isMobile=true, app.isTouch=true, _mobileNav present, rail absent, #toolbar/#taskbar display:none` confirmed. Scripts: `/tmp/vs-work/mobile-review/measure*.mjs`; logs `run*.log`; screenshots `/tmp/vs-work/mobile-review/*.png`. Worktrees/scratch removed after each run (verified 0 left). A fixture conversation could not be listed in the sidebar (discovery refuses the `e2e…` fixture family by design, `src/fixture-guard.js`), so the session-card long-press menu is code-verified only.

Status key: **A** available · **P** partial · **M** missing · **N** not applicable on a phone by design.

## Gap table

| # | Feature | Desktop entry | Mobile | Evidence | Proposal | Effort |
|---|---|---|---|---|---|---|
| 1 | Sidebar open/close | `#sidebar-toggle` | A (☰, edge swipe) | mobile-nav.js:18,182 | — | – |
| 2 | Layout presets, custom grids, snap/grid/resize/drag/Alt-drag/shake, maximize | toolbar center, titlebar | N (every window forced 100%, chrome hidden) | style.css:1871,1889-1898; window.js:181 | — | – |
| 3 | Saved workspace presets | `#btn-presets` | N (layouts meaningless) | style.css:1871 | — | – |
| 4 | New agent session | `#btn-new-session` | A (dialog 371×717 fits) | mobile-nav.js:19; 19-…png | — | – |
| 5 | Plain terminal | `#btn-terminal` | P (only via dialog Backend=shell or Files "Open Terminal Here") | index.html:172; app.js:504 | "+" long-press sheet: Agent / Terminal / Files / Browser | S |
| 6 | File explorer | `#btn-file-explorer` | P (welcome-screen button only while no window; session menu "Open folder") | app.js:735; session-card.js:145 | same sheet | S |
| 7 | Embedded browser | `#btn-browser`, Ctrl+\ b | M (chat links go to `window.open`) | app.js:517; chat-renderers.js:1881; style.css:1871 | same sheet | S |
| 8 | Desktop (VNC singleton) | `#btn-desktop` | M (toolbar is the only entry) | app.js:518,532 | gear row when `_vncAvailable` | S |
| 9 | Desktop apps launcher/windows | toolbar Apps + gear | A (gear row; noVNC touch) | desktop-app-launcher.js:97; style.css:2179 | — | – |
| 10 | ⚙ quick appearance (theme/size/font/DPI) | gear popover | A (DPI forced 1) | utils.js:876-881 | — | – |
| 11 | All Settings window | gear | P: nav strip 1119 px wide scrolls with no affordance, "Integration" clipped at first paint; desktop-only category "Toolbar & Layout" listed | 26-settings-window.png; run.log | hide desktop-only categories ≤768; wrap nav | S |
| 12 | Customize UI | gear | N | gear-menu.js:51 | — | – |
| 13 | Language / Manage agents / Plugins / Integrations / Usage / Background Work / Outbox / Diagnostics / Report a problem / Restore layout / Backup / Password / Update / Tour / Sign out | gear | A (15 rows measured) | run.log "gear labels"; manage-agents.js:1237; plugins-ui.js:19; jobs-panel.js:534 | — | – |
| 14 | Channels panel | rail + gear | **M** — gear row `when: _railEl`, rail never built on mobile, `focusChannelsPanel` returns false | channels-panel.js:461-467,630; sidebar-rail.js:78 | window fallback exactly like jobs-panel's `openJobsWindow` | M |
| 15 | Ports panel | rail | P (Remote tab 22×22 icon → per-host dialog) | sidebar-mounts.js:653-654 | enlarge icon; gear row | S |
| 16 | System panel (sysinfo) | rail only | M | sidebar-rail.js:120 (no other caller) | gear row "System…" → window | S |
| 17 | Quota pies / usage popup | taskbar | A (nav chip, sheet CSS) | usage-meter.js:45-47; style.css:1881 | — | – |
| 18 | "For you" inbox (agent-filed decisions) | `#taskbar-user-todos` | **M** — only binding is the taskbar button, taskbar `display:none`; only a transient toast reaches the phone | user-todos-panel.js:16; style.css:1872 | badge button in `#mobile-nav` opening the same popup as a sheet | S |
| 19 | Window list popup | `#taskbar-status` | A (title-tap switcher, 57 px rows) | mobile-nav.js:42; 31-…png | — | – |
| 20 | Desktop switch | previews, Ctrl+Alt+←→ | A (tabs when ≥2) | mobile-nav.js:71-93 | — | – |
| 21 | Desktop create/rename/delete/reorder | taskbar previews | M | desktop-manager.js:432,604,650 | "+" tab + long-press rename/delete in switcher | M |
| 22 | Move window to desktop | window menu, Ctrl+\ ] | M | taskbar.js:233 | switcher-row long-press → 'window' menu | S |
| 23 | Minimize/restore | titlebar, taskbar | M, and a minimized window disappears from the switcher with no restore path | mobile-nav.js:65,97; window.js:999 | never minimize ≤768 (or list minimized rows) | S |
| 24 | Close window | titlebar ✕ | A | mobile-nav.js:26 | — | – |
| 25 | Tab groups (merge/split/tab bar) | icon drag, tab bar | N (titlebar hidden, mouse-only drag) | tab-group.js:217; style.css:1898 | — | – |
| 26 | Window context menu (rename/restart/terminate/locate/props/close) | titlebar/taskbar right-click | P — same actions via session-card long-press menu; missing: Move to Desktop | window.js:120; session-card.js:114-154 | title long-press → `menuItems('window')` | S |
| 27 | Move mode | window menu, card | N (pointer only) | session-card.js:702 | — | – |
| 28 | Ctrl+K palette | keyboard | N (not installed; sidebar search) | app.js:324 | — | – |
| 29 | Ctrl+\ command mode, desktop hotkeys | keyboard | N | command-mode.js | — | – |
| 30 | Folders tab (workbench) | sidebar | A; header controls small: tabs 130×26, search 22 px tall, filter/sort/manage 23-28 px, ✕ 28 | 17-…png; run.log | ≥36 px controls ≤768 | S |
| 31 | Task Groups tab | sidebar | P — drill-down list; board bind/unbind drag N/A; task menu via long-press | sidebar-tasks.js:963-1018,991 | — | S |
| 32 | Remote tab (hosts/devices/storage/pair/share) | sidebar | A; action rows 28 px | sidebar.js:1155; 05-…png | taller rows | S |
| 33 | Session card actions (attach/resume/fork/history/star/archive/rename/status/copy/open folder/find/go-to/billing/rescue/props/terminate) | buttons + right-click | A via long-press (menu rows 40 px) | session-card.js:921; utils.js:473; style.css:1990 | — | – |
| 34 | Rename by double-click | card name | A via menu | session-card.js:932 | — | – |
| 35 | Drag session between groups | drag | N | sidebar-render.js | — | – |
| 36 | Chat send / newline | Enter | A (touch: Enter=newline, ▶ send, `chat.touchEnterSends`) | chat-input.js:257 | — | – |
| 37 | Attach / upload / paste image | Ctrl+V, drop | A (attach button ≤768) | chat.css:669 | — | – |
| 38 | Steer (Alt+Enter) + queue strip | hint line | A (bolt button; 35vh strip) | chat.css:552,658 | — | – |
| 39 | Slash commands, permission cards, AskUserQuestion, fork dialog | chat | A (dialogs 95vw) | style.css:1934 | — | – |
| 40 | Status bar dropdowns (model/effort/goal/style/permission) | click | P — bar 21 px, targets 13-14 px tall; dropdown rows 25 px | run.log; chat.css:1142 | min-height 36 ≤768 | S |
| 41 | Chat search | Ctrl+F only | **M** | chat-view.js:813-818 | search button in status/run bar | S |
| 42 | Minimap drag-to-jump + TOC | mouse | P — 8 px wide, `mousedown/mousemove` only; TOC 16×16 | chat-minimap.js:351-378; chat.css:934-977 | 14 px + pointer events | S |
| 43 | Per-message copy / fork / open-in-editor | hover buttons | P — 21×16 px, overlap text on 18/18 messages | 09-chat-window.png; run2.log | long-press message menu on touch | M |
| 44 | Message metadata popup | left-strip right-click | P (long-press on a 4 px strip) | chat.css:1159 | put in the same message menu | S |
| 45 | Link tap → Open/Copy; code-block toolbar | click/hover | A | chat-renderers.js:1766-1781; chat.css:1118 | — | – |
| 46 | Run bar, resume bar, read-only view | chat | A (34×28, 169×29) | chat.css:1266 | — | – |
| 47 | File explorer browse | window | P — bookmarks pane 130/390 px fixed; Size/Modified columns at x 400-620 (off-screen); toolbar buttons 9-15×24 | 28-file-explorer.png; run2.log | ≤768: collapsible bookmarks, name-only column, 36 px toolbar | M |
| 48 | Multi-select, drag-move, drag-upload | Ctrl/Shift click, DnD | M (no modifier keys, no touch drag) | file-explorer.js:313,889-892 | long-press "Select" mode | M |
| 49 | Explorer context ops (rename/delete/copy/cut/paste/archive/props/terminal here) | right-click | A via long-press | file-explorer.js:205,345 | — | – |
| 50 | Upload popover, viewers (PDF/DOCX/XLSX/CSV/hex/eml/media) | window | A (90vw clamp; untested visually) | style.css:1968 | — | – |
| 51 | Code editor (save/format/preview) | Ctrl+S + button | A (Save button exists) | code-editor.js:232 | — | – |
| 52 | Ctrl+G split-pane editor | terminal | P (split pane in 390 px, no mobile branch) | external-editor.js | stack panes ≤768 | S |
| 53 | Terminal: Esc/Tab/Ctrl/arrows/paste/^C… key row | — | A; row 694 px in 390 (📋 and ^C…^\ need scroll, no hint) | 32-terminal.png; run.log | wrap to 2 rows / scroll hint | S |
| 54 | Terminal text selection/copy | mouse drag | M (xterm has no touch selection; `.xterm` excluded from long-press) | utils.js:481 | "Copy last output" key | S |
| 55 | Session props / task detail / task log / workflow viewer / usage / jobs / outbox / integrations windows | menus | A (fullscreen windows) | style.css:1889 | — | – |
| 56 | Theme editor | gear ✎ | P (floating ~50-var panel, no mobile CSS) | theme-editor.css | sheet layout | M |
| 57 | Incident report | gear | A | gear-menu.js:81 | — | – |
| 58 | Stage manager | setting | N | stage-manager.js:50 | — | – |
| 59 | Multi-client layout sync | ws | P (own `autoSaveMobile` slot but remote `layout-sync` applied unguarded — code-read only) | persistence.js:263-267; layout.js:92-99 | ignore desktop-shaped state on mobile | S |

## Counts
Available **31** · Partial **16** · Missing **9** (Channels panel, For-you inbox, browser entry, Desktop/VNC entry, System panel, desktop CRUD, move-to-desktop, minimize/restore, chat search, terminal touch copy, explorer multi-select — several rows carry two items; row-wise 9) · Not applicable **12**.

## Top 10 gaps to close first
1. **For-you inbox on the nav bar** — a badge button in `#mobile-nav` that opens `#user-todos-popup` as the same full-width sheet the usage popup uses (style.css:1881 pattern). The one surface agents use to ask the user is unreachable from a phone.
2. **Channels window fallback** — drop the `when: _railEl` gate; mirror `openJobsWindow`'s "no rail ⇒ window" ladder so the ⚙ row lands somewhere on mobile.
3. **"+" long-press sheet** — Agent session / Terminal / Files / Browser / Desktop (gated by `_vncAvailable`), restoring the four toolbar entry points that vanish with `#toolbar`.
4. **Chat search button** — a magnifier in the status bar (touch face of Ctrl+F, same split as the steer bolt in chat.css:658).
5. **Message long-press menu** — copy / fork / open-in-editor / metadata as one `showContextMenu` on touch; hide the 21×16 hover buttons ≤768 (fixes the overlap defect).
6. **Explorer phone layout** — bookmarks as a collapsible strip, single Name column, 36 px toolbar buttons, long-press "Select" mode for multi-select.
7. **Desktop management in the switcher** — "+" tab, long-press tab → rename/delete, switcher-row long-press → `menuItems('window')` incl. Move to Desktop.
8. **Touch-target pass** — mobile-nav buttons (27×23…36×34), sidebar header (22-28 px), sidebar tabs (26 px), status-bar chips (14 px) to ≥36 px via one `@media (max-width:768px)` block. The ⚙ gear rows (29 px) are OUT OF SCOPE here: the gear menu is being restructured by docs/design-gear-menu-hierarchy.md (its own lane owns gear-menu.js / contributions.js and their row geometry); lifting them from this block would be a second writer on rows that lane is about to reshape.
9. **System/Ports gear rows** — "System…" and "Ports…" rows opening windows, like Usage.
10. **Terminal: copy + key row** — a "Copy screen" key, wrap the key row to two rows (or a fade hint); guard `wm.minimize` on mobile so a synced minimize cannot strand a window.

## Mobile-only defects measured (390×844, DSF 2)
- **Per-message hover buttons overlap text**: 18 `.chat-open-editor-btn` at 21×16 px, all 18 intersect their message's text box (text right edge 378 px). `/tmp/vs-work/mobile-review/09-chat-window.png`, `run2.log`.
- **Status bar unusable as a tap surface**: bar height 21 px; model 80×13, effort 36×14, style 60×14, permission 54×14 (all clickable). Dropdown rows 25 px. `09-chat-window.png`, `11-chat-status-dropdown.png`.
- **File explorer columns off-screen**: header right edges Name 400, Size 480, Modified 620 px on a 390 px viewport; bookmarks pane 130 px; toolbar buttons 9-15 px wide. `28-file-explorer.png`.
- **Settings nav strip**: 1119 px scrollWidth in a 390 px window, no scroll hint; "Integration" partially clipped. `26-settings-window.png`.
- **Gear popover**: 374×784 box, scrollHeight 800 > clientHeight 782 (last row needs scroll); rows 29 px; quick-control ± buttons 24×24. `25-gear-menu.png`.
- **Nav bar**: menu 36×34, gear 27×23, close 29×28, new 29×34 — all under 44 px. `30-empty-workspace.png`.
- **Terminal key row** 694 px scrollWidth vs 390 clientWidth — 📋 paste and ^C/^G/^R/^Z/^D/^\ hidden until scrolled; keys 32 px tall. `32-terminal.png`. (The oversized glyphs in that screenshot are a headless/no-GPU renderer artifact: xterm's model was 46×35 cells at 14 px, cell 8×21.5 — not counted.)
- Sidebar header: search input 22 px tall; filter/manage/sort 23-28 px; tabs 26 px. `17-sidebar-with-card.png`, `05-sidebar-remote.png`.
- New-session dialog fits (371×717, right 380, bottom 781); only the 13×13 worktree checkbox and 26 px footer buttons are small. `19-session-card-longpress-menu.png` (the dialog, opened by the "+ New Session" placeholder card).
