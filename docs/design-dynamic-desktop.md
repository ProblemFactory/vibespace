# Design: Dynamic Desktop (动态桌面 / Stage view)

Status: APPROVED design, pending implementation. Decisions settled with the user 2026-07-12
(chat session 9f4cd444); reference implementation studied: walter's fork
`PHIIISH1988/claude-code-webui` branch `feat/task-centric` (`src/lib/task-manager.js`) —
DIFFERENT model (task-driven, fixed 2×N grid + pinned Files window), so we implement the
user's session-driven spec fresh and port walter's defensive mechanisms (§6).

## 1. Concept

A per-session workspace stage. One special desktop — the **dynamic desktop** — sits at the
LEFT of the desktop strip, visually separated. It is a **VIEW**, not an owner: any window can
be a member of the dynamic view AND its normal home desktop at the same time (user decision:
"相当于一个特殊的view"). Since only one desktop is visible per tab at any moment, this needs
no DOM duplication — **one window object, two stored geometries** (home `gridBounds` + stage
bounds), applied on desktop entry/exit. Taskbar previews draw the window's rect in BOTH the
home-desktop preview and the dynamic preview.

Settings toggle `desktop.dynamicEnabled` (boolean, default **false**). Off = feature invisible.

## 2. The stage slot (占位假窗口)

- Exactly ONE slot (v1). Data model uses an array (`slots: [...]`) for future multi-slot,
  but v1 renders/uses only `slots[0]`. (User: two slots have an unsolved focus-model question.)
- On first entry the slot renders as a placeholder pseudo-window at the top-left grid cell.
  It drags/resizes/spans grid cells exactly like a normal window (reuse window.js mechanics
  on a `.window.stage-placeholder` element; excluded from sessions/layout capture as a window —
  its geometry IS the slot record).
- **Slot geometry is shared state** (user decision ③): while a hero occupies the slot,
  moving/resizing the hero WRITES the slot record. The next hero inherits it.
- Sessions cannot be *placed into* the dynamic desktop directly (no drag-into from sidebar,
  no create-on); they only materialize via §3.

## 3. Materialization (hero switching)

While the dynamic desktop is active, ANY action that would switch to / open a session window
(sidebar card click, taskbar click, Ctrl+K palette, find/goto, inbox jump, notification click,
session create, resume) is intercepted at the app focus funnel and instead:

1. The session's window becomes the **hero**: shown on the stage at the slot geometry.
   If the window also lives on a normal desktop, it keeps that membership (view model) —
   its home gridBounds are untouched.
2. The previous hero's workspace (hero + bound aux windows) is deactivated per §5.
3. The new hero's recorded workspace is restored: every bound window is re-shown (if alive)
   or replayed from its openSpec + stage geometry (if closed), alongside the hero.

Closing the hero window returns the stage to the placeholder (its aux set is deactivated and
recorded). On a NORMAL desktop all behaviors are unchanged — interception applies only while
the dynamic desktop is active.

## 4. Workspace binding (per-hero aux windows)

- While a hero is active on the stage, every window CREATED (any type — user decision ⑦:
  file explorers, viewers, editors, browsers, task windows, …) is tagged as bound to that
  hero's workspace. Bind record = `{ openSpec, stageBounds }`, keyed by the hero's stable
  session key `backend:backendSessionId` — the same replay machinery as layout restore
  (`replayOpenSpec` + `_applyGridBounds`). Transient windows without an openSpec (Settings)
  simply can't bind — acceptable.
- Closing a bound window while its hero is active = unbind (removed from the set).
- Dragging a bound window onto a normal-desktop preview = unbind + move there (it becomes a
  plain window of that desktop).
- Windows opened while the stage shows the PLACEHOLDER (no hero) are transient: not bound,
  not retained across a materialization (user decision ⑤ "这些窗口都不保留") — they are
  closed when a hero materializes or the user leaves the dynamic desktop.

## 5. Deactivation policy (hide vs close)

LRU keep-alive of the last **N workspaces** (setting `desktop.stageKeepAlive`, default 3):

- Within LRU: windows hidden via the established `visibility:hidden` pattern (scroll/terminal/
  WS state preserved) — instant switch-back.
- Beyond LRU: bound windows are serialized to their bind records and CLOSED. Session hero
  windows follow walter's hard-won rule (§6.4): **never close a session window that shows any
  in-flight signal** — streaming flag, active background tasks, active /goal, pending
  permission, non-empty draft — re-checked AT CLOSE TIME, never from cached state. A busy
  hero stays hidden regardless of LRU. Windows that ALSO live on a normal desktop are never
  closed by the stage — they just lose stage visibility.
