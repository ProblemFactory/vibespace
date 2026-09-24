# 设计：三张"浏览器"的脸（B-d03a — 先出渲染稿再改）

> owner 2026-09-23："可能会和其他几个功能产生 confusion"；裁定"先出渲染稿再改"。本文**只是设计稿，零产品代码**：三个方向作为真 HTML 渲染出来（`docs/mockups/browser-faces/`），用产品自己的类名与主题变量，无头 Chrome 截图并**按像素**核验，再按六条标准打分。§5 是建议与逐文件改动清单；需要 owner 拍板的事项列在 §5.3。英文镜像：`docs/design-browser-faces.md`。

**复现：** `node docs/mockups/browser-faces/build.mjs`（生成三个独立的 `direction-a|b|c.html`，产品规则从 `public/style.css` · `chat.css` · `viewers.css` 复制进每个文件自己的 `<style>`，深色主题值；`?view=phone` = 390 px 变体；`?lang=en|ja` 换标签）→ `node docs/mockups/browser-faces/shoot.mjs`（无头 Chrome 走裸 CDP，`file://` 打开，每个方向 × 桌面 zh / en / ja + 手机 zh = 12 张 PNG，每张旁边一个 JSON：每个 `[data-face]` 入口的盒子与像素判决 —— **≥ 30 个亮像素且盒内 ≥ 4 种颜色才算画出来了**；同一判决跑在工作区一块空白上必须**红**，否则整轮拒绝）。本文引用的那一轮：`docs/mockups/browser-faces/index.json`（12/12 绿，控制组 12/12 未画）。

---

## 1. 今天的三张脸（只读实测 2.369.160）

| | ① 网页视图（iframe） | ② Agent 浏览器 | ③ 浏览器应用（桌面应用） |
|---|---|---|---|
| **它是什么** | 一个 VibeSpace 窗口里的 `<iframe>` + 地址栏 + `Proxy: On/Off`（绕 `X-Frame-Options`）+ "↗ 新标签页打开"。窗口类型 `browser`，标签 `'Browser'`（`src/lib/browser-window.js`） | agent 自己驾驶的 `agent-browser` 实例：命名 profile、租约、实时视图（`browser-live` 窗口 = 画面 + 网址行 + 标签/控制台/动作面板 + Watch / Take over / Hand back）、Browser profiles 窗口（`browser-profiles`，housekeeping）（`docs/design-agent-browser-v2.zh.md`；`src/lib/browser-live-window.js`、`browser-trace-view.js`、`browser-profile-picker.js`） | 这台机器上的真 Chromium / Firefox，作为窗口类型 `desktop-app` 在自己的 X 显示上跑、经 xpra 画面（`docs/design-desktop-apps.zh.md`；B-bfe6 正在同分支并行建，本文不碰它的文件） |
| **谁来操作** | 你（纯前端；机器上什么都不跑） | agent（你可以接管，交还是一个计费 turn） | 你（鼠标键盘直接进 X 显示；agent **够不到**） |
| **从哪里打开** | 工具栏 `#btn-browser`（`public/index.html:108`，地球图标，标签 "Browser"）；手机 "+" 表单的 "Browser" 行（`src/lib/mobile-nav.js:65`）；命令 `browser.open`（"Open browser"，`command-mode.js:84`）；Ports 面板的 Open 行、实时视图里的 "在内嵌浏览器里打开这个网址" 按钮、发布页、文件资源管理器打开 .html —— `openBrowser(url)` 共 8 个调用点 | rail 第十项 `data-rail="browser"`（地球图标，提示 "Browser profiles"，`sidebar-rail.js:179`）；⚙ Tools ▸ "Browser profiles…"（order 35，地球图标，`browser-trace-view.js:575`）；会话卡片菜单 "Browser profile…" / "Live browser view" / "Hand back the browser"（`session-card.js:87-93`）；聊天状态栏的 Browser 芯片（`chat-status-bar.js:704`）；新建会话对话框的 "Browser profile" 行（`index.html:190`）；Settings → **Browser** 分类（12 行全是 `browser.*` + `window.realDesktopTargets`） | 工具栏 `#btn-desktop-apps`（"Apps"，窗口图标）；⚙ Tools ▸ "Desktop apps…"（order 30）；对话框里的目录卡（`category: 'browser'` 的行用 **`FILE_ICONS.web` = 又一个地球**）。手机端**没有入口**（"+" 表单只有 Agent 会话 / 终端 / 文件 / Browser / Desktop） |
| **什么时候用它** | 看一眼一个页面 / 本地服务 / 发布页；同源的东西（noVNC、本实例）完整可用 | 想看 agent 在网页上干什么、替它登录、给它钉一个 profile | 需要一个**真**浏览器：标签页、登录态、扩展、下载、被拒绝嵌入又不想走代理的站 |
| **它不是什么** | 不是浏览器：没有标签页、不保留登录（cookie 由外层页面决定）、agent 看不见它、很多站拒绝被嵌入 | 不是给你上网用的：窗口是 agent 标签页的**一个视图**；你接管时 agent 的命令被拒（`browser_paused`） | 不是 agent 的浏览器：不同 X 显示、不同 profile 目录；也不是网页视图——它是一台机器上的进程，需要画面后端（xpra / vnc-display），没有后端就打不开 |

