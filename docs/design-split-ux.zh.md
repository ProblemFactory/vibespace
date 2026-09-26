# 并排（side by side）的 UX：owner 的三个问题、mockup、精简集

**日期** 2026-09-23 · **lane** `lane-split`（自 master 348aa226 = 2.369.160；本 lane 的版本字面量 = 2.369.162）· **English mirror** [design-split-ux.md](design-split-ux.md) · **mockups** `docs/mockups/split-ux/` · **复现脚本** `scripts/dbg-split-gesture.mjs`

> **一句话结论。** 并排不再是任何拖动的副作用：拖窗口 = 移动 / 吸附，标签合并（图标 / 标签栏落点）仍是普通拖动+吸附的**唯一**例外，一字不改；并排是合并之后**显式**做的第二步 —— 标签栏上一枚 ⫿ 按钮（合并刚发生时脉冲一次 + 一条 5 s 的一键 toast）、窗口菜单里的"与 X 并排"、命令模式的 `v`。并排态由**同一枚**按钮变成徽章（点开 取消并排 / 交换左右），标签按**视觉顺序**排（左面在左），中间一枚映射分隔条的竖线，每面的标签用它的归属色下划线；任何一次并排后 5 s 内可"撤销"。手机（≤768 px）不变。

---

## 0. Owner 原话与它对应的三（四）个缺陷

> "我发现你这个side by side交互也有点问题，第一，我本来是想拖动窗口到左侧，结果莫名其妙进入了side by side模式。第二 side by side模式下标题栏的标签位置不符合直觉。第三 side by side模式和普通tabbed模式不太好区分。而且拖动的时候我往左拖却让窗口出现在了右侧很反直觉。你这个UX很不好，建议思考下UX改进"

> 第二条指令（覆盖任何"拖动时"的点子）："关于并排的设计，我觉得尽量不要搞太多拖动时候的复杂逻辑，除非很直观，不然只会让人感到困惑。我的理解是也许可以保持tab逻辑是唯一正常拖动吸附机制的例外，然后tab合并后在增加切换成side by side的按钮，当然这样会导致side by side需要两步，你可以斟酌一下怎样的UX是最好的，不行的话也可以在线调研一下。"

截图里的事实：一条标题栏，两个标签（"Fi…"、"Vi…"，各带 pool 芯片），下面两个面，右面活动；**chrome 上没有任何东西说"这是并排"**。

| # | Owner 看到的 | 缺陷名 |
|---|---|---|
| P1 | 想把窗口拖到左侧，却进入了并排 | **入口是拖动的副作用** |
| P2 | 并排态下标签栏的标签位置不符合直觉 | **标签顺序 ≠ 面顺序** |
| P3 | 并排态和普通标签态分不清 | **没有并排标记** |
| P4 | 往左拖，窗口却出现在右侧 | **落点半区决定方向，不是拖动方向** |

---

## 1. 复现（headless Chrome，scratch server，真实标题栏拖动）

`scripts/dbg-split-gesture.mjs`：worktree server + 假 `claude`（`CLAUDE_CMD`）+ 两个 chat 会话（Alpha / Bravo）；A **真的吸附在左边缘**（`wm._applySnap('left')`，它的标题栏盖住工作区左侧 30 px 吸附带），B 自由放在右边（left 700, top 80, 480×360）；每个手势 = `Input.dispatchMouseEvent` 按下 B 的标题栏（title span 中点）→ 14 步移动 → 松开。1280×900，2.369.160 的代码。

| 手势 | 指针路径（viewport px） | 松开那一帧 | 结果 |
|---|---|---|---|
| **G1** "拖到左边"：B 向左拖，松在 A 标题栏的**右半** | (947,138) → (537,62)，**Δx = −409** | 吸附指示器**显示中**（顶带），split 标记 `R` | `layout=split`，`pair=[A,B]`：**B 在右**（B 内容 left 357，A 内容 left 49）。= P1 + P4 |
| **G2** "拖到左侧边缘"：B 拖到 x = 工作区左边 + 12（吸附带内），指针在 A 的标题栏上 | (947,138) → (56,62)，Δx = −890 | 吸附指示器**显示中**（左带），split 标记 `L` | `layout=split`，`pair=[B,A]`（B 在左）；但 `tabs=[A,B]`，**标签条顺序 [A,B] ≠ 面顺序 [B,A]**。= P1（吸附被遮蔽）+ P2 |
| **G3** 对照：B 向左拖，松在 A 之外（A 下方，落进底部吸附带） | (947,138) → (415,892)，Δx = −531 | 吸附指示器显示中，split 标记空 | 无链，B `_isSnapped=true`（普通吸附照常） |

G1 之后的 chrome 事实（P2 + P3）：标签条里两个标签都 `split-member`，唯一的并排标记是 `.tab-label::before` 的 `"⫿ "`（9 px、opacity .55；在这台机器的 Noto 字体里渲染成豆腐块 —— `docs/mockups/split-ux/current.png`）；`.tab-split-glyph / .win-split-badge / .tab-split-btn` 元素 **0** 个；分隔条 6 px，`background = rgba(255,255,255,0.07)` = **与窗口边框同色**；宿主标题栏文字 = `Alpha — … Alpha — … ✕ Bravo`。**落区普查**：A 的标题栏 610 px 里 **489 px（80 %）是并排落区**（图标堆与控制钮之间的全部）。

---

## 2. 逐点表

