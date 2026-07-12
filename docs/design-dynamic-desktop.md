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
- ~~Dragging a bound window onto a normal-desktop preview = unbind + move there~~ SUPERSEDED
  2.112.4 (user directive): window drags between the stage and normal desktops are blocked in
  BOTH directions — stage-view windows (placeholder/hero/aux/stage-created) never drag out to
  a desktop preview, and the stage preview is not a drop target. `stage.dragToDesktopBlocked(win)`
  is the single predicate (window.js hover detection + dm.moveWindowToDesktop guard, which also
  covers the right-click "Move to desktop" menu path). Real report behind it: a dragged
  placeholder escaped onto a normal desktop and stuck there (further defended by `healStray()`
  + a captureState exclusion so the placeholder can never enter a desktop record).
- Windows opened while the stage shows the PLACEHOLDER (no hero) are transient: not bound,
  not retained across a materialization (user decision ⑤ "这些窗口都不保留") — they are
  closed when a hero materializes or the user leaves the dynamic desktop.

## 4b. Restoration conditions per window class (user probe: "zip 里打开的 PDF?")

The HIDDEN (LRU) tier restores everything for free. The REPLAY tier depends on what the
openSpec points at — classified at replay time:

| class | examples | replay condition | handling |
|---|---|---|---|
| durable | file viewer/editor on a real path, explorer dir, http(s) browser, task/props/usage windows, subagent viewers | target still exists (host reachable) | pre-validated via /api/file/info; probe failure (offline host) still ATTEMPTS the replay |
| derived | **PDF opened from inside a zip** (extract-entry temp file) | temp gone but the recipe survives | openSpec carries `via: {kind:'archive-entry', archive, entry}` (stamped at open); replay re-extracts a fresh temp and patches the path |
| volatile | blob:/data: browser pages (chat html preview, diagnostics), temp files with no recipe, Ctrl+G editor tmp | unrecoverable once closed | NEVER LRU-evicted (kept hidden-alive); if already gone at replay → skipped, one summary toast "{n} windows could not be restored" — never an open-but-broken viewer |

Deleted/moved real files degrade to skip+toast too (no recipe). Remote-host files ride the
same probe with `?host=`.

