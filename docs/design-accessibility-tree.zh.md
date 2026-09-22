# 无障碍树根治设计 — "暴露结构, 不暴露涂装" (2026-09-22)

> 状态: 设计稿, 等 owner 点头 (D1–D4)。起因: owner 的 Windows 整机卡顿 (2.369.144 定案: 一个 UIA 客户端让 Chrome 打开了 Web accessibility 模式, VibeSpace 标签页 50,150 个无障碍节点, 浏览器 UI 线程 `HandleAXEvents` 39.5 s)。owner 原话: "这个问题能根治嘛？比如优化 dom 树，暴露给 accessibility 必要的内容但不会失控？"
> 数据来源: 一次只读普查 (wf_89ddbc62-20e, 2026-09-22): 四个读者按子系统逐行数模板 + 12 份 incident bundle 的 inventory/geom + 遥测 dom-nodes; 综合者逐条复核。所有"估计"都标了; 需要活测量的列在 §5。

## §0 规则 (Chrome 的无障碍树怎么算)

- `display:none` 与 `content-visibility:hidden` 的子树**不在**树里; `content-visibility:auto` 的离屏子树**在**; `aria-hidden` 从平台树剪掉整棵子树 (是否也从序列化载荷剪掉 = §5 OQ1); `role=presentation` 只去元素不去文本。
- 每个元素**和每个文本节点**各算一个节点; UIA 客户端开的 kInlineTextBoxes 模式下每个 static-text 还按渲染行片段再长 inline-text-box。实测 50,150 AX / 22,692 元素 ≈ **2.2×**。
- 网页拿不到"模式是否开着" (隐私), 产品只能控制自己暴露什么, 做不到检测。

## §1 节点从哪来 (owner 抓到 50,150 那一分钟的页面: 5 个聊天窗, 1 个最小化, 292 张已渲染卡, 侧栏 120 行, 0 终端)

| 来源 | 份额 | 依据 |
|---|---|---|
| 四个**可见**聊天转录的已渲染卡片 | ≈ 26–34k = 52–68 % | 22,692 元素 − 侧栏 3.7–4.8k − chrome 1–2k − 最小化窗 2.5–3k ≈ 13.5–15.5k 暴露元素 × 2.2–2.5; kb 的 130 AX/卡 × 242 ≈ 31k 互相印证 |
| ↳ 其中 **82–85 % 的已渲染卡片在视口外** (geom: 227 张里 40 张在视口内) | 全在树里 | `.chat-msg { content-visibility:auto }` 不剪 AX |
| ↳ 关闭的工具卡壳 (Bash 占真实转录里 75 % 的工具调用) | 每张 16–18 节点 | `.chat-msg > .chat-tool-use > label + svg(3) + text + 两个 <details>/<summary>/▸ 生成文本` |
| ↳ assistant 正文卡 | p50 18–22, p90 60–90 | DOMPurify(marked) + linkify span + 两个悬浮按钮的 SVG; fenced code 在正文里是**一个**文本节点 (marked 不分 token) |
| ↳ minimap 标记 | 每窗每个 user turn 一个 div, **不封顶** | `renderFullExtent` 走整个对话的 turn; 唯一随对话长度而不是渲染窗口增长的项 |
| ↳ 关闭 `<details>` 里的代码块/diff | 按规则 0 (关闭 = content-visibility:hidden) — **但** chat.css:418-421 记录过 headless chrome 里关闭 details 的子元素仍然布局 (202 px), 若成立则一张 p50 Read 卡暴露 ≈ 500 而不是 13 = §5 OQ2 | 每行代码 JS ≈ 12 节点 (实测 hljs + 跨行 span 重开), JSON 12.8, bash 8.2, CSS 16.2, plain 5; 打开的 200 行 Read ≈ 3,000, 3,000 行上限 ≈ 36,000 |
| 侧栏 (默认过滤含 stopped ⇒ 120 行, 110 是 stopped) | ≈ 8–12k = 16–24 % | 每行 ~22 暴露节点 (+ ~60 个 display:none 的急切详情面板, 90 张卡 ≈ 5–7k DOM + ~1k listener) |
| 静态 chrome + 每窗 chrome (8 个空 resize handle + 4 按钮 + 图标栈) | ≈ 2–4k = 4–8 % | 模板逐行数 |
| **stale** 待删节点 (翻页/折叠重建的 churn: `_updateRuns` 每趟删掉再插回**所有** run header/footer; 状态栏每次更新 innerHTML 整条重建) | 9,902 = 20 % (实测) | chrome://accessibility 的 stale 计数 |
| 已经在树外 | 0 | 最小化窗 (display:none), 折叠 run 成员, 折叠文件夹, 关闭 details 的内容, 隐藏桌面的聊天窗 (content-visibility:hidden, 自 2.369.3) — 所以 .144 的桌面杠杆在所有抓到的状态里删掉的是 0 |
| 未抓到但**单独**就能到 50k 的形态 | 最坏情况 | 巨型会话的 gap slab: 每次取 2,000 条, 按条数封顶 3,400/2,400, 从不折叠 ⇒ 单窗 50–71k; Ctrl+F 打开时 `_updateRuns` 直接 return ⇒ 3,000 张折叠成员全部展开 |