- Active hero identity is **per-tab** (like `_activeId`); bind records + slot geometry are
  global (layouts.json + layout-sync). Close decisions act on shared windows → only the
  LRU/close pass runs them, guarded by the busy re-check.

## 6. Ported defensive mechanisms (walter's field lessons — do not skip)

1. **Serialize hero switches** (lock-and-queue, latest-wins): rapid A→B clicks running two
   async switch pipelines concurrently corrupted shared state ("white screen, toolbar gone").
   One in-flight switch; queued taskId/sessionKey holds ONLY the latest.
2. **Spawn/replay dedup** (`_spawningKeys` + refresh/spawn split): a chat window exists long
   before `openSpec.backendSessionId` is filled, so a reconcile pass re-running spawn creates
   duplicates (walter: 9 clones of one chat). Track in-flight spawn keys with a 15s hard
   timeout; reconcile passes must never spawn.
3. **`_inProgrammaticSwitch` guard**: desktop-switch hooks must distinguish user switches from
   programmatic ones or they feed back into the switch pipeline.
4. **Idle-close semantics**: default generous (30min-class), busy-signals re-checked at fire
   time (see §5). The original 30s default killed the previous session on every hop and
   swallowed messages sent into dead sessions.
5. Membership flags are SEPARATE booleans (`_hiddenByStage` vs `_hiddenByDesktop` analog to
   walter's `_hiddenByTask`) — never overload `win._desktopId` with a second meaning.

## 7. Persistence & sync

`layouts.json` gains `stage: { slot: {gridBounds}, workspaces: { '<backend:sid>': [ {openSpec,
stageBounds}, … ] }, lru: [keys…] }`, broadcast via the existing layout-sync (seq/user-dirty
guards apply). Per-tab active hero is NOT synced (mirrors per-tab desktop `_activeId`).
Restore on boot: stage records replay lazily on first entry, not at startup.

## 8. Exclusions / v1 boundaries

- Mobile: feature hidden (`isMobile`).
- Hero window cannot join a tab group while on stage; aux windows may group among themselves
  (chains persist via existing layout capture).
- Dynamic desktop preview: leftmost, separated by a divider, distinct accent border; shows
  placeholder outline when empty.
- Ctrl+Alt+Left from the leftmost normal desktop enters the dynamic desktop.

## 9. UI naming

"动态桌面" in zh; English label "Stage". Preview tooltip explains: "Sessions materialize here
with their own workspace of helper windows."

---

## Implementation progress (update per phase — post-compact continuation anchor)

- [x] **Phase A+B (committed)**: `src/lib/stage-manager.js` (StageManager, STAGE_ID='__stage__');
  SyncStore 'stage' registered in server.js (data/stage-sync.json; keys: slot / ws:<key> / lru);
  settings `desktop.dynamicEnabled` + `desktop.stageKeepAlive`; app.js instantiates `this.stage`;
  window.js hooks — focusWindow interception (`_stageBypass` opt), `_captureGridBounds` →
  `stage.onGeometryCaptured` (slot persistence), closeWindow → `stage.onWindowClosed`;
  layout.js `_doAutoSave` suppressed while stage active; desktop-manager `_renderSwitcher`
  prepends the separated Stage preview (slot outline + live rects, digest includes stage state),
  normal-preview click while staged routes through `stage.leave(deskId)`; placeholder is a REAL
  wm window (type 'stage-placeholder', dashed chrome, hint text, TYPE_ICONS entry); CSS + zh/ja.
  Enter/leave reuse dm primitives (capture→hide→retag activeId→show/replay); hero borrow keeps
  `_stageHomeBounds` and restores on deactivation.
- [ ] **Phase C**: workspace binding — tag windows created while a hero is active
  (hook wm.createWindow or app-level create paths → `stage.onWindowCreated(win)`), record
  `{openSpec, stageBounds}` sets into SyncStore `ws:<heroKey>` on deactivation, replay on
  materialization (walter dedup `_replayingKeys` ready in the class), unbind on close/drag-out,
  transient cleanup for empty-stage windows, `_sessionKeyFor` backfill once backendSessionId
  arrives (syncSessionIdentity hook).
- [ ] **Phase D**: LRU keep-alive (setting exists) + busy re-check at close time (streaming/
  bg tasks/goal/permission/draft — see chatStatus/taskState surfaces), preview polish,
  Ctrl+Alt+Left entry from leftmost desktop, CLAUDE.md + docs/window-manager.md sections,
  CHANGELOG + version bump, e2e smoke via headless where possible.

Known Phase A+B caveats to revisit: `shouldIntercept` has a dead `_hiddenByStage === undefined
&& false` clause (harmless, clean up); placeholder close button should be disabled; leave()
doesn't yet record the active workspace (Phase C); enter() while `dm._restoring` silently bails.
