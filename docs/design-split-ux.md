# Side-by-side UX: the owner's three problems, the mockups, the trimmed set

**Date** 2026-09-23 · **lane** `lane-split` (from master 348aa226 = 2.369.160; the lane's version literal = 2.369.162) · **Chinese original** [design-split-ux.zh.md](design-split-ux.zh.md) (authoritative where they differ) · **mockups** `docs/mockups/split-ux/` · **reproduction** `scripts/dbg-split-gesture.mjs`

> **One sentence.** Side by side is no longer a side effect of any drag: a window drag = move / snap, and the tab merge (icon / tab-bar drop) stays THE ONLY exception to ordinary drag+snap, untouched; side by side is an EXPLICIT second step after a merge — a ⫿ button on the tab strip (it pulses once right after a merge, with a 5 s one-click toast), "Beside X" in the window menu, `v` in command mode. In split mode the SAME button becomes the badge (click: Unsplit / Swap), the tabs render in VISUAL order (the left pane's tab on the left) with a small divider-mirroring glyph between them and each pane's tab underlined in its owner colour; every split entry can be undone for 5 s. The phone (≤ 768 px) is unchanged.

---

## 0. The owner's words and the defects they name

> "我发现你这个side by side交互也有点问题，第一，我本来是想拖动窗口到左侧，结果莫名其妙进入了side by side模式。第二 side by side模式下标题栏的标签位置不符合直觉。第三 side by side模式和普通tabbed模式不太好区分。而且拖动的时候我往左拖却让窗口出现在了右侧很反直觉。你这个UX很不好，建议思考下UX改进"

> Second directive (overrides any drag-time idea): "关于并排的设计，我觉得尽量不要搞太多拖动时候的复杂逻辑，除非很直观，不然只会让人感到困惑。我的理解是也许可以保持tab逻辑是唯一正常拖动吸附机制的例外，然后tab合并后在增加切换成side by side的按钮，当然这样会导致side by side需要两步，你可以斟酌一下怎样的UX是最好的，不行的话也可以在线调研一下。" — keep no complex drag-time logic; the tab merge stays the one exception to drag+snap; add a button after the merge; two steps are accepted.

The screenshot: one title bar with two tabs ("Fi…", "Vi…", each with a pool chip), two panes below, the right one active; **nothing in the chrome says "split"**.

| # | What the owner saw | Defect |
|---|---|---|
| P1 | Meant to drag a window to the left, entered side by side | **the entry is a drag side effect** |
| P2 | The tab positions in split mode defy intuition | **tab order ≠ pane order** |
| P3 | Split mode and tabbed mode are hard to tell apart | **no split mark** |
| P4 | Dragged LEFT, the window landed on the RIGHT | **the drop half decides the side, not the drag direction** |

---

## 1. Reproduction (headless Chrome, a scratch server, real title-bar drags)

`scripts/dbg-split-gesture.mjs`: a worktree server + a fake `claude` (`CLAUDE_CMD`) + two chat sessions (Alpha / Bravo); A REALLY snapped to the left edge (`wm._applySnap('left')`, so its title bar covers the workspace's 30 px snap band), B free on the right (left 700, top 80, 480×360); each gesture = `Input.dispatchMouseEvent` pressing B's title bar (the title span's centre) → 14 moves → release. 1280×900, the 2.369.160 code.

| Gesture | Pointer path (viewport px) | The release frame | Result |
|---|---|---|---|
| **G1** "drag to the left": B dragged LEFT, released on the RIGHT half of A's title bar | (947,138) → (537,62), **Δx = −409** | snap indicator SHOWING (the top band), split mark `R` | `layout=split`, `pair=[A,B]`: **B on the RIGHT** (B content left 357, A content left 49). = P1 + P4 |
| **G2** "drag to the left edge": B dragged to x = workspace left + 12 (inside the snap band), pointer on A's title bar | (947,138) → (56,62), Δx = −890 | snap indicator SHOWING (the left band), split mark `L` | `layout=split`, `pair=[B,A]` (B left); but `tabs=[A,B]`, **strip order [A,B] ≠ pane order [B,A]**. = P1 (the snap shadowed) + P2 |
| **G3** control: B dragged LEFT, released outside A (below it, into the bottom snap band) | (947,138) → (415,892), Δx = −531 | snap indicator showing, split mark empty | no chain, B `_isSnapped=true` (the ordinary snap) |

Chrome facts after G1 (P2 + P3): both tabs are `split-member`; the ONLY split mark is `.tab-label::before`'s `"⫿ "` (9 px, opacity .55; on this box's Noto fonts it renders as a tofu box — `docs/mockups/split-ux/current.png`); `.tab-split-glyph / .win-split-badge / .tab-split-btn` elements: **0**; the divider is 6 px with `background = rgba(255,255,255,0.07)` = **the window border colour**; the host title bar's text = `Alpha — … Alpha — … ✕ Bravo`. **Drop-zone census**: of A's 610 px title bar, **489 px (80 %) is a split drop zone** (everything between the icon stack and the controls).

---

## 2. The per-point table

| Point | What the owner saw | Why (file:function) | The minimal change | Cost | Risk | Do now? |
|---|---|---|---|---|---|---|
| **P1 entry** | dragging a window left entered a split | `tab-group.js:_detectSplitDropTarget` (345) arms a split drop on EVERY frame of a title-bar drag (`window.js:_setupDrag` 384) and a tab drag (`tab-group.js:_setupTabDrag` 568) whenever the pointer is over another window's title bar outside the icon / tabs / controls — no hover intent, no modifier, 80 % of the bar; on release the split branch (`window.js` 573) runs BEFORE the snap (607), so a target sitting at an edge SHADOWS the snap (G2: the indicator lit, a split happened) | **delete the whole drag-time split zone** (`_detectSplitDropTarget`, `_markSplitDrop`, `.tab-split-drop-left/right`, both drop branches, `chain-layout.dropSide`); add no body zone; the entry moves to the explicit button / menu / command after a merge (§4 R1) | low (deletion + one button) | low: `createWindow({intoChain})` and the live view's "Snap beside" never used the zone — unchanged | **yes** |
| **P2 tab order** | the tabs sat wrong in split mode | `tab-group.js:_renderTabBar` (388) draws tabs in CHAIN order (host first); `chain-layout.pairFor` can put the guest LEFT ⇒ pane left, tab right (G2) | render split mode in VISUAL order: `pair[0]`, the glyph, `pair[1]`, the rest; PURE `visualTabOrder(chain)` decides in ONE place (§4 R3, variant A) | low | low: `tabs` / `active` keep their meaning to the byte — only the render order changes | **yes** |
| **P3 indistinguishable** | split vs tabs look the same | the only mark is `style.css:4557`'s `⫿ ` pseudo-element (font coverage not guaranteed); the divider `style.css:4552` uses `--border` (= the window border); no badge, no exit control (only the live-view window's own Unbind) | a ⫿ badge (icons.js two-columns SVG) = the entry button's second state, click → Unsplit / Swap; owner-colour underlines on the pane tabs; divider hover accent + right-click with the same two items (§4 R4) | low–medium | low | **yes** |
| **P4 direction** | dragged left, landed right | `chain-layout.dropSide`: which HALF of the TARGET'S title bar the pointer is on — the drag DIRECTION never enters; a pointer arriving from the right enters the right half first (G1: Δx −409 still lands right) | disappears with P1: the explicit verbs name the side ("Beside X (on the right)" default, "Swap left and right" afterwards); nothing about pointer position remains (§4 R2) | 0 (with P1) | 0 | **yes** |
| (add) undo | — | a split entered by mistake can only be undone by dragging a tab out | after any split entry a 5 s toast "Side by side · Undo" restoring both windows' pre-split positions (§4 R5) | low | low | **yes** |
| (add) the price of two steps | the owner accepts two steps | — | right after a merge the button pulses once + a 5 s toast "Grouped as tabs · Show side by side" as a one-click | low | low (the `toast seconds` setting shortens it) | **yes** |
| (no) a drag-time body zone / intent delay | — | the second directive: no complex drag-time logic | not built; a chrome leg proves the NEGATIVE ("dragged into A's body, held 1.5 s ⇒ no split") | — | — | **no** |

---

## 3. Research: how six products enter side by side

| Product | Entry | Who decides the side | Exit | Lesson for VibeSpace |
|---|---|---|---|---|
| **VS Code** | the **Split Editor button** (top right of an editor); tab right-click *Split Editor*; `Ctrl+\`; **dragging a tab to an EDGE of the editor area** shows a blue drop zone | button = fixed (to the right); drag = which edge | close an editor group | button first; the drag is a second entry and only over a LARGE edge zone of the editor area, never a title-bar half |
| **JetBrains** | tab right-click **Split Right / Split Down**; `Window › Editor Tabs`; bindable shortcuts; a tab can also be dragged to a split position | the verb names the side (Right / Down) | drag back / close | verbs carrying the side = our R2 |
| **Arc** | tab right-click *Add Split View*; `⌘⇧+`; command bar "Add Right/Left Split"; drag a sidebar tab onto the left / right of another tab | commands name the side; drag = the drop side | close one split | commands/menus name the side; drag only BETWEEN SIDEBAR TABS, never over the whole window chrome |
| **Chrome 145+ (2026-02)** | tab right-click *Add tab to new split view* / *New split view with current tab*; the Split view icon left of the address bar; drag a tab to a target window's EDGE and HOLD until a "+ Create split view" label appears | menu = current page left; drag = which edge, with a dwell | right-click the merged tabs → *Separate views* | a drag entry needs a DWELL + an EXPLICIT LABEL, or is not done — the owner rules out exactly that kind of complexity, so we keep menus/buttons only |
| **tmux** | `prefix %` (side by side) / `prefix "` (stacked); no drag | the key names the side | `prefix x` | one command-mode key (our `v`) suffices |
| **iTerm2** | `⌘D` (side by side) / `⌘⇧D` (stacked); menu *Split Vertically/Horizontally*; no drag entry | menu/shortcut names the side | close a pane | same |

**Why button-first fits VibeSpace.** ① Windows already snap and tile (`_getSnapZone`, the grid, presets): dragging a window to the left SHOULD snap it left — any second meaning during a drag fights the strongest existing muscle memory (G2 is what losing that fight looks like). ② **The tab chain is the container**: a split is another rendering of the same chain (the premise of `chain-layout.js`), so the natural precondition is "already in one chain" and the entry belongs on the chain's chrome (the tab strip), not on some other window's title bar. ③ Four of the six (VS Code / JetBrains / Arc / Chrome) make the menu/button the first entry and the drag an optional second one — and every drag entry either sits on a LARGE edge zone of the content area or demands a DWELL + LABEL; a zero-dwell, unlabelled zone on another window's TITLE-BAR HALF is a shape none of the six has. ④ The owner's second directive rules drag-time logic out; two steps (merge → split) are accepted, and we make the second step obvious (the pulse + the one-click toast).

---

## 4. The decided rules

### R1 ENTRY — NO drag-time split at all

* Delete: `tab-group.js`'s `_detectSplitDropTarget` / `_markSplitDrop`, the split branches in `_setupTabDrag` and `window.js:_setupDrag`, `style.css`'s `.tab-split-drop-left/right`, `chain-layout.js`'s `dropSide` (its export and its unit leg). **No body zone is added.** A window drag = move / snap / grid; **the tab-merge drop (icon stack, tab bar) stays the ONLY exception, untouched.**
* Explicit entries (all through `wm.bindSplit(anchor, guest, { side, announce: true })`):
  1. **The ⫿ button on the tab strip** `.tab-split-btn` (`icons.js` gains `columns`, a two-columns SVG): visible when the chain has ≥ 2 tabs and layout = tabs, placed after `.tab-bar-tabs` and before `.window-controls`; click = `wm.splitActive(chain)`: **the active tab on the LEFT**, the partner = **the most recently active other tab** (`chain.recent`, maintained by `switchTab` / merges; local state, never persisted, never in the sync key; with no record, the chain's next neighbour). `stopPropagation` on mousedown and `.tab-split-btn` added to `window.js`'s title-bar mousedown exclusion list (the button is not a drag handle).
  2. **The window menu** (`taskbar.js:registerWindowMenu`, registry items, `when: in a chain with ≥ 2 tabs`): a submenu **Show side by side ▸** → one item per other tab "**Beside {name} (on the right)**" (the clicked window on the left); in split mode instead **Unsplit** / **Swap left and right**. A right-click on a TAB opens THAT tab's own window menu (today it opens the host's — `_renderTabBar` gives `.tab-item` a contextmenu → `showWindowContextMenu(app, tabWinId, …)`).
  3. **Command mode**: `registerCommand` `chain.toggleSplit` (`v`: split if tabs, unsplit if split), `chain.swapSides` (`V`), `chain.unsplit`, `chain.splitBeside(partnerId)`; the `[CMD]` hint line gains `v split`.
  4. **Programmatic**: `createWindow({intoChain:{split}})` (the live view's auto-bind) and the live-view bar's "Snap beside" are **unchanged** (the latter passes `announce:true` to get the undo toast).
* **The bridge between the two steps**: after a USER drag completes a merge (the three merge drops: icon drag, tab drag, title-bar drag) `wm._afterUserMerge(chain)`: the ⫿ button gets `.pulse` once (1.2 s, none under `prefers-reduced-motion`) + `showToast(t('Grouped as tabs'), { action: { label: t('Show side by side'), run } })` for 5 s — `utils.showToast` gains an `action` option (one button; clicking runs it and closes the toast). Chains produced by a layout restore / a remote sync do NOT trigger it (only the three drop sites call it).

* **The focus rule + the button's words + the bridge's retirement (split r1, the verifier's three).** Every USER entry keeps the focus on the window the user ACTED ON — `bindSplit(…, { focus: 'anchor' })` from the button (`splitActive`), the window menu's "Beside {name}" and command mode's `chain.splitBeside` (the menu used to land the focus on the NAMED partner: right-click A, type into C); the default `'guest'` stays for the programmatic `intoChain` bind and the live view's Snap beside (whose guest is the acted-on window). The button's title / aria-label name `splitPartner(chain, chain.recent)` — the window the click WILL use — and `switchTab` re-labels it after it moves `recent` (on a ≥ 3-tab chain a label computed once at render named a partner the click no longer used). The "Grouped as tabs" toast is kept on the chain and withdrawn by any `bindSplit` of that chain; if its action still runs after the group changed it says so — "Already shown side by side" / "The tab group changed — nothing to show side by side" — never a silent no-op. Pinned by `test-split-ux` leg 11 and `test-contributions`.

### R2 SIDE — the verbs name it, the pointer never does

"Beside {name} (on the right)" is the default (the initiator left, the partner right); afterwards **Swap left and right** (`wm.swapSplit(chain)` = reverse `pair`, re-render; `chainSyncKey` carries the pair order, other clients rebuild on the structural change). `pairFor({anchorId, guestId, side})` stays for the programmatic path; `side` comes only from the caller, never from a pointer position.

### R3 THE TAB STRIP in split mode — variant A (§5)

`_renderTabBar` in split mode draws PURE `visualTabOrder(chain)` = `[pair[0], pair[1], ...the rest in chain order]`; between the two pane tabs a `.tab-split-glyph` (`aria-hidden`, a 2 px accent vertical bar mirroring the divider; paint, not a node — design-accessibility-tree §3 row 2); each pane tab gets `.tab-pane` + `--pane-color` = that pane's OWNER colour (`win._ownerBadge.dots[0].color`, else `ownerColor(the view's session id — app.sessions.get(win.id).sessionId)`, else `ownerColor(win.id)` — `chain-layout.ownerSeq` gives any id a slot), a 2 px underline; the active pane's tab `.active` (the existing highlight) + `.tab-split-focus`; hidden tabs come after both and still follow D19 (a) when clicked (they replace the non-anchor pane). `tabs` / `active` / `pair` keep their meanings.

### R4 DISTINGUISH + EXIT

* **The ⫿ badge = the same `.tab-split-btn` in its second state**: in split mode `.on` (accent fill + outline), `aria-pressed=true`, title "Shown side by side — click for Unsplit / Swap"; click → `showContextMenu` with **Unsplit** (`wm.unbindSplit`, nothing moves) / **Swap left and right**. One place, two states — the user learns one spot.
* **The divider**: `:hover` in accent (the rule exists; its resting colour equals the border — resting becomes `color-mix(accent 35 %, border)` so it reads brighter than a border even unhovered); `contextmenu` → the same two items.
* On the phone the badge/button is hidden (R6).

### R5 UNDO

`bindSplit(..., { announce: true })` snapshots `{ guestWasFree, guestRect, guestZ, hostRect, chainBefore: {layout, split} }` before acting, then `showToast(t('Side by side: {left} | {right}'), { action: { label: t('Undo'), run: () => wm.undoSplit(snapshot) } })` (5 s). `undoSplit`: the chain is the same object, still split, the pair unchanged, both windows alive ⇒ a guest that was free → `_detachFromChain` + restore the guest's and the host's rects (the ±2 px leg); a guest that was already in the chain → restore `chainBefore` (tabs, or the earlier split record), **nothing moves**. Any precondition failing ⇒ the toast says "Nothing to undo any more" (never silent). The programmatic `intoChain` shows no toast.

### R6 THE PHONE (≤ 768 px) unchanged

One pane (`displayedPanes(chain, {narrow:true})`, the `.tab-split-focus` stylesheet rule); the ⫿ button/badge and the glyph hidden; the model still carries the split verbatim and never flattens it (§6b guard 5's existing leg stays).

---

## 5. Three mockup variants of the tab strip

Standalone HTML (the product's class names + the `[data-theme="dark"]` tokens), `docs/mockups/split-ux/{current,A,B,C}.html` → `*.png` (headless Chrome 700×520, DSF 1), Python/PIL pixel checks (the window is 640×380, the title band = its first 32 rows):

| | current (2.369.160) | **A** one strip, visual order | B one title bar per pane | C one split chip |
|---|---|---|---|---|
| title-band pixels differing from current | 0 % | **33.7 %** (6 911 px) | 61.6 % (12 617 px) | 47.4 % (9 705 px) |
| owner-colour pixels (A orange / B blue) | 0 / 15 | **300 / 330** | 0 / 641 (the unfocused pane's bar carries no colour) | 52 / 100 (two dots) |
| divider: 15 samples teal | 0/15 (= the border colour (42,42,62)) | 15/15 | 15/15 | 15/15 |
| pane names legible in a 640 px window | "Fix split UX" / "VibeSpace notes" in full | in full (the third tab too) | the right bar keeps only **"Vi…" / "T…"** (320 px must carry a tab + chip + the third tab + the badge + four controls — the owner's "Fi…/Vi…", worse) | in full; the third tab folds into "+1 ▾" |

Label widths (11 px, one font): zh "并排" 22 px / "取消并排" 44 / "交换左右" 44 / "与 Alpha 并排（在右侧）" 123; en "Side by side" 61 / "Unsplit" 37 / "Swap left and right" 98 / "Beside Alpha (on the right)" 137; ja "並べて表示" 55 / "並べ表示を解除" 77 / "左右を入れ替え" 77 / "Alpha の隣に並べる（右側）" 142 — all live in menus / toasts; the title bar carries only a 24 px icon button, so i18n length separates the variants only at C (the chip must hold two names).

**Six-criterion rubric (1–5)**

| Criterion | A | B | C |
|---|---|---|---|
| intuitiveness ("the left pane's tab is on the left") | 5 | 4 | 3 |
| distinguishability from tabs (pixel diff + badge) | 4 | 5 | 5 |
| drag affordance (drag a tab out / drag the bar to move) | 5 | 3 (two handles, controls on one side) | 1 (no tabs, no handle) |
| phone parity (≤ 768 shows one pane) | 5 (same strip, hide the glyph) | 2 (must collapse to one bar) | 3 |
| i18n length | 5 | 2 (a half-width bar cannot hold a name) | 4 |
| implementation cost | 5 (render order + glyph + underlines + one button) | 2 (a second title bar = a second DOM shape; `_detachFromChain` / promotion / the drag must know two handles) | 3 (a new chip component + an entry for the hidden third tab) |
| **total** | **29** | 18 | 19 |

**Recommendation: A.** B distinguishes best but breaks the "one window, one title bar" shape the whole geometry (gridBounds / snap / desktop previews / the drag) stands on, and at 640 px it squeezes names into exactly the "Vi…" the owner complained about. C makes the badge the container but hides the third tab and the drag-out handle with it. A changes only the render order on the current DOM, adds a glyph, two underlines and one button; its distinguishability is made up by the badge (accent fill) + the brighter divider to C's level.

---

## 6. Build chunks (≤ 3; each with its docs in the same commit; legs red first)

> **SHIPPED in 2.369.162** (all three chunks, one release). Chunk 1 = `test-window-binding-model` 65 → 96 (the drop-zone pins flipped negative); chunk 2 = `test-contributions` 203 (the window-menu matrix with chains + the command-mode verbs); chunk 3 = `test-split-ux` **73 legs green** (heavy; **85** after split r1's leg 11), **RED on 2.369.160: 10 failed / 15 passed** before its leg 4 stopped — legs 1, 1a and 2 split (G1: `layout=split`, B hidden inside A's chain), leg 4 found no button and no toast; leg 3 (the body hold) is green on both trees by construction (a NEGATIVE control: no body zone ever existed). `test-window-binding` 63 unchanged.

### Chunk 1 — the model + the window-manager core (R1 deletes the zone, R3 visual order, R4 badge, R5 undo, the post-merge bridge)

**Files** `src/lib/chain-layout.js` (drop `dropSide`; add `visualTabOrder(chain)`, `swappedPair(chain)`, `splitPartner(chain, recent)`) · `src/lib/tab-group.js` (delete `_detectSplitDropTarget` / `_markSplitDrop` / the tab drag's split branch; `_renderTabBar` visual order + glyph + `.tab-pane`/`--pane-color` + the two-state `.tab-split-btn`; `bindSplit({announce})` snapshot + toast; `swapSplit`, `undoSplit`, `splitActive`, `_afterUserMerge`, `chain.recent`; divider hover / contextmenu; tab contextmenu → its own window's menu) · `src/lib/window.js` (delete `_setupDrag`'s split branch and `splitTarget`; mousedown excludes `.tab-split-btn`; the merge drop calls `_afterUserMerge`) · `src/lib/utils.js` (`showToast`'s `action`) · `src/lib/icons.js` (`columns`, `swap`) · `public/style.css` (drop the drop classes; `.tab-split-btn{,.on,.pulse}`, `.tab-split-glyph`, the `.tab-pane` underline, the divider's resting colour, hidden ≤ 768 and below a 260 px host) · `src/lib/i18n-zh.js` / `i18n-ja.js`.
**Legs (red first)** `scripts/test-window-binding-model.mjs`: ① `dropSide` is no longer exported; `visualTabOrder` on `pair=[B,A]`, `tabs=[A,B,C]` gives `[B,A,C]`; `swappedPair`; `splitPartner` takes the most recent other tab, the neighbour without a record; ③ the wiring pins FLIP to negatives (`_detectSplitDropTarget` / `tab-split-drop` zero hits in `tab-group.js` / `window.js`; `_setupTabDrag` and `_setupDrag` no longer call `bindSplit`) + positives (`_renderTabBar` goes through `visualTabOrder`; the three merge drops each call `_afterUserMerge`; `bindSplit`'s announce goes through `showToast(…, { action`; §6b's four guards untouched). `scripts/test-window-binding.mjs` ③'s wording becomes "there is no drop-zone code to run".
**Docs** `docs/kb-file-structure.md` (chain-layout.js; the tab-group / window / layout essay) · `docs/design-agent-browser-v2.zh.md` §4.6 + `.md` §4.6 (the interaction bullet: title-bar halves → the explicit entries) · `docs/kb-features.md` (Window Manager's Tab groups line + P7 "How it behaves") · `CLAUDE.md` index lines (tab-group.js / chain-layout.js / window.js, ≤ 300 chars) · `docs/window-manager.md` (user doc: tab groups → side by side).

### Chunk 2 — the verbs and surfaces (R1's menu / command mode, R2's words, the live view and the settings text)

**Files** `src/lib/taskbar.js` (window-menu registrations: Show side by side ▸ / Unsplit / Swap, `when` by chain) · `src/lib/command-mode.js` (`chain.toggleSplit` `v`, `chain.swapSides` `V`, `chain.unsplit`, `chain.splitBeside`; the hint line) · `src/lib/browser-live-window.js` ("Snap beside" passes `announce:true`; the setting's description no longer mentions title-bar halves) · `src/lib/settings-schema.js` + `docs/settings.md` (`browser.autoBindLiveView` description) · i18n.
**Legs** `scripts/test-contributions.mjs` (the window-menu matrix: a chain-less ctx unchanged; a ctx with a chain gains the submenu naming `Beside {name} (on the right)`) · `scripts/test-window-types.mjs` (no new window type; the census stays green) · `scripts/test-architecture.mjs` (§44 settings census, §47 onboarded census over the new chrome suite).
**Docs** `docs/kb-file-structure.md` (taskbar.js window menu, command-mode.js) · `docs/keyboard-shortcuts.md` (`v` / `V`) · `docs/kb-features.md` (the Window menu line).

### Chunk 3 — the owner-gesture chrome gate + the release

*Shipped as specified, two notes from the build.* (a) The §1 G1 release row (the centre of A's bar) lies INSIDE the workspace's 30 px top snap band — the §1 table already recorded the indicator showing there — so a free drop there is the TOP snap, not a pointer-centred position. The gate therefore has leg 1 released on the lower rows of A's bar (33 px into the workspace, outside the band ⇒ the pointer-centred position ±8 px, measured Δ −409 / −64) and leg 1a on the exact §1 path (⇒ the `top` snap the indicator promised, ±2 px); both split on 2.369.160. G2 likewise releases at the lower rows (x = workspace + 12 ⇒ `left`, not `top-left`). (b) The fake `claude` gives each session its OWN conversation id (the fixture family + the shell pid): with one shared id a restoring second client attached both windows to one session.

**Files** `scripts/test-split-ux.mjs` (heavy, chrome; the scene = `dbg-split-gesture.mjs`: a fake claude, two chat sessions, A snapped left, B on the right, desktop page 1280×900 + a second desktop client + a phone page 390×844) · `scripts/ci.mjs` (the heavy row + why) · `package.json` / `package-lock.json` (2.369.162) · `CHANGELOG.md` (the lane's ONE entry).
**Legs (red first: on the pre-chunk-1 tree G1 splits)**
1. **G1 the owner gesture**: B dragged left across A's title bar, released on its right half ⇒ **no chain**, B moved (B.left changed by > 300 px, the element still display flex), A's rect unchanged;
2. **G2 the edge**: dragged toward the left workspace edge over A's title bar ⇒ B's rect = the left snap zone (±2 px), no chain;
3. **the body negative**: B dragged into A's content area and held 1.5 s ⇒ no chain (R1: no body zone);
4. **the merge stays the only exception**: B dropped on A's icon stack ⇒ a tabs chain; the ⫿ button appears with `.pulse`; a toast containing "Grouped as tabs" with a "Show side by side" button; clicking it ⇒ `layout=split`, `pair=[B,A]` (the active B on the left), **strip order = pane order**, one `.tab-split-glyph` between the two tabs, the two underlines = the two sessions' `ownerColor`;
5. **badge / unsplit / swap**: the button `.on` + `aria-pressed`; click opens the two items; swap ⇒ `pair=[A,B]` and the strip follows; unsplit ⇒ tabs, the host rect unchanged (±1 px), the button back in its entry state;
6. **undo**: `wm.bindSplit(A, B-free, {announce:true})` (the live view's "Snap beside" call shape) ⇒ a toast naming both + Undo; Undo ⇒ B free again at its pre-split rect (±2 px), A unmoved; then a split entered from tabs through the button and undone ⇒ back to tabs, nothing moved;
7. **the divider**: hover's computed background ≠ the border colour; right-click shows the two items;
8. **two clients**: a second desktop page sees the same chain (layout, pair, strip order), after the swap too; the §6b guard legs untouched;
9. **the phone**: one pane, no button / badge / glyph, the model still split;
10. **command mode**: `Ctrl+\` `v` splits a tabs chain and unsplits it again; `V` swaps.
11. **split r1** (a third session Charlie): after a split + unsplit of [A, B, C], a real click on B's tab re-labels the button with `splitPartner`'s window and the click uses it; a split through the button withdraws the "Grouped as tabs" toast, whose action, run after a remote-shaped split or a dissolved group, says so; the Alpha tab's "Beside Charlie" ⇒ pair [A, C] with the focus still on A.
**Docs** `CHANGELOG.md`; the `scripts/test-split-ux.mjs` line in `docs/kb-file-structure.md`; the `docs/design-split-ux.zh.md` index line in `CLAUDE.md`.

### i18n keys (English key → zh / ja; chunks 1 and 2 each add their own)

| key | zh | ja |
|---|---|---|
| `Side by side` | 并排 | 並べて表示 |
| `Show side by side` | 并排显示 | 並べて表示する |
| `Show side by side — this tab on the left, {name} on the right` | 并排显示 — 当前标签在左，{name} 在右 | 並べて表示 — このタブを左、{name} を右に |
| `Beside {name} (on the right)` | 与 {name} 并排（在右侧） | {name} と並べる（右側に） |
| `Shown side by side — click for Unsplit / Swap` | 并排显示中 — 点击：取消并排 / 交换左右 | 並べて表示中 — クリックで解除 / 左右入れ替え |
| `Unsplit` | 取消并排 | 並べ表示を解除 |
| `Swap left and right` | 交换左右 | 左右を入れ替え |
| `Side by side: {left} \| {right}` | 已并排：{left} \| {right} | 並べました：{left} \| {right} |
| `Undo` | 撤销 | 元に戻す |
| `Grouped as tabs` | 已合并为标签组 | タブにまとめました |
| `Nothing to undo any more — the group changed` | 已无法撤销 — 分组已变 | 元に戻せません — グループが変わりました |
| `Already shown side by side` (r1) | 已经在并排显示 | すでに並べて表示しています |
| `The tab group changed — nothing to show side by side` (r1) | 标签组已变 — 没有可并排显示的 | タブグループが変わりました — 並べて表示するものがありません |

(`Shown side by side` / `Unbind` / `Snap beside {name}` / the divider tooltip already exist and are reused.)

---

## 7. Honest limits / not doing

* **No drag-time split entry, none** (the title-bar halves are deleted, no body zone is built). Whoever wants a "dragged" split does: drag-merge (the one exception) → click ⫿.
* The live view's auto-bind (`createWindow({intoChain})`) shows no toast and no pulse — it is not the user's act.
* Swap changes `chainSyncKey`; other clients rebuild the chain as a structural change (re-parenting two contents); one explicit act, acceptable; the ratio keeps applying in place.
* `chain.recent` is local state: another client's "most recently active tab" may differ — it only picks the DEFAULT partner; the menu offers any partner.
* The 24 px button/badge rides the tab row in `window.tabWrap` mode; below a 260 px host it is hidden by a NEW stylesheet rule (no title-bar button hides by width today — chunk 1 adds the rule).
* **Found by the gate, NOT fixed here (pre-existing, `src/lib/layout.js`):** a client DROPS every `layout-sync` that lands while its `_restoring` gate is up — 1 s after each remote apply and 5 s after its own boot restore — and never asks again (the seq is not advanced, nothing is deferred). A swap made on client 1 within ~5 s of client 2 loading was lost on client 2 until the next change (reproduced by leg 8 before it waited for client 2's gate). Deferring instead of dropping (the `_pointerDown` path's latest-wins) is the likely fix; it touches the §6b guards and needs its own leg.

---

## 8. v2 (2026-09-25, inc-muhfb5al-jzk6) — a strip half per side, tab drag, links side by side, two settings

**The owner** (2.369.177, Report a problem): "这个UX非常奇怪啊，首先并排之后tab列表都在左侧，比较难看出来哪边是哪个tab。其次我没法拖动tab重排序，最后我只能调整右侧展示的tab而无法调整左侧的。建议加入tab拖动+直接两侧分开展示的功能。" — the tabs all sit on the left, you cannot tell which side is which; tabs cannot be reordered by drag; only the right side's tab can be changed. Then: "另外以后从窗口打开文件路径/本地链接的时候默认side by side展示吧。然后拖动窗口后是直接side by side还是普通tabbed，以及打开文件路径/链接默认用并排还是独立窗口也都加入设置选项。" — open paths / local links from a window side by side by default, and make both the merge-drop result and the link placement settings.

**The three defects, measured** (reader, 1600×900 headless, a 1200×600 host): the strip never followed the divider — at ratio 0.5 the right pane's tab centre sat **282 px left** of the right pane's left edge, at 0.7 all three tabs sat over the **left** pane; a horizontal tab drag did nothing (only a 30 px vertical pull-out existed); D19 (a) replaced only the non-anchor pane, and after a swap still only the non-host side — exactly "I can only change the right side".

### The model (PURE `src/lib/chain-layout.js`, gate `scripts/test-chain-layout.mjs`, fast)

* `tabs` keeps its meaning to the byte (membership; `tabs[0]` = the host that owns the element — a reorder NEVER re-hosts, re-hosting re-parents every content). New: `order` = the strip order (a permutation of `tabs`; missing = `tabs` order).
* In a split **every tab belongs to a side**: `split.left` / `split.right` are ordered lists, their union = `tabs`, each id once, `pair[0] ∈ left`, `pair[1] ∈ right`, the strip = `left ++ right` (so unsplitting is "left then right" by construction). `normalizeChain` is the one validation: a pair member on the wrong side or an empty side ⇒ the layout collapses to tabs (the validator never guesses a pane; the verbs pick a substitute before normalizing).
* **The creation rule** (`enterSplit`): the guest goes ALONE to its side, every other tab (in strip order) stays with the anchor; on a chain **already** split the anchor keeps its side and the guest goes to the end of the OTHER side, both shown — "beside the source" is always the side the source is not on, never a literal "right" that would cover a right-hand source.
* **The old-record repair** (written once, `sidesFor`): a record with no side lists ⇒ the non-anchor pane alone on its side, every other tab with the anchor (anchor = the host when it is in the pair, else the left member).
* Verbs: `showTab` (shown on ITS OWN side — both sides switchable; `splitReplaceable` / D19 (a) retired), `moveTab` (a reorder; across the boundary = a side change — a DISPLAYED tab carries its display, the side it left shows the tab now at its index, else the one before; that side left empty ⇒ the split ends; a hidden tab moved across stays hidden — the pair changes only when the moved tab was shown — which holds for the keyboard / API path only: **a press shows the tab** (the browser rule), so a POINTER drag always moves a SHOWN tab and carries its display (v2 verify r1 ⑤); never a new split), `removeTab` (a removed pane is replaced by its side's neighbour at the same index, an emptied side ends the split; `active` stays on the same window — a bare `splice` slid it onto the next one), `insertTab`, `swapSides` (the side lists swap with the pair).
* `chainSyncKey` = members + strip order + layout + where the sides are cut + the pair, computed on a normalized **clone** (an old record keys like its repaired form); the ratio still applies in place.

### The strip (`_renderTabBar`, `public/style.css`)

* In a split the strip is **two halves**: the host's title bar is a **subgrid** of the host grid (it already spans 1 / -1), and `.tab-bar-split` dissolves (`display: contents`) into the left half (column 1), the glyph (column 2 = over the divider) and the right half (column 3). `splitColumns()` stays the one spelling of the columns — the halves follow a divider drag with **no JS** (measured ±1 px every frame). The ⫿ badge and the window controls share column 3, pinned to its end; the right half reserves them with `--split-ctl` (the controls' width, published on the HOST by the title-bar ResizeObserver) + `--split-btn` as a **margin** (never a padding — a scroll box paints its overflow into its own padding); the right column keeps a **floor** (`splitColumns`: the controls + a tab's room, ≤ 45 %); a column too tight for the badge + a tab hides the badge (`.split-btn-hidden`; the divider's right-click keeps Unsplit / Swap) (v2 verify r1 ②).
* Each half lists its side in order; each side's SHOWN tab is a `.tab-pane` (the window background + the owner-colour underline), the focused one also `.active` + `.tab-split-focus`. A click only re-marks in place (`_markStrip`) — never a rebuild of the strip under the pointer.
* Tabs layout: one strip in `order`. The phone (≤ 768 px): one strip (left then right), no halves, no glyph (R6).
* A press inside a pane focuses THAT pane (`chain.active` + `activeWindowId`) — before, a click in either pane focused the host, so the keyboard, command mode and the menus acted on the wrong tab.

### The drag (`_setupTabDrag`)

* The **first 8 px** of movement decide once: mostly horizontal = a **reorder** (an insertion marker, rAF-coalesced, a per-drag AbortController, Esc cancels, the drop = `moveTabInChain` — the one mutation path: PURE moveTab → normalize → re-derive → notify), and it never turns into a pull-out later; mostly vertical = the pre-v2 pull-out path verbatim (|dy| > 30). Crossing the halves' boundary MOVES the tab to the other side — never a new split.
* R1 stands: **no drag creates a split** — the icon-stack merge stays the one drag exception, and F3's setting only makes that exception land as a split.
* Keyboard: `Ctrl+Shift+PageUp` / `PageDown` (registry chords in app.js; inert unless the active window is in a ≥ 2-tab group — the browser keeps the chord otherwise; a terminal lets it through only in a group) and command mode `{` / `}` move the active tab within ITS OWN list; at the edge nothing moves.

### The two settings (Settings → Window, schema-driven, both read AT THE ACT)

* `window.mergeDropLayout`: `tabs` (default = today: grouped as tabs + the pulse / "Show side by side" toast) | `split` (the icon-stack merge lands side by side at once, the dragged window on the RIGHT; the toast offers **Undo** — the dragged window back where it stood, the three drop sites record its rect when the drag starts — and **Unsplit** — stay grouped as tabs, the dragged window back at the SLOT it was dropped on = the `tabs` setting's own result, while the strip is still the one this split made — v2 verify r1 ③). A drop onto a chain **already** split (either setting) joins the half under the pointer and is shown there; the toast names the new pair and offers **Undo** (the window back where it stood, the split back to its sides / order / pair from before the drop — the three drop sites share ONE `_mergeDrop`, which snapshots the target chain before the drop; v2 verify r1 ④).
* `window.openLinkPlacement`: `split` (default, the owner's choice) | `tab` | `window` (today's free window). A path / local link opened from a chat (chat-renderers' three open sites) takes **that chat's own window** as the source (the ChatView's winInfo, read at click time — never the active window); `app.linkPlacement` turns it into an `intoChain` that rides `FileViewer.open`'s four createWindow calls and `openEditor`: `split` = beside the source (on a chain already split, the side the source is not on); `tab` = a tab right after the source (on its side in a split), shown. The source gone / minimized / on another desktop / the Stage up / the phone ⇒ a free window. The same path opened again from the same window ⇒ its tab is shown (a `:line` link moves the editor there). A text file goes straight to the editor (no throwaway viewer born into the chain and closed again — it would flash a tab).

### Multi-client (kb-design-lessons §6b addendum)

* A key that changed while the **members and the host are the same** (a reorder, a cross-side move, a per-side switch, a swap, split / unsplit) is applied **in place** on the other client (`applyChainRecord`: no content re-parented, `active` stays that client's unless the new layout hides it); only a membership or host change rebuilds. None of the four §6b guards changed.
* **A local divider drag wins over a record that could not know it** (v2 verify r1 ①): client 2 dragging the divider while client 1 makes a structural change → the record is held by §6b guard 3 until the pointerup, then applied in place — and `applyChainRecord` used to copy the record's ratio (0.50) over the drag (0.15) while the apply's user-dirty clear dropped the pointerup's own save: client 2 snapped back a second later and nobody learned the drag. Now a USER's divider act (the drag's release, the double-click — when the ratio really moved) stamps the chain LOCALLY (PURE `holdRatio`; never persisted, never in the key, never in a clone) and the next save leaving this client releases it; while the stamp stands (≤ 60 s = §6b's own dirty expiry) and the chain still shows that value, BOTH in-place paths (the key-match ratio, the same-member record) keep the local ratio, and the apply re-sends it ONCE (the dirty bit re-armed with the drag's real release time — never a fabricated "now"). Measured: client 2 at 0.15 after 1 s and 5 s, client 1 and the disk 0.15, exactly one layout-sync from client 2, no echo. An idle client never re-sends (it holds nothing) — the verifier's "keep the local ratio whenever the local chain is split, and re-send" would let an idle client push a stale ratio back over somebody's fresh divider drag, so it was not taken.
* A member window still being **replayed asynchronously** (`FileViewer.open` awaits `/api/file/info` before it creates its window) keeps its chain **pending** until it appears (bounded; past the deadline the present members are grouped). Before, client 2 kept a free viewer, and its next user-caused save (no chain) broke client 1's chain (the reader measured a free window at 0.3 / 1 / 2.5 / 5 s). The boot restore goes through the same reconcile (`_queueChain`).
* Version skew: a ≤ 2.369.177 client's save drops `order` / `left` / `right`; new clients repair by the rule — transient (stale tabs reload on reconnect).

### Gates

`scripts/test-chain-layout.mjs` (fast, new) · `test-window-binding-model` (fast, the ④ wiring pins) · `test-contributions` (the commands + `{` / `}`) · `test-split-ux` (heavy, leg 12: L1–L11 + L1b / L4a / L7b–L7d (v2 verify r1), `test-chain-layout` ⑪ the held ratio + two patched-copy controls; leg 12 as first shipped: L1–L10, each with a control where one makes sense — the subgrid rule neutered ⇒ misaligned; `moveTabInChain` neutered ⇒ no reorder; client 2's reconcile reverted to "group what is there" ⇒ the async viewer lands free; the chord inert outside a group; the `tabs` setting ⇒ the same drop groups as tabs).

### Honest limits (v2)

* The title bar still carries ONE strip DOM (one title bar per window — §5's reason against variant B stands); the halves are tight: a 640 px window at ratio 0.5 leaves the right half ≈ 317 − 8 − 89 − 30 (padding + controls + badge) ≈ 190 px. On a narrow window the right column keeps its floor (the controls + a tab's room): the ratio is stored as given (e.g. 0.85), this client draws the right column at the floor and the divider stops there; a wider client shows the ratio exactly.
* A divider drag during a MEMBERSHIP change (a rebuild) still takes the record's ratio — the hold covers the two in-place paths.
* `Ctrl+Shift+PageUp/PageDown` may be kept by the browser itself in a regular tab ("move tab"); an installed app window gives it to the page. Command mode `{` / `}` always works. Headless cannot show whether a page's preventDefault beats the browser — confirm in a headed browser.
* Files opened from the file explorer (double-click) or an archive entry do **not** take F2 (the owner said "file path / local link"; an explorer used as a launcher would pile files into its chain). Ctrl+G is a split pane inside a terminal, not an "open from a window".
* The decision is made once: a drag that starts horizontal never becomes a pull-out (to pull a tab out, start downward).
* A reorder / switch updates the other clients **in place**; a membership change is still a structural rebuild (contents re-parented).
* A tab **group** dragged by its title bar onto another window's icon used to merge its host alone and orphan the other tabs (hidden inside the host's element); the group now just moves (merge tab by tab).
* The `_restoring` layout-sync drop (§7) is not fixed here.
* D19 (a) (`docs/design-agent-browser-v2.md` §4.6) is superseded by the owner's 2026-09-25 ruling: both sides are switchable.

### v2 verify r1 (2026-09-25, adversarial verifier → fix agent)

Each reproduced red first with the verifier's recipe (the new `test-split-ux` legs L1b / L11 / L6 / L9 / L7b / L7c all red on the unfixed build), fixed at the cause, proven with numbers:

* ① **minor, fixed** — client 2's divider drag across client 1's structural change snapped back and reached nobody. See the third multi-client bullet above; gate: L11 (a real drag, client 1's `moveTabInChain` between moves 4 and 5, client 2 holding the record) + control (`_holdSplitRatio` neutered ⇒ the same drag 0.15 → 0.50 snaps back to the record's 0.15, zero sends); `test-chain-layout` ⑪ + patched-copy controls (no expiry / blind to a moved ratio).
* ② **low, fixed** — a 640 px host at 0.85: the right column (95 px) was narrower than the controls (89) + the badge, and the padding reservation painted the tab under □ (measured 610–630 vs the controls from 606). Fix: the right column's floor + a margin reservation + the badge stepping aside. L1b: after the same drag the tab shows ≥ 30 px (44 measured) and takes a click, the first visible control button is the element at its own centre, the badge hides; back at 1100 px / 0.5 the badge returns; control = the as-shipped columns + padding ⇒ the tab painted under the controls.
* ③ **low, fixed** — `mergeDropLayout = split`: the toast's Unsplit put the dragged window LAST instead of at its drop slot. L7b: the `tabs` reference [A, C, B]; under `split` the toast's Unsplit = [A, C, B]; control = the badge menu's plain Unsplit (left then right, [A, B, C]).
* ④ **low, fixed** — a drop onto an already-split chain had no toast and no Undo. L7c (both settings): left [A, C], pair [C, B], a toast with Undo only; Undo ⇒ C back at its pre-drag rect (±2 px), the split back to [A | B]. L7d: [A, D | B] with D hidden, C dropped between A and D ⇒ Undo gives exactly [A, D | B], pair [A, B]; control = the before-layout restore neutered ⇒ the Undo only detaches C and shows D (pair [D, B]).
* ⑤ **low, doc fixed** — "a hidden tab moved across stays hidden" holds for the keyboard / API only; a press shows the tab (the browser rule, kept), so a pointer drag always moves a shown tab. L4a pins both paths.
* ⑦ **low (pre-existing), fixed** — the boot restore's `applyPosition` re-keyed windows to their saved ids but not `wm.activeWindowId` (it named a window that no longer existed). One line; L6 / L9 assert it names a live window after the reload (both red before).

**v2 verify lows (not fixed)** (2026-09-25):

* ⑥ The lane commit `bae4d382` carries the `Claude Opus 5.5 (1M context)` trailer, not the line the lane rules name — the fix agent does not rewrite history (no rebase / squash / amend); the fix commit carries the line this session's attribution rule gives (Opus 5.5); unifying it, if wanted, is the integrator's at the version commit.
* ⑧ (pre-existing, harness-induced) Two clients holding the same sessions under DIFFERENT window ids: the first structural broadcast empties the stale client — it closes every chat window and creates none (`_applyRemoteState` creates the remote ids first — `replayOpenSpec` dedupes by session ⇒ nothing created — then closes the local windows the remote lacks). The fix (a remote window whose session is already open locally under another id ⇒ re-key it instead of create + close) reaches into the core of the multi-client sync and is outside this lane; recorded here.
