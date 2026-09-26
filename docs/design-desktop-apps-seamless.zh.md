# 设计：桌面应用第三轮 — seamless 窗口、剪贴板、DPI 推导、远程主机（给 owner 的设计稿）

> owner 2026-09-23 试用 2.369.156 + .158（docs/design-desktop-apps.zh.md P8-2）后的原话，逐条作答：
> "我简单测试了下app功能，为啥应用里复制之后要手动点击才能复制到本机？这个不能seamless吗？以及我关闭内部窗口之后外部窗口还要额外关闭一次，以及实际上如果内部窗口具有完整的窗口控制能力（关闭按钮啥的），外部窗口就不应该显示任何东西，来达到seamless的效果（当然有没有可能有什么feature必须要在外部窗口展示东西，所以无法seamless的？你也要考虑。以及内部app的dpi也应该是可调的，最好是能从vibespace自身的dpi自动推导，保证最佳的窗口渲染效果，当然还是有必要在界面配置里加入一个remote app的dpi调整的。以及你要思考下整个app功能对于remote host的适配程度，自动seamless setup能力等等。"
>
> 本文只是设计（无代码、无版本号）。每一点先给**逐点影响表**，再给**一个精简集**，最后是只有 owner 能做的决定（D1…D9，每条带建议默认值）。所有"实测"都是 2026-09-23 在本机做的（xpra v6.5.3、gnome-calculator 50 / GTK 4.22、xterm、Chrome 153 无头、真 worktree 服务器），脚本与原始结果在 `/tmp/vs-design-measure/`（不入库）。英文孪生：docs/design-desktop-apps-seamless.md。

## 0. 一段话

五件事里有四件是**客户端一个 lane 就能收口的小改动**（剪贴板：把"点击复制"换成"用户自己那次 Ctrl+C 打开的 5 秒手势窗"——实测在明文 http 下成立；关闭：应用退出 ⇒ 我们的窗口跟着关；seamless：检测到应用自带 header bar 就藏掉我们的标题栏，拖它的 header bar 就是拖我们的窗口——xpra 已经把那次拖动作为一条报文发给我们，我们今天只是忽略了它；DPI：把 VibeSpace 自己的有效缩放 `devicePixelRatio × UI 缩放` 推导成应用缩放，每窗可改、改了重启）。第五件（远程主机）是**一条独立的大 lane**，形状照抄 browser-serve / browser-access（在应用所在的机器上跑同一份代码、经 agentd 数据面转发 xpra 的 ws），要先定 D5–D8。

## 1. 逐点影响表

| # | owner 看到的 | 今天为什么这样（file:line） | 技术上可能什么 | 最小改动 | 成本 | 风险 | 建议 |
|---|---|---|---|---|---|---|---|
| 1 | 应用里复制后要点 chip 才到本机剪贴板 | 页面是 `http://<主机名>`，`isSecureContext === false`（xpra-view.js:119），`navigator.clipboard` **不存在**（实测 M1）；`deliverCopy`（picture-shell.js:201–207）在非安全页只能走 chip，chip 的点击用 `execCommand('copy')`（picture-shell.js:43–54 / 195–199）。这是浏览器规则：非安全源没有异步剪贴板 API | **实测 M1**：`execCommand('copy')` 在**用户可信按键/点击之后 5 s 内**异步调用都成功（0/50/150/300/1000/3000/4800 ms 全成，5200 ms 起失败），我们的视图对 keydown 做 `preventDefault` 也不影响（M1b）；应用的剪贴板 token 在用户按下 Ctrl+C 后 23–300 ms 到达（M3c 的 lost-window 23 ms 是同一条链路的量级；§7.2 50–300 ms）——**在窗内**。所以：用户在应用里按 Ctrl+C（或点菜单 Copy）⇒ token 到 ⇒ 我们直接写本机剪贴板，**不用点击**。做不到的：不是用户在本页面做的复制（agent 经 P9 复制、应用自己定时复制、另一台客户端复制）——窗外，chip 保留（浏览器规则，不是我们的） | `deliverCopy` 非安全分支：先 `copyViaSelection(text)`，返回 true 就 toast 并不显示 chip，false 才显示 chip（≈5 行）；chip 加一次性提示"要每次都无感复制，开 HTTPS（三种办法见 §3.1）"，按设备记一次可关 | S（1 lane 半天含测试） | 低：门就是浏览器自己的返回值；负控=无手势时 false ⇒ chip（实测）。Firefox 同规则（5 s 瞬时激活，未实测）；Safari 可能要求同步（未实测）⇒ 那里仍退回 chip | **是** |
| 2 | 关了应用自己的窗口，外面的 VibeSpace 窗口还要再关一次 | keeper 只把记录改成 `exited`（`onPartExit` → `fail(rec,'app-exit')` → teardown → commit，desktop-app-keeper.js:704–719）；客户端 `render()` 对终态只**断开画面、写一句状态**（desktop-app-window.js:362–365），视图写 "The application closed its window"（xpra-view.js:238），**没有任何代码关窗口**。实测 M3c：点计算器自己的 ✕ ⇒ `lost-window` 23 ms ⇒ 状态句 59 ms ⇒ 记录 `exited` 61 ms ⇒ 窗口仍在 | 记录终态 + 视图无窗口 ⇒ `app.wm.closeWindow` + toast "计算器已退出"；多客户端各自收同一条 `desktop-apps-updated` 广播各自关（布局同步不会再开：openSpec 重放遇到 `exited` 记录 ⇒ toast 不开窗）。反向：外层 ✕ 今天**不停应用**（`onClose` 只 dispose 视图，desktop-app-window.js:406；应用活到 idle 超时）⇒ 改成外层 ✕ = 给应用发 `close-window`（xpra-proto.js:375 已有，等于 WM_DELETE_WINDOW，应用可以问"保存吗？"），5 s 内第二次 ✕ = Stop（实现常量 `OUTER_CLOSE_AGAIN_MS`；初稿写的 10 s） | `render()` 终态分支 + `openDesktopApp` 的死记录门 + `onClose` 发 `close-window`（可选 D2b）；对话框/弹窗关闭**不是**应用退出：规则只看**记录**（进程没了）且**视图零窗口**，两者同时才关 | S–M | 低；一个 fork 后自退的启动器（进程退了、窗口还在）不会误关（零窗口条件）；`failed` 记录**不关**（错误要看得见，静默失败零容忍） | **是** |
| 3 | 内窗口自带完整控制（关闭等），外窗口不该显示任何东西 | window.js:85–95 给每种窗口都造标题栏；desktop-app-window.js:135 像别的窗口一样 `createWindow`；xpra seamless 一级没有服务端装饰（配方 desktop-display.js:471–484，xpra 自己当 WM 不画框），所以 GTK 的 header bar（CSD）画在 pane 里，我们的标题栏又叠一层 | **检测（实测 M2/M3a）**：xpra 的 `new-window` 元数据里，计算器 `decorations: 0`（来自 `_MOTIF_WM_HINTS` flags∋DECORATIONS 且 decorations=0，xpra x11/models/window.py:844–849），xterm **没有** `decorations` 键（无 motif hints，xpra 默认 -1 不发）⇒ 规则 `csd = meta.decorations === 0`；`_GTK_FRAME_EXTENTS` 无合成器时不存在、`GTK_CSD` 未设、window-type 两者都是 NORMAL——都不能当信号。**拖动（实测 M3b）**：拖 header bar ⇒ GTK 发 `_NET_WM_MOVERESIZE` ⇒ xpra（WM）发给我们 `initiate-moveresize [wid, x_root, y_root, direction, button, source]`（seamless.py:750–765 / source/window.py:297–302；direction 0–7 = 八个边角 resize、8 = MOVE、11 = CANCEL）⇒ 我们今天**忽略**（xpra-client.js:331），什么都不动。所以 seamless 的跟随 = 把这条报文接成**外窗口**的拖动/缩放（内 X 窗口留在 0,0 的贴合，皮带不变）。应用自己的最大化/最小化按钮 ⇒ `_NET_WM_STATE` ⇒ `window-metadata {maximized|iconic}`（我们已声明这两个键，xpra-proto.js:54）⇒ 映射到 `toggleMaximize/minimize`（GTK4 在 xpra 下是否显示这两个按钮**未实测**，本机只量了 ✕） | 见 §3.3：PURE `seamlessVerdict` + client 的 `on.moveresize` + WindowManager 的 `beginDragFromPointer/beginResizeFromPointer` + 标题栏与状态条折成 0 高热区（顶边悬停 1.5 s 展开）+ 每窗开关 | M（1 lane 1–2 天） | 中：必须留在应用之上的东西有一份诚实清单（§3.3 表），其中**agent 租约**与**标签组**两项让 seamless 暂停（不是在上面叠东西）；一个把 decorations 设 0 却没有自己关闭按钮的 kiosk 型应用会没有 ✕——逃生口=任务栏右键菜单（taskbar.js:239）+ 顶边热区，永远在 | **是**：检测到 CSD 自动 seamless；⋯ 菜单每窗开关 |
| 4 | 内部应用的 DPI 应可调，最好从 VibeSpace 自身 DPI 推导 | .158 已做：启动带 `devicePixelRatio`（launcher:186），`appScaleFor('auto', dpr)` = DPR ≥ 1.5 取 2 否则 1（desktop-apps.js:378–385），`scaleKnobs`：GDK_SCALE 整数 + Xft.dpi 承载小数（386–392；GTK 在 X11 上没有小数 GDK_SCALE，1.5 只放大文字），设置 `desktop.appScale` auto/1/1.5/2（settings-schema.js:133–141），启动时固定、改了要重启（说明里写了）、状态条 `2×` 芯片。**UI 缩放不在里面**：`vibespace.uiScale` 是 body zoom + `--ui-scale`（utils.js:875–889），pane 反缩放到净缩放 1（COUNTER_ZOOM utils.js:848）⇒ chrome 1.25× 时应用仍 1.0×。实测 M4：DPR 2 + uiScale 125 ⇒ 记录 scale 2 / dpi 96，pane 1123×700 CSS ⇒ X 2246×1400，body zoom 1.25 未参与 | VibeSpace 自己的有效缩放 = `devicePixelRatio × uiScale`（屏幕的 × 用户在这台设备上声明的）。推导：整数部分按 r2 的比例就近规则（几何中点 √2：< 1.414 取 1，否则 2；≥ 2.83 取 3），余数**只向上**进 dpi（`dpi = max(96, 96 × eff / gdk)`）：1.00→(1,96)；1.25→(1,120)；1.5→(2,96)；2.0→(2,96)；2.5→(2,120)；3.0→(3,96)。GTK 控件跟整数、文字跟 dpi（GTK3/4 实测规则 §7.6）；Qt 从 Xft.dpi 自己推小数（未实测）；xterm faceSize × gdk；Electron/Chromium 类应用要 `--force-device-scale-factor=<小数>`（未实测，注册表行可声明，P-later） | `appScaleFor` 加 `uiScale` 入参 + `scaleKnobs` 接受任意 1..3 的有效值（记录已存 `scale`+`dpi`，芯片打印 `2.5×`）；窗口 ⋯ 菜单 "缩放 ▸ 自动/1×/1.5×/2×/2.5×/3×" ⇒ `POST /api/desktop/apps/:id/relaunch {scale}`（同 exec/args/cwd 的新记录，同一个窗口换 id）；全局 `desktop.appScale` 的 auto = 推导值；远程应用把同一组 knobs 随启动 op 送到设备（推导在客户端，施加在设备） | S–M | 低；诚实限制不变：xpra 是像素流，改缩放要重启应用（GDK_SCALE 启动时读），客户端 `dpi` 必须等于记录的 dpi（§7.6 的规则，否则 xpra 改写 Xft.dpi 让文字翻倍） | **是** |
| 5 | 整个功能对 remote host 的适配、自动 seamless setup | `hostFacts` 按名拒绝非本地（desktop-display.js:111–117 / 160–161），keeper 同（:268），路由 `unsupported-host`（routes/desktop-apps.js:70–74）；桥连的是 `ws://127.0.0.1:<port>/`（desktop-stream.js:837）与 `net.connect(port,'127.0.0.1')`（:729）。v1 明写"daemon op 还没写" | **形状已有先例**：browser-serve（SHARED op 表 + runner，daemon 打包同一模块）+ browser-access（`call(hostId, op)`：本地进程内 / 配对设备走 agentd op / 无 daemon 的 ssh 主机按名拒绝 `host_needs_daemon`）+ `forwardCdp`（hub 侧回环监听 → `dm.tcpForward(remotePort)`，port-forward 的原语）。desktop-display.js 已经是 `hostId` 参数化的纯机器事实模块（fs/child_process），agentd 的 esbuild `--bundle`（package.json:10）像 browser-serve 一样静态打包它。xpra 协议端到端，桥只转字节 ⇒ 剪贴板/输入/几何/x5 座位**零改动**。做不到：macOS/Windows 设备（没有 X11，按名拒绝 `no_x11`）；无 daemon 的 ssh 主机（一次 ssh 起的 xpra 会话断线即孤儿，没有 keeper 进程——拒绝，不做单文件 rung） | §3.5：SHARED `src/desktop-serve.js`（把 keeper 里"在机器上做"的一半抽出：facts/launch/stop/status/list/windows/fit/keep-alive）+ ORCH `src/server/desktop-access.js`（browser-access 逐字形状）+ agentd `desktop-serve` op（三触规则 + 能力门）+ 桥的端口解析走 `forwardPort` + 记录加 `hostId`（一次性迁移）+ 启动对话框的机器选择 + "在 <机器> 上安装 xpra…"（owner 点击、先看计划、需 passwordless sudo；机队=镜像） | L（2 lanes） | 中-高：keeper 1181 行里生命周期与策略是内联的，抽 SHARED 一半是 lane 的大头；机队镜像的 xpra 3.1.3 协议仍是 OPEN（§9-1/§9-4）——建议镜像升到 xpra.org 的 6.x bookworm 包（D7）而不是去量 3.1；设备重启后应用消失（hub 记录在下次 `list` 变 `exited`，诚实） | **是，但先定 D5–D8，单独 lane** |

## 2. 实测（2026-09-23，本机）

### 2.1 M1 — 剪贴板，Chrome 153 无头，页面 `http://<hostname>:<port>`（主机名，非回环）