---

## 2. 用户真会撞上的混淆（每一条都指向代码）

1. **同一个地球，三个意思。** 工具栏 `#btn-browser`（`UI_ICONS.web` 形状）打开 iframe；rail `RAIL_ICONS.browser`（同一个地球放大到 24 格）打开 Browser profiles **窗口**；⚙ Tools ▸ "Browser profiles…" 用 `UI_ICONS.globe`；聊天状态栏芯片 `chat-status-browser` 用 `UI_ICONS.web` 显示 agent **最后用过的 profile 名**；Apps 目录里 `category:'browser'` 的卡用 `FILE_ICONS.web`。于是地球在工具栏 = "你的网页视图"，在别处 = "agent 的浏览器"，在 Apps 里 = "真 Chromium"。三张脸、三种窗口类型（`browser` / `browser-live` / `desktop-app`）、一个图标。
2. **工具栏的 "Browser" vs rail 的 "Browser profiles" vs Apps 对话框。** 三个入口在屏幕上相距不到 300 px（工具栏右侧 / rail 底部 / 工具栏右侧），名字里都有 browser，点开是三种完全不同的东西；rail 项是 2.369.145 按 owner "这个菜单藏太深了" 加上的，它把"agent 浏览器"这张脸推到了和"网页视图"同一视觉层级。
3. **聊天状态栏里的那枚 "Browser" 芯片。** 代码里状态栏只有**一枚**浏览器芯片（`chip('browser', …)`，`chat-status-bar.js:704`）：一个地球 + profile 名（"Shopping"）；同一窗口里，实时视图工具条上还有**第二个地球按钮**（`browser-live-window.js:133`，"在内嵌浏览器里打开这个网址"）——它打开的是**网页视图**。用户看到的就是"两个地球，一个开 agent 的实时视图，一个开 iframe"；芯片的下拉里 "Open live view" 与按钮的提示文案互相不指向对方。（如果 owner 指的是别的两枚，请在 §5.3 D6 点名。）
4. **⚙ 树里相邻的两行。** Tools ▸ Desktop apps…（30）与 Browser profiles…（35）紧挨着；网页视图在 ⚙ 树里**没有行**（只有工具栏按钮、手机表单、命令面板）。一个想"开个浏览器"的人在 ⚙ 里只会找到另外两张脸。
5. **Settings 里的 "Browser" 分类只讲 agent 浏览器。** `settings-schema.js:413-517` 的 12 行（`browser.isolateSessions` … `browser.defaultProfile`、`window.realDesktopTargets`）全是 agent 浏览器 / 窗口目标；而"显示浏览器按钮"（`toolbar.showBrowserButton`，标签 "Show Browser button"）在 Toolbar 分类下，指的是**网页视图**；Apps 对话框的"Agents on your real desktop"提示写着 "Off — turn it on in Settings → Browser"（`desktop-app-launcher.js:292`）。三处 "Browser" 各指一物。
6. **窗口标题与任务栏。** 网页视图窗口标题 = 主机名或 'Browser'（`browser-window.js:12-13`）；实时视图标题 = profile 名；桌面应用标题 = 应用标签（"Chromium"）。任务栏里三种"浏览器"三种图标（地球 / 带点的窗口 / 窗口），只有 `browser-live` 的副标题写了 "浏览器(实时)"。
7. **手机端不对称。** "+" 表单只有网页视图那一行（"Browser"）；agent 浏览器只能从会话卡片长按 → "Live browser view" 到达；桌面应用**没有**手机入口（`mobile-nav.js:60-68`），而 2.369.158 刚把手机上的桌面应用做成了"整应用缩放到可点"。

