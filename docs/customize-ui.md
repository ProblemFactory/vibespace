# Customize UI

VibeSpace's chrome (toolbar, taskbar, sidebar) is rearrangeable through **Customize mode** — a Firefox-style edit mode where you change the UI by clicking and dragging the real elements, not by hunting through a settings list.

**Enter:** ⚙ menu → **Customize UI…**, or right-click empty toolbar/taskbar space → **Customize UI…**
**Exit:** **Done**, or Escape.

While editing, the workspace dims, every customizable element gets a dashed outline, and a control bar appears at the bottom (`+ Spring` / `Reset` / `All settings…` / `Done`).

## Show / hide elements

**Click** an outlined element to hide or show it. Hidden elements stay on screen at low opacity while you're editing (so nothing ever disappears from the canvas) — click again to bring one back. Hover any element for a tooltip explaining what it is.

A few core anchors are deliberately not customizable: the ☰ sidebar toggle, the ⚙ gear, the window-item strip, and the [CMD] indicator. The **New Session** button can be moved but never hidden.

## Drag to move

**Drag** an element to reorder it within its bar or move it to a different bar entirely. Target areas light up while dragging and an insertion marker shows exactly where it will land. Hosting areas:

- **Toolbar center** and **toolbar right**
- **Taskbar tray** (the right side of the taskbar: desktop previews, usage meters, window counter)
- **Two extra rows** — one below the toolbar, one next to the taskbar. They're invisible until you drag something into them and vanish again when emptied. (E.g. give the layout presets their own full-width row.)

Everything keeps working wherever it lives — e.g. drag the desktop previews and usage donuts into the toolbar, then set the taskbar to *Hidden*: full desktop switching and usage monitoring with zero taskbar.

## A narrow screen: the toolbar folds, never overlaps

When the toolbar has less room than its buttons need (a low-resolution screen, UI scale 125 %, a wide sidebar, a large toolbar scale, or ja labels), nothing overlaps and nothing hides under the sidebar: first the "VibeSpace" title shrinks (with an ellipsis, then out of sight), then the buttons give up their words one at a time — the icon stays, the words become its tooltip and screen-reader name (Presets first, then Desktop, then Web view / Apps, then Files / Terminal, New Session last) — and only then do they fold into a **⋯** button at the toolbar's right end, whose menu lists exactly the folded buttons in their order (the layout presets as a submenu of their own buttons); a row does exactly what its button does. The fold reads the arrangement you made here: a button you moved keeps its place in the order, a hidden button never counts, and the taskbar widgets you drag into the toolbar (usage, For you, desktop previews) never fold. While you are in Customize mode the fold is paused — every element is shown full so you can click and drag it, and the toolbar may take two rows — and **Done** folds it again.

## Position pills & alignment chips

Segmented pills float next to the bars they control:

- **Taskbar**: Bottom / Top, and Show / Auto-hide / Hidden
- **Sidebar**: Left / Right

Mini alignment chips appear next to each alignable area:

- **Window items**: left-aligned or centered (Windows-11 style)
- **Toolbar center**: left / center / right
- **Tray**: at the taskbar's left or right end

## Springs (flexible space)

**+ Spring** inserts an invisible spacer (macOS-toolbar "flexible space") that pushes its neighbors apart — drag it between two elements for justify-between-style layouts. While editing, springs show as hatched ↔ bars; click one to configure it:

- **Flexible** with a strength weight 1–9 — two springs at 1× and 3× split the leftover space 1:3
- **Fixed** width, in **px** or **% of screen width** (the unit toggle converts in place)
- **Match…** — width-pick mode: click any bar element to copy its width into the spring; keep clicking to *sum* several elements' widths; Done/Escape finishes. The config popover parks mid-screen while picking so it never covers your target.
- **Remove**

Recipe — align an extra row's center with the toolbar's center (the toolbar's left section offsets its center): put a fixed spring at the row start → **Match…** → click the "☰ VibeSpace" section. Done.

## Reset & persistence

**Reset** restores the stock chrome (arrangement, alignment, springs, positions, visibility). Every change writes ordinary settings (`chrome.arrangement`, `chrome.zoneAlign`, `chrome.springs`, `toolbar.*`, `taskbar.*`, `sidebar.position`), so it persists across restarts and syncs live to all connected clients. The right-click menus on toolbar/taskbar space keep quick single toggles; the full list lives in [settings.md](settings.md).

## Recovering off-screen windows

Related quality-of-life: if a window gets dragged off-screen, expand its session card in the sidebar → **Move** — the window attaches to your cursor (switching to its desktop first); click to place it. Also available by right-clicking the window's taskbar item, any row of the window-list popup (the window counter chip), or via command mode.