| 项 | 结果 |
|---|---|
| `isSecureContext` / `typeof navigator.clipboard` | `false` / `undefined`（回环页 `true`——回环证明不了任何事） |
| 无任何手势时 `document.execCommand('copy')` | `false`，剪贴板未变 |
| keydown 处理器**内同步** `execCommand('copy')`（可信 Ctrl+C） | `true`，剪贴板 = 写入值 |
| 可信 Ctrl+C 之后 **setTimeout 异步** `execCommand('copy')` | 0 / 50 / 150 / 300 / 1000 / 3000 / **4800 ms 全部 `true`**，`navigator.userActivation.isActive === true`；**5200 / 7000 ms `false`**（Chrome 的瞬时激活窗 5 s） |
| 同上但 keydown 里 `e.preventDefault()`（我们视图的形状） | 150 / 300 / 4800 ms 仍 `true`（激活与 preventDefault 无关） |
| `copy` 事件里 `clipboardData.setData`（有选区时） | 成功——但**聚焦一个空 textarea、无选区**（我们 IME textarea 的形状）时 Chrome **不派发 copy 事件**（0 次）⇒ "第二次 Ctrl+C 补写"这条路**否决** |
| `navigator.clipboard.writeText` 在 http 下带激活 | API 不存在（`hasApi:false`） |
| 控制组：http 下 textarea 的 Ctrl+V | 粘贴事件正常（今天 浏览器→应用 那条路不受影响） |

### 2.2 M2 — CSD 的 X 属性，裸 Xvfb（无 WM，与 xpra seamless 一级同形）

| 应用 | `_MOTIF_WM_HINTS` | `_GTK_FRAME_EXTENTS` | `_NET_WM_WINDOW_TYPE` | 其它 |
|---|---|---|---|---|
| gnome-calculator（370×616，min 370×616） | `0x3, 0x1, 0x0, 0x0, 0x0`（flags = FUNCTIONS\|DECORATIONS，functions ALL，**decorations 0**） | 无（无合成器不写阴影边） | NORMAL | `_GTK_APPLICATION_ID` org.gnome.Calculator；环境 `GTK_CSD` 未设 |
| xterm（484×316，inc 6×13，base 4×4） | **不存在** | 无 | 不存在 | 需要服务端装饰——seamless 一级里它**没有任何关闭按钮** |

### 2.3 M3 — 在真产品上（worktree 服务器 + 无头 Chrome，xpra 一级）

| 项 | 结果 |
|---|---|
| M3a 计算器 `new-window` 元数据（客户端 `client.windows`） | `decorations: 0`，window-type [NORMAL]，class [gnome-calculator]，size-constraints min [360,616] |
| M3a xterm 同上 | **无 `decorations` 键**，size-constraints {base [4,4], inc [6,13], min [10,17]} |
| M3b 在 pane 里可信拖 header bar 120×64 px | 收到 **2 条 `initiate-moveresize`**（其它只有 draw/ping/pointer）；VibeSpace 窗口 `left/top` 不变（70,45）；客户端主窗口 (0,0) 不变；X 端 `[0,0,898,616]` 不变——今天这次拖动**什么都不做** |
| M3c 点计算器自己的 ✕ | 点击后 **23 ms** `lost-window` 报文 → **59 ms** 视图状态 "The application closed its window" → **61 ms** 记录 `exited`（`exitCode 0`，日志 `exited: application exited (code 0)`）→ VibeSpace 窗口**仍在**（`exists:true`，视图 `connected`，0 个窗口） |
| M4 DPR 2 页面 + `vibespace.uiScale` 125（body zoom 1.25，`--ui-scale` 1.25） | 记录 `scale 2, dpi 96`（DPR 2 送到）；pane **1123×700 CSS** ⇒ X 主窗口 **2246×1400** 设备 px，canvas backing 2246×1400 在 1123×700 CSS 盒里（ratio 2）；应用最小 720×1232 设备 px。UI 缩放**未参与**：chrome 1.25×，应用 1.0×。推导值：2 × 1.25 = 2.5 ⇒ GDK_SCALE 2 + dpi 120 |

## 3. 每一点的设计

### 3.1 剪贴板：手势窗 + 一次性 HTTPS 提示

规则（PURE，`clipboardDelivery` 扩成三态 `api | gesture | chip`）：安全页有 API ⇒ `api`（今天）；否则先试 `copyViaSelection(text)`——它在用户最近一次可信输入的 5 s 内成立，token 恰好在这个窗里到（用户按 Ctrl+C / 点 Copy 的那次输入是**我们页面**收到的可信事件，随后转发给应用）；成立 ⇒ toast "已复制到本机剪贴板"，不显示 chip；不成立 ⇒ chip（窗外的复制：agent、定时、另一客户端）。不需要 `copy` 事件（M1b 否决）。

Seamless 与不 seamless 的路，照实说：
- **能无感**：https 页面（今天已是）；http 页面上**用户自己触发**的复制（本设计）。
- **不能无感**：http 页面上不是本页手势产生的复制——非安全源没有手势就不能写剪贴板，这是浏览器规则；chip 保留。
- **让 http 变 https 的三条路（给这位 owner 的确切步骤）**：① 零基础设施：Chrome 地址栏 `chrome://flags/#unsafely-treat-insecure-origin-as-secure`，填 `http://<主机名>:3456`，重启浏览器——只对这台浏览器生效，之后 `navigator.clipboard` 存在，今天的代码就无感（**未实测**，Chrome 文档行为）；② `tailscale serve --bg 3456`（Tailscale 自动签证书，地址变成 `https://<机器>.<tailnet>.ts.net`）；③ 一个反代（Caddy 两行：`<主机名> { reverse_proxy 127.0.0.1:3456 }`，本地 CA 自签需在浏览器信任一次）。产品本身不做 TLS（server.js:159 只有 `http.createServer`，无 TLS 开关）——**不建议加**：反代/Tailscale 已经是通行做法，加一个证书路径设置只会多一处要维护的 TLS 代码。提示语一次性（按设备记 `desktopCopyHintShown`），带"怎么做"的链接指向 docs/getting-started.md 的新一节。

Gate：test-xpra-client §3 的 fake DOM 加两腿——有激活（`copyViaSelection` 注入为 true）⇒ 无 chip + toast；无激活 ⇒ chip；test-desktop-xpra-window 的明文 http 腿改成：可信 Ctrl+C 打进应用（xterm 里 `printf x | xclip -i` 由按键触发…实际用 `xclip -i` 在按键后 200 ms 内写）⇒ 安全页读回 = 应用剪贴板，**零点击**；负控 = 无按键的 `xclip -i` ⇒ chip 出现。

### 3.2 关闭：应用退出 = 我们的窗口关闭；外层 ✕ = 应用自己的关闭

- 客户端 `render()`：`rec.state === 'exited'` 且视图 `windows().length === 0` ⇒ `showToast(t('{app} exited', …))` + `app.wm.closeWindow(winInfo.id)`；`failed` ⇒ 留窗、红字（今天）。`openDesktopApp(app, id)` 的首个 GET 遇到 `exited` ⇒ toast、不建窗（布局同步重放的死记录不再变成空窗）。`stoppedBy === 'user'`（点了 Stop）同样关（D2d）。
- 两个条件都要：**只有进程没了**（fork 后自退的启动器）⇒ 不关，keeper 的标记普查已经能看到真正的应用进程（`evidenceCensus`），把它记为 `pids.app` 是 keeper 的后续（不在本轮）；**只有窗口没了**（应用关了主窗还在跑，如托盘型）⇒ 视图今天那句 "The application closed its window" + 一个 "Stop" 按钮，不自动关。
- 外层 ✕（seamless 与否都一样）：先 `client.send(P.closeWindow(mainWid))`（xpra-proto.js:375，= WM_DELETE_WINDOW；应用可弹"保存？"，此时不关）；5 s 内第二次 ✕（`OUTER_CLOSE_AGAIN_MS`，lane 任务书的数；初稿写的 10 s）⇒ `POST …/stop`；应用退出走上面那条。实测（A r1，2026-09-24）：没有客户端装饰的 xterm 对 WM_DELETE_WINDOW 的回应是给自己的 shell 发 hangup，shell 退了它就退——交互式 bash 第一次 ✕ 就结束；扛得住 SIGHUP 的 shell（zsh 首次运行的 `zsh-newuser-install` 菜单——HOME 里没有 .zshrc）让 xterm 继续活着，第二次 ✕（toast 写明了）就是 Stop。多客户端：每个客户端各自从广播关自己的 pane；x5 座位随之释放（今天已经如此——socket 关闭即 leave）。agent 租约（P9b）：应用退出 ⇒ 引擎的 `holderAlive` 失真 ⇒ 租约按今天的 `window-leases-updated` 路径消失，agent 的下一条动词得到 `window_gone`（已有的拒绝名）。
- Gate：test-desktop-xpra-window 加一腿——点 CSD ✕ ⇒ 2 s 内 `app.wm.windows` 里没有该窗、toast 文本命中；第二页面同时关；控制组 = 去掉关窗那一行的副本。

### 3.3 Seamless chrome

**判定（PURE，`src/lib/desktop-seamless.js`，零依赖，进 bundle）**：

```
seamlessVerdict({ csd, setting, userToggle, lease, chain, phone, connected })
  → { seamless: bool, why: 'csd' | 'user' | 'setting-off' | 'ssd' | 'lease' | 'chain' | 'phone' | 'disconnected' }
csd = meta.decorations === 0（主窗口）；setting = desktop.seamless 'auto' | 'off'；userToggle = 每窗 'auto' | 'on' | 'off'（user state desktopAppFrame[appId]）
seamless ⇔ connected ∧ ¬lease ∧ ¬chain ∧ ¬phone ∧ (userToggle==='on' ∨ (userToggle==='auto' ∧ setting==='auto' ∧ csd))
```

**窗口形态**：seamless 时 `.window.seamless`——标题栏与状态条折成 **0 高的热区**（`display:none` 之外的另一个类，热区 6 px 在窗顶），顶边悬停 250 ms 或按住 Alt 时两条同时滑出 1.5 s（离开即收）；`.window-active` 的 1 px 边框保留（焦点仍要看得见）；resize 手柄保留（它们是 8 个空 div，本来就不可见）。**不 seamless**（xterm 这类 SSD 应用、或任一暂停条件）= 今天的样子。

**交互映射**：

| 用户在应用里做的 | xpra 报文 | 我们 | 
|---|---|---|
| 拖 header bar | `initiate-moveresize` direction 8（MOVE） | `wm.beginDragFromPointer(winId)`：从当前指针位置进入 `_setupDrag` 的 processMove（同一套：网格吸附、shake 直通、标签合并命中、桌面预览投放）；释放 pointer capture；X 端主窗口留在 0,0（皮带不动） |
| 拖 CSD 的边/角 | direction 0–7 | `wm.beginResizeFromPointer(winId, dir)`：走 `_setupResize` 的手柄路径（最小尺寸=应用最小值，已有）；pane 变 ⇒ 现有的 refit |
| 键盘移动/缩放（Alt+F7/F8 类） | 9 / 10 | 同上，鼠标接管 |
| CANCEL | 11 | 结束拖动，还原 |
| 点应用的 最大化 / 最小化 | `window-metadata {maximized}` / `{iconic}` | `toggleMaximize` / `minimize`（GTK4 在 xpra 下是否画这两个按钮**未实测**；没有就靠热区/菜单） |
| 点应用的 ✕ | 应用退出 | §3.2 |
| 双击 header bar | 应用自己处理（GTK 最大化 = 上一行） | — |
| 右键标题栏（今天的窗口菜单） | — | **任务栏项右键**（taskbar.js:239 `showWindowContextMenu`，已有全菜单）+ 热区里的 ⋯ |

**必须仍然显示在应用之上的东西（诚实清单）与去处**：

| 东西 | 今天在哪 | seamless 下 | 是否需要留一条最小 bar |
|---|---|---|---|
| x5 blocked 覆盖层 "Active on another client / Resume here" | 整 pane 覆盖层 | 不变（它本来就盖住应用） | 否 |
| "Scaled to fit — 应用至少 w×h" 角标 | pane 角标（xpra-view.js:110） | 不变（瞬态角标） | 否 |
| 明文 http 的复制 chip | 状态条（picture-shell.js:103） | pane 右上角浮 chip，10 s 自隐；§3.1 之后只在窗外复制时出现 | 否 |
| 断线状态 + Reconnect | 状态条 | 未连接时 pane 中央覆盖层（画面本来没了）；连接后隐藏 | 否 |
| `2×` 缩放芯片、后端芯片、CPU/RSS、idle 倒计时、Keep running、Stop | 状态条（desktop-app-window.js:286–304） | 热区展开时可见；任务栏右键菜单 "Desktop app ▸ Keep running / Stop / Scale ▸" | 否 |
| idle 停止 < 1 min 警告 | 芯片 | toast | 否 |
| **agent 持有标记**（P9b：mode badge / Take over / Hand back，desktop-app-window.js:302–316） | 状态条 | **seamless 暂停**（bar 显示）——用户必须一眼看出是 agent 在驾驶；替代方案（4 px 彩色边框 + 热区徽章）更省但更不显眼 | **是**（唯一真正的理由） |
| 标签组的 tab bar（活在标题栏里）、图标拖拽合并、P7 的 owner/auth 徽章 | 标题栏 | **seamless 暂停**（进链即显示 bar） | 是（结构上） |
| 焦点/活动态 | `.window-active` 标题栏底色 | 1 px 边框（CSS） | 否 |

结论：只有 **agent 租约**与**标签组**两件事值得保留一条 bar，它们用"暂停 seamless"解决；其余都能进热区/菜单/toast。

**默认**：检测到 CSD 自动 seamless；每窗 ⋯（热区里）"显示窗口边框 ▸ 自动/开/关"，按应用 id 记在 user state；全局 `desktop.seamless` auto|off（`off` 给不喜欢的人一键回到今天）。手机（≤768 px）永不 seamless（窗口就是屏幕，标题栏是唯一的返回路径）。

**Gate**：fast test-desktop-seamless（判定表全矩阵 + 暂停条件 + 用户开关优先级）；test-xpra-client §2 加 `initiate-moveresize` ⇒ `on.moveresize` 事件（假 worker）；heavy test-desktop-xpra-window 加两腿：计算器 ⇒ `.window.seamless`、标题栏 `offsetHeight 0`、拖 header bar 120×64 ⇒ 窗口 `left/top` 各 +120/+64（±2）、X 主窗口仍 (0,0)；xterm ⇒ 不 seamless、标题栏可见；控制组 = M3b 今天的行为（什么都不动）。