---

## 3. 三个方向（真 HTML，`docs/mockups/browser-faces/`）

每个方向 = 一份独立的 `direction-x.html`（产品规则内联）+ 桌面 1200×800（zh / en / ja）+ 手机 390×844（zh）四张 PNG + 每张旁边的 JSON。三个方向共用一个夹具：一个 claude 会话正在用 profile "Shopping" 比价、第三家站要登录；一个真 Chromium 在 xpra 上跑着；一个 example.com 的页面。图上黄色圆圈是**标注**（手机版隐藏），不是产品元素。

### A — 一个 "Browser" hub 入口，三张卡（`direction-a.html`）
工具栏、rail、⚙ Tools ▸ 各只剩**一个**入口（保留地球），都打开一个 `createModalShell` 对话框 `dialog.browser-hub`：一句话导语（"三样东西都叫浏览器，按谁来操作它选"）+ 三张卡（`browser-hub-card`，站在 `.desktop-launch-card` 的字体/间距上）：**网页视图**（你 · 地址栏 + 打开）、**Agent 浏览器**（agent · 实时视图 / 配置… / "1 个会话在用"）、**浏览器应用**（你 · Chromium / Firefox / "经 xpra"）；每张卡有一行"它不是什么"；下方"正在运行"把三类活着的东西列成一张表（Shopping · agent 正在操作 / Chromium · xpra）。手机：hub 变成底部 sheet，三张卡竖排。Apps 按钮不动（它还管 xterm / 编辑器等）。
*截图事实：* 工具栏入口 72 / 79 / 83 px（zh / en / ja）——与今天的"浏览器"按钮同宽；三张卡 223 px 宽，zh 195 / en 190 / ja 221 px 高（ja 文案最长，对话框内滚动未触发）；手机 390 px 下三张卡各 ~150 px，"正在运行"仍在首屏。

### B — 改名，保留三个入口（`direction-b.html`）
名字说清谁来操作：工具栏 **网页视图**（Web view / ウェブビュー，地球**只**留给它）；rail 项 + ⚙ Tools ▸ + 状态栏芯片改叫 **Agent 浏览器**（Agent browser / エージェントブラウザ），图标换成 `browser-live` 窗口类型那个"带点的窗口"（rail 用它的 24 格版本，本文提案）；桌面应用里的 Chromium 卡标 **浏览器应用**（Browser app / ブラウザアプリ），窗口标题写 "Chromium — 浏览器应用"。⚙ 树保持 Tools ▸ Usage… · Background Work… · Desktop apps… · **Agent browser…** · Plugins…。手机 "+" 表单补齐三行：网页视图 / 桌面应用… / Agent 浏览器。
*截图事实：* 工具栏 "网页视图" 83 / 86 / **105** px（ja 是整条工具栏最宽的按钮，但仍窄于 "新規セッション" 的 113 px）；状态栏芯片从 "🌐 Shopping" 变成 "▣ Agent 浏览器 · Shopping"（多 ~70 px，在 470 px 宽的窗口里未挤掉 `$0.42`）；⚙ 飞出菜单 5 行未换行。

### C — 把网页视图折进浏览器应用，只留两张脸（`direction-c.html`）
给你的只剩**一个**"浏览器"按钮：有画面后端时 = 这台机器上的真 Chromium（xpra，窗口标题 "Chromium — 浏览器"，图标 = 窗口里一个地球，本文提案的新 SVG）；**没有**画面后端时同一个按钮把页面嵌进窗口（地址栏 + 代理）——旧网页视图降为这个窗口的**兜底档**，不再是一张脸。另一张脸是 agent 的（rail + ⚙ "Agent 浏览器"，实时视图 + 接管）。Apps 目录保留，其中的 Chromium 卡和工具栏按钮是同一个东西。手机 "+" 表单两行：浏览器 / Agent 浏览器。
*截图事实：* 工具栏按钮 72 / 79 / 83 px；兜底档说明条在窗口底部一行（zh 换行成两行，`b` 已 nowrap）；手机上真 Chromium 的画面按 2.369.158 整体缩放。

---

## 4. 六条标准与打分（5 = 没什么要修，3 = 能用但有可见代价，1 = 不及格）

