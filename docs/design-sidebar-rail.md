# Sidebar Activity Rail (vscode-style) — design + progress anchor

User decisions (2026-07-16): `sidebar.activityRail` **default ON**; implement
ALL panels at once (no phasing); Diagnostics = launcher icon + error badge
(not a panel).

## Evaluation (what belongs in the sidebar)

Criteria: ① monitorable/persistent state you glance at repeatedly (not one-shot
transactions), ② vertical row/card shape (no wide tables/charts), ③ cross-cuts
the workspace (sessions/machines/resources you act on while working),
④ shallow interactions (toggles/status/click) — deep wizards stay modal but
LAUNCH from panels.

| Surface | Verdict |
|---|---|
| 文件夹 / 任务组 / 远程 (session tabs) | rail items (existing sidebar content) |
| Ports (forwards + published URLs, all machines + local) | **new PANEL** — the vscode PORTS panel analogue; the new-port toast's landing place |
| Plugins (tailscale / frp) | PANEL — status cards + toggles; guided login stays modal |
| Manage Agents | PANEL — backend/login status, accounts + usage donuts; wizards launch modals |
| Diagnostics (telemetry report) | LAUNCHER icon + error-count badge — the report is read-once, stays a window |
| Usage dashboard | stays a window (needs width; taskbar pies cover glancing) |
| Settings | stays a window; rail bottom gear = launcher |
| For-you inbox | later (taskbar badge already serves it) |

## Rail

- ~44px vertical icon strip on the sidebar's OUTER edge (mirrors with
  `sidebar.position`). Top group (content panels): 会话📁 / 任务组🗂 / 远程🖥 /
  端口🔌. Middle (management panels): Agents🤖 / 插件🧩. Bottom (pinned
  launchers): 诊断📊(badge) / 设置⚙.
- Active item: left accent bar (vscode-style) + filled icon; hover = instant
  tooltip (`data-tip`). Click active item again = collapse/expand the sidebar.
- Rail replaces the old 3-tab bar when ON. The old tab bar (and management
  surfaces as ⚙-menu modals) return when `sidebar.activityRail` is OFF —
  the restore path is the SETTING, not customize-mode (rail is out of the
  chrome-zone drag system for v1).
- ⚙-menu entries for Agents/Plugins remain in BOTH modes: rail ON → they
  focus the sidebar panel; OFF → open the modal (unchanged).
- Badges: 任务组 = attention ⚠ count; 远程 = offline machines; 端口 = active
  forwards; 诊断 = recent error count (from /api/telemetry/summary, cached).
- Mobile: rail does NOT render (mobile keeps its two-level nav); panels reach
  mobile via gs-menu entries as full-screen sheets (management ones stay
  modals there).

## Panels

- Content renderers extracted so modal + panel share ONE source:
  - `renderPluginsPanel(container, app)` (from plugins-ui.js `_showPluginsDialog` body)
  - `renderAgentsPanel(container, app)` (from manage-agents.js dialog body)
  - `renderPortsPanel(container, app)` (NEW: machines+local sections; per row:
    detected listeners (detect on expand), active forwards with open/publish/
    unforward, published URLs; live-refresh on `machine-ports-new` /
    `port-forwards-updated`)
- Panel host: sidebar body div swapped per rail selection; session tabs keep
  their existing render paths (`_render()` / `_renderMounts()` etc.).

## State

- `sidebar.activityRail` (boolean, default true, liveApply) — the only new
  setting.
- Active rail item: localStorage `vibespace.railItem` (per device, like the
  current tab), falls back to 'sessions'.

## Progress

- [x] rail shell + 3 existing tabs as rail items + setting + live toggle
- [x] Ports panel (+ machine-ports-new integration)
- [x] Plugins panel extraction
- [x] Agents panel extraction
- [x] Diagnostics launcher + badge; Settings launcher
- [x] badges (tasks/remote/ports)
- [x] i18n zh/ja; CDP smoke (rail toggle + each panel renders)

Shipped 2.176.0 — smoke scripts/test-sidebar-rail.mjs (14 asserts). The
settings echo-revert race it exposed is fixed in settings.js applyRemote.