**已交付（lane B，2026-09-25，2.369.177）**——按上文实现；与计划不同之处与实测：
- **判定逐字是 §3.3 的公式**（`src/lib/desktop-seamless.js`）；`why` 先答"想不想"（user / setting-off / ssd / csd），再答暂停，于是菜单能说"agent 操作期间显示边框"而不是"没有标题栏"。被 block 的第二个客户端没有画面、无从得知应用的边框，所以它答 `ssd`（bar 显示在 "Resume here" 覆盖层之上）而不是 `disconnected`——结果相同。
- **开关的两套词。** 菜单说的是 FRAME（"显示窗口边框 ▸ 自动/开/关"，user state `desktopAppFrame[<应用 id 或 exec:basename>]` 存的是边框词）；判定里的 `userToggle` 说的是 SEAMLESS——边框"开" ⇒ userToggle off。一个 PURE 函数负责互译。
- **展开的时间：** 窗顶 6 px（几何判断，resize 手柄仍拥有边缘）悬停 250 ms，或在活动窗口上按住 Alt；两条 bar **叠在**应用之上（悬停绝不改变 pane 尺寸——应用不会因此重新 fit）；指针回到应用内或松开 Alt 后停留 1.5 s（"滑出 1.5 s"按停留理解），指针离开窗口立即收起。
- **拖动进入同一套机制：** `WindowManager.beginDragFromPointer` 从手势的按下点（由 xpra 的 x_root/y_root 换算）开始标题栏自己的拖动，由逐次拖动的 AbortController 上的 POINTER 事件驱动——pane 取消了自己的 pointerdown，浏览器不会再发兼容的鼠标事件。视图把指针交出去：释放 capture、不再向 X 转发移动、在 document 的 pointerup 上只向 X 发一次按键释放。**实测**：拖 header bar 120×64 ⇒ 窗口移动 120/64；X 与客户端都保持主窗口在 0,0；M3b 的"2 条报文"是 `[8 MOVE, button 1]`，以及松开时的 `[11 CANCEL, 0, 0, button 0]`——GTK4 在松开时发 CANCEL，晚于我们的 drop（无操作）。
- **菜单只有一层子菜单**（showContextMenu）："Desktop app ▸ Keep running / Stop / Scale ▸"变成窗口/任务栏菜单里的四个顶层行——显示窗口边框 ▸、缩放 ▸、保持运行、停止应用——展开后的 ⋯ 里是同样的行。
- **诚实清单，实际落地：** blocked 覆盖层与 fit 角标不变（在 pane 里）；状态条折起时复制 chip 浮在 pane **右下角**、10 s 后自隐（r1：原计划的右上角正好盖住 CSD header bar 自己的 ─ □ ✕——在 GNOME 计算器上实测）；idle 停止前最后一分钟是 toast；未连接 = 暂停（状态条与 Reconnect 显示），而不是另做一个覆盖层；agent 租约与标签组暂停；焦点 = 1 px `--border-active` 边框。
- **顺手发现：** 在应用画面里点击从不会激活它的 VibeSpace 窗口（被取消的 pointerdown 压掉了窗口焦点监听所等的 mousedown）——用窗口上的 capture 阶段 pointerdown 修复。
- Gate：test-desktop-seamless（fast）、test-xpra-client §2d/§2e、test-desktop-xpra-window §12（heavy，控制组 = 判定强制为 false 的副本）。
- **验证者 r1（2026-09-25），与首版的三处不同，每条都先在真实链路上复现为红：** (a) 从**最大化**的 seamless 窗口拖出来（应用的 header bar 或我们的标题栏）会让 X 保持 `maximized: true`——应用一直显示还原图标，第一次点击是死的；window.js 拖动取消最大化时现在像其他所有取消最大化一样调用 `onResize`（取消拖动而重新最大化时也调用），由它发出 `setAppState({maximized:false})`；(b) 浮动复制 chip 挪到 pane **右下角**（右上角在它的 10 s 里盖住应用的 ─ □ ✕）；(c) 展开后的标题栏与状态条原来是 z-index 25 / 24，压在 resize 手柄（10）之上，于是 250 ms 展开之后按在顶边 3 px 手柄带上变成了标题栏**拖动**——现在是 9 / 8，展开时顶边仍然是 resize（§12 (4) 命中测试，把 25 放回去的现场控制组）。热区仍是几何判断。

**Lane D (a) item C（2026-09-25）— seamless 下的 CHROME，实测**（Google Chrome 153.0.8010.47，xpra 6.5.3，keeper 的 `chromium` 行，全新 profile；owner 的第二张截图：两条栏叠在一起，"Chrome的顶部标题栏似乎不会自动隐藏？"）：
- **Chrome 创建了什么：** 0x400004 = 浏览器窗口（xpra 唯一转发的那个，被 reparent 进 `Xpra-CorralWindow-0x400004`）；不映射的辅助窗口 0x600001 "google-chrome" 10×10（WM_CLIENT_LEADER）、0x400000 "Chromium clipboard"（override-redirect，位于 -100,-100）、0x400006 1×1 override-redirect；菜单与 tooltip 以 `new-override-redirect` 到来（popup）。"第一个 main"的选法对 Chrome 是对的——不需要按证据挑窗口。
- **默认报告了什么：** `new-window` 元数据 `has-alpha: true`、`title "New Tab - Google Chrome"`、`class-instance ["google-chrome (<profile 目录>)", "Google-chrome"]`、`window-type ["NORMAL"]`、`size-constraints {gravity 10, minimum-size [500,87]}`、**`decorations: 1`**；X：`_MOTIF_WM_HINTS 0x2,0x0,0x1,0x0,0x0`（flags = DECORATIONS，decorations 1 = "窗口管理器，给我画边框"）、`_NET_WM_WINDOW_TYPE_NORMAL`、`WM_WINDOW_ROLE "browser"`、没有 `_GTK_FRAME_EXTENTS`、`_NET_FRAME_EXTENTS 0,0,0,0`。
- **为什么两条栏没折起：** Chrome 不认识这个窗口管理器（`_NET_SUPPORTING_WM_CHECK` 写的是 "Xpra"），所以它的"使用系统标题栏和边框"——profile 偏好 `browser.custom_chrome_frame` = false——就是默认值：它只画标签条和工具栏，**没有** ─ □ ✕，并请 WM 画边框 ⇒ 不是 CSD ⇒ `{seamless:false, why:'ssd'}`。owner 以为是 Chrome 自己的标题栏，其实是**我们的**（它带着 Chrome 的 X 标题和图标）；下面那条状态条也是我们的。判定路径上没有任何地方排除浏览器行，状态条也没有自己的规则（它在 `.window.seamless` 下与标题栏一起折起）。Chrome 153 **没有**对应的命令行开关（二进制的字符串里只有这个偏好名）。
- **`browser.custom_chrome_frame: true` 时：** `_MOTIF_WM_HINTS 0x2,0x0,0x0,0x0,0x0` ⇒ **`decorations: 0`**、`_GTK_FRAME_EXTENTS 5,5,5,5`、最小 [510,97]（最大化 [500,87]）、`_GTK_HIDE_TITLEBAR_WHEN_MAXIMIZED 1`、`_NET_WM_OPAQUE_REGION` = 窗口减去顶部两个 15 px 的圆角。Chrome 画出标签**以及**自己的 ─ □ ✕ ⇒ `why: 'csd'` ⇒ seamless。在 Chrome 自己的"设置 → 外观"里拨这个开关，会在**同一个** X 窗口上实时翻转 `decorations`（判定跟着变）。
- **经我们的客户端按它的按钮**（可信点击，900×620 窗口，DPR 1）：□ ⇒ `{maximized:true}` ⇒ 我们的窗口最大化；它的还原 ⇒ 我们还原；─ ⇒ `{iconic:true}` ⇒ 我们最小化；我们还原 ⇒ `setAppState({iconified:false})` ⇒ Chrome 重绘；✕ ⇒ Chrome 以 0 退出且不留窗口 ⇒ 我们的窗口关闭（A2）。拖标签条 ⇒ 两种边框模式下都发 `initiate-moveresize` 方向 8——但 x_root/y_root 比真实按下点**偏 +10,+5**（GNOME 计算器的是准的）：120/64 的手势只移动了 110/59。现在 view 在有按下进行中时从 pane **自己**记录的按下点起拖（只有键盘移动才用应用的根坐标）：120/64 ⇒ 120/64。
- **建了什么：** keeper 在 `<profile>/Default/Preferences` 里写 `browser.custom_chrome_frame: true`，每个 profile **只写一次**（旁边放标记文件 `.vibespace-frame-seeded`——Chrome 可能丢掉等于默认值的键，而用户在 Chrome 里把系统标题栏开回来之后不能被下次启动推翻），且只在该键**不存在**时写（已有的 `false` 是用户的选择），写在 `bringUp` 里、浏览器启动**之前**——全新 scaffold、保留的 profile、以及随缩放 ▸ 重启搬到后继的 profile 都一样（若在 `launch` 时写，后继的空 scaffold 就不空了，搬运的 `rmdir` 会失败）。单靠"显示窗口边框 ▸ 关"**不是**解法：默认布局下 Chrome 没有 ─ □ ✕，强制 seamless 只剩拖动。经缩放 ▸ 从 1× 重启到 1.5×（DPR 1）实测：搬过去的 profile 保留偏好与标记，后继再次 seamless（decorations 0，最小 [765,146] = 1.5 × [510,97]），窗口像任何应用一样跟随缩放（798×558 → 1197×837——浏览器行的控件就是它的整体缩放）。
- **实测的残留（未解）：** 非最大化时，Chrome 在我们 1 px 边框内侧画一条 5 px 的缩放边带（边缘 1 px 灰、3 px 白、一条 1 px 灰线），并把顶部两个角画成圆角（透明像素）；最大化后两者都消失。xpra 6.5.3 不转发 `_GTK_FRAME_EXTENTS`，Chrome 的不透明区域**包含**这条边带，Chrome 153 也不支持 `_GTK_EDGE_CONSTRAINTS`（平铺态）——客户端没有可以据以裁掉它的事实；要做就得让 keeper 从 X 读 `_GTK_FRAME_EXTENTS`。Firefox 未实测（本机是 snap，被 `snap-profile-unreachable` 按名拒绝）；它大概的开关（`browser.tabs.inTitlebar`）没有写。keeper 的停止会让 Chrome 留下 `profile.exit_type: "Crashed"`（reader 2 三次中两次——缩放 ▸ 的后继随后弹出"恢复页面？"）：原因未定位，未解。
- **顺手发现（已修）：** 一个 scroll 包里的各个 move 在它们读取的同一张画布上依次应用，后一个 move 读到的是前一个已经覆盖过的行（chrome://settings 上 66 个包里 593 次重叠——直到整屏重绘前都有重影行）；现在同一个包的每个 move 都读**同一份**快照（上游的 `do_paint`）。`has-alpha` 的窗口每次绘制前先清空该区域。
- Gate：test-desktop-seamless §6（实测元数据 ⇒ 判定；写入偏好 ⇒ Chrome 的边框 ⇒ seamless；控制组：不写 ⇒ `ssd`）、test-desktop-apps §14（偏好表）、test-xpra-client §7（按下点、scroll 快照、alpha 清空）、heavy test-desktop-xpra-window §16（真二进制）及其控制组副本。

### 3.4 DPI：从 VibeSpace 自己的缩放推导，每窗可改

- **推导（PURE，`appScaleFor(setting, dpr, uiScale)`）**：`eff = clamp(dpr × uiScale, 1, 3)`；`gdk = eff < √2 ? 1 : eff < 2√2 ? 2 : 3`（r2 的比例就近规则推广到 3）；`dpi = max(96, round(96 × eff / gdk))`（余数只向上进 dpi，永不把文字缩到 96 以下）。`scaleKnobs(eff)` 接受任意有效值，返回 `{scale: eff, gdkScale, dpi, env, xresources}`（GDK_SCALE、QT_SCALE_FACTOR=gdk、XTerm faceSize = 8 × gdk × (dpi/96)）。表：

| eff | gdk | dpi | GTK 控件 | 文字 |
|---|---|---|---|---|
| 1.00 | 1 | 96 | 1× | 1× |
| 1.25 | 1 | 120 | 1× | 1.25× |
| 1.50 | 2 | 96 | 2×（相对 chrome 1.33×） | 2× |
| 2.00 | 2 | 96 | 2× | 2× |
| 2.50 | 2 | 120 | 2× | 2.5× |
| 3.00 | 3 | 96 | 3× | 3× |

- **在哪里读 uiScale**：启动请求带 `uiScale`（launcher 已经带 `dpr`；`uiScale()` utils.js:841），路由校验 1..2（`UI_SCALE_MIN/MAX`）。远程应用：同一对数字随 `launch` op 送到设备，设备只施加 env + xrdb（推导在 hub，与今天 dpr 一样）。
- **每窗控制**：热区/任务栏菜单 "Scale ▸ 自动 (2.5×) / 1× / 1.5× / 2× / 3×" ⇒ `POST /api/desktop/apps/:id/relaunch {scale}`：keeper 起同 exec/args/cwd/host 的新记录，窗口的 `_desktopAppId` 与 openSpec 换成新 id（同一个 VibeSpace 窗口，画面重连），旧记录 stop。说明里写明"改缩放会重启应用（未保存的内容会丢）"，菜单项带确认（createModalShell）。全局 `desktop.appScale` 的 `auto` = 推导；保留显式 1/1.5/2，加 3。
- **.158 已经做了的、这里不动的**：设备像素端到端、`size-constraints` 的最小尺寸夹住窗口、Watch 的舞台缩放、客户端 `dpi` = 记录 dpi。
- **诚实限制**：改缩放必须重启（GDK_SCALE 启动时读）；小数在 GTK 上只影响文字（X11 的限制）；Qt/Electron 的小数 knob 未实测；vnc-display 一级不缩放（整屏级）。
- Gate：test-desktop-apps §10 加推导表（上表 6 行 + 边界 √2/2√2 + uiScale 缺省=1 与 .158 逐行相等的回归控制）；heavy §7 加一腿：uiScale 125 + DPR 2 ⇒ 记录 `scale 2.5, dpi 120`，计算器最小 `[900,1540]` 附近（720×1232 × 1.25 文字增量——只断言 ≥ 2× 的值且文字行高 > 2× 的）。
- **2026-09-25 补记 — lane D (b)：可点击的缩放芯片 + 每个应用的默认缩放**（owner："可以改成那个1.5x 已选的提示直接可以点快速切换" + "最好加入可以在app启动前那个app选择界面调整每个app默认dpi的能力"）。(1) 状态条上的缩放芯片在窗口能重启时（`relaunchVerdict` 为 null——运行中的 xpra 应用）是一个**控件**：role=button、Enter / Space，点击就在芯片处打开与 ⋯ 完全相同的 Scale ▸ 行（同一个函数）；否则是纯文本，原因写在 tooltip 里。(2) 启动对话框里每张应用卡片（所选机器的一级是 xpra 时）旁边有一个并列的小控件，菜单为 自动（设置 → 桌面应用缩放）/ 1× / 1.5× / 2× / 2.5× / 3×，把该**应用**的默认缩放存进 user state `desktopAppScale[<key>]`（与 `desktopAppFrame` 同一个键：注册表 id，否则 `exec:<basename>`；选“自动”即删除该键；同步到所有客户端），不会启动应用。每次启动都把该应用存下的默认值作为 `scaleChoice` 发出；`scalePick` 的优先级 = 窗口自己的重启选择 > 应用默认（来源 `app`，芯片 "1.5× · 应用默认"）> 显式的 `desktop.appScale` > 自动。路由在问配对机器之前就按名拒绝非法值；配对机器在 `launch` op 的 `body` 里收到它（op 形状不变；旧 agent 丢弃该字段，其记录如实写出实际缩放）。窗口的 Scale ▸ 标出应用默认那一行，并追加 "{n}× 是此应用的默认缩放" / "把 {n}× 设为此应用的默认缩放"（不重启）/ "取消此应用的默认缩放"。(3) 可点名选择的缩放现在是 1 / 1.5 / 2 / 2.5 / 3（`EXPLICIT_SCALES`——每一个都被 `scaleKnobs` 精确表达；lane D (b) 建成时用的是取整规则（2.5 = GDK_SCALE 2 + 120 dpi，标注"GTK 应用：控件 2×，文字 2.5×"），lane D 合并时由下文 lane D (a) 的向上取整规则取代：2.5 = 按 GDK_SCALE 3 绘制、以 0.8333 显示，每一行都只写"n×"；3 = GDK_SCALE 3），用于窗口菜单和卡片；设置里的枚举仍是 1 / 1.5 / 2。留给 owner 的决定：当设置是显式值时，某个应用选"自动"= 跟随设置（若要"该应用始终按屏幕推导"需要存一个 'auto' 行——未实现）。Gate：test-desktop-app-scale（快）、test-desktop-xpra-window §14（真实一级、两个客户端、去掉字段与控件的副本做对照）、test-desktop-remote §7（真实 daemon）。