| 标准 | 量什么 | A hub | B 改名 | C 折叠 |
|---|---|---|---|---|
| **可发现性** | 一个"想开个浏览器"的人几步能到对的那张脸；入口数 | **5** — 一个入口，hub 自己解释三张脸；"正在运行"把三类合一 | 3 — 三个入口都在，靠名字分辨；要先知道自己要哪种 | 4 — 两个入口，人用的那个就叫"浏览器" |
| **命名诚实** | 名字 = 它做的事；同名同物、异名异物 | 4 — 卡片诚实；工具栏那个词 "Browser" 在 hub 打开前仍是三义的 | **5** — 每个入口说清谁操作、是什么；地球只剩一个意思 | 3 — "浏览器"底下藏着一架梯子：有后端是真 Chromium（标签页/登录态），没后端是 iframe——同一个词两种体验，且按机器而变 |
| **手机对等** | 390 px 上三张脸各有入口、各能用 | **5** — 一个 sheet 三张卡（今天手机没有桌面应用入口，agent 浏览器只靠长按） | 4 — 三行都在 "+" 表单；"Agent 浏览器" 行是会话作用域的，无会话上下文时要先弹会话选择 | 3 — 手机上 xpra 画面可用但小；多数手机场景真正想要的是 iframe，而那成了"看机器有没有后端" |
| **i18n 长度** | 工具栏按钮、⚙ 行、rail 提示、状态栏芯片在 zh / en / ja 下的像素 | **5** — 72 / 79 / 83 px，与今天相同 | 3 — "网页视图" 83 / 86 / 105 px（ja 最宽）；"Agent 浏览器" 混写；芯片 +70 px | 4 — 工具栏不变；"Agent 浏览器" 只在 rail 提示与 ⚙ 行 |
| **迁移成本** | 新组件、改动文件数、i18n 键数、数据/布局迁移、对并行 lane 的依赖 | 2 — 新对话框 + "正在运行"要聚合三个数据源（活跃 `browser` 窗口 / profile digest / desktop-apps 列表）+ ~20 个 i18n 键 + 工具栏/rail/⚙ 三处重接；无数据迁移 | **5** — 只改标签与图标：~13 个文件、~14 个 i18n 键、零新组件、零数据迁移（§5.2） | 1 — 依赖 B-bfe6 交付 + 机器有画面后端；`openBrowser(url)` 的 8 个调用点要能把 URL 交给 xpra 里的 Chromium（启动参数可以，**之后的导航**要走 CDP 或 `xdg-open`，尚无通道）；layouts.json 里的 `browser` 窗口与 `proxy` 开关要么迁移要么永远保留兜底档（那代码一行不少） |
| **什么会坏** | 肌肉记忆、现有调用点、布局回放、套件里的 pin | 3 — 工具栏地球不再直接开页面（多一击）；命令 `browser.open`/Ports 的 Open/发布页/实时视图交接按钮应**继续直开网页视图**而不是 hub；布局回放不变 | **5** — 结构零改动；窗口类型 id、openSpec action、设置键、rail id 全部不动；只有 pin 标签的套件要跟（`test-contributions`、`test-browser-housekeeping`、`test-profile-blindness`、`test-ax-paint` 的 title/aria-label 普查） | 2 — `setup-flows.js:555` 用 blob URL 开生成的 HTML（xpra 里的 Chromium 开不了本页的 blob）；Ports 面板 "Open (through the app proxy)" 的代理语义没了；旧布局里的 `browser` 窗口回放到哪一档取决于当时机器状态 |
| **合计** | | 24 | **25** | 17 |

---

## 5. 建议

### 5.1 结论

