# VibeSpace history archive

Content moved OUT of CLAUDE.md (2.333.0 tiering pass) so the auto-loaded operating manual stays lean. Everything here is verbatim history — shipped fixes, superseded approaches. Nothing here is a live instruction; the live invariants stay in CLAUDE.md.

## Ancient bug-fix chronicle (moved out of CLAUDE.md 2.333.0)

One-liner fixes from the 2026-03→2026-07 era whose invariants are stated in the design sections, plus resolved-incident narratives. All shipped and stable; kept verbatim for archaeology.

- Stale buffer message pinned after the newest turns: stream-json stdout events can carry a PLACEHOLDER uuid (`…-000000000001`) while the JSONL record of the SAME message has the real uuid — the JSONL+buffer merge deduped by uuid only, so the buffer copy survived and was appended AFTER the entire history (recomputed identically every attach → "permanent" stuck message). Dedup now also matches `message.id` (`msg_…`, stable across both copies).
- Reconnect: WsManager only notifies state listeners on real TRANSITIONS — while the server is down, each failed 2s retry fired onclose again, appending another "Disconnected from server" marker to every chat window. `_reattach` clamps `_windowEnd` to `_total` (server totals can shift across restarts).
- Focus event spam (`^[[I^[[O`): stripped from terminal input
- Font changes: `clearTextureAtlas()` required
- Ctrl+G screen clearing: editor script named `code` (GUI editor whitelist)
- Session resume duplicates: `broadcastActiveSessions()` includes `claudeSessionId`
- Layout restore race: `_restoring` flag blocks auto-save
- Resumed sessions not showing: lock-first discovery with project dir matching
- Save & Close scroll: `scrollToBottom()` + `focus()` after editor close
- Sidebar resizer: `inside` mode for fixed-position elements
- Phantom cursor: disabled xterm.js cursor blink
- Session discovery inflation: `claimedLockPids` prevents one PID matching multiple JONLs
- Font switching no effect: original hardcoded fonts (Cascadia/SF Mono) not installed → Google Web Fonts + dynamic detection
- Web fonts not in dropdown: `document.fonts.check()` fails for unloaded CSS fonts → force-load via `document.fonts.load()`, then switched to `queryLocalFonts()` + server fallback approach
- Layout restore crash: removed `#theme-select` from HTML but `restoreState` still referenced it → TypeError crashed entire restore flow (grid, windows, sidebar all failed to restore)
- Layout restore wrong positions: `applyPosition` used `windows.values().pop()` to guess which window to position — completely unreliable with async `attachSession`. Fix: `attachSession()` returns `winInfo`, restore applies position directly to it
- Grid state not persisted: `setGrid()` didn't call `_notify()`, so grid changes didn't trigger autoSave
- Custom grid buttons wrapping: `<span>` container didn't participate in flex layout → `display: contents` makes children flatten into parent flex
- Windows don't follow workspace resize: sidebar toggle or browser resize changed workspace but windows kept old pixel positions → `win.gridBounds` (proportional 0-1) + ResizeObserver calls `_reflowWindows()`. All positioning events (grid snap, edge snap, drag, applyLayout, user resize) capture bounds. Works in grid and freeform modes.
- applyLayout bounds not captured: `_captureGridBounds` ran at 10ms but snap animation takes 220ms → window still at old position when captured. Fix: delay to 250ms.
- Terminal bell notification: `terminal.onBell()` → show 🔔 on title when window not focused, clear on focus/click
- File explorer title: shows current path with front-truncation (`…/long/path`) via `wm.setTitle()` on each `navigate()`
- White screen on resume: `dtach -n` loses initial output (no buffering when detached) → switched to `dtach -c` (create+attach). Also added `pty-wrapper.js` inside dtach for persistent buffering.
- Output lost on server restart: server-side buffer only exists in memory → `pty-wrapper.js` runs inside dtach independently, writes buffer to file continuously, survives server restarts
- Session kill leaves orphans: old kill only killed `dtach -a` (attach PTY), not `dtach -n` (session) → now uses `pgrep -f <socketPath>` to find and SIGTERM the dtach session process
- WebUI dtach sessions show as EXTERNAL: `/api/sessions` didn't check if PID was a webui-managed dtach child → pty-wrapper writes `childPid` to metadata file, server reads it directly + `pgrep -P childPid` for claude's forked child. No process tree traversal needed.
- Named layout restore kills sessions: `loadNamed()` used `closeWindow()` which triggers `onClose` → kill. Fix: detach UI only (dispose terminal + remove DOM), don't send kill message. Sessions stay alive for re-attach.
- Dead dtach sockets cause "connection refused": `restoreSessions()` tried to attach to dead sockets. Fix: verify via `fuser`/`pgrep` before attach, auto-clean dead sockets.
- node-pty `posix_spawnp failed` on macOS: prebuilt binary incompatible, `build/Release/spawn-helper` missing. Fix: `npm rebuild node-pty --build-from-source`. Also: commands (dtach, node, env, claude) resolved to full paths at startup via `resolveCmd()` since node-pty's `posix_spawnp` may not find Homebrew paths.
- File explorer path not restored: `_explorerPath` was set via monkey-patch of `navigate()` AFTER constructor, so `_loadHome()`'s navigate used the original unpatched version. Fix: set `winInfo._explorerPath` directly inside `FileExplorer.navigate()`. Also pass `startPath` to constructor to skip `_loadHome()` when restoring.
- Minimize/restore makes terminal narrow: minimizing a window (`display: none`) triggers ResizeObserver → `fit()` → fitAddon computes minimum 2×1 dimensions → sends tiny resize to server → `_effectiveSize` corrupted to {2,1}. On restore, stale `_effectiveSize` constrains terminal to 2 cols. Fix: `fit()` guards against zero-dimension containers (`offsetWidth === 0 || offsetHeight === 0`).
- Waiting blink on buffer restore: `_suppressWaiting` was checked but never assigned, so `suppressWaitingOnRestore` setting never worked. Fix: `app.js` sets `term._suppressWaiting = true` before buffer write, clears it in the write callback. Removed the dead setting.
- defaultStatusFilter always uses schema default: sidebar constructor reads setting synchronously before async settings load completes. Fix: one-shot listener via `settings.on()` that applies the server value once then removes itself.
- Ctrl+G triggers browser "Find in page": `preventDefault()` on Ctrl+G in terminal. Split-pane editor uses `Prec.highest` keymap to override CodeMirror's gotoLine.
- LIVE session not clickable / shows as EXTERNAL: `collectDescendantPids` didn't include root PIDs → replaced with PID-file approach (pty-wrapper writes childPid to metadata).
- Theme contrast — terminal: light theme had 7 invisible ANSI colors (white, brightWhite, brightYellow etc. on #ffffff). All 6 themes' ANSI black was near-invisible on bg. Fixed all.
- WebSocket reconnect wipes globalHandlers: ws.js reconnect logic cleared the `globalHandlers` map, losing persistent handlers registered by other modules. Fix: preserve `globalHandlers` across reconnects, only re-attach sessions.
- isSystemContext filter removed: was incorrectly filtering real user messages in tool-heavy sessions, causing missing messages in chat history. Removed the filter entirely.
- Chat pin-to-bottom fails with content-visibility: single `scrollTop` assignment didn't work because `content-visibility: auto` causes incremental layout. Fix: iterative scroll convergence over 10 rAF frames until stable.
- Clickable path tooltip: replaced text replacement feedback (which corrupted the path) with tooltip-style feedback on click/copy.
- Theme contrast — UI chrome: `--text-dim` was 1.4:1 in Nord, 2.4:1 in Solarized, 2.6:1 in Light. Used for setting descriptions, path labels. Fixed all themes to ≥4.1:1.
- readOnly ChatView `_streamStatus` crash: readOnly mode skips input area construction, so `_streamStatus` is null. `_showTyping`/`_hideTyping` now guard against null `_streamStatus`.
- `_renderElements` multi-block fix: `_onMessage` can append multiple elements (e.g. assistant with both text and tool_use blocks). Old code only detached one element. Fix: count elements before/after, detach all new ones.
- `_pendingToolUses` leak on jumps: `jumpToIndex` and `jumpToBottom` clear the message list but old pending tool uses remained, causing stale tool card matches. Fix: `_pendingToolUses.clear()` on every jump.
- outerHTML marker hack replaced: tool result rendering used `placeholder.outerHTML = html` which detaches the element from DOM, breaking subsequent references. Replaced with proper DOM node replacement.
- Permission resolve loop break: permission resolution could re-process already-resolved permissions in a loop. Added break after first match.
- Server `claudeSessionId` undefined in attach: attach handler accessed `session.claudeSessionId` before it was set for newly created sessions. Fix: fall back to `data.claudeSessionId` from client.
- `execFileSync` TDZ bug: `require('child_process')` declared after usage — `resolveCmd()` and `PERMISSION_MODES` parsing silently failed. Moved to top of server.js.
- Global font family crash: `fontSel.onchange` iterated sessions accessing `term.overrides.fontFamily` which crashes on ChatView instances. Fix: skip sessions without `.overrides`.
- `_closeExternalEditor` ResizeObserver leak: Resizer created in `_openExternalEditor` never destroyed by `_closeExternalEditor`. Fix: store on winInfo, destroy on close.
- Command mode 's' sidebar bypass: direct `classList.toggle('open')` left `sidebar.isOpen` stale. Fix: use `sidebar.toggle()`.
- Subagent watcher leak: `fs.watch` handles on `session.subagentWatchers` not closed on session exit. Fix: iterate and close in `onExit` handler.
- `task_type` not checked in `task_started`: Bash background commands (`local_bash`) were tracked as agent tasks, causing wrong icon and empty View Log. Fix: only track `local_agent`.
- `isStreaming` on refresh: only checked `bufferMessages` which could miss user messages. Fix: check `allMessages` (JSONL + buffer combined).
- Chat attach pagination off-by-one: `totalCount` included buffer messages, causing scroll-up through compacted sessions to skip or duplicate. Fix: `totalCount` uses JSONL count only (consistent with `/api/session-messages`), buffer messages appended as extra after JSONL slice.
- Search fallback: Ctrl+F search in chat now falls back to `/api/active` when session JSONL path unavailable, ensuring search works for live-only sessions.
- IME composing sends message: pressing Enter during IME composition (CJK input) sent incomplete text. Fix: guard with `e.isComposing || e.keyCode === 229` before handling Enter key.
- Scroll-to-bottom button invisible: zero-height wrapper had `width: 0`, button's `position: absolute; right: 16px` positioned it off-screen. Fix: `width: 100%` + `pointer-events: none` on wrapper.
- Linkify breaking markdown `<a>` tags: `_linkify` ran URL/path regex on text inside `<a href="...">URL</a>`, injecting `<span>` inside tags and corrupting HTML. Fix: split HTML into segments via alternation regex, skip `<a>` blocks, linkify inside `<code>` blocks (preserving wrapper), only linkify bare text segments.
- Markdown `<a href>` tags bypassed link handler: `_setupLinkHandler` only matched `.chat-link` spans, so clicking markdown-generated `<a>` tags navigated directly instead of copy. Fix: handler now matches both `.chat-link` and `a[href]`.
- `_linkifyText` path regex matched inside generated HTML attributes: after URL pass created `<span data-href="https://...">`, path regex matched `//domain/path` inside the attribute. Fix: split by HTML tags before path regex pass.
- Subagent View Log missing after refresh: pending Agent tool card had no View Log button on page refresh. Fix: server sends `activeSubagents` (toolUseId → {count}) in attach payload, client restores live status elements.
- Subagent View Log duplicate windows: clicking View Log multiple times opened duplicate read-only ChatViews. Fix: `_subagentViewers` Map tracks open windows by virtualId, focuses existing.
- Completed agent View Log generic title: completed agent button lacked `data-desc` attribute, title showed "Agent" instead of description. Fix: both completed and live agent buttons carry `data-desc`.
- Write/Read tool output truncated: output preview was cut at 500 chars with `...`. Fix: show full content (collapsed by default), consistent with other tools.
- Tool output always wrapped: `.chat-tool-use pre` had `white-space: pre-wrap` hardcoded, making Wrap toggle ineffective. Fix: changed to `pre` (no-wrap by default), toggle works.
- Diff view wrap overlaps prefix: `+`/`-` prefix and text on same line caused overlap when wrapped. Fix: flex layout with fixed prefix column, text wraps independently.
- `_linkifyText` path regex matched inside generated HTML attributes: URL pass created `<span data-href="...">`, path regex matched inside attribute. Fix: tag-split before path pass.
- Pending Agent tool card showed generic label: rendered as `🔧 Agent` instead of `🤖 Agent: {description}`. Fix: detect `block.name === 'Agent'` and use description from input.
- Active subagent count wrong after refresh: `activeSubagents` included completed agents. Fix: filter out agents with `result` message in buffer.
- Subagent View Log opens duplicates: no dedup check. Fix: `_subagentViewers` Map tracks open windows by virtualId, focuses existing.
- `_addOpenInEditorBtn`/`_extractMsgText` used raw Claude message shape (`msg.type`, `msg.message`) after refactor to normalized format (`msg.role`, `msg.content`). Fix: updated to use normalized shape.
- `pendingToolCalls` not flushed on result: interrupted tool calls stayed in pending map forever, risking wrong element mutation on resume. Fix: `_processResult` flushes all pending as error.
- `_onEditMessage` didn't handle `'interrupted'` status: element not re-rendered. Fix: added to status transition condition.
- `_subNormalizers`/`_normalizer` not cleaned up on session exit: listener closures held session alive. Fix: clear on exit/kill.
- Streaming indicator triggered by history load in `_extendTop`/`jumpToIndex`/`jumpToBottom`/`_reattach`: `_loadingHistory` flag was only set in `loadHistory()`. Fix: set in all batch loading paths.
- Duplicate user message: local preview + server echo had different IDs. Fix: removed local preview entirely — MessageManager is single source of truth.
- Running agent View Log missing after refactor: `_renderToolMsg` didn't set `data-tool-id`, so `_onSubagentMessage` couldn't find DOM element. Fix: set `data-tool-id` from `msg.toolCallId`.
- Scroll-up pagination at top edge: `scroll` event stops firing when `scrollTop=0`. Fix: `wheel` listener detects upward intent at top.
- Collapsible long user messages showed "Message (N chars)" with no preview. Fix: show first 120 chars + total length; hide preview on expand via CSS `summary > span { display: none }`.
- Resume briefly showed as external: session discovery only checked `webuiPids` (not yet updated). Fix: also check `activeSessions` by `claudeSessionId` as fallback.
- View-only pagination disabled: `_readOnly` flag blocked scroll-up loading. Fix: `_canPaginate` flag (false for `sub-*` subagent viewers only, true for `view-*` and normal sessions).
- Message timestamps all identical in history: `_create` used `Date.now()` during `convertHistory`. Fix: extract `raw.timestamp` (ISO string) from Claude messages.
- Minimap label not hiding on mouse leave: no `.chat-minimap-label.hidden` CSS rule existed (project has no global `.hidden`). Fix: added component-specific rule.
- Live messages lost when viewing history: `_onCreateMessage` rendered at bottom then `_trimBottom` removed them. Fix: defer live messages when not pinned, show badge count on scroll button.
- Click-to-focus triggered snap: no drag threshold meant mousedown+mouseup on title bar (to focus) could trigger snap behavior. Fix: 5px drag threshold — snap only activates after moving at least 5px.
- Snap loses original size: snapping to grid/edge permanently changed window size with no way to restore. Fix: pre-snap size memory saves `{width, height}` before snap, dragging out of snap restores original dimensions. Persisted in layout as `preSnapBounds`.
- Drag steals mouse events: during drag, iframes and terminals inside windows would capture mouse events. Fix: `pointer-events: none` on `.window-content` during drag.
- Taskbar overflow with many windows: taskbar items overflowed when many windows open. Fix: items use `flex-shrink` + `text-overflow: ellipsis` with `min-width: 0`.
- Draft sync blocked by focus: `StateSync` draft updates skipped textarea when it had focus (to avoid clobbering user input). Fix: always update textarea regardless of focus state for reliable multi-client sync.
- Layout sync ID remap: taskbar buttons captured window ID in closures, breaking after layout restore changed IDs. Fix: buttons reference `winInfo.id` dynamically instead of closure-captured ID.
- PPTX arrow keys stealing chat input: keyboard nav handler on `document` intercepted ArrowLeft/Right globally. Fix: guard `e.target.closest('textarea, input, [contenteditable]')`.
- Desktop switch `display:none` broke chat scroll: `display:none` collapses layout, losing scroll position. Fix: use `visibility:hidden` + `pointer-events:none` instead — preserves all internal state.
- Desktop delete lost hidden windows: non-active desktop windows stayed `visibility:hidden` after reassignment. Fix: show new active desktop's windows before reassigning deleted desktop's windows. Unloaded windows (never visited) restored via `layoutManager.restoreState()`.
- Desktop drag same-desktop drop: mini rect position wasn't applied — window disappeared. Fix: apply mini rect as `gridBounds` + `_applyGridBounds()` for same-desktop drops.
- Layout presets affected other desktops: `applyLayout` iterated all windows. Fix: filter by `_desktopId === activeDesktop` and `!_hiddenByDesktop`.
- Desktop preview empty after refresh: non-active desktops had no live windows. Fix: fall back to `_savedStates` cached data.
- Usage pie border artifact: `border` on `conic-gradient` circle caused bright seams. Fix: replaced with `box-shadow: 0 0 0 1px`.
- Active count always 0: filtered `type==='terminal'` only. Fix: count all windows on active desktop, renamed to "N windows".
- Duplicate sessions on macOS: same JSONL in multiple project dirs (CJK path encoding). Fix: `sessionMap` deduplicates by sessionId, running status wins over stopped.
- Usage not showing on macOS: credentials stored in Keychain not `.credentials.json`. Fix: `security find-generic-password -s "Claude Code-credentials" -a <user> -w` fallback.
- Settings search filter persisted after close/reopen: `_search` not cleared on `_showDialog()`. Fix: reset to `''` on open.
- Permission state lost across refresh/restart: `control_response` not in buffer, `control_request` stripped from raw(), `_processResult` flushed pending permission tools. Fix: record responses in buffer, pass control messages to normalizer, search backwards for flushed tools, auto-resolve completed tools.
- Composite icon invisible on dark themes: `opacity:0.15` fill, wrong `currentColor` inheritance, missing `data-backend` for contrast system. Fix: mode badge approach with `var(--text)` SVG + backend logo mask.
- macOS auto-update build failure: non-login shells lack Homebrew PATH. Fix: prepend `path.dirname(process.execPath)` to child process env.
- Tab merge targeting wrong window: Map iteration order != z-index. Fix: compare all matches by z-index, pick highest.
- Settings text inputs unstyled in dark themes: `.settings-input-text` had no CSS rule. Fix: added themed rule matching other settings controls.
- Settings multi-select layout broken: multi-select controls squeezed label. Fix: `:has(.settings-multi-select)` wraps control to full width below label.
- Interrupt killing session instead of stopping turn: Claude Code newer versions exit on SIGINT. `postInterrupt` always sent SIGINT as a "dual-interrupt" safety net (for bugs #17466, #3455), but in recent versions this kills the whole session and leaves chat read-only. Fix: delay SIGINT by 2s, re-read wrapper meta before firing; if `streaming:false` skip. Sending a new chat message cancels the pending SIGINT.
- Read-only chat windows had no way to continue: user had to close window and resume from sidebar. Fix: all read-only ChatViews (view-history, terminate, exit) show "Resume this session" button in place of input area; click calls `app.resumeSession()` + closes the read-only window. Subagent viewers skip.
- Tab drag-out couldn't merge: `_setupTabDrag`'s onMove only ran snap detection. Fix: also run the merge hit-test and on drop call `addToTabChain`/`createTabChain`.
- Tab drag-out preview confusing over merge zones: the detached window IS the cursor-following preview (no separate ghost), but while hovering a tab zone it was being hidden — users saw nothing. Fix: mirror the titleBar drag pattern exactly — window follows cursor normally in empty space; on entering merge zone, window `display:none` and a small `.tab-ghost` preview appears; on leaving, restore window and resume cursor tracking.
- Icon drag didn't hide source: the dragging icon's source window stayed visible while the ghost followed the cursor. Fix: `visibility:hidden` source on drag threshold crossed, restored on mouseup.
- Tab drag-out window drifted behind others: `_detachFromChain` copied the host's z-index, so the detached window might end up below a focused standalone window. Fix: call `focusWindow(winId)` right after detach.
- HTML preview broken for pages with relative resources: `srcdoc` has no base URL, and `sandbox='allow-scripts'` blocked same-origin loading. Fix: inject `<base href="/api/file/serve/DIR/">` into srcdoc, add `allow-same-origin` to sandbox. New path-based route `GET /api/file/serve/*` maps URL path segments to filesystem paths for proper `<base href>` resolution.
- HTML preview didn't re-render on resize: JS-computed layouts (canvas, calculated dimensions) froze at initial window size. Fix: ResizeObserver on preview body triggers debounced (300ms) srcdoc rewrite.
- Upload progress bar fill invisible: `<span>` fill element was `display:inline`, CSS width/height had no effect. Fix: `display:block`.
- Upload popover had no background: missing `background/border/box-shadow` CSS on `.upload-popover`.
- Popovers/context menus clipped by viewport edge: no bounds checking after render. Fix: `createPopover` uses rAF + `getBoundingClientRect` to clamp all four edges; `showContextMenu` clamps synchronously after items appended. Both render with `visibility:hidden` first then reveal.
- Model discovery failed for OAuth users: `/v1/models` returned 401 for OAuth tokens → switched to `/api/claude_cli/bootstrap`. Later (~2026-06) bootstrap's `additional_model_options` went null AND `/v1/models` started accepting OAuth Bearer → switched back to `/v1/models` for both auth types (new fable tier was missing until then).
- Resume/new session fails on older Claude CLI (`--name` unsupported): Claude Code <2.1.98 doesn't have `--name`, causing `error: unknown option` → exit code 1 → immediate read-only. Fix: parse `claude --help` at startup for `--name` support (`CLAUDE_SUPPORTS_NAME`), propagate to adapter config. `buildSessionArgs` only includes `--name` when supported.
- Dead sessions lost on server restart: layout restore silently dropped windows when dtach processes died. Fix: fallback to `viewSession()` (read-only JSONL history + Resume button). `captureState` now saves `cwd`, `restoreState` fetches `/api/sessions` for stopped session lookup.
- Broken pty stdin false positive: auto-detect killed working pty when API was slow. Buffer-growth check still failed for opus[1m] (10-30s before first token). Fix: wrapper writes `_stdin_ack` to stdout immediately on receiving stdin input; server checks for this ack instead of buffer growth. Immune to model latency.
- Codex thinking messages lost during/after tool calls: `_finalizeStreaming()` cleared reasoning map prematurely; `_processReasoningItem()` created duplicates. Fix: only finalize reasoning on turn-end; finalized items update existing streaming messages in-place.
- Lazy folder rendering: IntersectionObserver ignored `'pending'` state for off-screen folders. Fix: handle both `'pending'` and `'placeholder'`.
- Thinking/streaming state not syncing across clients: attach response `isStreaming` only read wrapper meta (can lag due to debounced writes). Fix: also check normalizer messages for `status==='streaming'`. `_reattach()` now calls `_syncTypingIndicator()` after catch-up.
- Stale streaming messages causing permanent 'responding' indicator: `_finalizeStreaming()` broke at first non-streaming message, leaving interleaved stale ones. Fix: scan to `role==='user'` boundary. `_deriveTypingLabel` also stops at user messages to ignore stale turns. `isStreaming` in attach response used `||` (stale meta overrode normalizer); fixed to prefer normalizer when it has messages.
- Broken pty stdin false positives with old wrappers: new server expected `_stdin_ack` but old running wrappers didn't send it. Fix: fallback to buffer growth check when no ack received.
- Codex resume lost old history: `thread/resume` always creates a new thread ID (fork by design). Server overwrote `backendSessionId` with new ID, losing the old one. Fix: track `forkedFrom` array (chain of old thread IDs). `CodexSessionMessages._ensureParsed` loads the full chain (oldest → newest) + current, merging with fingerprint dedup. Forked-from threads hidden from sidebar to avoid duplicates. Persisted in session metadata, survives server restarts. Supports multi-level forks (A → B → C).
- Model switch stuck on 'thinking...': the `set_model` confirmation echo (`<local-command-stdout>Set model to ...`) is a user record with NO turn behind it — the streaming tracker (server turn-lifecycle block + chat-wrapper meta.streaming) treated every user record as a turn start and waited forever for a result. Both now skip user records whose text starts with `<local-command-` (any local command echo).
- Session history lost after server restart: attach only loaded JSONL when `normalizer.total === 0`, but PTY `processLive` could populate partial buffer data first, so the full JSONL history (e.g. 4367 messages) was skipped (only 63 buffer messages shown). Fix: `_historyLoaded` flag; on first attach, re-create the normalizer and `convertHistory(sm.raw())` from full JSONL + buffer regardless of `processLive` having added partial data.
- Duplicate Codex messages from JSONL/buffer overlap: JSONL records carry `item_id` that buffer records lack, so `JSON.stringify(payload)` fingerprints differed and `mergeCodexRecords` dedup failed. Fix: strip `item_id`/`itemId` before fingerprinting `response_item`/`event_msg` records.
- Terminated (read-only) windows lost their identity (2.71.0, two user reports): the server session vanishes from the live list on kill (discovery re-lists it STOPPED with no webuiId), so (a) the Resume bar's `_getSessionIds` found nothing and `_resumeAndClose` silently no-op'd, and (b) `_notifySidebarFocus` cleared the sidebar highlight instead of highlighting the stopped card. Both now fall back to the identity captured in `winInfo._openSpec` (backend/backendSessionId/cwd, kept fresh by syncSessionIdentity while live) — the highlight fallback also covers view-history windows.
- Resume opening a second window for a terminated conversation: clicking sidebar Resume while a terminated (read-only) window for the same session was still open created a duplicate stuck window. Fix: `resumeSession` closes any window whose `_openSpec.backendSessionId` matches the target before creating the resumed window.
- File explorer Copy Path no-op over HTTP: `navigator.clipboard` is undefined in non-HTTPS contexts, so `navigator.clipboard?.writeText(...)` short-circuited to `undefined` and the `.catch` fallback never ran. Fix: use shared `copyText()` utility (handles the `execCommand` fallback).
- AskUserQuestion unanswerable in chat: rendered as a generic tool card with raw JSON. Fix: normalizer marks `permission.kind='user_input'` + `questions`; renderer shows interactive paginated questionnaire; response uses `approved:true` + `toolInput.answers` keyed by question text.
- `/goal` not working in stream-json mode (CLI ≤2.1.139): slash commands were terminal-only, so the wrapper simulated auto-continue after `result`. SUPERSEDED 2026-06-09: CLI ~2.1.1xx added `supportsNonInteractive` to `/goal` — the wrapper now forwards the native command, the Stop hook drives continuation/met-detection, and the server tails the JSONL for `goal_status` attachments (JSONL-only, not on stdout). Codex was native from the start (`thread/goal/set` RPC).
- Codex goal state wrong/zero on attach: tried to reconstruct from JSONL scan (format changed across versions: `<untrusted_objective>`→`<objective>`, `role:developer`→`role:user`) and wrapper meta with race conditions. Fix: query `thread/goal/get` (authoritative; camelCase `timeUsedSeconds`/`tokensUsed`) on startup + after each turn; wrapper meta is single source of truth; read goal fields in `restoreSessions` (not just attach, since `_goal` set during restore skipped the re-read).
- Codex `apply_patch` Update cards expanded by default: `renderPatchDiff` had `open` on the diff `<details>`. Fix: removed `open` to collapse like other tool cards.
- Codex resume self-referencing fork chain: newer codex keeps the SAME thread id on resume, but the spawn-time env chain appended the resume target unconditionally → `forked_from` contained the thread itself → discovery's merged-thread suppression hid the session from the list after termination. Wrapper now filters its own threadId from the emitted chain.

## tmux mouse-handling failures (pre-dtach, do NOT retry)

**Previous tmux failures** (for reference, do NOT retry):
1. ❌ `mouse off` + strip sequences → no scroll
2. ❌ `mouse off` + wheel→arrow keys → arrows = input history, not scroll
3. ❌ `mouse on` + `send-keys -M` → breaks selection
4. ❌ Strip `\e[?1000h` client-side → same as mouse off
5. ❌ `mouse on` + conditional binding → Claude doesn't set mouse_any_flag
6. ❌ `mouse on` + various unbind combos → selection still broken


## Usage-monitoring approach history (§9)

**Failed approaches:**
- ❌ Parse statusline output: user-customizable, can't guarantee format
- ❌ Statusline hook wrapper (`--settings`): intrusive, doesn't work for non-WebUI sessions
- ❌ macOS `security unlock-keychain`: works but requires empty keychain password, invasive
- ❌ Billable haiku `/v1/messages` + response headers: worked, but consumed quota to measure quota AND needed a fresh token → drove the token refresh that rotates + breaks the macOS Keychain (#20). Superseded 2026-06-22.
- ❌ Self-refreshing the OAuth token (`platform.claude.com/v1/oauth/token`): rotates Anthropic's refresh token out from under Claude Code → forced re-login on macOS. Removed.
- ✅ `GET /api/oauth/usage` (non-billable) + read-only token + 429 backoff: current approach. Earlier rejected for "aggressive rate limiting" — but that was *burst* polling; one request per ~5 min sustains fine (verified: 14/14 over 30 min at 2-min cadence, zero token rotation).
- ✅ `/v1/models` with OAuth Bearer: model discovery source (both auth types), now also read-only token.



## Superseded: OAuth token auto-refresh (REMOVED — see CLAUDE.md §9)

This fix was itself reverted: self-refreshing rotates the refresh token out from under the CLI (macOS forced-relogin). Kept only as history:

- OAuth token expired silently: server cached only the accessToken with no refresh. Fix: store full creds (accessToken + refreshToken + expiresAt), auto-refresh via `platform.claude.com/v1/oauth/token` when expired. `getOAuthToken(callback)` async API with refresh, sync fallback for non-critical paths.