**Lane D (a)（2026-09-25）— 小数是真正的缩放；窗口跟随重启**（上表是 A3 拼写小数的方式——已被取代）。owner 用缩放 ▸ 把 GNOME 计算器从 2× 重启到 1.5×："从2x切换到1.5x之后出现大量白边，你窗口尺寸计算不对"。**先实测**（xpra 6.5.3 + gnome-calculator 50，无头 Chrome DPR 2 / 1.5 / 1，真实的缩放 ▸ 路径）：我们的几何在每次切换都是精确的——X 主窗口 = 设备 px 的 pane，边距 0/0/0/0，pane 未覆盖 0.0 %。白的是计算器**自己的**背景：旧的 floor 规则把 1.5× 画成 GDK_SCALE 1 + 144 dpi（控件 1×，只放大文字），而 libadwaita 把内容列夹在约 676 逻辑 px，于是这次重启把每个控件和内容列都减半（DPR 2 下 676 → 338 CSS px），窗口却保持原尺寸——应用自己的背景从宽度的 25 % 变成 62 %。
- **现在的规则**（`scaleKnobs(s)`，规则 `ceil`）：GDK_SCALE = ⌈s⌉、96 dpi，view 以 `pictureScale` = s ÷ ⌈s⌉ 显示画面——控件**和**文字都是 s，由浏览器重新采样；整数缩放仍然 1:1。

| s | GDK_SCALE | dpi | 画面 | 控件 + 文字 |
|---|---|---|---|---|
| 1 | 1 | 96 | 1 | 1× |
| 1.25 | 2 | 96 | 0.625 | 1.25× |
| 1.5 | 2 | 96 | 0.75 | 1.5× |
| 2 | 2 | 96 | 1 | 2× |
| 2.5 | 3 | 96 | 0.8333 | 2.5× |
| 3 | 3 | 96 | 1 | 3× |

  auto 的小数用同一规则（DPR 1 上 125 % 的界面按 2 绘制、以 0.625 显示——应用与 chrome 一致，像素量约为 1:1 画面的 2.56 倍；让 auto 只取整数则会把 M4 的"1.25× chrome 旁边一个 1.0× 应用"带回来）。浏览器行保留 floor 规则（`rule: 'dpi'`、`scaleRuleOf`）：Chrome 按字体 dpi **整体**缩放（实测 1 + 144 dpi 时最小 [750,131] = 1.5 × [500,87]），1:1 保持锐利。记录里存 `gdkScale` + `pictureScale`；客户端读**记录**（`renderOf`）——没有这两个字段的记录（更早的，或跑旧代码的已配对机器）就是 floor 规则，按 1:1 显示。
- **窗口跟随重启**（PURE `relaunchPaneCss`）：新 pane = 应用的逻辑尺寸 × 新的控件缩放 ÷ dpr，逻辑尺寸 = pane 的 X px（view 把它缩放适配时取主窗口的）÷ 旧 GDK_SCALE；由发起的客户端改窗口尺寸（`WindowManager.resizeWindowTo`，左上角不动、以工作区为上限；最大化 / tab 链 / 手机布局不动），布局同步带到其他客户端。DPR 2：898×678 → 1× 449×339 → 1.5× 673.5×508.5 → 2× 898×678 → auto 898×678 → 1× 449×339——来回精确；应用自己的背景每一步都是 24.7 %。
- **我们自己的边距可能出现的三处，逐一实测并修复：** (1) F3——每次 CSD 连接都在栏还没折起时按 pane 映射应用（折起要等 `main`，而 `main` 在 fit 之后才来），约 160 ms 后再 fit 一次：现在客户端在 fit **之前**先报出主窗口，view 在这次回调里就 resize，map-window 就是最终尺寸；(2) pane 小于应用最小尺寸时（DPR 1 下的 2×：720×1232 放进被工作区夹住的 898×913 pane）缩放适配后两侧各露出 116 CSS px 的 pane 背景（25.8 %）：fit 现在在适配比例下保持 pane 的**形状**（1212×1232）；(3) GTK 在映射后约 650 ms 把自己缩回自己的尺寸，而 belt 同一任务内的再 fit 让中间那些行被清掉约 110 ms：缩小的窗口保留画布后备 1 s。
- **修后实测**（test-desktop-xpra-window §15，DPR 2 与 DPR 1，窗口自己的缩放 ▸ 行 auto → 1 → 1.5 → 2 → auto → 1，再改到 1200×800 又改回）：每一步每条边 ≤ 1 CSS px、截图里 pane 自己的背景 0.00 %；计算器每 1× 的内容列不变（DPR 2：2×、1×、1.5× 都是 338.0 CSS；DPR 1：676 / 673）；每个 map-window = 稳定后的主窗口。控制组（floor 旋钮、没有重启跟随的副本）：2× → 1.5× 内容列比 0.500，窗口保持 898 px——owner 的截图。
- **诚实的限制：** 小数画面是**重新采样**的（比整数缩放略柔和——这是真控件的代价）；1:1 的逐像素测试腿（test-desktop-xpra-window §6/§7）仍然用整数缩放。

**Lane D verify 修复（2026-09-25，对抗验证者唯一一条高于 low 的发现，先复现红）。** 每个应用的 map 从一个错过了广播的页面被**整张**带走：`src/lib/desktop-app-prefs.js` 每页只读一次 user state、此后再也不读，而保存时 PATCH 的是**整张** map（`{desktopAppScale: <本页的副本>}`），路由只按顶层键合并。在真服务器上用两个无头 Chrome 页面实测（两边都开着启动对话框）：B 的 socket 断开（合盖 / 网络抖动——WsManager 会自己重连），A 存了 xterm 2× ⇒ `{"xterm":2}`；B 重连后它的 xterm 卡片仍显示 "Auto"；B 存了计算器 1.5× ⇒ `{"gnome-calculator":1.5}`——A 的选择悄无声息地没了；B 在断线期间保存也一样；"显示窗口边框 ▸" 的 map 走的是同一个 loader。修复：loader 在**每一次**重连时重读（`ws.onStateChange`，desktop-app-window.js 对它的记录早就遵守这条规则），一次保存是对**一个**应用条目的**编辑**——`saveAppPrefs(key, (map) => setScaleChoice(map, appKey, choice))`——先在本地显示，再应用到服务器**此刻**持有的 map（一次新的 GET）上，只 PATCH 那一个键；同一页面的保存逐个执行；被拒的保存把视图回滚到服务器的 map（low 发现"先本地应用、从不回滚"随之修复）并用 toast 说明原因。修后同一配方实测：B 重连后卡片显示 "2×"，服务器保留 `{"xterm":2,"gnome-calculator":1.5}`；B 断线期间保存保留 `{"xterm":3,"gnome-calculator":2}`。残余（点名）：两个页面在同一个 GET→PATCH 窗口（几十毫秒）内编辑**同一张** map 时仍是后写者赢，与 user state 上同键竞争的现状一致。门：test-desktop-app-scale §8（两个页面挂在一个假服务器上，合并方式与路由完全相同、只向已连接的 socket 广播，两张 map 都测；三个 patched-copy 对照：去掉重连重读、旧的整张本地 map PATCH、保留被拒的编辑）+ §7 普查（每个 `saveAppPrefs` 调用传的都是编辑）+ heavy test-desktop-xpra-window §14 (1b)（同一配方在两个真页面上）。同一套件的 §12 (8) 在本地优先的视图一翻转就**只读一次** user state（显示窗口边框 ▸ 开，再回 Auto）——判官在和写入赛跑，保存多出的那次 GET 让它每次都输（首轮 heavy 两次尝试都红：`us` 为 null、随后键仍在）；两处读取现在都等（≤ 4 秒）服务器的副本，断言不变。

**Lane D verify lows（未修，2026-09-25）**——按验证者原意记录：
- **负载下快速层 test-exit-forensics 变红**：真 xpra / 计算器 / Chrome 测试腿与快速层并行时，`pty/SIGHUP` 基线收到 0 个信号；单跑 285/285。本 lane 的文件都不涉及（`data/bin/pty-wrapper.js`、`chat-wrapper.js`、`src/exit-facts.js`、该套件：无 diff）。集成者在 push 前于安静的机器上跑一次快速层；该套件的基线腿也许值得一个耐负载的等待（本 lane 之外）。
- **两个 "Auto" 含义不同**：窗口缩放 ▸ 的 "Auto (n×)" 按屏幕重新推导，既不看 设置 → Desktop app scale 也不看应用默认；卡片上的 "Auto" 意为"跟随设置"。`desktop.appScale` 为 2、应用默认 1.5× 时，在 DPR 1 的页面上窗口的 Auto 会以 1× · auto 重启。属于 owner 决策（§3.4 补记）：至少把窗口那一行按它做的事命名（"Auto — 本屏幕 (n×)"），和 / 或把 "设置 (2×)" / "应用默认 (1.5×)" 各自作为一行提供。
- **页面前 3 秒内的启动可能悄悄丢掉应用默认**：启动器最多等 3 秒第一次 user-state 读取，之后不带 `scaleChoice` 启动（记录以实例默认运行，"1× · auto"），一言不发。碰到时再修：等读取完成（卡片已有启动中状态），或 toast 说明读不到应用默认。
- **每个应用的 map 从不修剪**：registry 已不再列出的应用（删掉的行、只输过一次的命令）的键永远留在 `desktopAppScale` / `desktopAppFrame` 里；只有用户选 Auto 才会删除。增长以一个人选过的不同应用数为上限。可在对话框渲染时修剪，或继续把这个形状记为有意不修剪（frame map 也是如此）。
- （验证者的第五条 low——"先本地应用、服务器拒绝时从不回滚"——不在此列：上面那条修复已把它回滚。）

### 3.5 远程主机：在应用所在的机器上跑同一份代码

**分层（照 CS 分离法 + browser-serve 先例）**：

| 层 | 模块 | 内容 |
|---|---|---|
| SHARED | `src/desktop-serve.js`（新） | op 表 `DESKTOP_SERVE_OPS = ['facts','launch','stop','status','list','windows','fit','keep-alive','relaunch']` + `install({env, dataDir, homeDir, log})` + `runDesktopServeOp(ds, op, params)`——从 keeper 抽出**在机器上做的一半**：起 X/xpra/应用（今天的 `bringUp`）、部件身份（pid+starttime、标记普查）、teardown、贴合皮带、窗口枚举、本机记录文件（`<dataDir>/desktop-apps.json`，设备上是 `~/.vibespace/desktop-apps.json`）。每个 op 回 `{ok, code, error}`，绝不跨线抛 |
| ORCH（hub） | `src/server/desktop-app-keeper.js`（瘦身） | 注册表 + 策略：hub 记录（`data/desktop-apps.json` + `hostId`）、容量、idle 策略、runaway 阈值（采样值由设备 `status` 回）、x5 选举、广播、开机对每台机器 `list` 收养 |
| ORCH（hub） | `src/server/desktop-access.js`（新，browser-access 逐字形状） | `call(hostId, op, params)`：本地 ⇒ 进程内 runner；配对设备 ⇒ `dm.desktopServe(op, params)`；无 daemon 的 ssh 主机 ⇒ `host_needs_daemon`（按名拒绝，永不静默本地回退——**实际落地：ssh 主机会被装上 daemon 并得到服务；`host_needs_daemon` = agent 早于该 op；见偏差 ⑦**）；`forwardPort(hostId, port)` = `forwardCdp` 逐字（hub 回环监听 → `dm.tcpForward`，引用计数，按连接解析设备） |
| daemon | `src/agentd/agentd.js` + `client.js` | `desktop-serve` op：handler `require('./../desktop-serve.js')`（打包），回 `mux.control({op:'desktop-serve-result', id, result})`；client.js `desktopServe(op, params)` 能力门 `capabilities.includes('desktop-serve')`（老 daemon 永不被问——未知 op 会挂）；`'desktop-serve-result'` 进 client.js:253 的 id 键路由集（三触规则第 1 触；无主动推送——第 2 触不适用；无 watch——第 3 触不适用） |
| 桥 | `src/server/desktop-stream.js` | 唯一改动：上游端点由 `streamEndpointFor(rec)` 决定——本地 `127.0.0.1:<port>`，远程 `127.0.0.1:<forwardPort>`；xpra ws 与 rfb tcp 都一样；x5 座位、背压、心跳、命名关闭、剪贴板/输入策略**零改动**（协议端到端） |
| 路由/UI | routes + launcher + window | `host` 参数不再拒绝：启动对话框加机器选择（本机 + 有 `desktop-serve` 能力的配对设备；ssh-only 主机灰显 "需要 agent"），每台机器的目录按**它的** facts 灰显（绝不隐藏）；窗口标题带主机标签（display 字符串，绝不进 spawn） |

**远程剪贴板/输入**：xpra 的 `clipboard-token`、`key-action`、`configure-window` 都在同一条 ws 上，经 hub 回环转发到设备回环，再进 xpra——中间没有任何解析；§3.1 的手势窗在浏览器端，与机器无关。延迟：+设备链路 RTT（CDP 转发的先例；§7.1：200 ms RTT 下击键 265 ms）。