- 2026-07-12 (2.112.6) SHARED HERO (user directive, supersedes the v1 "hero is per-tab"
  decision): the 挂机/walk-over scenario — a device left idle on the stage must mirror what the
  user does on another device, so walking over shows the CURRENT workspace. The active hero is
  SHARED state in the stage store ('hero' → {key, openSpec}): `_publishHero` at materialization
  (value-compared; skipped while `_applyingRemoteHero`), `_followRemoteHero` on remote ops
  (150ms debounce, deferred while the local pointer is down) and at `enter()` (walk-over
  adoption — the shared hero WINS over the tab's stale local hero); hero close publishes a
  clear → placeholder everywhere. Which tab is staged at all stays per-tab. Follow path: find a
  local window by session key, else replay the published openSpec (identity adoption then
  converges the fresh window onto the desktop record).
- 2026-07-12 (2.112.6) harness-caught: `closeWindow`'s auto-focus-next skipped
  `_hiddenByDesktop` but NOT `_hiddenByStage` — closing the hero focused a stage-HIDDEN
  previous hero → re-materialized + re-published it, yanking every staged client back.
  Stage-hidden windows are now invisible to ALL four visible-window filters in window.js
  (close auto-focus, applyLayout, overlap switcher, overlap indicators). HARNESS LESSON №2:
  leftover SyncStore state between suite runs masks/aliases failures — wipe stage-sync.json +
  layouts.json between suites; and a find()-then-focus test step needs a create fallback or it
  silently no-ops.

Full audit of every replayOpenSpec action (2026-07-12, user push "别止步于此"):

| action | class | replay risk | handling |
|---|---|---|---|
| attachSession | hero (never aux) | stale serverId / dead session | existing re-resolution + viewSession fallback ✓ |
| openFileExplorer | durable | dir deleted / host offline | opens + navigates; graceful in-window error, user re-navigates (live CURRENT path refreshed into the spec at record time) |
| openFile | durable/derived | temp gone / file deleted | file/info probe; archive-entry recipe re-extracts; else skip+toast |
| openEditor | durable | file deleted; **unsaved edits** | same probe+skip; `winInfo._editorDirty()` (new — CodeEditor.modified exposed) makes dirty editors VOLATILE: never LRU-evicted |
| openBrowser | durable/volatile | blob:/data: dead after session | http(s) replays (page state lost — inherent); blob/data skip+toast, never evicted |
| openDesktop | durable | VNC server restarted | reconnect handles; desktop session persists server-side ✓ |
| openTaskDetail / openTaskLog | durable | task group DELETED | pre-checked against sidebar._tasks → skip (the window would open then self-close on tasks-updated) |
| openUsage / openSettings | durable | none (server data / pure UI) | ✓ |
| openSessionProps | durable | session gone | window renders from live lists, degrades to stale info — acceptable |
| openWorkflowDetail | durable | wf snapshot/journal cleaned | GET /api/workflow probe → 404 skips |
| attachTmuxSession | hero-class (terminal → never aux) | tmux target gone | attach errors into existing handling; N/A for workspaces |
| viewSession / viewSubagent | hero-class (type chat → never aux) | JSONL gone | N/A for workspaces; NOTE: focusing a read-only view on stage materializes it as hero (harmless — a read-only hero) |
| Ctrl+G editor / Settings-style transient | unbindable (no openSpec) | — | hide/show only; never recorded (correct: they're turn-scoped) |

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

## 5b. User addenda (2026-07-12, mid-implementation)

- **Incoming hero sits at the BOTTOM of the stage z-order**: the shared slot may have been
  moved/resized since a workspace was recorded, so the materializing hero must not cover that
  workspace's aux windows — the user rearranges from there. Input focus stays on the hero.
- **Aux state restoration is maximal**: the LRU-hidden tier preserves everything for free
  (visibility:hidden). The REPLAY tier additionally records per-window `extras` (a generic
  walker captures every scrollable descendant's scroll offsets, index-matched on restore) and
  refreshes live openSpec fields at record time (e.g. the file explorer's CURRENT path, not its
  creation path). Deep per-type state (wrap toggles etc.) rides the hidden tier; replay-tier
  fidelity can grow per-type as needed.

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
- [x] **Phase C (committed)**: workspace binding — tag windows created while a hero is active
  DONE: wm.createWindow tail → `stage.onWindowCreated` (session-type windows never bind — they
  swap in as hero; empty-stage windows tagged `_stageTransient`); `_recordActiveWorkspace()`
  serializes `{openSpec, stageBounds}` per aux into `ws:<key>` at every switch/leave/hero-close,
  with heroKey RE-DERIVED AT RECORD TIME (backendSessionId arrives late); `_restoreWorkspace()`
  shows live hidden members + replays missing via openSpec with `_replayingKeys` dedup (15s) and
  hides stale late-landing replays; `_sweepTransient()` closes empty-stage windows on
  materialize/leave; aux close → unbind + re-record; dm.moveWindowToDesktop → `stage.unbind`.
- [x] **Phase D (committed)**: LRU eviction `_enforceLru` — v1 CONSERVATIVE: only hidden AUX
  windows beyond keep-alive N are closed (records replay them); session windows are NEVER
  closed by the stage (strictly avoids walter's killed-session class). Ctrl+Alt+Left enters
  from the leftmost desktop / Right leaves (command-mode.js). Placeholder window controls
  hidden via CSS. Hero-at-bottom z placement + extras capture/restore (addenda §5b).
  SMOKE-VERIFIED via CDP-driven headless Chrome on an isolated worktree instance (12/12):
  enter/placeholder/materialize-at-slot/aux-bind/swap-hides-set/hero-close-returns-placeholder/
  leave-restores-desktop; caught+fixed: onWindowCreated must check win.type==='stage-placeholder'
  (the _isStagePlaceholder flag is set AFTER createWindow's tail hook ran — the placeholder got
  tagged transient and swept on first materialization).

Known Phase A+B caveats to revisit: `shouldIntercept` has a dead `_hiddenByStage === undefined
&& false` clause (harmless, clean up); placeholder close button should be disabled; leave()
doesn't yet record the active workspace (Phase C); enter() while `dm._restoring` silently bails.

### Field bug log

- 2026-07-12 "placeholder never moves": dragging worked; persistence didn't. `stage.init()` ran
  before `initStateSync()` → the 'stage' SyncStore was never registered → `StateSync.set()`
  SILENTLY DROPS writes for unknown stores → slotBounds() always returned the default top-left.
  Fixed by init ordering + a lazy `_sync()` guard that registers the store on any access.
  LESSON: any new SyncStore consumer must init AFTER initStateSync, and StateSync's silent-drop
  semantics hide this class of bug — guard in the consumer.
- 2026-07-12 (2.112.4) "回到普通桌面尺寸不还原": `leave()` hid the hero with `_hideStage` but
  never returned the borrowed geometry — the window came back to its normal desktop at the
  SLOT size. Fix: leave()/`_deactivateHero()` HAND THE HERO BACK to the desktop system —
  restore `_stageHomeBounds` → gridBounds, clear `_isStageHero`/`_onStage` (off-stage moves
  must edit HOME bounds, not the slot), then `dm._hideWin`/target-show it like any desktop
  window (a bare `_hideStage` left it invisible on its home desktop: the desktop show loops
  only clear `_hiddenByDesktop`). `enter()` re-borrows via the still-set `_heroWinId` (fresh
  home-bounds snapshot each time, so home moves made while off-stage are kept). Stage-created
  heroes (`_desktopId === STAGE_ID`) have no home and stay stage-hidden. `_materializeInner`
  clears `_hiddenByDesktop` (a stale flag excluded the hero from `_isStageVisible`).
- 2026-07-12 (2.112.4) "动态桌面里的 grid 配置不保存": desktop autosave is suppressed while
  staged, so the stage grid had NO persistence path. First fix (gate inside `_doAutoSave`)
  still lost it — `scheduleAutoSave`'s `_restoring` gates dropped the call before the stage
  gate ever ran (smoke-caught). The interception must live at the TOP of `scheduleAutoSave`:
  `if (stage.isActive) { stage.onStageLayoutChanged(); return; }` (content-compared, cheap,
  no debounce needed). Grid stored in the stage store key 'grid'; `enter()` applies it,
  `leave()` applies the target desktop's own grid as before.
- 2026-07-12 (2.112.4) liveApply: `desktop.dynamicEnabled` needed a page refresh — the
  switcher digest already included `stage.enabled` but nothing kicked `_renderSwitcher()` on
  the settings change. `stage.init()` registers a settings listener (render kick; disabling
  while staged leaves first). Same class in the sidebar: `sessionCard.*` settings are read at
  CARD BUILD time — sidebar constructor now re-renders on change (schema flipped to
  liveApply: true). LESSON: a `liveApply: true` schema flag is a CLAIM — every setting read
  at render/build time needs an explicit change listener that re-renders its surface.
- 2026-07-12 (2.112.5) MULTI-CLIENT DATA LOSS "窗口A两个客户端都看不到了": materializing a
  session with NO local window created a stage-owned hero under a FRESH winId; leaving to the
  desktop that (per other clients' records) held that session's window replayed nothing
  (attachSession same-session dedup) → the post-leave capture missed the recorded winId → the
  broadcast CLOSED the window on every client. Fix = IDENTITY ADOPTION: `_adoptDesktopIdentity`
  scans all desktops' saved states for the session and converges — `wm.rekeyWindow` onto the
  recorded winId + home desktop + gridBounds + isMaximized (retried at leave/_deactivateHero
  for late-arriving session ids, e.g. resume). TWO structural gotchas: (a) createWindow's tail
  focus runs materialization BEFORE app.js's desktop-tag wrapper assigns _desktopId — the
  adoption gate must accept `!win._desktopId`, and the wrapper must NOT clobber an id assigned
  during creation; (b) maximized heroes: borrow un-maximizes onto the slot, hand-back applies
  home element geometry BEFORE re-maximizing so toggleMaximize records HOME pixels as
  prevBounds. Verified with a two-CDP-client harness (10/10) + single-client regression (11/11).
  HARNESS LESSONS: background tabs throttle the 500ms autosave timer (launch chrome with
  --disable-background-timer-throttling …); broadcasts need REAL input per client (_userDirty).
- 2026-07-12 (2.112.5) live sync layer (user: "动态桌面完全没做多客户端同步"): stage store ops
  now MIRROR live — StateSync events fire for remote ops only (server excludes sender), so
  `init()` subscribes a 'stage'/'*' listener: 'slot' re-applies to the local slot occupant,
  'grid' re-applies setGrid, 'ws:<key>' reconciles the ACTIVE hero's workspace (400ms debounce;
  `_reconcileWorkspace` = _restoreWorkspace + close local aux missing from the record, dirty
  editors exempt). Recording is no longer switch/leave-only: `_scheduleRecord` (500ms) fires on
  aux create/move. Which VIEW a tab shows (staged or not, which hero) stays PER-TAB by design —
  same philosophy as the per-tab active desktop.