| 点 | Owner 看到 | 为什么（file:function） | 最小改动 | 成本 | 风险 | 现在做？ |
|---|---|---|---|---|---|---|
| **P1 入口** | 拖窗口到左侧，莫名进入并排 | `tab-group.js:_detectSplitDropTarget`（345）在**每一帧**标题栏拖动（`window.js:_setupDrag` 384）和标签拖动（`tab-group.js:_setupTabDrag` 568）里对"另一个窗口的标题栏、图标/标签/控制钮之外"命中就武装一个并排落点 —— 无 hover 意图、无修饰键、占标题栏 80 %；松开时并排分支（`window.js` 573）排在吸附之前（607），所以目标窗口贴边时**吸附被遮蔽**（G2：指示器亮着却并排了） | **删掉整个拖动时并排落区**（`_detectSplitDropTarget`、`_markSplitDrop`、`.tab-split-drop-left/right`、两条 drop 分支、`chain-layout.dropSide`），不加任何 body 落区；入口改为合并后的显式按钮 / 菜单 / 命令（§4 R1） | 低（删代码 + 一枚按钮） | 低：`createWindow({intoChain})` 与实时视图的"并排到 X 旁"不经过落区，原样保留 | **做** |
| **P2 标签顺序** | 并排态标签位置不直觉 | `tab-group.js:_renderTabBar`（388）按**链顺序**（host 在前）画标签；`chain-layout.pairFor` 可把 guest 放左边 ⇒ 面在左、标签在右（G2） | 并排态按**视觉顺序**画：`pair[0]`、竖线 glyph、`pair[1]`、其余标签；PURE `visualTabOrder(chain)` 一处决定（§4 R3，变体 A） | 低 | 低：`tabs`/`active` 语义一字不动，只是渲染顺序 | **做** |
| **P3 分不清** | 并排 vs 标签态无法区分 | 唯一标记 = `style.css:4557` 的 `⫿ ` 伪元素（字体覆盖不保证）；分隔条 `style.css:4552` 用 `--border`（与窗口边框同色）；没有徽章、没有退出控件（只有实时视图窗口自己的 Unbind） | ⫿ 徽章（icons.js SVG 两栏图标）= 入口按钮的第二态，点开 取消并排 / 交换左右；面标签的归属色下划线；分隔条 hover accent + 右键同两项（§4 R4） | 低–中 | 低 | **做** |
| **P4 方向** | 往左拖却出现在右侧 | `chain-layout.dropSide`：看指针在**目标标题栏**的哪一半，与拖动**方向**无关；从右边拖来的指针先进入右半（G1：Δx −409 仍落在右） | 随 P1 一起消失：显式动词点名方向（"与 X 并排（在右侧）"默认，之后"交换左右"），不再有任何"指针位置"的判定（§4 R2） | 0（随 P1） | 0 | **做** |
| （附）撤销 | — | 一次误入并排今天只能从标签条拖出去 | 任何一次并排后 5 s toast "已并排 · 撤销"，恢复两个窗口的并排前位置（§4 R5） | 低 | 低 | **做** |
| （附）两步的代价 | owner 接受两步 | — | 合并刚发生时按钮脉冲一次 + 5 s toast "已合并为标签组 · 并排显示"一键 | 低 | 低（toast 可被 `toast seconds` 设置缩短） | **做** |
| （不做）拖动时 body 落区 / 意图延迟 | — | owner 第二指令：拖动时不要复杂逻辑 | 不建；chrome leg 反向验证"拖进 A 的 body 停 1.5 s 也不并排" | — | — | **不做** |

---

## 3. 在线调研：六个产品怎样进入并排

| 产品 | 进入方式 | 方向由谁决定 | 退出 | 对 VibeSpace 的启示 |
|---|---|---|---|---|
| **VS Code** | 编辑器右上角 **Split Editor 按钮**；标签右键 *Split Editor*；`Ctrl+\`；**把标签拖到编辑区的边缘**出现蓝色落区 | 按钮 = 固定向右；拖动 = 落到哪条边 | 关掉一个编辑器组 | 按钮优先，拖动只在**编辑区边缘的大面积落区**（不是标题栏半区）才是第二入口 |
| **JetBrains** | 标签右键 **Split Right / Split Down**；`Window › Editor Tabs`；可绑快捷键；也可拖标签到分割位置 | 动词点名方向（Right / Down） | 拖回去 / 关闭 | 动词里带方向 = 我们的 R2 |
| **Arc** | 标签右键 *Add Split View*；`⌘⇧+`；命令栏 "Add Right/Left Split"；拖侧栏标签到另一个标签的左/右侧 | 命令点名方向；拖动 = 落点侧 | 关闭一格 | 命令/菜单点名方向，拖动只在**侧栏标签之间**（不是整个窗口 chrome） |
| **Chrome 145+ (2026-02)** | 标签右键 *Add tab to new split view* / *New split view with current tab*；地址栏左侧 Split view 图标；拖标签到目标窗口**边缘**直到出现 "Create split view" 的 + 图标 | 菜单 = 当前页在左；拖动 = 落到哪条边，且要**停留** | 右键合并的标签 → *Separate views* | 拖动入口要 **停留 + 明确标签（+ 图标 / 文案）**，否则不做 —— owner 恰恰不要这类复杂逻辑，所以我们只留菜单/按钮 |
| **tmux** | `prefix %`（左右）/ `prefix "`（上下）；无拖动 | 键位点名方向 | `prefix x` | 命令模式的一个键（我们的 `v`）就够 |
| **iTerm2** | `⌘D`（左右）/ `⌘⇧D`（上下）；菜单 *Split Vertically/Horizontally*；无拖动入口 | 菜单/快捷键点名方向 | 关闭面 | 同上 |

**为什么"按钮优先"最贴 VibeSpace。** ① 窗口本来就会吸附、铺格（`_getSnapZone`、grid、presets）：把窗口拖到左边"就该"吸附到左边 —— 任何拖动时的第二含义都在跟这条最强的既有肌肉记忆打架（G2 就是它输掉的样子）。② **标签链才是容器**：并排是同一条链的另一种渲染（`chain-layout.js` 的设计前提），所以并排的自然前提是"已经在一条链里"，入口就该长在链的 chrome 上（标签栏）而不是别的窗口的标题栏上。③ 六个产品里四个（VS Code / JetBrains / Arc / Chrome）都把**菜单/按钮**当第一入口，拖动是可选的第二入口，且都要么落在**编辑区边缘的大面积落区**、要么要求**停留 + 明确标签**；把落区放在另一个窗口的**标题栏半区**、零停留、零标签，是六个里没人做的形状。④ owner 的第二指令直接否掉了拖动时逻辑；两步（合并 → 并排）被接受，我们把第二步做成显眼的（脉冲 + 一键 toast）。

---

## 4. 定案规则

### R1 入口 —— 拖动时**完全没有**并排