**自动 seamless setup**：
- **能检测**：`facts` op（`binOnPath` xpra/Xvfb/xauth/xdotool/xwininfo/xdpyinfo + `xpra --version` + 注册表行的 exec 在不在 PATH）——对话框逐机器显示阶梯判定与理由（今天的芯片文字）。
- **可以装，但绝不静默**：① 机队 pod ⇒ 只走镜像（Dockerfile:23–38 已有 xpra + xterm + xdotool + wmctrl；D7 决定版本）；② 配对的 Linux 盒子 ⇒ owner 点 "在 <机器> 上安装 xpra…"（rclone 一键安装的形状，mounts.js:310）：先 `facts` 得发行版与 codename，**先显示计划**（apt 源里 xpra ≥ 5 就 `apt install xpra xterm xdotool xauth`，否则加 xpra.org 的仓库 `https://xpra.org/<dist>/<codename>` + key，钉 6.x），需要 passwordless sudo（plugins.js:295 `_sudoAvailable` 的探测）——没有就按名拒绝并把命令原样给 owner 复制；执行经 `runCmd` 流日志到对话框；③ 本机 ⇒ 同②。
- **做不到**：macOS / Windows 设备——没有 X11 服务器，seamless 一级不存在（XQuartz+xpra 是手工安装，不驱动）；对话框里按名说 `no_x11`。无 daemon 的 ssh 主机——`host_needs_daemon`，一键 "在这台主机上装 agent" 是既有路径。

**记录迁移**：`data/desktop-apps.json` 每条加 `hostId: 'local'`（一次性迁移 `2026-09-desktop-apps-host-key`，src/server/migrations.js 经共享 runner，ledger 记一次，失败下次重试）；设备侧记录由设备自己的 op 写在 `~/.vibespace/desktop-apps.json`（daemon 的 DEVICE_MIGRATIONS 表以后管它的形状）；hub 记录 = 设备记录 + hub 独有字段（viewers、idle 策略、pane 事实）。开机：hub 对本机进程内 `list`，对每台在线设备 `list`，按 `hostId:id` 收养；离线设备的记录保留 `unknown-host-offline` 状态，设备回来再问。

**测试**：fast `test-desktop-serve`（op 表普查：hub 调用的每个 op 在 SHARED 表里、daemon handler 逐名覆盖、hello-ack 能力串；runner 对每个 op 的失败都是 `{ok:false, code}`）；**real-daemon** `test-desktop-remote`（test-sysinfo-op 的模板：从构建产物起一个 agentd 当假配对设备（scratch HOME）⇒ `facts` ⇒ `launch xterm` ⇒ `forwardPort` ⇒ 经桥真 hello ⇒ 按键进文件 ⇒ `stop`；**能力门**：改掉 capabilities 的 daemon 副本 ⇒ `host_needs_daemon` 在 1 s 内，绝不挂）；heavy = 现有 test-desktop-xpra-window 以 `host=<假设备>` 再跑一遍主要腿；test-migrations 加第 43 行。

**SHIPPED（lane C1，2026-09-25，2.369.178；D5–D8 由 owner 按建议值定案）。** 落地的：SHARED `src/desktop-serve.js`（keeper 在机器上做的一半**逐字**搬出——起 X/xpra/应用、部件身份、标记普查、teardown、贴合皮带、窗口枚举、资源**采样**、本机记录文件——加九个 op 的 `DESKTOP_SERVE_OPS` 与 `runDesktopServeOp`，每个 op 回 `{ok, code, error}`，绝不跨线抛）；`src/server/desktop-app-keeper.js` 瘦身为注册表 + 策略（x5 选举、idle 判定、资源**报告**（只报告不停止——2.369.171 定律）、relaunch 的座位携带、广播）；ORCH `src/server/desktop-access.js`（browser-access 逐字形状：`call(hostId, op, params)` 本地进程内 / 配对设备走 agentd op / ssh 主机（经 ssh 装上 daemon）同走 agentd op / 早于该 op 的 agent 按名拒绝 `host_needs_daemon`（偏差 ⑦）；`forwardPort` = `forwardCdp` 逐字，引用计数、按连接解析设备）；agentd `desktop-serve` op（三触规则第 1 触：`desktop-serve-result` 进 client.js 的 id 键路由集；hello-ack 能力串；每个 daemon **进程**一个机器 keeper，记录 `~/.vibespace/desktop-apps.json`，daemon 重启时若记录里有活会话就在开机收养）；迁移 `2026-09-desktop-apps-host-key`（每条 hub 记录 `hostId: 'local'`；新记录由 `M.newRecord` 带出）。门：test-desktop-serve（fast，新）、test-desktop-remote（heavy，新，真 daemon）、test-migrations 加行；test-desktop-app-keeper / test-desktop-xpra 等**断言零改动**全绿（本机行为逐字节不变的证明）。

**与本节设计的偏差（逐条点名）：** ① 容量（CONCURRENT_CAP）由**机器**按它自己的会话数判定（它是这台机器资源的上限），不是 hub 汇总所有主机——设计表把"容量"放在 hub。② 本机的策略以 **hooks** 交给进程内的机器 keeper（`view`/`onCommit`/`idle`/`readyTick`/`onSample`/`onTeardown`，每个都在旧 tick 原来调用那段代码的位置被调用），本机只有**一个** store（hub 记录 = 本机记录）；hub 注册表里的**远程**记录、hub 对远程样本的判定（设备只保留最新样本给 `status` op）、远程 idle——都属于 C2。③ 表里有 `relaunch` op（设备上一次完成：后继 + `replacedBy` + 停旧的）；C1 修复轮（2026-09-25）起，进程内的 hub keeper 调用**同一个**机器 relaunch，带 `onSuccessor` 钩子（座位携带夹在后继记录与停旧之间），relaunch 只有**一个**实现——并且带上了 2.369.176（浏览器 relaunch 把 profile **搬到**后继、延后启动），它在 lane 开着时落到 master，rebase 时移植进机器半；test-desktop-app-keeper §18 (c3) 及其 no-carry 对照对它跑；两个 relaunch 接线 pin（test-desktop-apps §13、test-desktop-viewers 的座位携带 pin，现覆盖两条臂）改为指名这个形状（仅有的改写断言）。④ 三个 heavy 套件的**测试夹具**改了（不是断言）：test-desktop-app-keeper 的 `mutant()` 把每个锚点打到持有它的那一半（两文件合计恰好一次命中），keeper 副本对 `../desktop-serve` 的 require 重绑到打过补丁的机器半副本；`stops-on-over` 锚点少一层缩进（报告现在在 `reportSample`）；test-desktop-apps 的 keeper pin 读两半；test-desktop-xpra-window 的三个 keeper 杠杆改名到 src/desktop-serve.js。⑤ test-desktop-xpra-window 以 `host=<假设备>` 重跑主要腿需要桥的端口解析——C2。⑥ **真机腿走的是 ssh stdio 传输**（配对的测试盒上一个 scratch HOME 下的常驻 daemon，由测试进程的 DeviceManager 拨入），**没有做**"经 `ssh -R` 配对到 scratch hub 的 dial 配对"——dial 配对与机器选择、安装 rung 一起属于 C2；op 路径与数据面（同一个 Mux）相同。⑦ **ssh 主机不是被拒绝，而是由 daemon 服务**（在真 HostManager 类上实测，test-desktop-serve §5）：`hosts.device()` 经 ssh 装上打包的 daemon 并经 ssh stdio 驱动它，所以 D5 的要点（由 daemon 看护应用，绝不用一次性 ssh xpra）按构造成立；装不上（那边没有 node、ssh 断）就是 `host_unavailable` 并点名原因，最迟在 8 s 连接期限后。真句柄上的 `host_needs_daemon` 来自客户端的能力门（agent 早于 desktop-serve，< 1 s，test-desktop-remote §6）；desktop-access 里"没有 `desktopServe` 方法"那一臂是给替身用的保险。先例 browser-access 行为相同，其 kb 条目已改为照实写。

**§8-7 实测（2026-09-25）。** 配对的测试盒（Ubuntu 24.04 noble，node 20；apt 候选 xpra 3.1.5 < 5 ⇒ 按 D6 走 xpra.org noble 仓库装 6.5.3 + xterm + xvfb，passwordless sudo 在）：ssh 连接 + hello 1738 ms，`facts` 191 ms，launch op 13 ms，launch → ready 2176 ms，经 hub 回环转发的 ws 打开 19 ms，xpra hello 535 ms（本机回环假设备上是 531 ms——这是 xpra 自己处理 hello 的时间，不是链路），首帧 126 ms，**xpra ping→ping_echo 经转发 7 ms（5 次都是 7 ms）**——这就是输入路径的往返；"abc" 三次按键落进设备上应用写的文件（≤ 599 ms 的上界，含测试端每次轮询一次 ssh 读文件）；`windows` 回应用自己的行，stop ⇒ exited，设备上没有进程再带会话标记。本机回环假设备（test-desktop-remote）：按键 → 文件 11 ms。结论与 §7.1 的估计一致：转发只加链路 RTT，字节不被解析。

**SHIPPED（lane C2，2026-09-25，2.369.178）。** 落地的：① 桥：`src/server/desktop-stream.js` 唯一改动 `streamEndpointFor(target)`——本机目标同步回 `127.0.0.1:<port>`（C2 之前的路径，逐字节不变），带 `hostId` 的目标回 hub 转发的回环端口（`forwardPort` = desktop-access.forwardPort，每个 socket 持一个引用、关闭时释放一次；没接转发 ⇒ 502 按名拒绝）；x5 座位、背压、心跳、命名关闭、剪贴板/输入策略零改动。② hub 注册表（`src/server/desktop-app-keeper.js`）：配对机器的记录由设备自持（D8），hub 把最后看到的存在 `data/desktop-apps-hosts.json`——**绝不**进 `data/desktop-apps.json`（本机机器 keeper 独占那个文件，远程记录进去会被按本机 pid 判死并收割）；launch / stop / keep-alive / fit / windows / relaunch 全部经 op（带上 hub 的设置）；launch 后每 400 ms 跟进到稳定；策略留在 hub：idle 判定用桥报告的输入（hub 侧 `lastInputAt`，持久化）、资源**报告**判设备自己的样本（每个样本只判一次，只报告不停止）、x5 座位。③ 路由/UI：`host` 不再拒绝（`hostParam`：'' / local ⇒ 与之前逐字相同的调用）；`GET /api/desktop/machines`（不起连接阶梯就画出每台机器的行：ready / connect / offline / host_needs_daemon / no_x11，灰显绝不隐藏）；启动对话框 "运行于" 行、每台机器自己的目录/阶梯/容量；窗口标题 "{app} — on {machine}" + 主机芯片（主机名是 display 字符串，绝不进 spawn）。④ 自动 seamless setup：`facts {install:true}` 回安装事实（发行版、`UBUNTU_CODENAME` 优先的 codename、apt 候选、`sudo -n`、已装 xpra）；PURE `xpraInstallPlan` 先给计划（apt ≥ 5 用本机源；否则 xpra.org 仓库 + key，钉 6.x，显式带上 xpra-x11 / xpra-html5——它们在 xpra.org 是 xpra-server 的 Recommends）；执行经 agent 已有的 `run-stream` op（`sudo -n sh -c <plan>`，stderr 合进来，日志以 NDJSON 流进对话框）；没有 passwordless sudo ⇒ `no_sudo` 按名拒绝并给出可复制的命令；macOS/Windows ⇒ `no_x11`。机队只走镜像：deploy/docker/Dockerfile 改装 xpra.org bookworm 6.x 并钉住（D7；本 lane 没有构建镜像）。⑤ 开机：本机先收养，然后**后台**对注册表记得的每台机器 + 每台已拨入的设备 `list`，按 host + id 收养；不应答的机器记录保留为 `unknown-host-offline`（只是视图状态，窗口不关），tick 每 30 s 再问一次；已不在本实例的机器（unsupported-host）记录删除。门：test-desktop-serve §6–§10（fast）、test-desktop-remote §7（真 daemon：hub keeper + 真桥 + 真 xpra hello + 按键进文件 + 离线 404）、test-desktop-xpra-window §13（真 chrome：把 scratch daemon 当人那样配对到 worktree 服务器上——machine picker、设备的阶梯、在设备上启动、经 hub 转发的窗口、铺满、标题带机器名、按键落进设备上的文件、Stop 关窗）。

**与本节设计的偏差（C2，逐条点名）：** ⑧ xpra.org 仓库的形状用的是**实测**的 deb822（`URIs: https://xpra.org` + `Suites: <codename>`，即本机 /etc/apt/sources.list.d/xpra.sources 的样子），不是设计写的 `https://xpra.org/<dist>/<codename>`。⑨ 安装不走新的 desktop-serve op（op 表仍是九个）：`facts` 加一个 `install` 参数，执行走 agent 早就有的 `run-stream`——本机是进程内子进程，两条传输同一个 argv。⑩ ssh-only 主机不灰显为 "需要 agent"：C1 偏差 ⑦ 已证明 ssh 主机会被装上 daemon 并由它服务，所以选择器把没连上的 ssh 机器显示为 "选中时连接"（`connect`），真正灰显的是 agent 早于该 op 的（`host_needs_daemon`）、离线的拨入设备、macOS/Windows。⑪ 容量仍由机器自己按自己的会话数判（C1 偏差 ①）；hub 的 `liveRecords()` 只数本机（浏览器 keeper 的唯一上限与 window-targets 引擎都是本机的世界）。⑫ 远程应用**不是** agent 的窗口目标（engine 拿到的是 `keeper.local`：xdotool / AT-SPI 在本机执行）。⑬ hub 没装 xpra 时，托管的 html5 客户端从**设备**经 agent 读文件（`fsReadRange`，一组封闭的文件类型）。⑭ 匿名 socket（不带 `?viewer=`）仍是只读的 watch 座位——真机腿的测试客户端必须给自己命名才能打字（x5 的既有规则，不是缺陷）。

**§8-7 实测 · C2（2026-09-25，配对测试盒，dial 配对到 scratch hub）。** scratch hub = 本机上 lane 的 worktree 服务器（只绑回环、scratch HOME 与 data/）；设备 = lane 构建的 agentd bundle，放在盒子上的 scratch HOME/root 下，像人那样配对（`POST /api/device/dial-pair`，daemon 经 `ssh -R <rport>:127.0.0.1:<hubPort>` 拨 `/api/device-dial`）。配对 + 拨入 0.8 s；安装计划 0.36 s（noble，apt 候选 6.5.3-r0-1——C1 已装的 xpra.org 源——xpra 6.5.3 已在，`sudo -n` 在 ⇒ 计划 `source: apt, already`，只装 xterm/xdotool/xauth/xvfb）；安装 rung 经 `sudo -n` 真跑，27 行日志流进来，3.2 s；设备的阶梯 = xpra 6.5.3；launch op 14 ms，launch → ready 1.84 s；经 hub 桥 + 转发的 ws 打开 4 ms，xpra hello 552–622 ms，首帧 62–98 ms；**xpra ping→ping_echo 全路径 7–8 ms，链路本身 TCP 往返 6.4–8.9 ms**；**一次按键到应用回显字符的那一帧 11–18 ms**；"abcde" 落进设备上的文件；`windows` 回应用自己的行；Stop ⇒ exited，设备上没有进程带会话标记；清理：scratch daemon 停止、scratch 目录删除、hub 进程按证据收掉（xpra 留着）。**一个实测到的陷阱**：同样的路径若 `ssh -R` 隧道用 `-N`（没有 pty），ping 往返是 53–56 ms——多出的约 47 ms 是 Nagle + 延迟 ACK：OpenSSH 只在交互会话（有 pty）时给连接设 TCP_NODELAY；给 daemon 的 ws 客户端（ws-min）加 `setNoDelay` 在这个拓扑下没有任何变化（实测），换成 `-tt` + 远端命令的隧道就回到 7–8 ms。这是测试夹具的隧道，不是产品路径；产品里经 `ssh -R` 的只有远程 agent 调 hub API（不在本 lane 范围，未量）。直接经公网拨入时 ws-min 自己的 socket 没有 `setNoDelay`——是否因此多出延迟**未实测**。