> **SHIPPED (B), 2.369.168**（2026-09-24，owner："那就选B吧"；落在 browser takeover 的第三块 —— `docs/design-browser-takeover.zh.md` §7 / D10，§5.3 的 D1–D7 全部按本文默认）。只改标签与图标：工具栏 **网页视图**（地球只留给它）；rail 项 + ⚙ Tools ▸ **Agent 浏览器…**（order 35）+ 状态栏芯片 "**Agent 浏览器 · <profile>**"（tooltip 首行同前缀）+ 会话卡片三条命令 + Session Properties 分区 + Settings 分类 **Agent 浏览器**（Services 组）全部换到 `browser-live` 的"带点的窗口"（`UI_ICONS.browserLive`，只在 `icons.js` 定义一次；rail 用 24 格版本 `RAIL_ICONS.browser`）；实时视图窗口类型标签 **Agent 浏览器(实时)**，交接按钮 "在网页视图里打开这个网址"；Apps 对话框导语补"agent 够不到它"，目录卡副标签 **浏览器应用 ·** 门控在 `row.browser`，只显示在**可启动**的卡上（随 B-bfe6 的 Browsers 分区在集成时生效 —— D7 在合并时定下；变灰的浏览器卡只留简短原因）；手机 "+" 表单补齐 网页视图 / 桌面应用… / Agent 浏览器（最后一行：当前窗口的会话有浏览器 ⇒ 它的实时视图；否则列出持有浏览器的活会话供选择；一个都没有 ⇒ Agent 浏览器窗口）。窗口类型 id、openSpec action、设置键、rail id 一个没动，布局回放不受影响。会话卡片菜单是纯文字行（`showContextMenu` 不画 `icon`），所以卡片菜单带的是**名字**不是图标。门：`test-browser-faces`（新，fast）+ `test-window-types` / `test-contributions` / `test-ax-paint`（rail 项补 `aria-label`）/ `test-browser-housekeeping` / `test-profile-blindness(-chip)` / `test-architecture` §53（图标只定义一次）/ `test-mobile-gaps`。

**做 B，现在。** 它把 §2 的七条混淆里的 1 / 2 / 3 / 5 / 6 直接消掉（一个地球一个意思；三个名字三个东西；Settings 分类与提示文案跟着改名），4 / 7 由 B 的手机表单三行 + ⚙ 行改名覆盖；零结构改动、零迁移、一次提交。从 A 借**两样**：Apps 对话框导语补一句"谁来操作"，Chromium 卡的副标签写"浏览器应用"；手机 "+" 表单补齐三行。**C 不现在做**：它是 B-bfe6 落地、xpra 在机队里普及**之后**才值得问的问题（"网页视图还要不要作为一张脸存在"）——那时 B 已经把名字理顺，C 只是再删一个入口。A 的 hub 在 B 之后仍可作为**手机 sheet 的形态**回来，桌面上不需要它。

