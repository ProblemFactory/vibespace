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

### 3.5 远程主机：在应用所在的机器上跑同一份代码

**分层（照 CS 分离法 + browser-serve 先例）**：

| 层 | 模块 | 内容 |
|---|---|---|
| SHARED | `src/desktop-serve.js`（新） | op 表 `DESKTOP_SERVE_OPS = ['facts','launch','stop','status','list','windows','fit','keep-alive','relaunch']` + `install({env, dataDir, homeDir, log})` + `runDesktopServeOp(ds, op, params)`——从 keeper 抽出**在机器上做的一半**：起 X/xpra/应用（今天的 `bringUp`）、部件身份（pid+starttime、标记普查）、teardown、贴合皮带、窗口枚举、本机记录文件（`<dataDir>/desktop-apps.json`，设备上是 `~/.vibespace/desktop-apps.json`）。每个 op 回 `{ok, code, error}`，绝不跨线抛 |
| ORCH（hub） | `src/server/desktop-app-keeper.js`（瘦身） | 注册表 + 策略：hub 记录（`data/desktop-apps.json` + `hostId`）、容量、idle 策略、runaway 阈值（采样值由设备 `status` 回）、x5 选举、广播、开机对每台机器 `list` 收养 |
| ORCH（hub） | `src/server/desktop-access.js`（新，browser-access 逐字形状） | `call(hostId, op, params)`：本地 ⇒ 进程内 runner；配对设备 ⇒ `dm.desktopServe(op, params)`；无 daemon 的 ssh 主机 ⇒ `host_needs_daemon`（按名拒绝，永不静默本地回退）；`forwardPort(hostId, port)` = `forwardCdp` 逐字（hub 回环监听 → `dm.tcpForward`，引用计数，按连接解析设备） |
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
7. 远程链路上的实际延迟与 x5 座位切换——未实测（没有配对设备可用）；§7.1 的 netem 数字是同一条 ws 上的上界估计。
8. 一个把 `decorations` 设 0 但没有自己关闭按钮的应用（kiosk/splash 型）会自动 seamless——逃生口永远在（热区、任务栏菜单、Alt），但第一次可能让人愣一下；全局 `desktop.seamless=off` 是一键回退。 **已交付，每个逃生口都有 gate（lane B）**：热区与 Alt（test-desktop-xpra-window §12 (4)/(5)）、任务栏菜单（§12 (8)）、设置 → 无缝桌面应用窗口 = 关（§12 (8)）；kiosk 应用自己的窗口关闭时我们的窗口照样关闭（§3.2）。