**C2 验证修复（2026-09-25，五条，每条先复现）。** ① 配对机器上的单次点击操作（relaunch / stop / keep-alive / windows）若在请求**进行中**链路断开，要等满 desktop-serve 自己的 60 s 超时才回 503（真 daemon 在 relaunch 发出 103 ms 后被杀：实测 60 004 ms，而设备约 110 ms 就重新拨入）——agent 客户端现在在链路断开的一刻让所有在途请求失败（`mux.onDead` 拒绝 `conn.pending`，code `link_lost`）：毫秒级回 503 `host_unavailable`。② 查看者在转发建立期间半关闭会泄漏一个转发引用（ws 对这种握手不回调）——引用现在也挂在 socket 自己的 close 上。③ + ④ 安装梯级：远端运行超过 2 分钟被报成 "exited 1"（run-stream 固定 120 s 的兜底）而 apt 还在跑，且按机器的锁被释放——再点一次就会在旁边起第二个 apt。兜底现在按操作设定（安装传 `installMs + holdMs`），超时按名字叫 `install_timeout`，链路断开叫 `install_link_lost`，子进程**绝不杀**——偏差 ⑮：finding 建议杀掉它；但它是 `sudo -n` 下以 root 运行的 apt/dpkg（本用户发不了信号；`sudo` 只把 SIGTERM 转给 shell，apt 照跑），dpkg 解包到一半被打断需要 `dpkg --configure -a` 修复，所以改为**等它结束**：该机器的安装槽（现在归 desktop-access 所有，不再是路由）一直占着，直到子进程确实结束（本机的 close / 设备的 stream-exit），最多 60 分钟；期间再装一次答 `busy`。⑤ `sudo -n true` 探测本身现在有门（scratch PATH 上的假 sudo，一个不探测的副本做控制组）。门：test-desktop-serve §6/§8/§9/§10，test-desktop-remote §8（真 daemon：op 挂起时 SIGSTOP，再 SIGKILL ⇒ 毫秒内应答；修复前的客户端副本要等满超时）。

**C2 验证 r2 修复（2026-09-25，五条，每条先复现出红）。** F1（严重）观看者的连接在配对机器转发建立期间被 RESET，会让整个 hub 退出：等待转发的 socket 没有 error 监听（node 的 http server 在 'upgrade' 时摘掉了自己的，ws 只在接手 socket 时才挂上），于是这次 reset 成了 `uncaughtException` ⇒ `process.exit(1)`（实测：0 个监听，未捕获的 ECONNRESET；原门禁的几条腿都是 FIN）。桥现在在等待之前先挂监听，升级时交给 ws 自己的；CDP mediator 有同样的形状（且客户端先走时上游连接一直开着）——一并修了。F2 hub 那一侧链路断掉时，run-stream 子进程被永远暂停（一个 4 MB 的输出者卡在 1000 行中的约 270 行，重连后仍卡住）：daemon 现在把每个失主的子进程的输出续写进 `~/.vibespace/run-stream/<pid>.log`（上限 8 MB），它会跑完。F3 + F4 安装阶梯——见偏离 ⑯ ⑰。F5 配对设备的套件靠能力列表的**最后一项**找能力；现在按内容找，test-architecture §56 保证所有套件都这样。门禁：test-desktop-serve §8 / §9 / §10、test-desktop-remote §0 / §6 / §8、test-browser-mediation ③b、test-architecture §56——每个修复都带 mutant-copy 对照。

**偏离（验证 r2，逐条点名）：** ⑯ xpra 安装不再是启动它的进程的**子进程**（本机是 hub 进程，设备上是 daemon 的 run-stream——hub 重启 / Update / OOM 或 daemon 自我重启都会关掉它的管道，安装的 shell 和 dpkg 在下一行输出时被 SIGPIPE 杀死：实测 rc 141）：它在机器上**脱离运行**——自己的会话（`setsid`），stdin 为 /dev/null，输出追加到机器 keeper 数据目录里的 `xpra-install.log`，旁边是 pidfile `xpra-install.pid`（"<pid> <starttime>"）和退出文件——hub 只**跟读**这份日志（`tail --pid`）。对话框里流式显示的日志就是这次跟读。⑰ "每台机器只有一个安装"由机器上的 **PIDFILE** 决定，而不是 hub 的内存：facts 操作在记录的 pid + starttime 仍存活时报告 `installing: {pid, since}`，所以重启过的 hub（或重建的访问层）被要求安装时会**重新接上**——"{machine} 上仍在安装 — 已重新接上"，日志从头显示——而不是在旁边再起一个 apt；停止跟读某次安装的 hub（install_timeout、install_link_lost）会保留它的槽位（`busy`），直到机器的 facts 说安装已经结束（最多 60 分钟；释放槽位的那行日志写明它看到了什么——绝不会只因为链路断了就说"已结束"）。⑱ F2 中失主的 run-stream 输出写进机器上的按 pid 命名的日志；验证者的另一个选项——新连接按 id 重新接上一个仍在运行的流——没有做（那会是一个带能力声明的新操作；唯一需要跟读的流，即安装，已经脱离运行并由 ⑰ 重新接上）。

**验证 r2 的低优先级问题（未修复，2026-09-25 记录）：** L1 hub 登记表：一个快照早于 launch/relaunch 应答的 status/list 应答，会把**新**记录剪掉一个 tick（用桩证明；在单条 FIFO 链路上到不了）——需要时的修法：按主机的请求纪元（`sentAt` 对比 `hub[id].ingestedAt`）。L2 一个迟到的操作应答会让已移除机器的行在 data/desktop-apps-hosts.json 里复活，直到下次启动——修法：`ingestOne` / `ingestHost` 拒绝 `hostKnown` 已不认识的主机。L3 实际**运行**的计划是按新 facts 重算的，而不是对话框展示的那个对象（只涉及完整性：codename 受 CODENAME_RE 约束，路由只认 cookie，设备文本不经 innerHTML）——修法：在 NDJSON 的 done 行里回显所执行 `plan.script` 的 sha256，由对话框比对。L4 两个 hub 驱动同一台机器：一个 hub 的空闲判定看不到另一个 hub 的输入（由代码推得）——修法：通过一个 note-input 操作把 `lastInputAt` 同步到设备。

**C2 验证 r3 修复（2026-09-25，四条 minor + 三条 low，每条先复现出红）。** M1 pid 回绕后，若新安装在启动器第一次轮询前就已结束，启动器会跟随**旧** pidfile 里的 pid（另一个仍存活的进程）——hub 于是为一个几毫秒就结束的安装等满 15 分钟期限（实测：启动器挂过 6 s，旁边的退出文件写着 0）；现在只读新的 pidfile，`tail --pid` 只跟随刚核对过 starttime 的 pid。M2 失主的 run-stream 子进程若在切断时处于暂停状态，而它的日志写不进去（出错的 Writable 永远不发 'drain'：/dev/full ⇒ 卡在 4000 行中的第 117 行），就永远暂停；现在暂停由 drain、error 或 close 任一解除，出错的日志变成纯排空。M3 agent 的客户端还停在上游握手上时，CDP 租约被撤销（或其浏览器重启），结果成了一条不在任何 grant 集合里的活连接——revoke、repoint、shutdown 都碰不到它；现在这次等待属于 grant，并在握手完成时重新核对（按名回 503）。M4 两个 hub 在 runner 写 pidfile 之前的 5–20 ms 内同时开始安装，会各起一个 runner（2 中 2，5 中 5）；现在槽位是原子占用的。低优先级：L5 没有 `setsid` 的机器立即按名拒绝（原来 10.5 s 且原因丢失）；L6 失主日志的 8 MiB 上限按**文件**计（pid 回绕后又追加 8 MiB：15,106,486 字节）；L8 读不出 /proc 时启动器与 runner 都拒绝（绝不写一个谁也核对不了的 "<pid> " pidfile）；**L7（有客户端停在握手上时 shutdown ⇒ 已置空的 wss 上一个未捕获的 TypeError）由 M3 的核对覆盖**（`closed` ⇒ 503，且 shutdown 会终止停着的上游）。

**偏离（验证 r3，逐条点名）：** ⑲ 机器的安装槽位是 pidfile 旁边的**锁目录** `xpra-install.lock`（r2 的 ⑰ 读的是 pidfile，而它由 RUNNER 在启动器检查之后才写）：启动器在派生之前用 `mkdir` 占用，`owner` 文件为 "<pid> <starttime>"（先是启动器的，再是 runner 的），runner 在写完退出文件后删除；owner **被证明**已不存在的锁（/proc 里没有该条目，或读得到的 starttime 不同——探测结果为空什么也证明不了）由下一个占用者打破（每个死去的 owner 只打破一次，在按其命名的 `mkdir` 互斥下），没有 owner 的锁等 2 s 后打破；占用失败的 `start` **跟随**胜出者的安装并回报其记录的退出码。⑳ 失主 run-stream 写不进去的日志是纯排空——输出被丢弃，子进程绝不因它暂停——且 8 MiB 上限计入文件已有的字节（同一 pid 的前一个进程留下的满文件只再加标记行）。㉑ grant 变动时停在握手上的 CDP 客户端被**拒绝**（503：Lease Gone / Browser Restarting / Browser Stopped / Server Shutting Down），而不是重新拨到新上游——客户端重试时同一个 url 会到达当前的浏览器。

**C2 验证 r4 修复（2026-09-25，一条 major，先复现红）。** 两个并发的 `start` 仍可能跑出两个 xpra 安装：⑲ 的打破规则会删掉一把只是因为另一个占用者正处在 `mkdir` 与 owner 改名之间而暂时没有 owner 的锁（在 r3 启动器上实测：空目录 150 次启动中 1–4 次；把那次改名放慢 30 / 50 ms 时，20 轮中 12 / 17 轮出现多个 runner）。现在槽位的锁由内核持有——偏离 ㉒。门禁：test-desktop-serve §10（五个并发启动 40 轮自然速度 + 20 轮放宽窗口 ⇒ 每轮一个 runner；被杀的安装其锁立即释放；被杀的启动器其 runner 仍持锁；对照 `flock -n 9` → `true` ⇒ 5 个 runner），test-desktop-remote §8。

**偏离（验证 r4，点名）：** ㉒ 安装的互斥改为对一个**由正在运行的安装本身持有**的锁**文件**做 `flock`，取代 ⑲ 的锁目录、owner 文件与打破规则：启动器以 fd 9 打开 `<T>/vibespace-xpra-install-<状态目录 realpath 的 sha1 前 12 位十六进制>.lock`（`T` = `/run/user/<uid>`，若它是本用户拥有的可写目录，否则 `/tmp/vibespace-<uid>`（以 0700 创建）——自验证 r5 起按 uid 命名，绝不看环境变量），在派生之前取 `flock -n`；脱离的 runner shell 与 apt-get 继承这个描述符（apt-get 会为它派生的子进程关掉继承来的描述符——APT::Keep-Fds——所以 dpkg 从不持有它；比两者都活得久的 dpkg 由 dpkg 自己的锁把守），启动器关掉自己那份，于是锁的寿命恰好等于安装的寿命，最后一个持有者退出或被杀的那一刻由内核释放：没有任何手动打破，没有过期，没有 owner 身份。它**故意**放在本地存储上——状态目录（设备的 ~/.vibespace、hub 的 data/）可能在 NFS 或 FUSE 挂载上，那里的 flock 是模拟的或不存在；/tmp 与 runtime 目录是本地的，重启即清空，正是槽位的寿命（机器的寿命）。发现锁被占的 `start` 跟随正在运行的安装（仍按 pidfile）；根本拿不到锁时按名拒绝（退出码 125），绝不退回到会竞争的旧方案。util-linux 的 `flock` 与 `setsid` 一起成为前提（最先检查，125 并点名 util-linux）。pidfile 与退出文件记录锁的路径，facts 操作的 `installState` 报告它（`installing.lock`、`lastInstall.lock`）。

**C2 验证 r5 修复（2026-09-25，四条 low——本 lane 的最后一轮，每条带 pin 与对照）。** L1 与上一次安装的退出落在**同一秒**里的 `start`，在那次安装留下的子进程仍持有锁时，会回答那个过期的退出码而不是去跑（验证者：6/6）——退出文件的时刻现在是纳秒，`start` 只在它**严格晚于**自己开始时才把它当作答案（对照：整秒 `-ge` 的启动器回答过期的 100）。L2（措辞）锁由 runner shell 与 apt-get 持有，从不是 dpkg（见上面 ㉒）。L3 锁目录原来取 `$XDG_RUNTIME_DIR` 或 `/tmp`——环境不同的两个启动方会为同一个状态目录起出两把锁，而 `/tmp` 的名字可预测；现在是 `/run/user/<uid>`，否则 `/tmp/vibespace-<uid>`（0700），不是本用户拥有的目录时按名拒绝（对照：r4 那一行在三种环境下为同一个状态目录起出两把锁）。L4 没拿到锁（fd 9）就被启动的 runner，要等启动器 10 s 的 pidfile 等待走完才被报告；这段等待现在以 runner 自己的寿命为界（约 0.2 s 回 125 并点名那把锁；对照：3 s 时仍在等）。门：test-desktop-serve §10、test-desktop-remote §8。


### 3.6 lane E（2026-09-25）：窗口是**共享**给 agent 的，而不是默认可见 —— 可达性、无障碍树 / 像素模式、控制请求

**owner 原话（2026-09-25）：** "浏览器窗口不是也应该能给agent操作吗？为啥你说不让？另外可能默认不要让agent能看到所有窗口，而是创建前和创建后能选择把窗口暴露给哪些agent或者group，或者直接从一个窗口能发起让某个特定agent控制的request。话说我们的设计下多个窗口是可以同时被多个agent操作的吧？" —— 19:05 补充："我理解任何窗口发送给agent的时候应该都要有个选项可以切换无障碍还是像素模式。像素模式是最接近用户本人操作的方案作为兜底。"