### 5.2 B 的逐文件改动清单（全部只改标签/图标；id 一律不动）
- `public/index.html:108` — `#btn-browser` 文案 `Browser` → `Web view`（保留地球 SVG）。
- `src/lib/browser-window.js` — `registerWindowType` 的 `label: 'Browser'` → `'Web view'`；无 URL 时的 `startTitle` → `t('Web view')`。
- `src/lib/mobile-nav.js:60-68` — 行 `Browser` → `Web view`；新增 `Desktop app…`（`app._desktopAppsAvailable` 门控 → `runCommand('desktopApps.open')`）与 `Agent browser`（`app._browserProfiles` 门控 → `app.openBrowserProfiles()`）。
- `src/lib/sidebar-rail.js:41,74,179` — `RAIL_ICONS.browser` 换成 `browser-live` 图标的 24 格版本（本文提案：`<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M6.5 7h.01M9.5 7h.01"/><circle cx="12" cy="14" r="2.2"/>`）；提示 `Browser profiles` → `Agent browser`。rail id `browser` 不动（它是窗口不是面板，`vibespace.railItem` 永远存不到它）。
- `src/lib/icons.js` — 新增 `UI_ICONS.browserLive`（= `browser-live-window.js:622` 那个 16 格 SVG，一处定义），供 ⚙ 行、状态栏芯片、会话卡片菜单共用。
- `src/lib/browser-trace-view.js:403,571,575` — 窗口标题与窗口类型标签 `Browser profiles` → `Agent browser`；⚙ 行 `Browser profiles…` → `Agent browser…`，图标 `UI_ICONS.globe` → `UI_ICONS.browserLive`（order 35 不变）。类型 id `browser-profiles` 与 openSpec `openBrowserProfiles` 不动（布局回放按 id）。
- `src/lib/browser-live-window.js:133,621` — 窗口类型标签 `Browser (live)` → `Agent browser (live)`；交接按钮提示 `Open this URL in the embedded browser` → `Open this URL in a web view`。
- `src/lib/chat-status-bar.js:704` — 芯片图标 `UI_ICONS.web` → `UI_ICONS.browserLive`；文本前缀 `Agent browser ·`（tooltip 首行同样加前缀）。
- `src/lib/session-card.js:87-93` — 命令标题 `Browser profile…` → `Agent browser profile…`，`Live browser view` → `Agent browser — live view`，`Hand back the browser` → `Hand the agent browser back`。
- `src/lib/session-props.js:258` — 分区标题 `Browser` → `Agent browser`。
- `src/lib/settings-schema.js` — 12 行的 `category: t('Browser')` + `SETTINGS_CATEGORIES`（:1057）+ Services 组（:1119）→ `t('Agent browser')`；`:19` `Show Browser button` → `Show Web view button`。设置键（`browser.*`、`toolbar.showBrowserButton`）不动。
- `src/lib/customize-mode.js` — 元素标签 `Browser button` → `Web view button`。
- `src/lib/desktop-app-launcher.js:126,212,292-295` — 导语补一句"你用鼠标键盘操作；agent 够不到它"；`category:'browser'` 卡的副标签前缀 `Browser app ·`（**与 B-bfe6 lane 协调**：注册表行归它）；提示 `Settings → Browser` → `Settings → Agent browser`。
- `src/lib/command-mode.js:84` — 命令标题 `Open browser` → `Open a web view`。
- **⚙ 树最终行序：** Tools ▸ Usage…(10) · Background Work…(20) · Desktop apps…(30) · **Agent browser…**(35) · Plugins…(40)；网页视图仍不进 ⚙（它是工具栏/手机表单/命令面板的东西）。
- **i18n 新键（zh / ja）：** `Web view` 网页视图 / ウェブビュー · `Agent browser` Agent 浏览器 / エージェントブラウザ · `Agent browser…` · `Agent browser (live)` Agent 浏览器(实时) / エージェントブラウザ(ライブ) · `Browser app` 浏览器应用 / ブラウザアプリ · `Desktop app…` 桌面应用… / デスクトップアプリ… · `Show Web view button` 显示网页视图按钮 / ウェブビューボタンを表示 · `Web view button` 网页视图按钮 / ウェブビューボタン · `Open this URL in a web view` 在网页视图里打开这个网址 / このURLをウェブビューで開く · `Off — turn it on in Settings → Agent browser` · `Agent browser profile…` · `Agent browser — live view` · `Hand the agent browser back` · `Open a web view`。旧键 `Browser` / `Browser profiles` / `Browser (live)` 若无其他引用则删（`npm run build` 的 i18n 普查会指出）。
- **文档同提交：** kb-file-structure（browser-window.js / sidebar-rail.js / browser-trace-view.js / chat-status-bar.js / settings-schema.js 条目）、kb-features（UI 一节）、`docs/design-gear-menu-hierarchy.md` 的树、`docs/design-agent-browser-v2.zh.md` §5.3 的名字、CHANGELOG。
- **门：** `test-contributions`（⚙ 行标签）、`test-browser-housekeeping`、`test-profile-blindness`（芯片文案）、`test-window-types`（label 集合若被 pin）、`test-ax-paint`（icon-only 按钮的 title）、`test-i18n`/build 普查——先红后绿。

### 5.3 需要 owner 决定
- **D1 名字。** 本文用 网页视图 / Agent 浏览器 / 浏览器应用（en Web view / Agent browser / Browser app；ja ウェブビュー / エージェントブラウザ / ブラウザアプリ）。备选："内嵌网页"（更直白但更长）、"页面"（太泛）；"Agent 浏览器" 是否要纯中文"代理浏览器"（不建议——产品里 agent 一词不译）。
- **D2 Settings 分类改名。** `Browser` → `Agent browser` 会改 Services 组里的可见分类名与设置搜索结果；不改则 §2.5 留着。
- **D3 rail 图标。** 换成"带点的窗口"（与 `browser-live` 窗口、任务栏一致）还是保留地球只改提示？本文建议换——地球只留给网页视图是整个 B 的支点。
- **D4 C 是不是终态。** 若 owner 认定"iframe 不该是一张脸"，则在 B-bfe6 交付后立项 C（前提：URL 交接通道 + 无后端机器的兜底档 + 布局迁移）；否则 B 即终态。
- **D5 手机表单。** 补齐三行（建议）还是只改名（最小）。
- **D6 "两枚 Browser 芯片"。** §2.3 按代码只找到状态栏一枚芯片 + 实时视图工具条的一个地球按钮；若 owner 指的是别的两处，请点名，本表按之修正。
- **D7 Apps 对话框里的浏览器卡归属。** B-bfe6 lane 拥有注册表行；副标签 "浏览器应用 ·" 由它加还是由 B 的提交加，需在合并时定一处。