* 删除：`tab-group.js` 的 `_detectSplitDropTarget` / `_markSplitDrop`、`_setupTabDrag` 与 `window.js:_setupDrag` 里的两条并排分支、`style.css` 的 `.tab-split-drop-left/right`、`chain-layout.js` 的 `dropSide`（及其 export / 单测 leg）。**不加任何 body 落区**。窗口拖动 = 移动 / 吸附 / 网格；**标签合并落点（图标堆、标签栏）仍是唯一例外，一字不动**。
* 显式入口（都走 `wm.bindSplit(anchor, guest, { side, announce: true })`）：
  1. **标签栏的 ⫿ 按钮** `.tab-split-btn`（`icons.js` 新增 `columns` 两栏 SVG）：链 ≥ 2 个标签且 layout=tabs 时可见，位置在 `.tab-bar-tabs` 之后、`.window-controls` 之前；点击 = `wm.splitActive(chain)`：**活动标签在左**，伙伴 = **最近活动的另一个标签**（`chain.recent` 由 `switchTab` / 合并维护，本地状态，不入持久化与同步键；没有记录时取链里紧邻的下一个）。mousedown 上 `stopPropagation`，且 `window.js` 标题栏 mousedown 的排除列表加上 `.tab-split-btn`（按钮不是拖把）。
  2. **窗口菜单**（`taskbar.js:registerWindowMenu`，注册表项，`when: 在链里且链 ≥ 2`）：子菜单 **并排显示 ▸** → 每个其它标签一项 "**与 {name} 并排（在右侧）**"（被点的窗口在左）；并排态下改为两项 **取消并排** / **交换左右**。标签右键 = 打开**该标签自己窗口**的菜单（今天右键标签打开的是 host 的菜单，`_renderTabBar` 里给 `.tab-item` 挂 contextmenu → `showWindowContextMenu(app, tabWinId, …)`）。
  3. **命令模式**：`registerCommand` `chain.toggleSplit`（`v`：无并排则 splitActive，有则 unsplit）、`chain.swapSides`（`V`）、`chain.unsplit`、`chain.splitBeside(partnerId)`；`[CMD]` 提示行加 `v 并排`。
  4. **程序化**：`createWindow({intoChain:{split}})`（实时视图的自动绑定）和实时视图栏的 "并排到 X 旁" **不变**（后者传 `announce:true` 以获得撤销 toast）。
* **两步之间的桥**：用户拖动完成一次合并（三个合并落点：图标拖、标签拖、标题栏拖）后 `wm._afterUserMerge(chain)`：⫿ 按钮加 `.pulse` 一次（1.2 s，`prefers-reduced-motion` 下不动）+ `showToast(t('Grouped as tabs'), { action: { label: t('Show side by side'), run } })` 5 s —— `utils.showToast` 新增 `action` 选项（一枚按钮，点了即执行并关 toast）。恢复布局 / 远端同步产生的链**不**触发（只有三个拖动落点调它）。

* **焦点规则 + 按钮文案 + 桥的收回（split r1，验证者的三条）。** 每个**用户**入口都把焦点留在用户**动手的那个窗口** —— 按钮（`splitActive`）、窗口菜单的 "与 {name} 并排" 与命令模式的 `chain.splitBeside` 都传 `bindSplit(…, { focus: 'anchor' })`（菜单原先把焦点落到被**点名**的伙伴上：右键 A，却在往 C 里打字）；默认的 `'guest'` 只留给程序化的 `intoChain` 绑定与实时视图的"并排到 X 旁"（它的 guest 就是动手的那个窗口）。按钮的 title / aria-label 点名 `splitPartner(chain, chain.recent)` —— 点击**将要用**的那个窗口 —— 且 `switchTab` 在移动 `recent` 之后重写它（≥ 3 个标签的链上，渲染时算一次的文案点名的伙伴已经不是点击会用的那个）。"已合并为标签组" toast 挂在链上，该链任何一次 `bindSplit` 都把它收回；若它的动作在分组变了之后仍被执行，就**说出来** —— "已经在并排显示" / "标签组已变 — 没有可并排显示的" —— 绝不静默空转。由 `test-split-ux` leg 11 与 `test-contributions` 钉住。

### R2 方向 —— 动词点名侧，指针无关

"与 {name} 并排（在右侧）"是默认（发起者在左，伙伴在右）；之后用 **交换左右**（`wm.swapSplit(chain)` = 反转 `pair`，重画；`chainSyncKey` 带 pair 顺序，其它客户端按结构变化重建）。`pairFor({anchorId, guestId, side})` 保留给程序化路径，`side` 只来自调用者，永远不来自指针位置。

### R3 并排态的标签条 —— 变体 A（§5 评分）

`_renderTabBar` 在 split 态按 PURE `visualTabOrder(chain)` = `[pair[0], pair[1], ...其余按链顺序]` 画；两个面标签之间插一枚 `.tab-split-glyph`（`aria-hidden`，2 px 竖线，accent，镜像分隔条；纯 paint，不是节点 —— design-accessibility-tree §3 行 2 的规矩）；每个面标签 `.tab-pane` + `--pane-color` = 该面的**归属色**（`win._ownerBadge.dots[0].color`，否则 `ownerColor(会话 webuiId)`，否则 `ownerColor(win.id)` —— `chain-layout.ownerSeq` 对任何 id 都给一个槽），2 px 下划线；活动面的标签 `.active`（既有高亮）+ `.tab-split-focus`；隐藏标签排在两者之后，点它仍走 D19(a)（替换非锚面）。`tabs` / `active` / `pair` 的语义不变。

### R4 区分 + 退出

* **⫿ 徽章 = 同一枚 `.tab-split-btn` 的第二态**：split 时 `.on`（accent 底 + 描边）、`aria-pressed=true`、title "并排显示中 — 点击：取消并排 / 交换左右"；点击 `showContextMenu` 两项 **取消并排**（`wm.unbindSplit`，什么都不动）/ **交换左右**。一个位置、两种状态，用户只学一处。
* **分隔条**：`:hover` 走 accent（今天已有 `.tab-split-divider:hover` 的规则，但静态色与边框同色 —— 静态改为 `color-mix(accent 35%, border)`，让它在非 hover 时也比边框亮）；`contextmenu` → 同两项。
* 手机上徽章/按钮隐藏（R6）。

### R5 撤销

`bindSplit(..., { announce: true })` 在改动前拍快照 `{ guestWasFree, guestRect, guestZ, hostRect, chainBefore: {layout, split} }`，成功后 `showToast(t('Side by side: {left} | {right}'), { action: { label: t('Undo'), run: () => wm.undoSplit(snapshot) } })`（5 s）。`undoSplit`：链仍是同一个对象、layout 仍 split、pair 未变、两个窗口都在 ⇒ guest 原本自由 → `_detachFromChain` + 恢复 guest 与 host 的 rect（±2 px 的 leg）；guest 原本就在链里 → 恢复 `chainBefore`（tabs，或先前的 split 记录），**什么都不移动**。任何前提不成立 ⇒ toast 里说"已无法撤销"（不静默）。程序化的 `intoChain` 不出 toast。

### R6 手机（≤ 768 px）不变