## §2 目标

1. 暴露的节点数与**渲染了多少卡片、翻了多少页、gap slab 多大、搜索开没开**无关 — 只与视口附近的内容有关 (结构性上界)。
2. 代码块在树里是 O(1): 文本暴露**一次**, 涂装 (token span / 行号) 不暴露。
3. 纯涂装 (图标 / 行号 / 折叠箭头 / resize handle / minimap) 不进树。
4. 一条 heavy 门用 Chrome **自己的**树计数 (CDP `Accessibility.getFullAXTree`), 每卡 / 每窗 / 每标签页有上限, 增长不变量红了就挡 — "不会失控"靠门不靠自觉。
5. 屏幕阅读器用户不失去任何**控件**: 按钮保留可访问名, 视口附近的内容全部可读; 默认值保持诚实。

## §3 方案 (按顺序; 0 决定 1–4 写什么属性)

| # | 步骤 | 机制 | 预期削减 | 风险 | 门 |
|---|---|---|---|---|---|
| 0 | **先量再拧**: AX 普查门 + AX 相关计数器 | 新 heavy 套件 `scripts/test-ax-budget.mjs`, 用每个 chrome 套件都有的裸 ws `cdp()`: `Accessibility.enable` (和 UIA 客户端一样把渲染进程的 AX 模式打开) → `getFullAXTree({depth:-1})`; 数 TOTAL (Blink 序列化的 = HandleAXEvents 付的) 与 NON-IGNORED (平台树) 两个数; 按 `DOM.querySelectorAll` 的 backendNodeId 归属到每张卡 / 侧栏 / 状态栏 / minimap。腿: ①纯 chrome 基线 ②按卡种类的每卡成本 (真实形状的 fixture) ③增长不变量 (50 张卡 vs 翻 4 页 vs Ctrl+F vs teleport gap) ④隐藏态 Δ=0 ⑤打开的 3,000 行 Read ⑥关闭 details 是否在树里 (OQ2) ⑦负控 (去掉属性的副本必须变大)。incident inventory 加 `axExposedEst` (TreeWalker 文本节点) 与 minimap 标记数 | 不直接削减; 把 50,150 变成一个被门守的数, 并回答 OQ1–3 | 低。50k 节点页上 getFullAXTree 本身要几秒 ⇒ 只在有界 fixture 上、app.ready + settle 之后跑; heavy tier; scratch 名字走 scripts/scratch.mjs; 上限先**量**出来再按 ×1.25 钉 (钉猜的数 = 空腿) | test-ax-budget ①–⑦; test-architecture §43 普查 |
| 1 | **只暴露读者所在的带**: 带外卡片出树, 新 slab 生下来就在树外 (结构性"不会失控") | 一个派生 `axExposure(card)` = 卡在 keep zone 内 (视口 ± TRIM_KEEP_VIEWPORTS, `_keepZone` / `_cardPositions` 一次布局读) **或**持有 document.activeElement **或**是搜索/跳转目标; 其余写步骤 0 证明有效的属性 (默认 aria-hidden — 布局中立, 2.369.142 的所有翻页不变量原样成立; 只有普查证明 aria-hidden 不缩序列化载荷时才用 content-visibility:hidden; **绝不**用 inert — 它连整个转录的选择与页内查找一起杀掉)。驱动: 每卡 `contentvisibilityautostatechange` (浏览器已经算好 skipped/unskipped) + 翻页 landing 后一趟; 每趟只翻**边界**上的几张卡 | 转录 AX 从 (已渲染卡 50–3,000 × 60–130) 到 (带内卡 ≈ 30–60 × 60–130): 实测 85 % 在带外 ⇒ ≥ 80 % 的转录节点消失; 计数与翻页 / fold 长到 3,000 / gap slab 3,400 / 搜索展开**无关** | 中。landing 机制读卡片几何 — aria-hidden 不改几何; 每次翻转本身是 AX 事件, 但只翻边界的几十个节点 vs 50k 的整树序列化。AT 用户失去对已滚走历史的虚拟光标 (视口附近全保留; `exposeChat` 三值 all / near / off, 'all' 恢复今天的行为) | test-ax-budget ③ + ⑦; test-chat-paging §1c/§4c/§4d + test-chat-trim-guard + test-desktop-resume-paging + test-hidden-view-suspend 保持绿 |
| 2 | **纯涂装在源头出树**: 图标 / 行号 / 生成字形 / handle / minimap 条 | (a) `icons.js` 的 `_s()` — 每个图标都经过的那一个 helper — 给 `<svg>` 加 `aria-hidden="true" focusable="false"`; 图标按钮都已带 `title`, 没有 title 的图标按钮补 `aria-label` (t()); (b) `.chat-code-ln` 行号 span 与 `.chat-diff-prefix` aria-hidden; (c) 每个 ▸/▾ 生成字形改成 `content: '\25B8' / ""` 的 alt-text 形式, 不再是 static-text 节点; (d) `.chat-run-arrow`、spinner、8 个 resize handle、minimap 条 aria-hidden | 每张工具卡 16–18 → ≈ 11; 每张正文卡 −4–6; 每行暴露的代码 −2; 90 张侧栏卡 × 3 图标; 约每个壳 −25–35 %, 零视觉 / 键盘变化 | 极低, 只加属性。规则: 绝不 aria-hide 一个控件的**唯一**可访问名 | test-ax-budget ② 上限收紧; fast 静态普查 (`_s()` 带 aria-hidden; 每条 `content:` 字形规则带 `/ ""`) |
| 3 | **minimap**: N 个标记 div → 一个绘制面, 条本身 aria-hidden | 单个 `<canvas>` (或一个 `<svg><path>`) 按 turn 列表重绘, 至少按像素行分桶 (600 px 的条 ≤ 300 个不同的 2 px 行); TOC 按钮保留为可访问路径; hover 高亮 / `_repositionMarkers` / 拖拽标签改到桶上 | 每个长窗 500–3,000 → ≈ 5; 唯一随对话长度增长的非转录项消失 | 中 (小型重写); 先读 scripts/test-chat-minimap* 钉的类名 | test-ax-budget: §1c fixture 带历史 gap 的窗 minimap ≤ 10 节点, 与 turn 数无关 |
| 4 | **代码块与 diff 在树里 O(1)**: 涂装 aria-hidden, 文本暴露一次 | `highlight.js:176` 每行 JS 12 节点 — `role=presentation` 留着每个 token 的文本节点, 按行的形态永远便宜不了。`.chat-code-block` 的逐行结构 (与 `.chat-diff-body` 的行) aria-hidden, 加**一个**兄弟 `<pre class=chat-code-a11y>` 装原文 (sr-only 裁剪: absolute + 1px + overflow hidden + clip-path, **不是** display:none), 就是 Copy 按钮已经拼出来的那段文本; chat-search 的文本 walker 与 `rehighlightCodeBlock` 限定 `:not(.chat-code-a11y)`。后续 (DOM/JS 成本, 2.338.0 同步 innerHTML 那一类): 语法上色改 CSS Custom Highlight API + CSS counter 行号 ⇒ 每行 1 元素 + 1 文本节点 | 打开的 200 行 Read ≈ 2,400 → ≈ 20 AX; 3,000 行最坏 ≈ 36k → ≈ 20。若 OQ2 说关闭的 details 也在树里, 本步再减每张 p50 Read/Write ≈ 500 并**升到第 2 位** | 打开的块代码文本在 DOM 里出现两遍 (受 MAX_LINES 3000 约束); 屏幕阅读器用户失去代码内逐行导航 (保留整段文本与编辑器按钮)。Highlight-API 那半要在卡片被 trim 时丢掉 range (`_trimEdge` / `_swapMessageEl`) | test-ax-budget: 打开的 3,000 行 Read 卡 ≤ 60 AX; fast 腿钉每行 DOM 数; test-owner-batch-2369-32 的 `</span>${mediaHtml}<details` 接缝 |
| 5 | **折叠要守住**: 搜索打开时 run 保持折叠, gap 卡也折叠, 瞬时展开有界 | `_updateRuns` 在搜索栏可见时直接 return ⇒ Ctrl+F 把 3,000 成员全展开; 改为只打开**当前匹配**所在的 run (`_setRunOpen(run, true)` 在 `_withViewportAnchor` 内; 折叠成员的文本节点还在 DOM, highlight range 照建)。`.chat-gap-msg` 像普通卡一样参与 `kindOf` ⇒ 2,000 条的 gap slab 像窗口一样折叠; `_trimGapDom` 改按 keep zone (几百条的底) 而不是 3,400/2,400 | 两个最大的瞬时爆炸: 3,000 卡窗口开搜索 ≈ 3k 而不是 ≈ 60k; gap slab 从 50–70k 到 header + 文本卡。步骤 1 落地后这些变成 DOM/JS 收益 — 为 fold 重建的 churn 也值得 | 搜索低-中 (搜索栏的 MutationObserver 重跑 `_updateRuns`); gap 折叠中-高 — 是 2.369.142 的 landing 机制, fold 必须像 `_extendTop` 那样在 anchored 段内跑, `_reserveFreshHeights` 要看到折叠后的几何 | test-chat-search + test-fold-ux (搜索开着折叠数不变, 匹配的 run 打开); test-chat-paging §1c/§4c/§4d; test-ax-budget ③ |
| 6 | **一个 hider 一个 writer**: 每种"隐藏"都剪, 包括 Stage | 三个 hidden 写者: desktop-manager `_hideWin` (visibility + aria-hidden + chat 的 c-v:hidden)、stage-manager `_hideStage` (**只有** visibility — 整棵子树还在树里)、view-visibility 的三个 display:none 理由。PURE 理由集加 'desktop' / 'stage'; 两个 manager 只**设**理由; `syncHiddenViews` 对任何理由写 aria-hidden + `inert` + (chat) content-visibility:hidden, ChatView 从同一个集合 suspend; .144 的桌面行为逐字节不变 | Stage 模式: 隐藏窗整棵子树出树; 普通桌面 0 变化, 但不变量从三个平行站点变成一个普查 (孪生漂移那一类) | 低-中: 隐藏但持焦的窗口加 `inert` 要先交出焦点 (minimize 已有 `_focusMostRecent`) | test-hidden-view-suspend 每个理由一条腿 ⇒ 属性; test-ax-budget ④ |
| 7 | **侧栏** — 转录有界后最大的子树 | (a) 详情面板**首次展开时**才建 (只有 expandedCardId 那一张会显示) — 每 5 s `_render` 的 DOM/GC/listener 成本, AX 中立; (b) **关闭**的侧栏 (translateX(-100 %)) 加 aria-hidden + inert, 与 rail 折叠态的 display:none 对齐; (c) workbench 的 Recent 区采用分组列表 / 任务板已经在用的 IntersectionObserver 占位策略。**默认值问题 (D3)**: stopped 会话默认折进 display:none 的组 (120 行里 110 是 stopped) | (a) −5–7k DOM + ≈ 1k listener; (b) 侧栏关着时 −8–12k AX; (c) 按滚动位置 −30–60 %; stopped 折叠去掉剩余 8–12k 的大部分 | (a)/(b) 低; (c) 中 — highlightSession / 跳到卡片依赖卡片存在 (rAF 预渲染), 占位高度要和 workbench 卡一致 | test-ax-budget: 120 行侧栏 ≤ 预算 (开) / ≈ 0 (关); 现有侧栏 / session-card 套件; anti-ping-pong 四守卫不动 |
| 8 | **churn 不是体积** — 没变的不重序列化 (那 20 % stale) | (a) `_updateRuns` 每趟删掉再插回所有 header/footer — 改成 diff run 列表只碰变的; (b) 状态栏每次 innerHTML 整条重建 — 改成键控 chip 原地更新 (taskbar.js 是现成先例); (c) trim/extend 走 DocumentFragment/replaceChildren, 卡片身份跨 trim/extend 保持, 一次翻页 = 一批 mutation | stale ≈ 10k → 每次手势几百; 每次翻页 / 每个 turn (20 个窗的 context% / cost / turn-state) 更少的 HandleAXEvents 任务 | 中: 18 种 chip 渲染后绑 handler; trim/grow 是 inc-mubvu3a4 的核心 — 每处改动过 §1c 复现驱动 | test-ax-budget mutation 计数腿 (CDP DOM.childNodeInserted/Removed 每次翻页 / 每次状态更新); test-chat-paging; test-turn-truth-ui |
| 9 | **瞬时窗口** (低优先) — 设置窗一次渲染全部分类; 文件浏览器每页 100 行 | settings-ui 把 ≈ 147 行全部塞进一个 scroller 且每个搜索键击重渲染 — 改成一次一个分类 (搜索 = 过滤后的平铺), 非活动分类 display:none (**不是** c-v:auto); 浏览器行图标归步骤 2 | 设置窗开着时 ≈ 2k, 每键击不再爆 2–3k | 低-中: harness 分区的 intro + 每行 apply chip 按分区照常工作; §44 SETTINGS_CATEGORIES 普查不受影响 | 现有 test-settings-*; test-ax-budget 一条设置窗开着 ≤ 预算 |