**决定（默认值已告知 owner，按此构建）：**
- **D1 默认隐藏。** 桌面应用窗口对所有 agent 不可见；`vibespace-window list` 只列用户共享过的；对未共享窗口的每个动词都按名拒绝 `not_exposed`。唯一例外：agent 自己 `vibespace-window open` 打开的窗口只共享给它自己的会话。
- **D2 共享给谁、何时共享。** 共享对象是活的 agent **会话**（按持久的对话键 —— `<backend>:<对话 id>`，尚无对话时 `webui:<id>`，与 server.js `sessionStatusKey` 同一拼法，重启 / resume 同一对话后依然有效）或整个**任务组**（组内每个会话，现在或以后加入的 —— 每个动词执行时才查询成员关系）。在**启动前**选（桌面应用对话框的「共享给 agent」一行，按应用记在用户状态 `desktopAppReach`，键与 desktopAppFrame 相同）或**启动后**选（窗口的 ⋯ 以及标题栏 / 任务栏菜单 →「共享给 agent…」）。随时可撤销；agent 占用窗口时撤销会立即结束它的租约 —— 它的下一个动词得到 `not_exposed`。
- **D3 控制请求。** 在窗口上「请 <agent> 接管」—— VibeSpace 给该 agent 发一条指明窗口的消息（标签、句柄、模式、操作方式、用户可选的一句话作为备注）。默认**免费**：走投递梯的 stash，即 agent 的下一个回合。「立即唤醒」（默认关）= 经投递梯受门控的 `deliverToConversation`、声明的花费理由 `window-share-request` 开启的计费回合（被无人值守回合预算拒绝时 fail closed，或没有活的通道时，退回到下一回合并说明原因；每个对话 30 秒内最多唤醒一次）。请求会先把窗口**授予**该 agent。**开放点的实现：** 当**另一个** agent 占用窗口时，对话框会说明并提供「结束 <name> 对这个窗口的占用」（默认勾选）—— 用户的意图是「让这个 agent 来控制」。
- **D4 浏览器也是窗口。** 用户从桌面应用启动的 Chrome / Firefox 一经共享即与普通应用一样可操作（标记为「[the user's browser]」；agent 自己的网页工作仍用 `vibespace-browser`）；agent `open` 浏览器行（以及 `url` / `keepProfile`）仍是 `browser_is_human`。浏览器行启动时**总是**带无障碍开关（chromium `--force-renderer-accessibility`；firefox 在环境里设 `GNOME_ACCESSIBILITY=1`）—— 因为启动后才共享也需要它，而运行时再打开无障碍会翻转用户整个会话的 org.a11y.Status。
- **D5** 真实桌面的同意开关（`window.realDesktopTargets`，tier 3）不变且正交 —— 那一类窗口从不读取共享。
- **D6** 每个窗口一个持有者；不同 agent 可以同时持有任意多个窗口（每个应用有自己的显示，一个上的注入永远到不了另一个）。写进手册并钉住。
- **D7 模式。** 每次共享都带 `auto`（默认）| `tree` | `pixels`，在选择器里选、随时可切换（切换在持有者的下一个动词生效，审计 `mode-changed`）；窗口上的芯片会写明（「已共享给 2 个 · 像素」）。`pixels` = 最接近用户亲手操作：`screenshot`（窗口自己的图像 + 尺寸 + 原点 + 缩放）和 `click --at`（**这张图像**里的一个像素）、`type`（按键）、`key`、`scroll`（新增）；树动词（`snapshot`、`click @ref`、`type @ref`）按 owner 的原句拒绝 `mode_pixels`。`tree` = 全部可用（像素动词是 agent 自己的兜底）。`auto` 在 attach 时解析（一次探测；刚启动的应用最多重试 3 秒），并在每次 snapshot 时重新解析：有可操作节点时为 tree，否则为 pixels，`list` / `attach` 会说明结果和原因（"no accessibility tree — pixel mode"）。

**模型。** 纯函数模块 src/window-reach.js（每个窗口一条可达记录 `{windowId, mode, rows:[{principal, grantedAt, by: user|request|self-open}]}`，每个主体一行，撤销只删自己那一行，只放宽，`reachFor` = 取最大并指明起决定作用的那一行；模式表 `verbGate`；像素计划 / 可见性 / 坐标映射；请求文本；选择器；启动记忆）。window-targets 引擎持有存储（data/window-reach.json，原子写 0600，缩放 ▸ 重启后转给继任窗口，窗口结束时清理；广播 `window-reach-updated`）、每个动词上的可达门、模式解析和像素路径。用户路由（cookie 认证，仅限人 —— agent 令牌得到 `agent_forbidden`）：`GET/POST/DELETE /api/desktop/apps/:id/reach`、`PUT …/reach/mode`、`POST …/reach/request`，以及启动请求里的 `share`。配对机器上的窗口不是 agent 目标（`share_local_only`）。

**实测（lane E 读者 + 构建者，2026-09-25，xpra 6.5.3、at-spi 2.60.4、Chrome 153、GTK4 的 GNOME 计算器、私有会话总线）：**
- **Chrome 带 `--force-renderer-accessibility`：** 在默认 600 节点预算内快照就能到达**页面** —— 235–237 个节点，约 50 ms；记录就绪后约 0.9 秒页面出现（attach 的 auto 探测 825 ms 解析为 `tree`）；按钮「Press me」= 角色 `button`，动作 `[press, showContextMenu]`，`click @ref` 后页面显示「pressed 1」，**无需查看者**；页面输入框 = 角色 `entry`、状态 `editable` 但**没有 EditableText**（census `editableText 0`）⇒ 先经无障碍树聚焦（`Component.grab_focus`）再以按键输入 ⇒「typed xyz」（需要查看者）；`scroll down --by 5` ⇒ 滚动约 600 px（每格 120 px）。**不带该标志（对照组）：** 4 个节点 —— application + 3 个 frame，子节点不可读 —— 30 秒内没有页面；auto 解析为 pixels "its accessibility tree is closed"。
- **GNOME 计算器（GTK4）：** 约 0.5 秒 107 个节点，每个按钮都有 `click`；`click @ref` 无需查看者。GTK4 把每个节点的 SCREEN 坐标都报成 0,0（WINDOW 相对坐标是对的：「7」在 24,428 64×44 逻辑像素）—— 树坐标永远不是点击坐标。
- **xterm：** 根本不在无障碍总线上 ⇒ auto 解析为 pixels "no accessibility tree"。
- **没有客户端时的 xpra 一级：** 主窗口 `IsUnviewable` —— 根窗口截图和窗口截图都是黑的，`click --at` 返回成功但什么都没发生，`key` 丢失，AT-SPI `grab_focus` 返回 True 却无效。挂上客户端后，应用**自己的** X 窗口有真实像素（其 alpha 字节为 0 —— 已强制不透明），而**根窗口**截图（lane E 之前的截图方式）仍是黑的（xpra 在屏外合成）。第一个客户端会把根窗口从 4096×2304 改成它自己的 1920×1200（2264 像素高的 Chrome 窗口于是超出下边 ⇒ 按名拒绝 `outside_window`）。无头替身查看者约 171 MB PSS（Xvfb 56 + 客户端 115）。
- **坐标：** `click --at` 是窗口自己图像里的像素（按应用缩放的设备像素）：缩放 2 的计算器 ——「7」在 (86,876) / (112,900)，缩放 1 时 (43,438)；计算器主窗口在 (0,0)，Chrome 在 (20,20) —— 原点在动作时读取，从不假定。
- **顺手修掉的缺陷：** `xdotool mousemove --sync` 移到指针当前位置会挂 7 秒（同一点第二次点击 / 按键失败 `inject_failed`）—— 现在不再同步；`--button` 4..7 被强制成**左键**点击 —— 现在按名拒绝，滚轮用 `scroll`；指针在 xterm 窗口外时输入的按键会丢 —— 现在按键 / 输入前指针先停在主窗口内。
- **D6：** 两个 agent 同时操作两个窗口（计算器上的树点击 + 向 xterm 输入）—— 都生效；跨窗口操作 ⇒ `not_attached`。

**门禁：** test-window-reach（fast —— 30 格可达表、72 格模式表、按实测几何的像素计划、三个补丁副本对照）、test-window-targets §4–§5（fast —— 默认隐藏、浏览器用例在共享前为 `not_exposed`、存根投递梯上的请求、人类路由、STATUS 普查）、test-window-target §4（heavy —— 私有会话总线下真实 xpra 一级：计算器、xterm、Chrome 的全部 D1–D7 用例，真实投递梯 + 真实花费守卫在 owner 上限 0 时拒绝唤醒）、test-desktop-app-window §E（heavy —— chrome UI）。

**诚实的限制：** Firefox 的 `GNOME_ACCESSIBILITY=1` 未实测（本机 firefox 是 snap，无法在临时目录打开配置文件）；Chromium 渲染器无障碍在重页面上的 CPU 开销未实测；模式解析结果只在内存中（重启后重新探测）；配对机器上的窗口不能共享（lane C 的引擎只操作本机窗口）。

**lane E 核验（2026-09-25）—— 对抗式核验者高于 low 的两条发现，已修复（每条都先复现为红）：**
- **MAJOR —— 启动器那一行说的和点击做的正相反。** 未动过时，「共享给 agent」一行写着「对 agent 隐藏（每个应用会记住上次的选择）」，而启动却套用了这个应用**记住的**共享（lane 自己的重型套件恰好钉住了这一点）。D2 说下一次启动要**提议**同样的共享 —— 提议是动作之前就能看到的东西。现在这行字由点击所用的同一条规则推导（纯函数 `launchSummary` 基于 `launchShare`）：未动过时，只要有任何应用记住了共享，这一行就写「每个应用按你上次的共享设置启动」；应用记住了共享的目录卡片上带一个标签（「已共享给 Ops · 像素」）；套用了记住的共享的启动会弹出提示，说明在哪里修改。门禁：test-window-reach §7b（50 格表 + 未动过时总说"隐藏"的对照副本）、test-desktop-app-window §E（第二次启动前的标签和行文字、启动后的提示）。
- **MINOR（可达性泄漏）—— 撤销挡不住已经在执行中的动词。** 可达性只在动词的各个 await 之前检查一次（最长 3 秒的 `auto` 探测、helper 的快照、输入后端探测、窗口计划、截图）；落在这期间的撤销仍然会注入（`click --at`、`click @ref`）、交出树（`snapshot`）或在租约已没的情况下回答"已 attach"（`attachWithMode`）—— 用 400 ms 的假 helper、撤销落在第 100 ms 复现。现在 `stillHeld` 在每一个动作和每一次交付之前**紧接着**重新判定整件事（窗口还在、开关还开着、可达、租约还是自己的、没被接管）；一个动词要么排在撤回之前、要么排在之后，绝不横跨。同一次重检也覆盖动词执行中离开任务组、被接管、真实桌面开关被关掉。门禁：test-window-targets §5（七条竞态用例 + 去掉重检的引擎补丁副本对照）。事故文：docs/kb-bugfix-invariants.md。

**lane E 核验 low 级（未修复，2026-09-25）** —— 记录下来留给后续一轮，各附核验者提出的修法：
1. **像素原点跟着**最大**的窗口走。** `pixelPlan` 按面积选主窗口，所以比主窗口**更大**的弹窗 / 对话框会在截图和点击之间移动坐标原点（偏 100 px 的点击且不拒绝）。在 Chrome 153 上实测其弹窗（320×274）一直比主窗口（2033×2284）小，所以需要一个超大的对话框才会触发。修法：按句柄记住主窗口 id，只要它仍然映射就沿用（消失了才重选），原点自上次截图后变了就带说明拒绝 `outside_window`。
2. **30 秒唤醒节流只在内存里。** 两次「立即唤醒」之间服务器重启，就允许在间隔内再计费唤醒一次（此时只有支出守卫按身份的每小时上限兜底）。修法：把上次唤醒时间记在可达记录上，或在 create() 时读支出日志里该对话最后一条 `window-share-request`。
3. **「结束 <agent> 对这个窗口的占用」结束的是**发送时**的持有者。** 对话框打开时记下了持有者；如果点发送前另一个 agent 拿走了租约，请求会结束**那个** agent 的占用。修法：发送 `endHoldOf` 指明对话框显示的持有者；只有它仍持有时才结束，否则回答 `holderChanged` 并说明。
4. **仅限人类的共享路由只靠 Authorization 头挡 agent。** 关闭密码认证时，一个省略自己令牌的本地调用者挡不住（与现有 reset-credit / inbox-reply 同一模式 —— 开启认证时 cookie 门会拒绝）。修法：在每个仅限人类的路由上加正向的人类见证（每页一个 nonce），reset-credit 和 inbox-reply 一并改。
5. **未复现：`key ctrl+t` 之后向 Chrome 地址栏输入 URL 没有跳转**，只在一次真实运行里见过（标签条显示新标签页；树里没有任一页面的标题；页面字段的 `type @ref` 用例通过）。怀疑：`focusedNode` 选中的不是地址栏。如果复现：ctrl+t 之后未给 ref 时优先选地址栏输入框，或在手册里教 `type @<地址栏 ref>`。
- **观察到的门禁偶发失败，不是核验者的发现（2026-09-25，留给下一次诊断）：** test-window-targets §5 在真实 GTK 夹具上的像素用例在 15:14–15:23 PDT 之间 11 次运行里失败 5 次，抛出 `windowShot needs a window plan`（未捕获，整个套件退出）—— 含本轮修复的 7 次里 4 次，未修复的 lane E 基线提交上 4 次里 1 次，所以早于本轮修复 —— 当时另一条 lane 的完整 heavy 层正以四条并行 lane 在本机运行；抛出时套件自己的显示对 `xwininfo -root -tree` 回答**没有任何窗口**（夹具没了，或该显示号被另一个 X 服务器占用）。之后 10 次运行 0 失败，其中 6 次是三个同时跑。原因未找到；再出现时先记录夹具和 Xvfb 的退出（退出码 + 信号）。

**lane E 核验第二轮（2026-09-25）—— 第二轮对抗式核验：无 major，两条 minor + 五条 low；修了四条（每条都先复现为红），三条记录在下面。**
- **M1（minor）—— 重新判定按**函数**钉住，而不是按**调用点**。** 四个只删掉一处的变异体 —— 滚动之前没有重新判定、键入键位的路径里没有、应用窗口截图回答之前没有、tier 3 截图回答之前没有 —— 都让 test-window-targets 的每个行为用例通过（核验者：244/0；这里在树的副本上复现）（产品在这四处都是对的；套件分辨不出来）。现在竞态用例是**确定性**的（用户的动作在某个具名 await 开始时触发），并由**逐调用点普查**从引擎源码里 grep 出每一个 `held()` / `heldOrUnlink(` / `stillHeld(` 调用，在补丁副本里把它单独换成不检查的租约，要求至少一个用例变红（14 处；click @ref 那一处标注 `// no-await-before` —— 按构造就是冗余的，其断言在代码里核对）。新增用例：滚动、像素模式的 type、向"按状态可编辑"字段的 type、窗口计划截图、tier 3 截图期间开关被关掉。
- **M2（minor）—— 启动器说出的是过时的共享。** 卡片标签和启动提示直接用每个应用的记忆里的名字（一个已结束的会话、一个已删除的任务组 —— 「已共享给 alpha, Ops (old name) · 自动」，而启动写下的行谁也匹配不上；记忆只在这一行被动过时才重写）。现在这些字读的是选择器的名单：「alpha（当前未运行）」「Ops（当前不在列表中）」（选择器自己的说法），改过名的任务组用它的当前标题；启动的审计行会数出无人匹配的行。门禁：test-window-reach §7b（名单用例 + 对照）、test-desktop-app-window §E（第三次启动前删掉记住的任务组）。
- **L4（low，已修 —— 失败即关闭的方向）—— 任务组存储**抛异常**时被读成"不是成员"。** 动词回答 `not_exposed`，租约被丢掉并审计为 "exposure revoked by the user"；故障期间撤销一个不相关的主体也会丢掉经由任务组持有的租约。现在是 `reach_unreadable`（新的封闭代码，503）：动词按名字被拒绝，租约**保留**，审计 by:store；`list` 会数出无法判定的窗口；`detach` 永远可用。
- **L5（low，已修）—— 接管不会取消已经在执行的动作。** `type`（每个字符 12 ms）在接管或撤销之后还会继续注入最长 20 秒，和用户的按键交错；`TYPE_MAX` 4000 在固定的 20 秒里根本打不完。现在每次注入都是**租约**可取消的子进程（接管 / 租约被丢时按它自己的句柄杀掉），动词回答 `window_paused` / `not_exposed` 并带 `did.partial`；`TYPE_MAX` = 1500，超时随文本长度增长。**顺带实测：** 在按下和松开一个键之间 SIGKILL，会让这个键**一直按着**，服务器还会自动重复它（1.5 秒 37 次，输入框里一串 "qqqq…"）—— 所以每次被杀的注入（取消或超时）都先经 XTEST **松开**它可能按着的键（没映射的 keysym 零成本跳过；松开一个没按下的键会被服务器丢弃）。事件文章：docs/kb-bugfix-invariants.md。

**lane E 核验第二轮 low 级（未修复，2026-09-25）** —— 记录下来留给后续一轮，各附核验者提出的修法：
- **L3 —— 未动过的「共享给 agent」弹出框显示**空的**选择器**，而这一行说的是每个应用按上次的共享启动（选择器从对话框自己的空白选择开始，而不是任何应用的记忆）。修法：在弹出框里加第一行说明 —— 未动过时每个应用保留自己记住的共享，在这里选择则会覆盖这次启动。
- **L6 —— 「高级」（exec）或「最近」启动会套用记住的共享，但点击之前没有标签**（标签只装饰目录卡片）。修法：同样装饰「最近」的各行，并在「高级」的运行按钮上注明该命令的键记住的共享。
- **L7 —— 很长的中文 / 日文任务组名会把卡片标签里的**模式**挤掉**（40 个字符的标题占满标签的两行；工具提示里仍有）。修法：把模式放在前面（「像素 · 已共享给 …」），或者只显示一个名字 + "+N"。
- **观察到的门禁偶发失败，不是核验者的发现（2026-09-25 17:2x PDT，第二轮修复的运行）：** test-desktop-app-window 的**最后一个**用例 —— 单例 Desktop 窗口的状态标签在 15 秒内稳定下来（在这个 worktree 服务器上是 "no VNC server installed"）—— 三次运行里有一次回答 `null`（第一次，紧接在 test-window-target 之后，机器负载约 3.5）；两次重跑全部通过。该用例及其代码都没被 lane E 改动；留给下一次诊断（先在超时那一刻抓下标签的文字）。

**lane E 核验第三轮（2026-09-26）—— 第三轮对抗式核验：一条 minor + 四条 low，全部修复（每条都先复现为红）；没有新增「未修复」项。**
- **F1（minor）—— 第二轮的取消挂在一个会被重新 attach 替换掉的租约**对象**上。** `injecting` 注册在 `act()` 开头 `requireLease` 返回的那个租约对象上；同一个会话在动词的探测期间 detach 再 attach（或者用户撤销、重新共享、agent 再 attach），租约表里就换成了一个**新**对象 —— 重新判定在新对象上通过，接管的取消去看新对象、什么也没找到，于是 type 穿过接管一直打完（403 ms 后回答 `ok`，什么都没被杀）。现在正在执行的动作按**窗口句柄**记录；接管或丢掉租约会取消这个窗口上的每一个动作。门禁：test-window-targets §5（两条重新 attach 用例；对照 = 第二轮按对象记录的写法）。事故文：docs/kb-bugfix-invariants.md。
- **F2（low）—— 被**超时**杀掉的注入，其 `partial` 到不了调用方。** 原语说了 `partial: true` + `released`，引擎抛出时却没带 `did`。现在每一个没做完的注入，其拒绝和审计行上都带 `did`（路由 502 + `did`，CLI 的 "STOPPED PART-WAY"）。门禁：§5 经真实原语强制超时的用例 + 路由 + CLI + 对照。
- **F3（low）—— 像素模式下输入非 ASCII 文本需要 UTF-8 locale，而显示环境并不保证有。** 在本机 Xvfb 上、没有 LANG 时实测：`type "ab中文é"` 先打出了 "ab"，随后 xdotool 以 "Invalid multi-byte sequence encountered" 失败，且不带 `partial`。现在含非 ASCII 字符的文本按 desktop-display.js 早已用于 xwininfo 的 UTF-8 规则运行（`LC_ALL=C.UTF-8`，否则用环境自己的 UTF-8 locale，均用 `locale charmap` 核实）；一个都加载不了时，在打任何字之前就以 `no_utf8_locale`（503）拒绝，并指出第一个这样的字符。xdotool 开始之后才放弃的 type 回答 `partial`，理由用它自己的报错（绝不是命令行 —— 那里有文本）。门禁：§2b 用假的 `locale` 回答，§3 在真实 Xvfb 上去掉 LANG + 无规则对照。
- **F4（low）—— `list` 晚一个 await 交出了已撤销窗口的那一行。** 现在它在最后一个 await 之后重新判定可达性（`stillListed`，逐调用点普查的第 15 处）。门禁：§5 一条竞态用例。
- **F5（low）—— 启动审计把存储读不出来的任务组算成 `unmatched`。** 一个组行在某次成员关系读取抛异常时谁也没找到，记为 `undecided`（纯函数 `reachedState` / `launchCounts`；共享视图把这一行标为 `undecided`）。门禁：test-window-reach §2c + 对照 (g)，test-window-targets §5 + 对照。

## 4. 精简集（建议就建这些）

| 建 | 内容 | 需要先定 |
|---|---|---|
| **A**（一条 lane，S+S+S–M，不等决定） | §3.1 手势窗 + 一次性提示；§3.2 应用退出 ⇒ 关窗、死记录不开窗、外层 ✕ ⇒ `close-window`（两次 = Stop）；§3.4 推导 `DPR × uiScale` + 每窗 Scale ▸ relaunch + `desktop.appScale` 的 auto = 推导 | 无（D1/D2/D4 都取建议值即可开工；owner 反对再改） |
| **B**（一条 lane，M） | §3.3 seamless：PURE 判定 + `initiate-moveresize` 接成外窗口拖/缩放 + 热区 + 暂停规则 + 每窗开关 + 全局 off | D3 |
| **C**（两条 lane，L） | §3.5 远程：desktop-serve 抽取 + desktop-access + daemon op + 桥端口解析 + 记录迁移 + 机器选择 + 安装 rung + 三个套件 | D5–D8 |
| 不建（本轮） | 产品内 TLS；Electron/Qt 小数缩放 knob（D9）；fork 型启动器的真实 pid 收养；GTK Broadway 一级 | — |

## 5. 只有 owner 能做的决定

| # | 决定 | 建议默认 |
|---|---|---|
| D1 | 明文 http 上用手势窗写剪贴板（用户自己那次 Ctrl+C/点击之后 5 s 内），窗外仍 chip；一次性 HTTPS 提示要不要、指向哪条路 | **是**；提示一次/设备、可关；文档三条路（Chrome flag / Tailscale serve / Caddy），不在产品里做 TLS |
| D2 | (a) 应用退出 ⇒ 窗口自动关 + toast；(b) 外层 ✕ ⇒ 先给应用 `close-window`，5 s 内再按 = Stop；(c) `failed` 留窗；(d) 点 Stop 也关窗 | 全部**是** |
| D3 | seamless 默认：检测 CSD 自动开；暂停条件 = agent 租约 / 标签组 / 手机；展开手势 = 顶边悬停 250 ms 或 Alt；每窗开关按应用 id 记；全局 `desktop.seamless` auto/off | 全部按建议 |
| D4 | 推导 = `DPR × uiScale`，整数按比例就近，余数只向上进 dpi；1.5× 保留为显式；每窗 Scale ▸ relaunch 带确认 | 按建议 | **2.369.176 补:** 浏览器应用的 Scale ▸ 也可用 — keeper 先停旧的、把 profile 目录搬到后继者名下、再以新缩放启动 (登录/标签页保留); X11 下 GDK_SCALE/Xft.dpi 启动时只读一次, 真·实时改缩放不存在.
| D5 | 远程范围：只做有 daemon 的配对设备；无 daemon 的 ssh 主机按名拒绝（不做单文件 rung） | **是** |
| D6 | 安装 rung：配对 Linux 盒子上 owner 点击、先看计划、需 passwordless sudo（apt ≥ 5 否则 xpra.org 仓库，钉 6.x）；机队只走镜像 | **是** |
| D7 | 机队镜像的 xpra：3.1.3（bookworm）协议未量，要么在 bookworm 容器里量 3.1，要么镜像改装 xpra.org 的 6.x bookworm 包，全机队一个协议版本 | **改镜像到 6.x**（省掉一次没人想做的测量；§9-1/§9-4 随之关闭） |
| D8 | 远程记录归属：设备自持 `~/.vibespace/desktop-apps.json` + hub 注册表（hub 死了应用还在，回来收养）vs hub 独持 | **设备自持 + hub 注册表** |
| D9 | Electron/Qt 的小数缩放 knob（注册表行 `scaleArg`） | **本轮不做** |

## 6. 需要 owner 的事

1. D1–D9 的答复（默认值即"同意"）。
2. HTTPS：选一条路（§3.1 三选一），或者说"就用 chip 兜底、不开 HTTPS"——lane A 不因此阻塞。
3. 远程：指定一台**配对了 daemon** 的 Linux 设备做 lane C 的真机腿（ssh-only 的主机不够——它需要先装 agent），以及它上面有没有 passwordless sudo（决定安装 rung 能不能在那台上量）。
4. 机队：批准镜像升到 xpra.org 6.x（D7），或者要求先量 3.1。
5. GTK4 在 xpra 下 header bar 有没有最小化/最大化按钮——本机可以量（一次 30 s 的脚本），只是本轮没量；要的话 lane B 顺手量并把映射钉进套件。

## 7. 建议的构建顺序

| 顺序 | lane | 内容 | 门 |
|---|---|---|---|
| 1 | A | §3.1 + §3.2 + §3.4（不依赖任何决定；每项各自的 fast 腿 + heavy test-desktop-xpra-window 的新腿） | test-xpra-client、test-desktop-apps §10、test-window-minsize、test-desktop-xpra-window |
| 2 | B | §3.3（D3 之后；与 A 合并后自己在合并树上跑 heavy——2.369.134 的教训） | test-desktop-seamless（新，fast）、test-xpra-client §2、test-desktop-xpra-window |
| 3 | C1 | desktop-serve 抽取 + desktop-access + daemon op + 记录迁移（D5/D8 之后；行为对本机**逐字节不变**——test-desktop-app-keeper / test-desktop-xpra 全绿是抽取的门） | test-desktop-serve（新）、test-migrations、test-architecture 的 SHARED 普查 |
| 4 | C2 | 桥端口解析 + 机器选择 + 安装 rung + 真 daemon 套件（D6/D7 之后） | test-desktop-remote（新，real-daemon）、test-desktop-xpra-window `host=` 腿 |

## 8. 未验证 / 诚实的限制

1. Firefox / Safari 的手势窗：Firefox 同为 5 s 瞬时激活（规范），Safari 可能要求同步——都未实测；退路是 chip，不会更糟。
2. Chrome 的 `unsafely-treat-insecure-origin-as-secure` flag 让 `navigator.clipboard` 出现——按文档行为，未实测。
3. ~~GTK4 在 xpra 下是否画 最小化/最大化 按钮~~——**2026-09-25 已实测（lane B）**：GTK 4.22 / GNOME 计算器 50 在 xpra 6.5.3 下画出 最小化、最大化 和 关闭；点击它们分别发 `window-metadata {maximized:true|false}` / `{iconic:true}`，映射为我们窗口的 最大化 / 还原 / 最小化（set 语义），我们的还原会回发 `{iconified:false}`（xpra 回 `{iconic:false}`，应用重新绘制）。钉在 test-desktop-xpra-window §12 (3)。
4. CSD 边角 resize 的 `initiate-moveresize` direction 0–7——**2026-09-25 已实测**：GNOME 计算器在 xpra 下（无合成器 ⇒ 无阴影 ⇒ 无 CSD resize 边框）从边和角都**不发**任何 direction；缩放仍靠我们的 8 个手柄（seamless 下保留）。0–7 / 9 / 10 仍接到手柄自己的 resize 路径，并在假 worker 上钉住（test-xpra-client §2d）。
5. Qt 的 `QT_SCALE_FACTOR` 小数、Electron 的 `--force-device-scale-factor`——未实测（D9）。
6. 机队镜像 xpra 3.1.3 的协议——仍 OPEN（D7 建议绕过）。
7. 远程链路上的实际延迟——**已实测**（§3.5 的 §8-7 两段：C1 ssh stdio 7 ms、C2 dial 7–8 ms，按键到回显 11–18 ms）；跨链路的 x5 座位切换——仍未实测（桥与座位代码对远程零改动，但没有在真链路上切过）。
8. 一个把 `decorations` 设 0 但没有自己关闭按钮的应用（kiosk/splash 型）会自动 seamless——逃生口永远在（热区、任务栏菜单、Alt），但第一次可能让人愣一下；全局 `desktop.seamless=off` 是一键回退。 **已交付，每个逃生口都有 gate（lane B）**：热区与 Alt（test-desktop-xpra-window §12 (4)/(5)）、任务栏菜单（§12 (8)）、设置 → 无缝桌面应用窗口 = 关（§12 (8)）；kiosk 应用自己的窗口关闭时我们的窗口照样关闭（§3.2）。