一个面（`displayedPanes(chain, {narrow:true})`、`.tab-split-focus` 的样式表规则）；⫿ 按钮/徽章、glyph 隐藏；模型照旧原样携带 split 不拍扁（§6b 第五类守卫的既有 leg 保留）。

---

## 5. 标签条的三个 mockup 变体

标准 HTML（产品的 class 名 + `[data-theme="dark"]` 的 token），`docs/mockups/split-ux/{current,A,B,C}.html` → `*.png`（headless Chrome 700×520，DSF 1），Python/PIL 像素核对（窗口 640×380，标题带 = 前 32 行）：

| | current (2.369.160) | **A** 一条条、视觉顺序 | B 每面一条标题栏 | C 一枚并排芯片 |
|---|---|---|---|---|
| 标题带与 current 的像素差 | 0 % | **33.7 %**（6 911 px） | 61.6 %（12 617 px） | 47.4 %（9 705 px） |
| 归属色像素（A 橙 / B 蓝） | 0 / 15 | **300 / 330** | 0 / 641（非焦点面的条没有颜色） | 52 / 100（两个点） |
| 分隔条 15 个采样点为 teal | 0/15（= 边框色 (42,42,62)） | 15/15 | 15/15 | 15/15 |
| 面的名字可读性（640 px 窗口） | "Fix split UX" / "VibeSpace notes" 全显 | 全显（第三标签也在） | 右条只剩 **"Vi…" / "T…"**（320 px 里要塞标签+芯片+第三标签+徽章+四个控制钮 —— 正是 owner 截图里的 "Fi…/Vi…"，更糟） | 全显，第三标签折进 "+1 ▾" |

标签文案宽度（11 px，同一字体）：zh "并排" 22 px / "取消并排" 44 / "交换左右" 44 / "与 Alpha 并排（在右侧）" 123；en "Side by side" 61 / "Unsplit" 37 / "Swap left and right" 98 / "Beside Alpha (on the right)" 137；ja "並べて表示" 55 / "並べ表示を解除" 77 / "左右を入れ替え" 77 / "Alpha の隣に並べる（右側）" 142 —— 都只出现在菜单/toast 里，标题栏上只有一枚 24 px 的图标按钮，所以 i18n 长度对三个变体差别只在 C（芯片要装两个名字）。

**六准则评分（1–5）**

| 准则 | A | B | C |
|---|---|---|---|
| 直觉（"左面的标签在左"） | 5 | 4 | 3 |
| 与标签态的可区分度（像素差 + 徽章） | 4 | 5 | 5 |
| 拖动可供性（拖标签出去 / 拖标题栏移窗） | 5 | 3（两条把手，控制钮只在一边） | 1（没有标签就没有把手） |
| 手机一致性（≤768 只显一面） | 5（同一条条，隐藏 glyph 即可） | 2（要塌回一条） | 3 |
| i18n 长度 | 5 | 2（半宽的条装不下名字） | 4 |
| 实现成本 | 5（渲染顺序 + glyph + 下划线 + 一枚按钮） | 2（第二条标题栏 = 第二个 DOM 形状，`_detachFromChain` / 提升 / 拖动都要认两条把手） | 3（新的芯片组件 + 隐藏标签的第三标签入口） |
| **合计** | **29** | 18 | 19 |

**推荐 A。** B 的可区分度最高，但它打破了"一个窗口一条标题栏"这个整套几何（gridBounds / 吸附 / 桌面预览 / 拖动）赖以成立的形状，而且在 640 px 就把名字挤成了 owner 抱怨的那种 "Vi…"。C 把徽章做成了容器，却把第三个标签和拖出把手一起藏掉。A 在 current 的 DOM 上只改渲染顺序、加一枚 glyph、两条下划线和一枚按钮，可区分度靠徽章（accent 底）+ 分隔条提亮补足到与 C 同级。

---

## 6. 施工分块（≤ 3，每块与它的文档同一提交；leg 先红后绿）

> **已发布 2.369.162**（三块一次发布）。Chunk 1 = `test-window-binding-model` 65 → 96（落区钉翻成负钉）；chunk 2 = `test-contributions` 203（带链的窗口菜单矩阵 + 命令模式动词）；chunk 3 = `test-split-ux` **73 条 leg 全绿**（heavy；split r1 的 leg 11 之后 **85**），**在 2.369.160 上先红：10 失败 / 15 通过**（leg 4 处提前终止）—— leg 1、1a、2 都进入了并排（G1：`layout=split`，B 被藏进 A 的链），leg 4 找不到按钮也没有 toast；leg 3（body 停留）在两棵树上都绿，按构造如此（反向对照：body 落区从未存在）。`test-window-binding` 63 不变。

### Chunk 1 — 模型 + 窗口管理器核心（R1 删落区、R3 视觉顺序、R4 徽章、R5 撤销、合并后的桥）

**文件** `src/lib/chain-layout.js`（删 `dropSide`；加 `visualTabOrder(chain)`、`swappedPair(chain)`、`splitPartner(chain, recent)`）· `src/lib/tab-group.js`（删 `_detectSplitDropTarget` / `_markSplitDrop` / 标签拖动的并排分支；`_renderTabBar` 视觉顺序 + glyph + `.tab-pane`/`--pane-color` + `.tab-split-btn` 两态；`bindSplit({announce})` 快照 + toast；`swapSplit`、`undoSplit`、`splitActive`、`_afterUserMerge`、`chain.recent`；分隔条 hover/contextmenu；标签 contextmenu → 自己窗口的菜单）· `src/lib/window.js`（删 `_setupDrag` 的并排分支与 `splitTarget`；mousedown 排除 `.tab-split-btn`；合并落点调 `_afterUserMerge`）· `src/lib/utils.js`（`showToast` 的 `action`）· `src/lib/icons.js`（`columns`、`swap`）· `public/style.css`（删 drop 类；`.tab-split-btn{,.on,.pulse}`、`.tab-split-glyph`、`.tab-pane` 下划线、分隔条静态色、≤768 隐藏）· `src/lib/i18n-zh.js` / `i18n-ja.js`。
**Legs（先红）** `scripts/test-window-binding-model.mjs`：① `dropSide` 不再导出；`visualTabOrder` 对 `pair=[B,A]`、`tabs=[A,B,C]` 给 `[B,A,C]`；`swappedPair`；`splitPartner` 取 recent 里最近的另一个、无记录取相邻；③ wiring pins 翻转为**负钉**（`tab-group.js` / `window.js` 里 `_detectSplitDropTarget` / `tab-split-drop` 零命中；`_setupTabDrag` 与 `_setupDrag` 不再调用 `bindSplit`）+ 正钉（`_renderTabBar` 走 `visualTabOrder`；三个合并落点各调一次 `_afterUserMerge`；`bindSplit` 的 announce 走 `showToast(…, { action`；§6b 四道守卫仍原样）。`scripts/test-window-binding.mjs` ③ 的文案改为"没有落区代码可跑"。
**文档** `docs/kb-file-structure.md`（chain-layout.js、tab-group/window/layout 两条 essay）· `docs/design-agent-browser-v2.zh.md` §4.6 + `.md` §4.6（交互小节：拖到标题栏半区 → 显式入口）· `docs/kb-features.md`（Window Manager 的 Tab groups 行 + P7 "How it behaves"）· `CLAUDE.md` 索引行（tab-group.js / chain-layout.js / window.js，≤300 字符）· `docs/window-manager.md`（用户文档：标签组 → 并排）。