## §4 预算门 (test-ax-budget)

- **怎么数**: heavy tier 的 headless chrome, `Accessibility.enable` → `getFullAXTree({depth:-1})`; 每个作用域两个数: TOTAL (Blink 序列化的一切, 含 ignored — HandleAXEvents 反序列化的载荷, chrome://accessibility 报的数) 与 NON-IGNORED (平台树)。归属: `DOM.querySelectorAll` (`.chat-message-list > .chat-msg:not(.chat-run-collapsed)`, `#sidebar`, `.window-titlebar`, `.chat-status-bar`, `.chat-minimap`) 的 backendNodeId 对上每个 AX 节点的 `backendDOMNodeId`, 按 childIds 求子树和。**绝不**用 `getElementsByTagName('*')` (那是 DOM 体积, 不是暴露量; 实测差 2.2–2.5×)。
- **上限 (设计目标; 每个数先在 1400×1000 的已发布渲染器上**量**, 按 ×1.25 钉 (test-architecture 的 server.js 行数 ratchet 同款), 随步骤落地收紧; 钉猜的数 = 空腿)**: 每张已渲染卡 (TOTAL, disclosure 关闭) — 关闭的工具卡 ≤ 40 (今天 16–18), Edit/Patch ≤ 40 (13), user ≤ 60, assistant 正文 ≤ 150 于 §1c p90 形状 (60–90), 带**打开的**代码/diff 块的卡 ≤ 60 与行数无关 (今天 ≈ 12 × 行 + 22; 腿打开一张 3,000 行 Read)。每个聊天窗 ≤ 5,000 TOTAL — 带内卡 (≤ 2 视口 ≈ 30–50 × ≤ 100) + chrome (标题栏 + 状态栏 + composer ≤ 200) + minimap ≤ 10 — 在 §1c fixture 上 50 张卡时、翻 4 页后、Ctrl+F 开着、teleport 到 gap 视图四种状态断言: 三个 Δ ≤ 5,000 的 10 % (**增长不变量**)。每个标签页 ≤ 20,000 TOTAL / ≤ 8,000 NON-IGNORED 于 5 窗 + 120 行侧栏的 fixture。
- **负控**: 去掉属性的 scratch-dir 副本必须**变大** (§7 的 patched-copy 惯例; 新层要从旧层的控制组里剥掉)。

## §5 待活测量的问题 (步骤 0 回答)

- **OQ1** aria-hidden 是从**序列化载荷**里剪 (TOTAL 变小) 还是只从平台树剪 (仍序列化为 ignored, reason ariaHiddenSubtree)? 决定步骤 1 写哪个属性, 也决定 .144 的开关到底帮了多少 (owner 只确认了 Chrome 的 Suppress 开关, 没试过 exposeChat=off)。
- **OQ2** 关闭的 `<details class=chat-diff>` 内容在 owner 的 Chrome 153 上是否布局 / 在树里? chat.css:418-421 记录过 headless 里 202 px 的反例。是 ⇒ 步骤 4 升到第 2 位。
- **OQ3** SVG 子形状 (`<path>` 等无 `<title>`) 算不算; 裸 `<span>` (hljs token / .chat-link) 是按元素序列化还是只经文本? 决定每行 12 vs ≈ 8、每图标 3 vs 1。
- **OQ4** owner 各窗的 minimap 标记实际数量 (bundle 里没有 turn 数) — 下次抓取把 `.chat-minimap-marker` 计数加进 inventory。
- **OQ5** 浏览器侧成本模型: HandleAXEvents 时间正比于序列化节点数、事件批次数 (stale 9,902 暗示 churn 有份)、还是 UIA 客户端 kInlineTextBoxes 模式下的 inline-text-box 展开 (每个换行段落 / 代码行再乘一次)? 步骤 2 单独落地后 owner 再录一段 chrome://tracing 即可分辨。
- **OQ6** 只有 `visibility:hidden` 的非聊天隐藏桌面窗 (files/editor/terminal) 是否被剪 — 读者 2 说否 (后代可覆盖 visibility, Blink 会走进去); .144 的 aria-hidden 只在 OQ1 为"剪载荷"时才覆盖它们。
- **OQ7** owner 形状下 (compact, 2195×1100, dpr 1.75) 一个视口装几张卡 — 定带宽与每窗上限; 常量注释说 150 张**折叠**卡 ≈ 一屏, 未折叠密度未测。

## §6 需要 owner 的决定

- **D1** 是否按 §3 顺序整体开工 (一条 lane: 0 → 1 → 2 → 3 → 4 → 5, 一次对抗验证 + 一次修复; 6–9 作为第二条)? 还是只做 0–2 先看数?
- **D2** `accessibility.exposeChat` 改三值 all / near (默认) / off? "near" = 视口附近全暴露、带外剪掉 — 屏幕阅读器用户仍能读到正在看的内容, 但失去对已滚走历史的虚拟光标。
- **D3** 侧栏默认把 stopped 会话折进折叠组 (今天 120 行里 110 是 stopped)?
- **D4** `write` 加进默认 collapseKinds (Edit/Write 今天每张都是 13 节点的壳, 还把相邻 run 劈成两半)?

## §7 每节的归属 (设计文档每节都是债务)

| 节 | 归属 |
|---|---|
| §3 步骤 0–5 | backlog B-ax-root (lane 1), 等 D1 |
| §3 步骤 6–9 | backlog B-ax-root (lane 2) |
| §4 门 | 步骤 0 的交付物; ci.mjs tier 行 + test-architecture §43 |
| §5 OQ1–OQ7 | 步骤 0 的腿 ①–⑦ + 下一次 incident inventory |
| §6 D1–D4 | owner 收件箱 (vibespace-ask) |