### Chunk 2 — 动词与表面（R1 的菜单 / 命令模式、R2 的文案、实时视图与设置文案）

**文件** `src/lib/taskbar.js`（窗口菜单注册项：并排显示 ▸ / 取消并排 / 交换左右，`when` 按链）· `src/lib/command-mode.js`（`chain.toggleSplit` `v`、`chain.swapSides` `V`、`chain.unsplit`、`chain.splitBeside`；提示行）· `src/lib/browser-live-window.js`（"并排到 X 旁" 传 `announce:true`；设置描述文案不再提"拖到标题栏左半/右半"）· `src/lib/settings-schema.js` + `docs/settings.md`（`browser.autoBindLiveView` 描述）· i18n。
**Legs** `scripts/test-contributions.mjs`（窗口菜单矩阵：无链的 ctx 不变；带链的 ctx 多出子菜单，标签点名 `与 {name} 并排（在右侧）`）· `scripts/test-window-types.mjs`（不新增窗口类型；仅确认 census 仍绿）· `scripts/test-architecture.mjs`（§44 设置 census、§47 onboarded census 对新 chrome suite）。
**文档** `docs/kb-file-structure.md`（taskbar.js 窗口菜单、command-mode.js 行）· `docs/keyboard-shortcuts.md`（`v` / `V`）· `docs/kb-features.md`（Window menu 行）。

### Chunk 3 — Owner 手势的 chrome 门 + 发布

*按规格施工，两点施工记录。*（a）§1 的 G1 松开行（A 标题栏的中线）落在工作区顶部 30 px 吸附带**之内** —— §1 表里已记"吸附指示器显示中（顶带）" —— 所以那里的自由松开是**顶部吸附**，不是跟随指针的位置。于是门里 leg 1 松在 A 标题栏的下沿几行（离工作区顶 33 px，带外 ⇒ 跟随指针 ±8 px，实测 Δ −409 / −64），leg 1a 走 §1 原路径（⇒ 指示器许诺的 `top` 吸附，±2 px）；两者在 2.369.160 上都会并排。G2 同理松在下沿（x = 工作区 + 12 ⇒ `left`，不是 `top-left`）。（b）假 `claude` 给每个会话**自己的**对话 id（fixture 家族前缀 + shell pid）：共用一个 id 时，第二个客户端恢复布局会把两个窗口都挂到同一个会话上。

**文件** `scripts/test-split-ux.mjs`（heavy，chrome；场景 = `dbg-split-gesture.mjs`：假 claude、两个 chat 会话、A 吸附左、B 在右，桌面页 1280×900 + 第二个桌面客户端 + 手机页 390×844）· `scripts/ci.mjs`（heavy 行 + why）· `package.json` / `package-lock.json`（2.369.162）· `CHANGELOG.md`（本 lane 唯一一条）。
**Legs（先红：在 chunk 1 之前的树上，G1 会并排）**
1. **G1 owner 手势**：B 向左拖过 A 的标题栏，松在右半 ⇒ **无链**，B 移动（B.left 变化 > 300 px，元素仍 display flex），A 的 rect 不变；
2. **G2 边缘**：拖向左工作区边缘、指针在 A 标题栏上 ⇒ B 的 rect = 左吸附区（±2 px），无链；
3. **body 反向 leg**：B 拖进 A 的内容区并停 1.5 s 再松 ⇒ 无链（R1：没有 body 落区）；
4. **合并仍是唯一例外**：B 拖到 A 的图标堆 ⇒ tabs 链；⫿ 按钮出现且带 `.pulse`；toast 含 "已合并为标签组" 与一枚 "并排显示" 按钮；点它 ⇒ `layout=split`，`pair=[B,A]`（活动的 B 在左），**标签条顺序 = 面顺序**，两标签间一枚 `.tab-split-glyph`，两条下划线 = 两个会话的 `ownerColor`；
5. **徽章 / 取消 / 交换**：按钮 `.on` + `aria-pressed`；点开菜单两项；交换 ⇒ `pair=[A,B]` 且条顺序跟着变；取消 ⇒ tabs，host rect 不变（±1 px），按钮回到入口态；
6. **撤销**：`wm.bindSplit(A, B自由, {announce:true})`（实时视图 "并排到 X 旁" 的调用形状）⇒ toast 含两个名字 + 撤销；点撤销 ⇒ B 自由且 rect 回到并排前（±2 px），A 不动；再从 tabs 态按钮进入并排后撤销 ⇒ 回到 tabs，什么都不动；
7. **分隔条**：hover 的计算背景 ≠ 边框色；右键菜单两项；
8. **两个客户端**：第二个桌面页看到同一条链（layout、pair、条顺序），交换后亦然；§6b 守卫 leg 原样；
9. **手机**：一个面，无按钮/徽章/glyph，模型仍 split；
10. **命令模式**：`Ctrl+\` `v` 在 tabs 链上进入并排、再按退出；`V` 交换。
11. **split r1**（第三个会话 Charlie）：[A, B, C] 并排再取消之后，真实点击 B 的标签 ⇒ 按钮文案改为 `splitPartner` 的窗口，且点击用的正是它；经按钮进入并排 ⇒ 收回 "已合并为标签组" toast，而它的动作在远端形状的并排 / 分组解散之后执行时会说明原因；Alpha 标签的 "与 Charlie 并排" ⇒ pair [A, C]，焦点仍在 A。
**文档** `CHANGELOG.md`；`docs/kb-file-structure.md` 的 `scripts/test-split-ux.mjs` 行；`CLAUDE.md` 的 `docs/design-split-ux.zh.md` 索引行。

### i18n 键（英文键 → zh / ja；chunk 1 与 2 各加自己的）

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
| `Already shown side by side`（r1） | 已经在并排显示 | すでに並べて表示しています |
| `The tab group changed — nothing to show side by side`（r1） | 标签组已变 — 没有可并排显示的 | タブグループが変わりました — 並べて表示するものがありません |

（`Shown side by side` / `Unbind` / `Snap beside {name}` / 分隔条提示已存在，原样复用。）

---

## 7. 诚实边界 / 不做

* **没有拖动时的并排入口，一个都没有**（标题栏半区删除，body 落区不建）。想要"拖出来的并排"的人走：拖合并（唯一例外）→ 点 ⫿。
* 实时视图的自动绑定（`createWindow({intoChain})`）不出 toast、不脉冲 —— 它不是用户的动作。
* 交换左右会改 `chainSyncKey`，其它客户端按"结构变化"重建这条链（重新挂两块 content）；一次显式动作，可接受；比例（ratio）继续原地应用。
* `chain.recent` 是本地状态：另一个客户端的"最近活动标签"可能不同 —— 它只决定**默认伙伴**，菜单可选任何伙伴。
* 徽章/按钮的 24 px 在 `window.tabWrap` 换行模式下与标签同行排在末尾；极窄窗口（宿主 < 260 px）时由一条新样式表规则隐藏（今天没有任何标题栏按钮按宽度隐藏 —— 这条规则是新的，chunk 1 一并加）。
* **门发现、本 lane 不修（既有问题，`src/lib/layout.js`）：** 客户端在 `_restoring` 门抬起期间（每次远端应用后 1 s、自身开机恢复后 5 s）收到的 `layout-sync` 一律**丢弃**，之后也不再补要（seq 不前进，也不延后应用）。客户端 2 刚加载的 ~5 s 内在客户端 1 上做的交换，在客户端 2 上一直丢失到下一次变化（leg 8 在等待客户端 2 的门之前复现过）。可能的修法是改丢弃为延后（照 `_pointerDown` 路径的"最新者胜"）；它动到 §6b 守卫，需要自己的 leg。

---

## 8. v2（2026-09-25，inc-muhfb5al-jzk6）—— 每侧一半的标签条、拖动重排、链接默认并排、两个设置

**Owner 原话**（2.369.177，Report a problem）："这个UX非常奇怪啊，首先并排之后tab列表都在左侧，比较难看出来哪边是哪个tab。其次我没法拖动tab重排序，最后我只能调整右侧展示的tab而无法调整左侧的。建议加入tab拖动+直接两侧分开展示的功能。" 接着："另外以后从窗口打开文件路径/本地链接的时候默认side by side展示吧。然后拖动窗口后是直接side by side还是普通tabbed，以及打开文件路径/链接默认用并排还是独立窗口也都加入设置选项。"

**三个缺陷的实测**（reader，1600×900 headless，宿主 1200×600）：并排后标签条完全不跟分隔条 —— 比例 0.5 时右面板的标签中心在右面板左缘**左侧 282 px**，比例 0.7 时三个标签全部压在**左**面板上方；水平拖标签什么也不做（只看竖直 30 px 的拖出）；D19 (a) 只替换非锚面板，交换之后也只有宿主之外那一面可换 —— 正是"只能调右边"。

### 模型（PURE `src/lib/chain-layout.js`，门 `scripts/test-chain-layout.mjs`，fast）

* `tabs` 的含义一字不改（成员；`tabs[0]` = 持有元素的宿主 —— 重排**绝不**换宿主，换宿主会把每块 content 重新挂载）。新增 `order` = 标签条顺序（`tabs` 的一个排列；缺省 = `tabs` 顺序）。
* 并排时**每个标签属于一侧**：`split.left` / `split.right` 是有序列表，并集 = `tabs`，每个 id 一次，`pair[0] ∈ left`、`pair[1] ∈ right`，标签条 = `left ++ right`（所以取消并排天然是"左边然后右边"）。`normalizeChain` 是唯一的校验：pair 成员在错的一侧、某侧为空 ⇒ 塌缩为 tabs（校验器从不猜面板；动词先选替补再规范化）。
* **创建规则**（`enterSplit`）：guest **独自**去它那一侧，其余标签（按标签条顺序）留在锚那一侧；在**已经并排**的链上，锚保留自己的一侧，guest 去**另一侧**末尾，两者都显示 —— "在源旁边"永远是源不在的那一侧，不是字面的"右"（字面的右会盖住右侧的源）。
* **旧记录修复**（写一次，`sidesFor`）：没有侧列表的记录 ⇒ 非锚面板独自一侧，其余全部跟锚（锚 = 宿主若在 pair 中，否则左成员）。
* 动词：`showTab`（显示在**它自己**那一侧 —— 两侧都能切换；`splitReplaceable` / D19 (a) 退役）、`moveTab`（重排；跨界 = 换侧，**正在显示的**标签带着显示过去，它离开的那侧显示原位置的邻居，否则前一个；离开的一侧空了 ⇒ 并排结束；隐藏的标签跨界仍隐藏 —— pair 只在被移动的标签正在显示时才变 —— 这一句只对键盘 / API 路径成立：**按下即显示**（浏览器的规则），所以指针拖动移动的永远是一个**正在显示**的标签，它带着显示过去（v2 verify r1 ⑤）；永不新建并排）、`removeTab`（被移除的面板由同侧同下标的邻居替补，一侧空了 ⇒ 结束；`active` 按窗口 id 保持 —— 裸 `splice` 会把它滑到下一个）、`insertTab`、`swapSides`（侧列表随 pair 一起互换）。
* `chainSyncKey` = 成员 + 标签条顺序 + 布局 + 侧的切分点 + pair，在规范化的**副本**上计算（旧记录与它的修复形式同键）；比例仍原地应用。

### 标签条（`_renderTabBar`，`public/style.css`）

* 并排时标签条是**两半**：宿主的标题栏是宿主网格的 **subgrid**（它本来就跨 1 / -1），`.tab-bar-split` 以 `display: contents` 溶解成：左半（第 1 列）、glyph（第 2 列 = 分隔条正上方）、右半（第 3 列）。`splitColumns()` 仍是列的唯一写法 —— 分隔条拖动时两半**无需任何 JS** 跟随（实测每帧 ±1 px）。⫿ 徽章与窗口控件和右半共用第 3 列、贴在末端，右半用 `--split-ctl`（标题栏 ResizeObserver 发布的控件宽度，发布在**宿主**上）+ `--split-btn` 以 **margin**（绝不是 padding —— 滚动盒会把溢出画进自己的 padding）预留它们；右列有**下限**（`splitColumns`：控件 + 一个标签的位置，≤ 45 %）；右列放不下徽章 + 一个标签时徽章让位（`.split-btn-hidden`，分隔条右键仍有 取消并排 / 交换）（v2 verify r1 ②）。
* 每半列出它那一侧，按顺序；每侧**显示中的**标签是 `.tab-pane`（窗口底色 + 归属色下划线），聚焦的那个另加 `.active` + `.tab-split-focus`。一次点击只**原地重标**（`_markStrip`），绝不在指针下重建标签条。
* tabs 布局：一条标签条，按 `order`。手机（≤ 768 px）：一条标签条（左然后右），无半、无 glyph（R6）。
* 在面板里按下 = 聚焦**那个**面板（`chain.active` + `activeWindowId`）—— 之前点哪个面板都聚焦宿主，键盘 / 命令模式 / 菜单作用在错的标签上。

### 拖动（`_setupTabDrag`）

* 移动的**前 8 px 一次性决定**：以水平为主 = **重排**（插入标记、rAF 合并、每次拖动一个 AbortController、Esc 取消，松开 = `moveTabInChain` —— 唯一的变更路径：PURE moveTab → normalize → 重新派生 → notify），之后再往下也**不会**变成拖出；以竖直为主 = v2 之前的拖出路径原样（|dy| > 30）。跨过两半的分界 = **移动到另一侧**，永不新建并排。
* R1 仍然成立：**没有拖动会新建并排** —— 图标堆叠合并仍是唯一的拖动例外；F3 的设置只是让这个例外直接落成并排。
* 键盘：`Ctrl+Shift+PageUp` / `PageDown`（注册表和弦，在 app.js；窗口不在 ≥ 2 标签的组里时惰性 —— 浏览器保留它；终端只在组里才放行）和命令模式 `{` / `}` 在**它自己的列表**里左右移动活动标签，到边缘不动。

### 两个设置（Settings → Window，schema 驱动，均在**动作发生时**读取）

* `window.mergeDropLayout`：`tabs`（默认 = 今天：合并为标签 + 脉冲 / "并排显示" toast）| `split`（图标堆叠合并直接并排，被拖的窗口在**右**，toast 提供 **撤销**（被拖的窗口回到拖动前的位置 —— 三个落点在拖动开始时记下矩形）与 **取消并排**（保持为标签组，被拖的窗口回到它**落下的槽位** = `tabs` 设置本来的结果；只要标签条仍是这次并排造出来的样子 —— v2 verify r1 ③））。落到一个**已经并排**的链上（两个设置下都一样）：被拖的窗口进入指针下的那一半并在那里显示，toast 说出新的一对并提供 **撤销**（窗口回到拖动前的位置，并排回到落下前的两侧 / 顺序 / 一对 —— 三个落点共用一个 `_mergeDrop`，在落下前快照目标链；v2 verify r1 ④）。
* `window.openLinkPlacement`：`split`（默认，owner 的选择）| `tab` | `window`（今天的自由窗口）。从对话打开的路径 / 本地链接（chat-renderers 的三个打开点）以**该对话自己的窗口**为源（ChatView 的 winInfo，点击时读取 —— 绝不是活动窗口），经 `app.linkPlacement` 算出 `intoChain`，穿过 `FileViewer.open` 的四个 createWindow 与 `openEditor`：`split` = 在源旁边（已并排时在源不在的那一侧）；`tab` = 紧跟源的一个标签（并排时在源那一侧）并显示。源已关闭 / 最小化 / 在别的桌面 / Stage 开着 / 手机 ⇒ 自由窗口。同一个窗口再次打开同一路径 ⇒ 显示它已在的标签（`:line` 链接把编辑器移到那一行）。文本文件直接进编辑器（不再先生一个空 viewer 再关掉 —— 它会在链里闪一个标签）。

### 多客户端（kb-design-lessons §6b 补遗）

* 键变了但**成员与宿主相同**（重排、跨侧移动、单侧切换、交换、并排 / 取消）⇒ 另一个客户端**原地**应用（`applyChainRecord`：不重新挂载任何 content，`active` 仍是本客户端的，除非新布局把它藏起来）；只有成员或宿主变化才重建。§6b 四道守卫一道没动。
* **本地分隔条拖动优先于它不可能知道的记录**（v2 verify r1 ①）：客户端 2 拖分隔条时客户端 1 做了一次结构变更 → 这条记录被 §6b 守卫 3 扣到 pointerup，然后原地应用 —— 以前 `applyChainRecord` 把记录的比例（0.50）盖过拖动（0.15），应用末尾清掉 user-dirty 又把 pointerup 自己的那次保存丢掉：客户端 2 一秒后弹回，谁都没收到。现在用户的分隔条动作（拖动松开、双击，且比例确实变了）在链上打一个**本地**戳（PURE `holdRatio`，不持久化、不进键、不进 clone），下一次离开本客户端的保存释放它；戳还在（≤ 60 s = §6b 自己的 dirty 过期）且比例仍是那个值时，**两条**原地路径（键相同的比例、同成员的记录）都保留本地比例，应用之后**只重发一次**（dirty 位用拖动真实的松开时刻重新置位，不伪造"现在"）。实测：客户端 2 在 +1 s / +5 s 都是 0.15，客户端 1 与磁盘 0.15，客户端 2 恰好 1 次 layout-sync，0 回声。一个空闲客户端**不会**重发（它没有戳）—— 验证者建议的"本地已并排就一律保留本地比例并重发"会让空闲客户端把陈旧比例回推，盖掉别人刚拖的分隔条，所以没采用。
* 一个成员窗口还在**异步回放**（`FileViewer.open` 先 await `/api/file/info` 再建窗口）⇒ 那条链**挂起**直到它出现（有期限；过期则把在场的成员组起来）。之前客户端 2 会留下一个自由 viewer，它下一次由用户引起的保存（不带链）会拆掉客户端 1 的链（reader 实测：0.3 / 1 / 2.5 / 5 s 都是自由窗口）。启动恢复走同一个协调（`_queueChain`）。
* 版本错位：≤ 2.369.177 的客户端保存时丢掉 `order` / `left` / `right`，新客户端按规则修复 —— 过渡性的（旧标签页重连时重载）。

### 门

`scripts/test-chain-layout.mjs`（fast，新）· `test-window-binding-model`（fast，④ 接线钉）· `test-contributions`（命令 + `{` / `}`）· `test-split-ux`（heavy，腿 12：L1–L11 + L1b / L4a / L7b–L7d（v2 verify r1），`test-chain-layout` ⑪ 持有的比例 + 两个补丁副本对照；腿 12 原有：L1–L10，每条能有对照的都有对照 —— subgrid 规则被中和 ⇒ 不对齐；`moveTabInChain` 被中和 ⇒ 不重排；客户端 2 的协调退回"有啥组啥" ⇒ 异步 viewer 成了自由窗口；和弦在无组窗口上惰性；`tabs` 设置 ⇒ 同样的落点合并为标签）。

### 诚实边界（v2）

* 标题栏里**还是**一条标签条的 DOM（一个标题栏一个窗口，§5 否决变体 B 的理由仍在）；两半挤：640 px 窗口、比例 0.5 时右半约 317 − 8 − 89 − 30（内边距 + 控件 + 徽章）≈ 190 px。窄窗口上右列有下限（控件 + 一个标签的位置）：比例照存（例如 0.85），这个客户端把右列画在下限处，分隔条停在那里；更宽的客户端按比例原样显示。
* 成员变化（重建）期间的分隔条拖动仍按记录的比例（持有只覆盖两条原地路径）。
* `Ctrl+Shift+PageUp/PageDown` 在普通浏览器标签页里浏览器可能留给自己（"移动标签页"）；已安装的应用窗口里页面拿得到。命令模式 `{` / `}` 永远可用。headless 无法证明页面的 preventDefault 能否赢过浏览器 —— 需在有头浏览器里确认。
* 从文件浏览器双击 / 归档条目打开的文件**不**走 F2（owner 说的是"文件路径 / 本地链接"；把文件浏览器当启动器会把文件堆进它的链）。Ctrl+G 编辑器是终端内的分栏，不是"从窗口打开"。
* 分类只做一次：以水平开始的拖动之后往下拖**不会**拖出（要拖出就先往下）。
* 一次重排 / 切换会让其它客户端**原地**更新；成员变化仍是结构性重建（重新挂载 content）。
* 标题栏拖动一个标签**组**（宿主）落到另一个窗口的图标上：以前会把宿主单独合并过去、把组里其它标签留成孤儿（藏在隐藏的宿主元素里）；现在组整体只移动，不合并（逐个标签合并）。
* `_restoring` 期间丢弃 layout-sync 的既有问题（§7）没修。
* D19 (a)（`docs/design-agent-browser-v2.zh.md` §4.6）被 owner 2026-09-25 的裁决取代：两侧都可切换。

### v2 verify r1（2026-09-25，对抗验证者 → 修复 agent）

先按验证者的配方复现为红（`test-split-ux` 的新腿 L1b / L11 / L6 / L9 / L7b / L7c 在未修的构建上全红），再修到根上，数字为证：

* ① **minor，已修** —— 客户端 2 的分隔条拖动跨过客户端 1 的结构变更后弹回、无人收到。见上面"多客户端"的第三条；门：L11（真实拖动 + 客户端 1 在第 4、5 次移动之间 `moveTabInChain`，客户端 2 持有记录）+ 对照（`_holdSplitRatio` 被中和 ⇒ 同样的拖动 0.15 → 0.50 弹回记录的 0.15、0 次发送）；`test-chain-layout` ⑪ + 补丁副本对照（无过期 / 无视已移动的比例）。
* ② **low，已修** —— 640 px 宿主、比例 0.85：右列 95 px 比控件（89）+ 徽章还窄，padding 预留让标签画在 □ 下面（实测 610–630 vs 控件起点 606）。修：右列下限 + margin 预留 + 徽章让位。L1b：同一拖动后标签 ≥ 30 px 可见（实测 44 px）且可点，控件第一个可见按钮在自己中心处命中自己，徽章隐藏；回到 1100 px / 0.5 徽章回来；对照 = 原样的列与 padding ⇒ 标签画在控件下。
* ③ **low，已修** —— `mergeDropLayout = split` 的 toast "取消并排"把被拖的窗口放到末尾而不是落下的槽位。L7b：`tabs` 下的参照 [A, C, B]，`split` 下 取消并排 = [A, C, B]；对照 = 徽章菜单的普通取消并排（左然后右 [A, B, C]）。
* ④ **low，已修** —— 落到已并排的链上没有 toast、没有撤销。L7c（`tabs` 与 `split` 两种设置）：左 [A, C]、pair [C, B]，toast 只有 撤销；撤销 ⇒ C 回到拖动前的位置（±2 px），并排回到 [A | B]。L7d：[A, D | B]（D 隐藏）、C 落在 A 与 D 之间 ⇒ 撤销后恰好 [A, D | B]、pair [A, B]；对照 = 恢复落下前布局被中和 ⇒ 撤销只拆出 C，显示 D（pair [D, B]）。
* ⑤ **low，文档已修** —— "隐藏的标签跨界仍隐藏"只对键盘 / API 成立；按下即显示（浏览器的规则，保留），指针拖动总是移动一个显示中的标签。L4a 钉住两种路径。
* ⑦ **low（既有），已修** —— 开机恢复的 `applyPosition` 把窗口重新编号到保存的 id，却没带上 `wm.activeWindowId`（它指向不存在的窗口）。一行修复；L6 / L9 重载后断言它指向活窗口（未修时两处都红）。

**v2 verify lows (not fixed)**（2026-09-25）：

* ⑥ lane 提交 `bae4d382` 的 trailer 是 `Claude Opus 5.5 (1M context)`，不是 lane 规则写的那一行 —— 修复 agent 按规则不改写历史（不 rebase / squash / amend）；修复提交用的是本会话署名规则给出的那一行（Opus 5.5），合并时如需统一由集成方在版本提交里处理。
* ⑧（既有，测试脚手架诱发）两个客户端以**不同的窗口 id** 持有同一批会话：第一次结构广播让陈旧的客户端关掉全部 chat 窗口且一个都不新建（`_applyRemoteState` 先建远端 id —— `replayOpenSpec` 按会话去重 ⇒ 什么也没建 —— 再关掉不在远端的本地窗口）。修法（远端窗口的会话已在本地以别的 id 打开 ⇒ 重新编号而不是建 + 关）触及多客户端同步的核心，不在本 lane 的范围内；登记在此。
