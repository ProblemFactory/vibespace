# 设计：通用桌面应用窗口（浏览器内 X11 渲染）

> owner 2026-09-13："顺便把通用桌面 app 支持（浏览器 based X11 渲染啥的）都支持一下，注意维护良好的代码结构确保后续可维护性，组件合理拆分。"
> 本文是 docs/design-agent-browser-v2.zh.md §4.7（原生客户端窗口）与 §4.9（窗口目标）的**实现规范**，把"一个原生窗口"推广成"任意本地桌面应用"。它取代原 P8 的范围；P9/P10（agent 操作窗口）建立在它之上。英文孪生：docs/design-desktop-apps.md。

> **2026-09-23 · 三张"浏览器"的脸（B-d03a）：** 浏览器作为桌面应用（本设计的 xpra 档，B-bfe6）是产品里第三张叫"浏览器"的脸——与工具栏的 iframe 网页视图、agent 浏览器（design-agent-browser-v2）并列。三者的边界、代码里的七处混淆、三个渲染出来的方向与打分见 `docs/design-browser-faces.zh.md`（建议：先改名——网页视图 / Agent 浏览器 / 浏览器应用——Apps 目录里 `category:'browser'` 的卡副标签写"浏览器应用"）。

## 0. 一段话概括

任何本地桌面应用（`exec` + 参数 + cwd）都可以在 VibeSpace 里作为一个**窗口类型 `desktop-app`** 打开：服务端为它起一个**自己的** X 显示与画面服务器，浏览器端用一个共享的**画面视图组件**渲染并转发输入。画面服务器按**能力阶梯**选：`xpra`（逐窗口 seamless、自适应编码，装了就用）→ `vnc-display`（每应用一个 Xvnc，或 Xvfb + x11vnc，整显示）→ 现有的单例整桌面（D10 的兜底，不新建）。每一级是**一行能力记录**，不是 if 链；一个应用的记录只存它选了哪一级和为什么。所有东西经**一个 keeper**（数量上限 + runaway 守卫 + 开机收养，与浏览器 keeper 同一套纪律）和**一个 ws 桥**（`/api/desktop/:id/stream`，cookie 鉴权，服务端桥接，原始端口永不暴露）。

## 1. 今天实际存在的东西（只读实测，2026-09-13）

- 本机：Ubuntu 25.10，Wayland 会话（`DISPLAY=:1` 是 Xwayland）；`Xvfb`、`x11vnc`、`websockify`、`xdotool`、`wmctrl`、`xdpyinfo` 在，`xpra` **未装**但 apt 有 6.5.3；`Xtigervnc`/`Xvnc` 不在。已有两个 Xvfb 在跑（agent-browser 的与一个 1600x1000 的）。
- 机队镜像（deploy/docker/Dockerfile，Debian bookworm）：`tigervnc-standalone-server` + XFCE 在；bookworm 仓库有 `xpra 3.1.3`。
- 产品里已有：`src/vnc.js`（单例整桌面：Xvnc `:7` + XFCE，`POST /api/vnc/start`，detached + 开机收养）、`src/lib/desktop-window.js`（noVNC 视图，单例窗口，DPI 反缩放 `zoom: calc(1 / var(--ui-scale))`，resizeSession/scaleViewport）、`server.js` 里的 `/api/vnc` upgrade 桥。这三样是**先例**，也是本设计要**复用而不是复制**的东西。

## 2. 模块拆分（可维护性的全部要求都在这一节）

| 层 | 模块 | 职责 | 绝不做的事 |
|---|---|---|---|
| PURE | `src/desktop-apps.js` | 应用注册表行 `{id, label, exec, args, cwd, env, category, backendPrefs}`；**画面后端能力表** `DISPLAY_BACKENDS`（`xpra` / `vnc-display` / `desktop-singleton`，每行：`perWindow`、`adaptive`、`needs:[bins]`、`stream:'rfb'|'xpra'`）；`resolveBackend(hostFacts, prefs)` 阶梯（每次回落带理由）；应用会话状态机 `launching → ready → exited|failed`；容量与 runaway 策略数字（与 browser §3.5 共用同一份常量） | 不 import 任何东西；不碰文件系统 |
| SHARED | `src/desktop-display.js` | **机器事实**：哪些二进制在、分配 X 显示号（`-displayfd`）、X auth cookie、枚举一个显示上的窗口（`xdotool`/`wmctrl`，P9 复用）、探测 `xpra` 版本；`hostId` 是参数（v1 只本地，daemon 以后打包它） | 不做决定；不写记录 |
| ORCH | `src/server/desktop-app-keeper.js` | 生命周期：spawn（setsid、detached）X 显示 → 应用 → 画面服务器；`data/desktop-apps.json` 原子写 + `desktop-apps-updated` 广播；开机**收养**（按 pid+starttime+端口）；数量上限（启动时拒绝并点名占位者，绝不杀）、资源**报告**（**2026-09-25 owner 裁定**：「不是就算是单一内存2G也不好啊，chrome这么吃内存，完全可能超过这个量吧。这个keeper到底是干啥的，没必要别乱加会影响使用的feature」——一个人正在用的应用绝不因资源被停、被 park、被拒绝启动或被删配置；超过阈值（足迹 ΣPss，绝不是 VmRSS 之和）只在活记录上标出、越线开始时发一条通知（2026-09-25 r2：回滞——连续 3 个低于 90% 阈值的采样才重新布防、每会话每小时至多一条、无人收到则同 key 重发）、记遥测；只有产品自己跑的无头 OpenCode serve 仍会被停，判定唯一在 `src/runaway-guard.js`。起因：Google Chrome 就绪 3 s 后因 25 进程 VmRSS 之和 2.0 GB 被当 runaway 停掉、配置被删、park 60 min）；每应用 idle timeout；stop/kill；退出即广播 | 不认识具体应用；不碰 ws |
| ORCH | `src/server/desktop-stream.js` | **一个** ws 桥：`GET /api/desktop/:id/stream`（cookie 鉴权、背压、断线即关；`rfb` 透传到 127.0.0.1 端口，`xpra` 透传到 xpra 的 ws）；`/api/vnc` 那条桥改为调用它（单例桌面 = 一个固定 id），消灭孪生 | 不起进程 |
| ORCH | `src/routes/desktop-apps.js` | `GET /api/desktop/apps`（注册表 + 活会话 + 每级可用性与理由）、`POST /api/desktop/apps`（`{appId}` 或 `{exec,args,cwd}`）、`POST /api/desktop/apps/:id/stop`、`GET /api/desktop/apps/:id`；签名带 `host` | 不做业务判定 |
| CLIENT | `src/lib/vnc-view.js` | **共享画面视图组件**：从 `desktop-window.js` 抽出的 noVNC 装载（`loadRFB`）、DPI 反缩放、resize/scale 策略、焦点与输入转发、断线重连与状态芯片；`desktop-window.js` 与新窗口都用它 | 不知道窗口类型 |
| CLIENT | `src/lib/desktop-app-window.js` | 窗口类型 `desktop-app`（`registerWindowType`，`openSpec {openDesktopApp:{id}}`，每应用会话一个窗口、可进标签组、布局可恢复、多客户端同看一个显示）；标题 = 转义过的应用标签；状态栏：后端级别 + 理由、CPU/RSS、Stop | 不直接 fetch 进程信息（读广播） |
| CLIENT | `src/lib/desktop-app-launcher.js` | ⚙ 菜单 "Desktop apps…" 与工具栏项（contributions.js 注册）；启动对话框**以目录为主**（2026-09-14，owner 项 A）：一句白话说明（做什么、点哪里，zh+ja）→ 后端芯片（阶梯原话）→ 运行中（Open/Stop + 槽位数，非空才显示，在目录之上）→ **应用目录**＝卡片网格（标签 + 一行 exec/理由 + icons.js 的 SVG，按注册表 `category` 选图标），一键启动、启动中的卡片转圈并禁用直到记录应答，不在 PATH 的应用**变灰并说明理由，绝不隐藏**，目录为空时白话说明并自动展开命令表单 → "高级：运行任意命令"折叠区（exec、参数、cwd 自动补全 + Launch + 最近；默认折叠，展开状态存 user state `desktopAppAdvancedOpen`，merge-only PATCH）；卡片与折叠区都是 button（aria-expanded）；≤768px 单列；失败必到 toast。**宽度写在 `.dialog.desktop-launch` 上，绝不写在 body 上**（2026-09-14 实测：body 的 min-width 撑破固定 440px 的 `.dialog`，而 overflow:hidden 的盒子仍是滚动容器，聚焦命令输入框把对话框自己横向滚了 308px——标题滚出左边、✕ 落在标题栏中间、应用列只剩 64px 的边条），程序性 focus 一律 `{preventScroll:true}`，两列 `minmax(0,1fr)` | 不持有会话状态 |

规则：**新一级画面后端 = `DISPLAY_BACKENDS` 加一行 + `desktop-display.js` 加它的探测 + `desktop-stream.js` 加它的透传**，其它任何文件不改。`server.js` 只加接线（尺寸棘轮 2100 行——先量，超了就把既有 stanza 抽走）。

## 3. 后端阶梯（每一级是一行能力记录）

| 级 | 组成 | 逐窗口 | 差网自适应 | 需要 | 判定 |
|---|---|---|---|---|---|
| `xpra` | `xpra start :N --start=<exec> --html=on --bind-tcp=127.0.0.1:<port>`（seamless），HTML5 客户端库或托管上游客户端（D21 (c)） | 是 | 是 | `xpra` | 装了就首选；本机可 `apt install xpra`，机队镜像加一行 |
| `vnc-display` | 每应用一个 `Xvnc :N -localhost -rfbport <port>`（镜像里有）或 `Xvfb :N` + `x11vnc -display :N -localhost -rfbport <port>`（本机现状）+ 一个轻量 WM（`xfwm4`/`openbox` 有则用，无则裸） | 否（整显示，但显示里只有这一个应用） | 否 | `Xvnc` 或 `Xvfb`+`x11vnc` | 今天两边都能跑的那一级，P8-1 先落这级；**x4（2026-09-22）：显示能否跟随 VibeSpace 窗口由本行的 `fit` 列按 `via` 判定——`Xvnc` **跟随**（TigerVNC 接受客户端 SetDesktopSize，argv 明写 `-AcceptSetDesktopSize`，本机实测 1280x800→900x600 回 status 0 用时 43 ms、帧缓冲 50 ms 后就是新尺寸；`=0` 是唯一会拒绝的杠杆），`Xvfb+x11vnc` **固定**（x11vnc 0.9.17 没有 SetDesktopSize，浏览器缩放，窗口芯片点名：`fixed 1280x800 (Xvfb) — install tigervnc for a window that follows`）；两种拼法下 keeper 都做**应用贴合**（xdotool 把应用顶层窗口移到 0,0 并缩放到帧缓冲，无需 WM；第二个顶层窗口保留尺寸、推回帧缓冲内） |
| `desktop-singleton` | 现有 `src/vnc.js` 的 `:7` 整桌面 | 否 | 否 | 同上 | D10 兜底：应用起在共享桌面里，窗口只是打开 Desktop |

`resolveBackend` 从上往下取第一个 `needs` 全在的；每次回落 `console.log('[desktop] backend fallback: xpra→vnc-display (xpra not on PATH)')` 并把 `backend` + `fallbackWhy` 写进记录，窗口状态栏显示它——用户要知道自己看到的是逐窗口还是整显示。

## 4. 数据模型（`data/desktop-apps.json`，原子写）

```
{ "apps": { "<id>": { "id", "label", "exec", "args", "cwd", "env"?, "source": "registry"|"adhoc",
            "backend": "xpra"|"vnc-display"|"desktop-singleton", "fallbackWhy": null|string,
            "display": ":N", "port": <127.0.0.1 端口>, "pids": { "x": n, "app": n, "server": n },
            "startedAt", "state": "launching"|"ready"|"exited"|"failed", "exitCode"?, "lastError"?,
            "idleTimeoutMs", "lastInputAt" } } }
```
记录只存**事实**（pid/端口/显示号/选了哪级），不存派生值。开机收养：pid+starttime 都对得上才算活；否则标 `exited` 并保留 `lastError`。

## 5. 安全

- 画面端口只绑 127.0.0.1；浏览器只走 cookie 鉴权的 ws 桥（与 `/api/vnc` 同一条纪律）。
- `exec` 来自注册表或用户在对话框里输入——**不是 agent**；agent 侧（P9）只拿窗口目标句柄，不拿 exec。
- 应用继承 `agentEnv()` 那种净化过的 env（不是 `process.env`），DISPLAY/XAUTHORITY 由 keeper 注入；secrets 不进 argv。
- 每应用 idle timeout（默认 0 = 不停，owner 2026-09-25 定案；设了分钟数才在无输入 N 分钟后停，状态栏可见倒计时；"保持运行"是一次显式动作）。
- （B-bfe6，§7.7）浏览器应用是**人**的窗口，带它**自己的**配置目录（`data/desktop-apps/<id>/profile`，0700，会话结束即删，除非选了保留）——绝不是 agent 浏览器的配置，绝不是用户真正的 `~/.config/chromium` / `~/.mozilla`（按名拒绝），argv 里永远没有自动化 flag（`--remote-debugging-*`、`--enable-automation`、`--headless`、marionette……按名拒绝 `automation-flag`）。

## 6. 测试 gate

| 套件 | 层 | 内容 |
|---|---|---|
| `test-desktop-apps` | fast | PURE：注册表行校验、`resolveBackend` 阶梯全矩阵（每种缺失组合各一行 + 回落理由文本）、状态机、容量/runaway 判定 |
| `test-desktop-display` | fast（无二进制即 SKIP 并说明） | 显示号分配不撞、auth cookie、窗口枚举（真 Xvfb + `xterm`/`xlogo`/`xmessage` 之一） |
| `test-desktop-app-keeper` | heavy | 真 Xvfb + x11vnc（或 Xvnc）：launch → 端口监听 → RFB 握手（`net`）→ 记录落盘 → **SIGKILL keeper 进程并重建 ⇒ 收养** → stop 干净（无孤儿 X/服务器；`/proc` 计数前后相等）；runaway 守卫用一个吃 CPU 的假应用 |
| `test-desktop-app-window` | heavy | headless chrome：启动对话框 → 窗口出现 → canvas 非全黑 → 第二个客户端同看 → SIGKILL 服务器 + 重启 ⇒ 窗口恢复且仍连得上 → Stop ⇒ 窗口显示 exited；**2026-09-14 增几何 pin**（用页面自己算的 rect）：1000×800 / 777×800 / 480×640 各一次全新打开——`.dialog` 不横向滚动（scrollLeft 0、scrollWidth ≤ clientWidth）、标题中心可 elementFromPoint 点中、✕ 在对话框右侧 48px 内、第一张卡片的标签在卡片内、展开时两列各 ≥ 38%、三条 nowrap 最近条目不挤压；zh 的说明行；真点一张卡片启动并出现启动中态；折叠区默认关且重载后保持展开 |
| `test-vnc-view` | fast | 共享视图组件的 DPI 反缩放与坐标（沿用 inc-mtdrm922 的量法）；`desktop-window.js` 改用组件后逐字节同一批断言 |

## 7. 分片

| 片 | 内容 | 轮次 |
|---|---|---|
| **P8-1** | §2 全部模块（`xpra` 级只做探测与记录，透传留接口）、`vnc-display` 级端到端、`vnc-view.js` 抽取并让 `desktop-window.js` 改用、`/api/vnc` 桥并入 `desktop-stream.js`、启动器、窗口、五个套件、kb/CLAUDE.md、Dockerfile 加 `xpra`（只加包，不启用） | 6–9 |
| **P8-2** | `xpra` 级端到端：D21 (c)——先托管上游 HTML5 客户端做验证切片（200 ms / 1 Mbps 实测写进 kb），再用 `xpra-html5-client` 在 `desktop-app-window` 里自己画；逐窗口标题/图标。**chunk x1 已落（2026-09-21）：服务端半边 + 验证切片**——`xpra-seamless` 配方（每会话一个 `xpra start --daemon=no --displayfd=3 --use-display=no --html=on --bind-tcp=127.0.0.1:<port> --bind=none --resize-display=yes --clipboard-direction=both`，其余功能逐项按名关闭；xpra 自己起 Xvfb 并当 WM，应用仍由 keeper 自己 spawn；四个实测陷阱与每个 flag 的理由见 kb-file-structure.md 的 desktop-display.js 条目）、keeper 记录 `{backend:'xpra', stream:'xpra', probe:'http'}` + 共用全部上限/守卫/idle/收养（DA1：老会话绝不迁移）+ `windows(id)`、桥 `xpra` 透传（ws↔ws，同背压/同心跳/命名关闭）、`/api/desktop/:id/xpra-ui/*` 托管上游客户端（cookie 鉴权、nosniff、无目录）、`desktop.backendPrefs` 实例级顺序；窗口在 x2 之前暂以 iframe 显示托管客户端。 **chunk x2 已落（2026-09-22）：客户端半边，D21 (c) (b)**——npm `xpra-html5-client` 审过并否决（其 README 自述 MPL-2.0、源自上游客户端，而 package.json 写 Apache-2.0；2022-05-25 之后再无发布，是 xpra 4.x 时代；解包 10.7 MB / ESM 2.37 MB 带 node-forge + lodash-es；且是一整个带自己窗口模型的客户端——窗口不会是我们的）；传输层用上游 html5 v21 的 `Protocol.js` WORKER，经 x1 的路由（`/api/desktop/:id/xpra-ui/js/`）从已安装的包原样提供（MPL-2.0，docs/third-party-notices.md），报文之上全是我们的：`src/lib/xpra-proto.js`（PURE 词汇）、`xpra-client.js`（无 DOM 的会话）、`xpra-view.js`（画面 pane），站在从 vnc-view.js 抽出的画面外壳（`picture-shell.js`）上。应用窗口填满 pane 并跟随它、对话框被推回 pane 内、标题栏带应用自己的标题与图标、剪贴板双向（明文 http 的 chip 在主机名页面实测）、IME/Latin-1 文本经 NATIVE 键盘映射打进去（§7.2）。门：test-xpra-client（fast，114）+ test-desktop-xpra-window（heavy，真 xpra + xterm）。 **chunk x3 已落（2026-09-22）：收口**——新增 heavy 门 test-desktop-xpra（真 worktree 服务器 + 密码鉴权 + 真 xpra 6.5.3 + 它自己的 Xvfb + xterm，从 node 经产品自己的路由与唯一的 ws 桥驱动，无 chrome，~50 s）：起动、绑定检查（xpra 只绑 127.0.0.1，本机非回环地址上的裸 TCP 连接被拒）、中继鉴权（无 cookie 401 / 陌生 id 404 / 真 rencodeplus hello）、协议层的跟随尺寸与双向剪贴板、keep-alive 与 idle 停止、SIGKILL 重启后的收养（xpra 与 vnc-display 记录各按出生时的后端收养，绝不迁移）、cap 即 keeper-limits 的数（§7.3）；test-desktop-apps §1 加守卫数字"只导入不复制"普查；机队镜像的 xpra 3.1.3 记为 OPEN（§9-1 + Dockerfile 注释）。 **chunk x4 已落（2026-09-22，owner 看到 vnc-display 级 1280x800 黑底左上角一个小计算器："就算是vnc也不能这样啊，完全无法做自动贴合，尺寸匹配吗？"）：vnc-display 级也贴合窗口**——(a) Xvnc 服务端跟随客户端 SetDesktopSize（`X_SERVER_ARGS.Xvnc` 明写 `-AcceptSetDesktopSize`，实测见 §7.4；`-extension RANDR` 只让 X 侧 xrandr 失明，客户端缩放照样生效），(b) keeper 的 **APP-FIT 步骤**（PURE `appFitPlan` + `desktop-display.applyWindowPlan` 一次链式 xdotool：ready 后每 500 ms 等应用映射出顶层窗口、桥报告的每个 SetDesktopSize 去抖 250 ms 后、以及每个 tick 的皮带；帧缓冲尺寸只读 xdpyinfo 的**真值**，绝不读客户端的请求），(c) Xvfb+x11vnc 固定几何仍然贴合 + 浏览器缩放 + 芯片点名限制，(d) heavy 门 test-desktop-vnc-fit（真 Xvnc + 真 xterm + 无头 Chrome：两次缩放 VibeSpace 窗口，帧缓冲 2 s 内跟随、应用矩形 = 帧缓冲、画布上应用之外 0 个像素）；机队镜像加 `xdotool wmctrl`（§9-8：有 WM 时经 wmctrl 最大化——本机无 WM，**未实测**）。门：test-desktop-apps §9（206）+ test-desktop-display §6（144，实测即门：Xvnc 跟随 + `=0` 对照拒绝）+ test-desktop-app-keeper §13（217）+ test-desktop-vnc-fit（heavy）。 **x5 已落（2026-09-22，owner 裁定）：多客户端 = 单活跃 viewer**——一个应用窗口的人类观看者里只有一个 ACTIVE（它的 pane 决定应用几何、只有它的输入/剪贴板被转发），其余全部 BLOCKED（覆盖层：应用标题 + “Active on another client” + “Resume here”，没有画面）；agent 驾驶时所有人 Watch（画面按 pane 缩放适配，不发任何几何）。规则、表格与实测见 §7.5；r8 留下的 §9-11 由此关闭。 | 4–7 |
| **P9** | 见 browser 设计 §4.9：`src/window-targets.js` 复用 `desktop-display.js` 的枚举，`vibespace-window` CLI | 按原排期 |

### 7.1 D21 (c) (a) 验证切片实测（2026-09-21，本机 xpra v6.5.3 + xpra-html5 21，worktree 服务器 + 无头 Chrome，中继层 netem）

| 项 | netem 关（回环） | rtt 200 ms / 1 Mbps |
|---|---|---|
| 起动：displayfd / HTTP 200 / 第一个窗口映射 | 175 ms–1.2 s / 1.3–2.3 s / ~2.5 s | 同（服务端） |
| 托管客户端首个窗口画布（navigate 后） | 0.7 s | 0.9 s |
| 画面形状 | 一个 seamless 窗口＝应用自己的画布（370x616 计算器 / 484x316 xterm），黑色占比 0.00，无 root | 同 |
| 击键→字形上屏（xterm，无键控制组保持静止） | 34 ms | 265 ms（≈ RTT + 65 ms） |
| 视口 1000x700→640x480 | 虚拟屏跟随（xdpyinfo 640x480），应用窗口保持自身尺寸（seamless；贴合 pane = x2 的 `configure-window`） | 同 |
| 剪贴板 | 回环＝secure context，客户端有异步 Clipboard API + 轮询；明文 http 主机名下 API 缺席，上游客户端退回页内 pasteboard（x2 用自己的 chip 实测） | 同 |
| 会话 RSS（连着客户端） | xterm 203 MB / 计算器 460 MB（xpra 86 + Xvfb 98@4096x2304 + 应用；GTK4 damage 流让 xpra 增长） | 202 / 463 MB |
| CPU（连着客户端，5 s） | xterm 0–0.2 % / 计算器 10–16 %（它自己的动画） | 同 |
| `xpra info` 一次 | 115–135 ms + 一条完整连接（`windows.<xid>.*` 族）⇒ 不用于轮询；活标题/图标走协议 | — |


### 7.2 chunk x2 实测（2026-09-22，本机 xpra v6.5.3 + xpra-html5 21，worktree 服务器 + 无头 Chrome，真 xterm 跑 `cat > file`）

| 项 | 实测 |
|---|---|
| 打开窗口到第一个窗口画出 | 0.76 s（三次 0.75–0.76） |
| 应用窗口跟随 pane（xterm 按字符格取整） | 898×553 的 pane 里 898×550；638×413 里 634×407——都在 0,0，X 服务器自己报的几何在 pane 一格以内，我们的画布与 X 差 ≤3 px |
| 应用窗口之外的黑像素（pane 截图在页内解码计数） | 5,456 个像素里 0（638×413）；0 里 0（898×553——窗口盖满 pane） |
| 标题栏 | 应用窗口自己的标题，与 X 服务器报的（`GET …/windows`）相等 |
| 打字 | 可信键事件打 `hi xpra 42`，从应用的文件读回 |
| IME / 非布局文本 | CDP insertText 的 `é中文` 与作为键事件的 `é`——**只有**经 native 键盘映射才行：xpra 6.5.3 把只发 `keycodes` 的客户端翻译到它自己的 `us` 映射（`set_keycode_translation`），从不为缺失的 keysym 造键码；发 `x11_keycodes` + `query_struct` 的客户端则让服务器按客户端的映射编程 X 键盘映射（`set_all_keycodes`），于是客户端在按下之前先用 `keyboard-config` 发布每个新字符的一行 |
| 剪贴板 浏览器→应用 | `paste` 事件的文本就是应用显示上 `xclip -o -selection clipboard` 读到的 |
| 剪贴板 应用→浏览器，安全页面（回环） | 显示上 `xclip -i` 落进 `navigator.clipboard` |
| 剪贴板 应用→浏览器，明文 http（主机名页面，`isSecureContext === false`） | “应用内已复制 — 点击复制到本机” chip；一次可信点击复制成功（从安全页面读回） |
| 哪个观看者收到应用的复制 | 只有一个——第一个开了剪贴板的客户端，之后是最后一个发过输入的（xpra 的 ui driver）；第二个观看者要先碰一下应用 |
| 同一应用的第二个顶层窗口（xterm Ctrl+Button1 菜单，override-redirect） | 画在指针处、pane 之内；它 446 px 高，有 149 px 垂在 553 px 的 root 之下——Xt 按连接时缓存的屏幕尺寸摆菜单，这是 X 自己的裁剪，不是我们的 |
| 剪贴板 浏览器→应用，明文 http 下的真实粘贴（CDP 原生 paste 命令——浏览器自己的剪贴板，不用异步 API） | 在画面上 Ctrl+V，以及 Paste chip 打开的粘贴框 + 发送（外壳的，补全后每一级都有）都被 `xclip -o` 读回；粘贴框写明原因是非 HTTPS，发送后焦点回到应用 |
| UI 缩放下（`vibespace.uiScale` 125，body zoom 1.25）的第三个尺寸（560×460 布局 px） | 屏幕上窗格 698×500 = 会话的 screen；画布 694×498 px 画在 694×498 屏幕 px 上（净缩放 1）；X 的窗口 694×498；窗口外 3,388 个像素里 0 个黑；指针移到窗格 (137, 91) 与 (558, 350) 恰好落在 X 的同一坐标（`xdotool getmouselocation`） |
| Stop | “已停止”，记录的每个 pid 都没了 |

### 7.3 chunk x3 实测（2026-09-22，本机 xpra v6.5.3，真 worktree 服务器（密码鉴权开）+ 真 xterm，从 node 经路由与桥驱动；test-desktop-xpra 一次 48 s）

| 项 | 实测 |
|---|---|
| `POST /api/desktop/apps` 到 ready | 1.53 s（display :4，一个 xpra pid 同为 x 与 server，应用自己的 pid，无我们的 WM，probe http） |
| xpra 的会话文件 | `data/desktop-apps/<id>/xpra/`（`4`、`server.pid`）；`--bind=none` ⇒ 任何地方都没有 unix socket；`~/.xpra`、`~/.Xauthority` 不存在 |
| 绑定检查 | xpra 端口在 `/proc/net/tcp` 里只有一行 `0100007F`（无 tcp6 行）；对本机非回环地址的裸 TCP 连接 ECONNREFUSED，对 127.0.0.1 应答；对照：产品自己的端口绑 `00000000`，非回环连接应答 |
| 中继鉴权（真服务器） | 无 cookie ⇒ 升级 401；cookie + 陌生 id ⇒ 404；cookie + id ⇒ 101 |
| 经中继的真 hello（已安装客户端的 rencode.js 装进套件自己的 realm） | 512–515 ms 应答，xpra 6.5，98 个 packet-types（含 display-configure、keyboard-config、configure-window、clipboard-token） |
| new-window | 484×316 at 0,0，标题 "vs-x3-title"，class ["xterm","XTerm"] |
| 跟随尺寸（display-configure + configure-window） | 640×480 ⇒ X 自己报 640×472，412 ms，服务器回一条 `window-move-resize 640×472`（xterm 按字符格取整，X 纠正了请求）；900×620 ⇒ X 报 898×615，1.03 s，服务器**不回**任何确认——读 `x11/server/seamless.py` 得到的规则：`do_process_window_configure` 只通知**其他**客户端，`size_notify_clients` 只在 X 最终几何与服务器自己的 clamp（client-geometry）不同时才发；x2 客户端因此先按 fit 乐观应用、再接受纠正 |
| 剪贴板 浏览器→应用（协议层） | 经中继发 `clipboard-token` 后，显示上 `xclip -o -selection clipboard` 读到同一文本 |
| 剪贴板 应用→浏览器（协议层） | 显示上 `xclip -i` ⇒ 中继上收到 greedy 的 `clipboard-token`，直接携带文本；token 计入 idle 时钟的输入（lastInputAt 前移） |
| idle 停止 / keep-alive | `PATCH /api/settings {desktop.idleTimeoutMin: 0.05}` 即时生效于**新**启动：无输入的会话 ready 后 5.0–6.0 s 退出（3 s 超时 + 5 s tick），stoppedBy idle，xpra + Xvfb + 应用全没；旁边 keep-alive 的会话（idleTimeoutMs 0）活着；第一个会话保留启动时盖上的超时 |
| SIGKILL + 重启后的收养 | 三个活会话（两个 xpra + 一个经 `desktop.backendPrefs` 钉住的 vnc-display）全部在服务器死后仍活，重启后 1.8–2.0 s 内 3/3 收养：各自出生时的后端、同 pid + starttime、同端口；vnc-display 那条绝不迁移；阶梯仍选 xpra；重启后新启动取 xpra；对已收养 xpra 会话的中继照常应答 hello |
| cap | `GET /api/desktop/apps` 的 `cap.cap` === keeper-limits.CONCURRENT_CAP（6） |
| 停止 | 四个会话经产品停止 ⇒ exited by user；15 个记录 pid 全没；marker 普查为空（没有进程再带本次的 `VIBESPACE_DESKTOP_APP=<id>` 或 XAUTHORITY 路径） |

### 7.4 chunk x4 实测（2026-09-22，本机 Xtigervnc 1.15.0 + xdotool 3.2016 + 真 xterm / gnome-calculator；keeper 的 argv 逐字；worktree 服务器 + 无头 Chrome）

| 项 | 数值 |
|---|---|
| 客户端 SetDesktopSize 1280x800→900x600（keeper argv） | ExtendedDesktopSize 回 status 0 **43 ms**，xdpyinfo/xrandr 50 ms 后读到 900x600；再放大到 1600x1000（越过 `-geometry`）、再回 1280x800 都成功 |
| 对照 `-AcceptSetDesktopSize=0` | 回 status 1，帧缓冲留在 1280x800 ⇒ 这个 flag 是唯一杠杆 |
| 对照 `-extension RANDR` | xrandr "RandR extension missing"，但客户端 SetDesktopSize 照样把帧缓冲改成 900x600（X 侧读尺寸不需要 RANDR） |
| 裸 X 上 `xdotool windowmove 0 0 windowsize 1280 800`（无 WM） | xterm 484x316 → 1280x800+0+0 **3 ms**；gnome-calculator（GTK3）370x616 → 1280x800+0+0 **3 ms**（服务器直接应用客户端的 ConfigureWindow） |
| 真 keeper（§13）：ready → 首次贴合 | 101 ms（xterm 映射极快；GTK 应用 1–2 s，由 500 ms 步进等到为止） |
| 真桥上真 RFB 客户端发 SetDesktopSize 900x600 / 1024x700 | 帧缓冲与应用窗口 **305 / 306 ms** 内跟随（250 ms 去抖 + 服务器 ~50 ms + 贴合 2 ms）；idle 时钟不动 |
| 皮带：手工把窗口挪成 300x200+40+40 | 下一个 tick 回到 1024x700+0+0（782 ms，tick 1 s） |
| 无头 Chrome（test-desktop-vnc-fit）：连上后 | 窗口 900x620 → pane 898x553 = 帧缓冲 = 画布 = 应用窗口 898x553+0+0；应用之外 0 像素；画布黑色占比 1.7 %（白底 xterm）；Connected 后 336–340 ms 稳定 |
| 缩放到 900x640 / 1180x760 | 帧缓冲 2 s 内变化；pane 898x573 / 1178x693 = 帧缓冲 = 画布 = 应用窗口；应用之外 0 像素；变化被看到后 22–24 ms 稳定（贴合 4–5 ms，why `client asked …`） |
| X 把第二个顶层放到 +2000+1500 | 皮带推回帧缓冲内：244x134 → +934+559（1178x693 内），尺寸不变，主窗口不动 |
| Xvfb+x11vnc 拼法（PATH 去掉 Xvnc） | fitMode fixed，芯片逐字 `fixed 1280x800 (Xvfb) — install tigervnc for a window that follows`，应用贴合到 1280x800，画布 1280x800 由 noVNC 缩放，缩放 VibeSpace 窗口对显示无影响 |
| 缺 xdotool | 拒绝按名记录一次（`xdotool not on PATH`），帧缓冲仍实测，记录仍 ready，一分钟后再问 |
| UI 缩放 125（body zoom 1.25）下第三个尺寸：窗口 640x500 布局 px | 帧缓冲 314 ms 内变成**屏幕上的** pane 798x550（不是布局 px），画布 798x550 画在 798x550 屏幕 px 上（net zoom 1），应用窗口 798x550+0+0、应用之外 0 像素；画布 (137,91) / (638,385) 处的指针在 X 上正好是 (137,91) / (638,385)（xdotool getmouselocation） |
| 标题栏（x4 收尾） | 显示**应用窗口自己的标题**（keeper 贴合时同一次 xwininfo 枚举读到的名字，`appTitle` 事实，零额外 spawn；每个 tick 更新）：`vs-fit "q" <b>x</b>` 原样作为文本，标题栏里 0 个元素；读不出名字时保留启动 label |
| xwininfo 1.1.6 打印名字的方式（实测） | **不转义**：UTF-8 `_NET_WM_NAME` 原样带引号 `"计算器 "x" \ é"`；xterm 的非 Latin-1 标题是 COMPOUND_TEXT，打印成 `(name in unsupported encoding COMPOUND_TEXT)`；C 区域设置下 UTF-8 名字打印成 `" (failure in conversion from UTF8_STRING to ANSI_X3.4-1968)"`。旧的解析正则把前两种行**整行丢掉**——应用窗口从贴合计划和 windows(id) 里消失；现在从右往左解析（几何、类组、名字），读不出的名字为 null、行保留，并以 `LC_ALL=C.UTF-8` 调用 xwininfo |

### 7.5 x5 多客户端 = 单活跃 viewer（2026-09-22，owner 裁定；本机 xpra v6.5.3 + 真 xterm，worktree 服务器 + 两个无头 Chrome 页面）

owner 原话：“直接block掉非active客户端的app界面，因为多客户端同时操作鼠标感觉也会有问题” + “仿照terminal…可以手动take over”。即终端的 size-override（server.js `resizeSessionToMin` + `_sizeOwnerWs`、terminal.js 的 “Resume here” 覆盖层）变成默认：一个应用窗口的**人类**观看者里恰好一个 ACTIVE；点 Resume here 即接管（接管者 active，原 active 变 blocked）；active 离开时，剩下的观看者里**最近一次处于 active 的**自动接管（从未 active 过的，取最近加入的）——自 2.369.156 起先有 **5 s 宽限**（见本节末）。与 agent 租约（P9b）的组合：agent 驾驶（lease input `agent`）时所有人 Watch；人类接管 agent 的窗口（lease input `user`）即让该客户端成为 active，其余 blocked。

| 状态 | 画面 | 输入 / 剪贴板 | 几何（显示尺寸、configure-window） |
|---|---|---|---|
| active | 有 | 转发 | 转发——应用跟随**它的** pane |
| blocked | **无**（覆盖层；桥为它**不开**上游连接） | 什么都不转发 | 什么都不转发（hello 与被扣的几类报文被保留，成为 active 时先发） |
| watch | 有（整个舞台按 pane 缩放适配：contain，绝不裁剪；2.369.156 起**绝不放大**——上限 1，居中） | 截断 | 截断（键盘映射 / 显示尺寸 / **configure-window** 保留，接管时重放；unmap-window 截断） |

落点：PURE `src/desktop-viewers.js`（`viewerState` / `nextActive` / `activeAfterJoin` / `viewersView` / 客户端的 `paneState`，什么都不 import，也打进浏览器包）；keeper 的选举（`viewerJoined/Left/takeoverViewer/activeViewer/onViewers`，只存 viewer id，不碰 WebSocket，不持久化）+ 广播 `desktop-app-viewers {id, active, viewers:[{id, label, since}]}`（按公开的 pane key 命名，**从不**带 socket 的秘密 id）；桥的 `viewerSeats`（window-live-wiring 把 keeper 的选举与引擎的租约经 `viewerState` 组合；每次 keeper 变化与每条 `window-leases-updated` 都 `refresh`）——blocked 的 socket 不开上游、只保留 hello 与被扣报文；active/watch→blocked 时**切断**（上游关闭 + socket 以 4001 `blocked` 关闭，pane 立即以 blocked 身份重连）；blocked→active 时开上游并先重放保留的报文；rfb 级同一策略（blocked 不开 TCP）；`POST /api/desktop/apps/:id/viewers/takeover`（Resume here；agent 持有时走引擎的人类接管，另一人持有时 `holderAlive:false` 直接**移交**——不交还、不公告、不计费）+ `GET …/viewers`；客户端覆盖层用 textContent 写标题，Resume here **先在本地翻转**再发请求（不等广播回声）。

| 项（test-desktop-xpra-window §5） | 实测 |
|---|---|
| A 先到 ⇒ active | A 的 pane 698×433 ⇒ X 694×433（xterm 按字符格取整）；A 打字进应用 |
| B 到（另一尺寸） | 覆盖层 “Active on another client” + 应用名 + Resume here；B 视图里 0 个窗口、0 个 canvas |
| B 在 blocked 时缩放到 818×493、再打字 | 2.5 s 后 X 仍是 694×433（A 的 pane）；“zz” 没进应用 |
| B 点 Resume here | **648 ms** 后 X = 814×485（B 的 pane 818×493）；A 显示覆盖层、没有画面；B 打字进应用 |
| A 关闭 / B 关闭后 A 重开 | B 仍 active 且在线 / A 重新 active 且在线 |
| agent attach（真 fake-claude 会话的 vsst_ 令牌） | 两个页面都 Watch：D 的 pane 518×313、X 694×433 ⇒ 舞台缩放 0.723（= contain 适配值），canvas 502×313 完全在 pane 内；D 的小 pane 与 A 缩到 900×620 都不改 X；两边打字都被拒 |
| 对照：pre-x5 服务器（worktree 副本，wiring 不给桥 seats） | 第二个页面**不**被挡，它缩放到 818×493 后 3 s 内 X 变成 814×485——“B 的 pane 改不动任何东西”那条腿在那里失败 |
| 假上游上的桥（test-desktop-viewers） | blocked：0 个上游连接、双向 0 包；接管后重放顺序 hello → keyboard-config → display-configure → configure-window，11 ms；对照（seat 恒 `free` 的补丁副本）：blocked 的 B 的 display-configure / configure-window / key-action 全到上游 |

**2.369.156 收口**——第三轮对抗验证（MERGEABLE）留下的四个 LOW 全部关闭，两个 INFO 作为**产品默认值**落地（owner 可反对）：

- **宽限（默认，`VIEWER_GRACE_MS` = 5 s）**：active pane 的 socket 关闭而仍有其他观看者时，座位为**它的 pane** 保留 5 s——其余人保持 blocked，广播的 `active` 仍是那个 pane（`viewersView` 的 `activePane`；否则 `active: null` 会让每个客户端读成“我是 active”，而桥仍挡着它们）；同一 pane 重连（网络抖动），或把它记为前任的新窗口（页面重载：同一标签页的 sessionStorage 记着上一个 pane key，经 `?prev=` 带上——只是提示，宽限之外永不夺座）拿回座位；宽限内的 Resume here 立即生效；宽限到期才选最近一次 active 的。页面重载或网络抖动不再把应用交给另一台设备。
- **Watch 不放大（默认）**：xpra 级 Watch 舞台缩放上限 1、居中（整像素偏移）——pane 比应用大时 1:1 清晰显示，小时照旧缩小适配。vnc 级画面仍是 noVNC 的 `scaleViewport`（未改）。
- **LOW-1**：每次加入都打一条假的 `reconcile failed — c.reconcile is not a function` warn（加入自身的广播在该 socket 布线前就 refresh 了）⇒ `refresh()` 跳过尚未布线的 socket（它紧接着自己应用状态）。
- **LOW-2**：xpra 级 blocked 覆盖层显示的是启动 label 而不是应用自己的标题（blocked pane 没有协议会话）⇒ keeper 在出现 blocked 座位时、接管时、以及有 blocked 座位期间的 tick 上（至多 10 s 一次）经 `windows(id)` 从 X 读主窗口标题写入记录的 `appTitle`（PURE `appMainWindow({seamless})`）；窗口里 blocked 的 pane 先用记录的标题，active/watch 的先用协议标题。
- **LOW-3**：匿名 socket（没有 `?viewer=`——托管的上游页面 `/api/desktop/:id/xpra-ui/` 正是这样）被当作 `anon-N` 入座，可能拿到 ACTIVE ⇒ 只有具名 pane 参与选举；匿名 socket 在受管流上是只读 WATCH 座（画面有，输入/几何截断），永不当选、永不 blocked、不进广播。托管页因此只能看（上游页面会从 `path` 里剥掉 `?`/`=`/`&`，带不了 viewer id）；产品窗口是驾驶面。
- **LOW-4**：active pane 的 socket 静默断开时，它自己的重连被挡最多两轮 ping（实测 29.8 s）⇒ 同一 pane 经更新的 socket 加入时座位立即移到它（一个 pane 就是一个客户端），旧 socket 被切断；被切断的 socket 立即退出选举（不等最长 30 s 的关闭握手）。

| 项 | 实测 |
|---|---|
| LOW-4 经桥（test-desktop-viewers §5） | 旧 socket 静默断开、新 socket 加入 ⇒ **11 ms** 内 active，hello + 按键到上游，旧上游关闭；对照（去掉这一分支的 keeper 副本）：仍被挡、1 个上游连接 |
| 宽限经桥 | A 关闭 ⇒ 宽限内 B 0 个上游连接；A 的 pane 重连 ⇒ active，全程没有给 B 开上游 |
| LOW-3 | 匿名 socket 的 hello + map-window 到上游，key-action / configure-window / display-configure 截断；第一个具名 pane active；对照（旧的 `anon-<n>` 入座）：匿名 socket 拿到 active、按键与几何到上游 |
| LOW-1 | 场景里 5 次加入 0 条 warn；对照（去掉跳过那一行）5 条 |
| LOW-2（test-desktop-xpra-window §5，真 xpra + xterm，恶意标题 `vs-x5 <b>"t"</b> & <i>x</i>`） | B blocked 时覆盖层与标题栏都是该标题原文（0 个子元素）；A 被切断后的覆盖层同上；对照（去掉加入时读取的 keeper 副本）：记录没有标题，只能显示 label |
| Watch 不放大（test-desktop-xpra-window §5） | A 的 pane 1078×633 大于应用窗口 698×433 ⇒ 舞台缩放 1（不设上限的适配值 1.462）、画布 698×433 即窗口本身尺寸、留白 左/右 190/190、上/下 100/100（后台标签页不跑渲染步，ResizeObserver 的重新适配等到标签页被显示——实测先读到未居中的 0/380） |

### 7.6 HiDPI + 应用的最小尺寸（2.369.158，owner 报障 2026-09-23；本机 xpra v6.5.3 + gnome-calculator 50（GTK 4.22）+ 一个 GTK 3.24 探针窗口 + xterm，worktree 服务器 + deviceScaleFactor 2 的无头 Chrome）

owner 在 devicePixelRatio 2 的屏幕上用 xpra 级打开 GNOME Calculator 截图报了三件事，原话：
1. 应用被 resize 成 pane 大小了，但**高度不对**——键盘下面几行被裁掉：“如果内窗口有最小高度，外窗口的 resize 也要被限制在这个高度”。
2. “DPI 太低了——没有地方可以调吗？”
3. “看起来还是像 VNC，我以为你们是在前端渲染 X11 窗口”。

**根因（实测）。** (1) 客户端 hello 的 `metadata.supported` 抄的是 xpra-html5 v21 的清单，里面只有 `size-hints`（4.x 之前的名字）；xpra 6.x 的名字是 `size-constraints`，而服务端**只发客户端列出的键**——计算器的 new-window 只带 `has-alpha,title,class-instance,window-type,decorations`。所以 x2 以来的贴合皮带一直是“盲的”：从没收到过最小尺寸，按 pane 请求一个比 616 px 矮的高度，X 按最小值夹住，pane 把多出来的部分裁掉——就是截图。加上 `size-constraints` 后：1× 时计算器 `{increment:[2,2], minimum-size:[360,616]}`，xterm `{base-size:[4,4], increment:[6,13], minimum-size:[10,17]}`。(2) pane 的 CSS px 就是 X px（§9-7），应用按 96 dpi 渲染，2× 屏幕再把位图放大 2 倍。(3) xpra **本来就是**逐窗口的像素流（damage 区域，png/webp/jpeg/h264），不是矢量/DOM 渲染；“像 VNC”的是那张被放大的 96 dpi 位图（以及文字上的有损编码）。

**做了什么。**
- **HiDPI 端到端。** 启动请求带上发起客户端的 `devicePixelRatio`（`POST /api/desktop/apps` 的 `dpr`，1..3，缺省 1，越界按名拒绝）；新设置 `desktop.appScale`（auto | 1 | 1.5 | 2，默认 auto；r1 的 auto = 发起屏幕的 DPR 取整到 0.5、夹在 1..2——r2 改为 DPR ≥ 1.5 取 2、否则 1，见下文 r2）在**启动时**决定应用的 SCALE，记录带 `scale` 与 `dpi`；改设置要重新启动应用才生效（设置说明里写明，窗口状态条的 `2×` 芯片显示当前缩放）。客户端把 pane 的 CSS px × DPR 作为**设备像素**发给 hello 的桌面尺寸、每个 display-configure、每次贴合的 configure-window（仍按应用的 increment 取整）；每个窗口 canvas 的 backing store 是设备像素、CSS 盒子是设备 ÷ DPR（2× 屏幕上 1:1，清晰）；指针 CSS → 设备（再穿过 stage 的缩放）；UI 缩放的 counter-zoom（net zoom 1）不变，Watch 的舞台缩放与 1/DPR 组合。DPR 变化（换显示器、浏览器缩放）由分辨率媒体查询触发重新布局。
- **哪些旋钮真的有效（逐项实测，只留有效的）：** GDK_SCALE=2 让 GTK3 与 GTK4 **精确**翻倍（计算器最小 360x616 → 720x1232；GTK3 探针 195x53 → 390x106）；Xft.dpi（xpra 的 `--dpi`，同时写进 resource manager 与 XSETTINGS）只放大**字体**，并且与 GDK_SCALE **相乘**——GDK_SCALE=2 + 192 dpi = 4 倍文字（计算器 800x1232，GTK3 探针 796x168），所以显示器的字体 dpi = 96 × scale / GDK_SCALE（1× 与 2× 都是 96，1.5× 是 144，小数部分走 dpi）；GDK_DPI_SCALE 被 GTK4 **忽略**（计算器不变），在 GTK3 上会把 dpi 已经承载的小数再算一次——不设；客户端 hello / display-configure 里的 `dpi` **必须等于**这个字体 dpi，因为 xpra 会在客户端 dpi **变化**时把 Xft.dpi 改写成它（实测 96 → 144），若发 96 × DPR 就是 4 倍文字；xterm 的默认字体是位图 `fixed`，任何 dpi 都到不了它（Xft.dpi 96 与 192 下格子都是 6x13），Xft 字体可以（faceSize 10 下 8 → 16 px 格子）——所以 scale > 1 时 keeper 在**该应用自己的显示器**上用 `xrdb -merge` 给 XTerm/UXTerm 一个 Xft 字体（`faceName: Monospace`，`faceSize: 8 × GDK_SCALE`），2× 时 xterm 的格子是 13x26 设备 px（r1 表里的 13x27 是 100 dpi 下量的，见 r2 ④）；~~xpra 在客户端连上时会重写 resource manager~~——**r2 更正**：xpra 是在显示器起来**约 1 秒后**一次性**替换**整个资源库（与客户端无关），r1 在那之前就合并并启动了应用，见 r2 ④。Qt：QT_ENABLE_HIGHDPI_SCALING=1 + QT_SCALE_FACTOR=整数部分（小数由 Qt 从 Xft.dpi 自己推）——**本机没有 Qt 应用，未实测**。xdpyinfo 的分辨率跟随客户端的 dpi，因此是 96x96（不是 192：那会把字体翻倍）。
- **应用的最小尺寸限制 VibeSpace 窗口。** 主窗口的 size-constraints（设备 px 的 minimum-size，没有则 base-size）÷ DPR 向上取整 = 最小 pane（CSS px，`minPaneCss`）；desktop-app-window 加上窗口自己的 chrome（标题栏 + 状态条 + 边框，按 viewport 矩形测、按 UI 缩放换成 layout px）经 `WindowManager.setMinSize` 设为这个窗口的最小尺寸。规则就是终端自己的最小尺寸（`.window` 的 CSS min-width/min-height 320×180）按窗口提高：内联 min-width/min-height 管住每条改尺寸的路径（snap、网格格子、预设、最大化、布局恢复——格子比最小值小时窗口保持最小值、诚实地压到相邻格子上，从不被挤小），resize 拖动**停在最小值**（光标可以越过去，窗口不动，对边保持不动），已经打开的窗口低于新最小值时立即抬高；贴合永远不会请求低于应用最小值的几何。≤768 px 手机布局上窗口就是屏幕（CSS 强制 min 0 !important），pane 比应用最小值小时画面**缩放适配、绝不裁剪**，角标 t('Scaled to fit — the app needs at least {w}×{h}')。
- **措辞。** 后端芯片的 tooltip 说明 xpra 是什么：t('xpra streams each app window as pixels; text stays crisp at your screen’s scale')。

| 项（test-desktop-xpra-window §6，DPR 2 页面） | 实测 |
|---|---|
| 启动 xterm（`dpr: devicePixelRatio`） | 记录 `scale 2, dpi 96`；Xft.dpi 96、xdpyinfo 96x96 |
| pane 698×433 CSS | X 窗口 1395×841 = pane × 2（xterm 格子 13×27 以内）；canvas backing 1395×841 在 697.5×420.5 CSS 盒子里（r1 实测。r2：竞态修好后格子 13×26、X 1395×862；697.5 CSS 的盒子被 Chrome 重采样——18.6 % 像素不同——backing 补到 1396 ⇒ 698 CSS 后 119 万像素只差 1 个） |
| 指针 | CSS (101,57) → X (202,114)；(489,260) → (978,520) |
| 清晰度（放大冗余：每轴一相位像素可由邻居预测的程度，0 = 原生，→1 = 被放大） | r2：此分数只打印不再判定——格子高 26（偶数）时文字行的奇偶相位本身就不对称（逐像素 1:1 的画面也得 0.13），判定改为 canvas 与屏幕逐像素恒等（我们 1 / 1,193,478；对照 45.7 %）。r1：我们 0.006；对照（ratio 固定 1、scale 固定 1、不要 size-constraints 的补丁副本）0.126，canvas backing 698×433 = CSS 尺寸 |
| GNOME Calculator 2× | `minimum-size [740,1232]`（高度正好 2 × 616，宽度随字体；740 是 r1 在 100 dpi 竞态下量的，r2 起 720×1232）⇒ 最小 pane 370×616，窗口最小 372×683 layout px；向左上拖 700 px 后窗口停在 372×683、pane 370×616、应用 740×1232 完整不裁；点两次“7”，应用复制出 “77” |
| 对照：同样的拖动 | pane 318×113，X 仍把计算器留在最小值——被裁掉（owner 的截图） |
| UI 缩放 1.25 + DPR 2 | canvas 796×1232 在 398×616 CSS 盒子里（仍然 2×），pane 仍 ≥ 最小值 |
| 手机 390×844 @2 | pane 390×767 ≥ 最小值：不缩放、无角标 |
| 手机 320×568 @2 | pane 320×491 < 370×616：舞台缩放 0.797，应用整体显示为 294.9×491，角标 “Scaled to fit — the app needs at least 370×616” |

#### 7.6.1 r2 — 验证者的五条发现（2026-09-23，每条先在真实一级上复现再修；repro = 真 worktree 服务器 + 无头 Chrome，同一探针在修前/修后两棵树上各跑一遍）

| # | 发现（复现） | 根因 | 修复 | 修后实测 |
|---|---|---|---|---|
| ① | 小数 DPR（1.25/1.5/1.75）：DPR 1.5、900×800 窗口里的计算器，舞台被加了 `scale(0.999545)`、角标 “Scaled to fit” 出现在**装得下**应用的 pane 上，截图与 canvas 有 4.18 % 像素不同——模糊，“像 VNC” | `devicePane` 四舍五入：733 × 1.5 = 1099.5 → 1100，CSS 盒子 733.33 > pane 733；另外两处：Chrome 把 canvas 的绘制盒对齐到**整 CSS px**——1346 / 1.5 = 897.33… CSS 会被重采样（去掉 transform 后仍有 1.3–1.9 %），连 DPR 2 下奇数宽度的 xterm（1395 / 2 = 697.5 CSS）也是 18.6 % 像素不同、每个字形边缘变软（补到 1396 ⇒ 698 CSS 后 119 万像素里只差 1 个）；pane 在 CSS 65 处 = 设备 97.5（半像素） | `devicePane` 向下取整；舞台适配容忍 < 1 CSS px 的溢出；canvas backing 向上取到该比例的网格步长（2 ⇒ 2、1.5 ⇒ 3、1.25 ⇒ 5、1.75 ⇒ 7），CSS 盒子 = backing ÷ 比例（整 CSS px）；舞台原点推到设备像素网格上（每次适配、指针进入、窗口移动后） | DPR 1.5 三个窗口尺寸：~1.7 M 个稳定像素里只有 9 / 12 / 229 个不同；1.25、1.75 同样；DPR 2 不变；舞台恒等、无角标 |
| ② | 手机 320×568 @2：X 显示器 640×982（pane），计算器按最小值 740×1232 放在 0,0；点击发到了正确的设备坐标，但 X 把指针夹在显示器最后一行（点 “0” 后 xdotool 读到 97,981）——依次点 7…0 显示 `7894564564`，第 3–4 行和右侧一列（`=`、`mod`、`%`）点不到 | 显示器尺寸 = pane，而贴合请求的是更大的应用最小值：显示器没有**包含**它放置的窗口 | 显示器尺寸 = max(pane, 主窗口的贴合)（`displayFor`，唯一规则），`syncDisplay` 唯一发送者：hello 之后、resize、离开 Watch、refit **之前**、新主窗口 map 之前、主窗口消失 | 显示器 720×1232 ⊇ 应用；十个数字全部命中，xdotool 读到应用右下角 |
| ③ | 窗口最小值不受工作区限制：DPR-1 页面接管 2× 计算器 ⇒ 最小 742×1299，在 815 px 高的工作区上窗口被抬到 1299 高、键盘在屏幕外、不缩放、无角标，而且再也拉不小；`desktop.appScale=2` 在 1366×768 的 1× 屏幕上同样 | `setMinSize` 只按应用要的值设 | 窗口的有效最小值 = min(应用最小值 + chrome, 工作区)（`minOf(win, 工作区)`，不低于 320×180），抬高时滑回工作区内；工作区变大时（ResizeObserver 的 reflow）还给完整最小值；于是 pane 小于应用最小值 ⇒ 视图的缩放适配 + 角标（②修好后输入也能到） | 900×815 的窗口正好在 815 px 工作区里，缩放 0.607 + 角标 “…at least 720×1232”，数字全部命中 |
| ④ | 竞态：应用在 xpra 写入 Xft.dpi **之前约 1 秒**启动，而那次写入会**抹掉** keeper 合并的 XTerm* 资源——“1.5×” 的 xterm 格子 7×14（Xvfb 的 100 dpi），文档里的测量也因此不对 | xpra 在显示器起来约 1 秒后一次性**替换** RESOURCE_MANAGER（Xft.dpi、Xcursor.size…）；recipe 在 ~0.2 s 就返回 | keeper 在自己的 xpra 显示器上先等 `xrdb -query` 出现 `Xft.dpi:`（`waitForXftDpi`，异步、有界 5 s、失败只告警），再合并、再启动应用 | xterm 格子 1× / 1.5× / 2× = 6×13 / 10×19 / 13×26；客户端连上后合并的字体仍在；launch→ready 不变（1.52 s，ready 本来就等 xpra 的 HTTP 监听） |
| ⑤ | “1.5×” 让 GTK 控件在 1.25/1.5 屏幕上**变小**：GDK_SCALE=1 只有字体 144 dpi，计算器最小值 360×616 设备 px（与 1× 相同；2× 是 720×1232）——在 DPR 1.5 屏幕上是 240×411 CSS，按键只有 1× 屏幕上的 0.67 | X11 上的 GTK 没有小数 GDK_SCALE，1.5× 只放大文字 | auto 改为 DPR ≥ 1.5 取 2（1.5 屏幕上控件 1.33×、1.75 上 1.14×）、否则 1（1.25 上 0.8×）——两个整数缩放里比例上更近的那个；1.5× 保留为显式选择，标成 t('1.5× (text only in GTK apps)')，说明里写明原因 | auto 从 DPR 1.5 启动 ⇒ scale 2、dpi 96，计算器 720×1232 |

两条低优先级也修了：**主动 pane 只在最小值情形缩放**（只看主窗口、且应用有最小值——正是角标的条件；比 pane 大的对话框不再让整个画面中途跳一下缩放；Watch 仍包含所有非弹出窗口）；**窗口最小值会重新测量**（窗口元素、标题栏、状态条、pane 上一个 ResizeObserver——chrome 高度变化与窗口从 display:none 重新布局都会触发；UI 缩放变化由 `applyUiPrefs` 发出的 `vs:ui-scale` 事件触发；r1 那个 500 ms × 40 次、20 秒后放弃的重试删掉了）。

后果，照实写：DPR 1.5 的小屏（1080p 笔记本 150 %，约 1280×720 CSS）上，auto = 2× 的计算器最小高度 822 CSS 放不下，会缩放适配并显示角标——想要不缩放就选 1×（按键 0.67×，但清晰）。

Gate：test-xpra-client §6b（向下取整对 10 个比例 × 200..1400 每个宽度都不溢出、网格步长对 9 个比例 × 1..2000 每个尺寸都是整 CSS px、DPR 1.5 的恒等适配、显示器先于 map 长大、超大对话框；每条都有 r1 补丁副本做对照）；test-window-minsize（工作区上限、滑回、reflow 还原；未加上限的 r1 写法做对照）；test-desktop-apps §10（auto 表 + r1 的“取整到 0.5”做对照；等待 < 合并 < 启动的顺序钉）；heavy test-desktop-xpra-window §7（真 xpra 一级：DPR 1.5 逐像素 1:1、手机上十个数字 + 右下角、DPR-1 接管、1.5× 的 xterm 格子；对照 = 把九个 r2 杠杆全部拉回的 r1 副本）。

**诚实的限制。** xpra 仍然是**像素流**，不是矢量渲染：清晰来自“按屏幕分辨率渲染 + 1:1 显示”，文字仍可能经过有损编码（h264/jpeg 在大面积变化时）；缩放只在启动时决定（改设置要重启应用）；另一台 DPR 不同的客户端看同一个应用时，按它自己的 DPR 映射设备像素（清晰，但应用的尺寸按启动时的缩放；r2：放不进它的工作区时缩放适配并显示角标）；Qt 的旋钮未实测；vnc-display 级的画面仍是 CSS px（缩放只作用于 xpra 级——在整屏级上放大应用只会让它显得更大）。**GTK Broadway**（GTK3 自带的 HTML5 后端，把 GTK 窗口画进浏览器）记为一个可能的、只限 GTK 的未来一级，**未做**。


**Lane D (a)（2026-09-25）— 小数缩放，重新审视。** 上面"1.5× 在 GTK 里只放大文字"的规则，正是 owner 用缩放 ▸ 从 2× 重启到 1.5× 后出现大量白边的根源（控件减半、窗口不变，GNOME 计算器被夹住的内容列四周露出它自己的背景）。现在小数是**真正的**缩放：按 GDK_SCALE ⌈s⌉ 绘制、以 s ÷ ⌈s⌉ 显示（1.5 = 2 × 0.75）——按设计是**重新采样**的画面（比整数缩放略柔和）；整数缩放保持本节的 1:1 画面，浏览器行保留 dpi 规则（Chrome 按 Xft.dpi 整体缩放）。窗口在重启后保持应用的逻辑尺寸，应用最小尺寸大于 pane 时 fit 保持 pane 的形状，主窗口在第一次 fit 之前先被报出。细节、数字与 gate：docs/design-desktop-apps-seamless.zh.md §3.4 "Lane D (a)"。
### 7.7 B-bfe6 — 浏览器作为桌面应用（2.369.166；owner 2026-09-23 "应用里面也可以加入一下浏览器"；本机：google-chrome（deb）+ snap firefox 156.0-1，xpra 6.5.3）

**关系先说清。** 桌面应用里的浏览器是**人**的浏览器：一行注册表（§5——exec 绝不来自 agent），和其他应用一样走 xpra 逐窗口级，带一个由应用会话**自己拥有**的配置目录。它**不是** Agent 浏览器（design-agent-browser-v2 §3：配置在 `data/browser-*` 下，由浏览器配置 keeper 经 CDP 驱动——桌面应用浏览器没有 CDP 端口、没有任何自动化 flag），也绝不打开用户真正的配置。启动器用一句话说明，写在"Browsers"分区里，也写在每张浏览器卡片的 tooltip 里：*This is your own browser window (an app); the Agent browser is separate.*（中文：这是你自己的浏览器窗口（一个应用）；Agent 浏览器（浏览器配置）是另一回事。）

| 部分 | 位置 | 内容 |
|---|---|---|
| 行 | PURE `DEFAULT_REGISTRY` | `chromium`（chromium → chromium-browser → google-chrome，PATH 上第一个）· `firefox`（firefox → firefox-esr）；`browser` + `execs` 字段；行里不许带配置或自动化 flag |
| 选二进制 | PURE `browserRowFor(row, bins)` | `execs` 里第一个在 PATH 上的成为实际 exec 与标签（"Google Chrome"）；都不在 ⇒ `browser-absent` 并列出全部候选 |
| argv | PURE `browserArgv(row, {profileDir, url})` | chromium `--user-data-dir=<dir> --no-first-run --no-default-browser-check --password-store=basic`；firefox `--new-instance -profile <dir>`（+ `user.js` 就是它的首次运行开关）；**然后**才是 URL |
| URL | PURE `validateBrowserUrl`（对话框与服务端同一个函数） | 只允许 http/https，不含空白/控制字符，≤ 2048，否则按名 `bad-url` |
| 配置目录 | PURE `profileDirVerdict` + keeper | `data/desktop-apps/<id>/profile`，创建时 0700；必须在 keeper 自己的根下（否则 `profile-not-owned`），绝不是 $HOME 或真实浏览器的配置根（`profile-is-users`）；每条终止路径上**异步**删除，除非选了"保留配置"（开机补完被中断的删除） |
| snap | SHARED `browserConfinement` + PURE 判定 | snap 看到的是私有 /tmp，看不到 `~/.隐藏目录` ⇒ 只有数据目录在 $HOME 里的非隐藏文件夹下才提供，否则变灰 / 按名拒绝 `snap-profile-unreachable` |
| 对话框 | CLIENT 启动器 | Applications 之后的"Browsers"标题、那句说明、"Open URL (optional)"、"Keep the profile after it closes" |

**实测（test-desktop-xpra-window §8，本机真 google-chrome，从对话框启动）：** 在 xpra 级进入 ready；我们的客户端画出窗口，标题栏为 `vs-bfe6 <pid> - Google Chrome`（xpra 报告的页面标题；X 一致）；我们自己的 http 服务器收到了 URL 参数的那次 GET；运行中进程的 argv（Chrome 把自己的 /proc cmdline 改写成**一个**空格拼接的字符串）带 `--user-data-dir=<keeper 的目录>` 与该 URL，没有自动化 flag；Chrome 把配置写进了 keeper 的 0700 目录；Stop ⇒ exited、所有 pid 消失、然后删除配置。runaway 守卫的采样：两次运行分别为 **2 个进程 133 MB / 9 个进程 487 MB**（采样落在 Chrome 启动期间——是下限，不是稳态）。无论 `--user-data-dir` 怎么写，Chrome **还会**创建 `~/.config/google-chrome/Crash Reports`（它的 crashpad 数据库：settings.dat + 四个空目录）并打开 `~/.local/share/pki/nssdb`（用户共享的 NSS 证书库）（strace，2026-09-23）——两者都不是配置（没有 cookie、历史或登录）；HOME **刻意不重定向**，所以下载落在用户真正的 Downloads 文件夹。本机的 Firefox 是 snap（`/usr/bin/firefox` = 2,377 字节的脚本 → `/snap/bin/firefox`），而套件的 scratch 数据目录在 /tmp：它的启动被按名拒绝（409），窗口那条腿带着这个理由 SKIP。

**r1（2026-09-23，验证者三条）。** ① agent 的 `POST /api/agent/window/open` 曾能启动浏览器行（一个真 Chrome，agent 送来的 url/keepProfile 被**静默丢弃**），再用 `vibespace-window snapshot/click/type` 经 AT-SPI 驱动它——绕过 Agent 浏览器的全部规则（CDP 裁判、动作轨迹、强制出口代理、接管/交还）。现在 window-targets 引擎在 exec 三元组之后、问 keeper 之前，按名拒绝带 `browser` 的注册表行以及 body 里的 `url` / `keepProfile`：`browser_is_human`（403），提示 agent 去用 `vibespace-browser`；`list` 的"你可以打开的应用"不再列浏览器行。② "Keep the profile after it closes" 的复选框曾堆在文字上方（`.dialog-body label` 的纵向 flex 优先级更高）——现在 `.dialog-body label.desktop-launch-check` 横向一行。③ 变灰的 snap 浏览器卡片曾把 204 字符的英文句子塞进 10 px 单行（1512 宽只剩约 27 字符，手机上无 tooltip、也不翻译）——现在按 keeper 的 `reasonCode` 显示一句短的、翻译过的理由（"Snap: cannot reach the data folder"），整句留在 tooltip，变灰卡片的副标题最多两行。门：test-window-targets §4、test-desktop-app-window §B（1200×800 / 375×667）。

**未决。** (a) ~~2 GiB 的 runaway RSS 上限按整个会话集合计……守卫按决定不变~~ **已由 2026-09-25 owner 裁定关闭**：这正是事故本身（Chrome 就绪 3 s 后被停）；资源守卫对应用只报告不处置，内存按 ΣPss 计。(b) 保留下来的配置留在 `data/desktop-apps/<id>/profile`；目前没有"用它重新启动"的入口（记录里写着路径）。(c) Firefox 的 `user.js` 首次运行设置与非 snap 的 Firefox 本机未实测（只装了 snap）。(d) 数据目录在 $HOME 里时的 snap 浏览器本机未启动过（套件都跑在 /tmp）。(e) 人自己启动的浏览器窗口，agent 仍可 `vibespace-window attach` 到它（与其他 VibeSpace 启动的应用一样，P9 D27 (a)）——r1 只拒绝 agent **启动**浏览器；是否也拒绝 attach 要 owner 定。

### 7.8 第三轮 Lane A — 无缝复制、关闭、DPI（docs/design-desktop-apps-seamless.zh.md；owner 2026-09-23 试用 .156/.158）

精简集的 Lane A（seamless 设计 §4），在一个分支上分三块建。状态：

| 项 | 状态 | 已交付 / 下一步 |
|---|---|---|
| **A1 剪贴板**（§3.1） | **已交付**（2.369.166） | 明文 http：用户自己在 xpra pane 里按下的、可信的复制组合键打开一个 5 s 窗口；窗口内到达的应用 token 由 `execCommand('copy')` 写入，**无需点击**；其余情况保留 chip；每台设备一次的提示 "Enable HTTPS for seamless copy" 链接到 docs/getting-started.md（三条路线，产品本身不做 TLS） |
| **A2 关闭**（§3.2） | **已交付**（2.369.166） | 应用结束（自己的 ✕、退出、Stop、空闲停止）⇒ 每个客户端各自从广播关掉窗口，并弹 toast「<app> exited / stopped」；`failed` 保留红色句子、agent 租约保留窗口与标记、退出时显示器上仍留有窗口（fork 型启动器）保留窗口；布局重放遇到已死的记录不开窗；外层 ✕（及 tab ✕、任务栏菜单、Ctrl+\\ x、手机 ✕）在活跃 xpra pane 上向应用主窗口发 `close-window`，5 s 内再按一次 = Stop |
| **A3 DPI**（§3.4） | **已交付**（2.369.166） | 启动带上发起客户端的 `uiScale`；`desktop.appScale: auto` 由 `devicePixelRatio × UI 缩放` 推导（整数部分按比例就近——中点 √2 / 2√2——进 GDK_SCALE，余数只向上进字体 dpi；显式 1.5× 仍是 GTK 只放大文字）；记录带 `scaleOrigin`（auto / setting / chosen）与 `scaleFrom`，芯片写「2.5× · auto」；窗口 ⋯（及标题栏 / 任务栏菜单）Scale ▸ 自动 / 1× / 1.5× / 2× ⇒ 确认 ⇒ `POST …/relaunch`：同一个应用以新缩放先起、旧记录写 `replacedBy` 再停，同一个 VibeSpace 窗口在每个客户端上换到新会话 |

**A1 实测（2026-09-23，本机：xpra v6.5.3、GNOME Calculator 50、无头 Chrome 打开 `http://<hostname>:<port>`——不是 loopback；从安全的 loopback 页面读回：一个浏览器、一个剪贴板；test-desktop-xpra-window §9）：** 页面不是安全上下文、没有 `navigator.clipboard`；用户输入 1234 并在 pane 里按 Ctrl+C ⇒ 计算器自己的剪贴板 token **约 30 ms** 后到达视图（多次运行 28–30 ms），浏览器剪贴板读到 `1234`——零点击、没有 chip、一个 "Copied to your clipboard" toast；Ctrl+C 之后 **5.5 s** 才到的 token ⇒ chip，剪贴板不动（Chrome 的窗口是 5000 ms；M1：4800 ms 成功、5200 ms 被拒）；按了一个普通数字键**约 0.1 s** 后出现的复制（页面**有**瞬时激活，但没有复制组合键）⇒ chip，剪贴板不动——手势窗口属于用户的**复制**，不是任何一次激活；第二次 Ctrl+C 写入 `12345` 并清掉待处理的 chip。这个 origin 上的第一个 chip（§2 的 xterm 那条腿）显示了提示并记下；§9 在同一 origin 上的 chip 不再显示。

**规则的组成。** PURE `clipboardDelivery({secure, canWrite, gestureAge})` → `api | gesture | chip` 与 `GESTURE_WINDOW_MS = 5000`（picture-shell.js——xpra-proto.js 里没人用的孪生删掉）；xpra 视图的 stamp = `client.keyDown` 回答 `'copy'`（已转发给应用）且事件 `isTrusted`、不是 `repeat` 的那次 keydown；每次投递都消耗它（一次组合键，最多一次写入）；被客户端去重的 token 不消耗。`execCommand` 自己返回的 `false` 落回 chip。

**A2 实测（2026-09-24，本机：xpra v6.5.3、GNOME Calculator 50、Tk 8.6 wish、两个无头 Chrome 页面；test-desktop-xpra-window §10 + test-desktop-app-keeper §19，两次运行）：** 计算器**自己的** ✕（点在 pane 里它的 CSD 标题栏）⇒ 两个页面上的 VibeSpace 窗口都在点击后 **1028–1033 ms** 消失，各自弹「Calculator exited」；**外层** ✕（标题栏，可信点击）⇒ verdict `ask-app` ⇒ `close-window` ⇒ 计算器进程 **257–775 ms** 后消失，两个窗口 **231–750 ms** 后消失（记录 `exited`、无 `stoppedBy`、`windowsAtExit 0`——是应用退出，不是 Stop）；一个用自己的「Save?」对话框回应 WM_DELETE_WINDOW 的 Tk 应用：第一次 ✕ ⇒ 对话框画在 pane 里、两边窗口都在、toast 提示再按一次；对话框自己关掉 ⇒ 记录仍 `ready`（对话框关闭不是应用退出）；**1.5–1.8 s** 后第二次 ✕ ⇒ Stop（`stoppedBy user`）⇒ 两边窗口 **416–738 ms** 后消失，「vs-a2-tk stopped」；被 block 的 pane 的 ✕ 不去问应用（应用继续跑）；布局里存着一个窗口、无客户端时应用被停掉、新页面恢复布局 ⇒ 窗口以 `desktop-app-pending` 出生、**从未显示**、带 toast 关掉。keeper：应用自己退出 ⇒ `windowsAtExit 0`，携带它的广播在状态翻转后 **153 ms**（xpra）/ **261 ms**（vnc-display：Xvfb+x11vnc）到达；`sh -c 'xterm & sleep 3; exit 0'` ⇒ 两个级都是 **1**（fork 出的 xterm 还在）。实测事实：xpra 把受管的应用窗口放在 Corral 包装窗口里，**只有有客户端连着时**它才是 mapped——没有客户端时存活的 xterm 读成 viewable=false，所以 xpra 级只按窗口是否**存在**计数。对照组：窗口从不自关的副本 ⇒ 同一个 ✕ 之后窗口停在「Exited: application exited (code 0)」（M3c 的现状）；没有普查的 keeper 副本 ⇒ fork 型启动器的记录没有计数，verdict 会关掉一个仍在屏幕上的窗口。

**A2 规则的组成。** PURE（src/desktop-apps.js）`windowsLeftCount` / `exitCloseVerdict(rec, {leased})`（每个窗口在记录首次进入终态时**只判一次**——之后租约掉了也不再重判）/ `outerCloseVerdict` / `OUTER_CLOSE_AGAIN_MS = 5000`（设计写 10 s，本轮按 Lane A 的规格取 5 s）；keeper 在应用退出时、teardown **之前**做一次窗口普查（`EXIT_CENSUS_MS` 2000 为上限）写进 `windowsAtExit`，再 teardown、再 commit 广播——所有客户端（包括没有协议窗口可数的 blocked pane）按同一个事实判定；`WindowManager.requestClose` 是用户关闭的唯一否决点（程序性关闭——布局同步、窗口自关——永不被否决）；xpra-client `closeMain()` 只对主窗口、不在 Watch / 只读时发。

**未决（A2）。** (a) 布局是共享的：被 block 的 pane 按 ✕ 关掉窗口，会经布局同步把其他客户端的这份也关掉（与 A2 之前相同；应用继续跑）。(b) RFB 级（vnc-display / 单例）没有逐窗口协议，外层 ✕ 仍只关 pane。(c) fork 型启动器：keeper 仍在启动器退出时 teardown 整个会话（把真正的应用 pid 记为 `pids.app` 是后续项，本轮不做）——窗口保留它的句子而不是自关。

**A3 实测（2026-09-24，本机：xpra v6.5.3、GNOME Calculator 50、xterm、无头 Chrome DPR 2 + `vibespace.uiScale` 125；test-desktop-xpra-window §11 + test-desktop-app-keeper §20，各两次运行）：** 从启动器自己的目录卡片启动 ⇒ 记录 `2.5×、120 dpi、auto、from {dpr 2, uiScale 1.25}`；在应用的显示里量到计算器 environ 的 GDK_SCALE=2、资源库 `Xft.dpi: 120`（xdpyinfo 120x120），芯片「2.5× · auto」。文字那一半：同一个 40×10 的 xterm 在 2.5×（120 dpi）比 2×（96 dpi）大 1.23 倍（644×324 对 524×264 设备 px）。GNOME Calculator 的最小尺寸在 2.5× 仍是 720×1232——它由按钮决定（120 dpi 的文字放得进 2× 的按钮），所以文字倍数在 xterm 上量。⋯ → Scale ▸ 1.5× → Relaunch ⇒ 两个页面上**同一个** VibeSpace 窗口在确认后 102–103 ms 指向新会话，新会话在确认后 1534–1549 ms ready（keeper 侧 1349 ms），以 `1.5×、144 dpi、chosen` 运行（量到 GDK_SCALE=1、Xft.dpi 144，最小尺寸回到 360×616），芯片「1.5× · chosen」；旧会话 `exited` / `relaunch` / `replacedBy`，它的计算器进程已消失；每个客户端一个窗口。对照 = 用 A3 之前挑选规则（只看设置 + dpr）的 keeper 副本：同一个客户端得到 2×、Xft.dpi 96。

**A3 规则的组成。** PURE（src/desktop-apps.js）`effectiveScale(dpr, uiScale)`（夹到 1..3）/ `appScaleFor(setting, dpr, uiScale)`（auto = 文字倍数：< √2 原值、< 2 取 2、< 2√2 原值、否则 3）/ `scaleKnobs`（任意 1..3：GDK_SCALE = floor，dpi = 96 × scale / GDK_SCALE）/ `scalePick`（来源 auto / setting / chosen；重启的 auto 从**发起重启的**客户端重新推导）/ `validateRelaunchRequest` / `relaunchVerdict`（只有 ready 的 xpra 应用；浏览器应用拒绝——它的 profile 属于它自己的会话）/ `relaunchBodyOf` / `scaleMenuModel`（原因码 lease / seat / 判定码）；`exitCloseVerdict` 对带 `replacedBy` 的记录答 `relaunched`（窗口跟随，不关）。keeper `relaunch(id, body)` 先起后停；窗口 `retarget(nextId)` 重置每一个按记录的事实并换 `id` / `_desktopAppId` / `_openSpec`。

**未决（A3）。** (a) 菜单与设置只给 1× / 1.5× / 2×（auto 仍可推导到 3×，如 DPR 2 × UI 150 %）；seamless 设计里的 2.5× / 3× 显式行没做。(b) agent 租约只在客户端挡（keeper 看不到 window 租约；agent 路由到不了 `/relaunch`）。(c) Qt 的小数 QT_SCALE_FACTOR、Electron 的 `--force-device-scale-factor` 未实测（D9）。(d) vnc-display 一级不缩放（整屏按浏览器像素）。

**A r1（修复轮，2.369.166；验证者的六条，全部先复现、红腿先行）。** ① **手势复制后键盘焦点丢了**：`copyViaSelection` 的 `ta.select()` 把焦点给了临时 textarea，`ta.remove()` 把它丢到 `<body>`——复制之后按的每个键都无声消失（验证者：1234 + Ctrl+C 落地，之后 5 + Ctrl+C 毫无反应、计算器仍是 1234）。修复：写入前记住 `activeElement`、移除后 `{preventScroll:true}` 交还（拒写/抛错同样交还）。实测（§9，真 xpra 级、hostname 页面）：两次手势复制后 `activeElement` 都是 pane 的 IME；`5` **不经任何脚本 refocus** 就到了计算器，第二次复制读回 `12345`（token 在组合键后 30 ms）。② **Scale ▸ 重启把座位交给了之前被 block 的客户端**：`replacedBy` 广播先到，其他客户端先连上继任者，发起重启的客户端要等 HTTP 应答（旧会话 teardown 之后）才连，于是永远输掉首连选举。修复：keeper `carrySeat` 在提交 `replacedBy` 之前把旧窗口的活跃 pane 作为**无计时器**的 grace 放到继任者上（其他客户端连上即 blocked），旧会话 stop 之后（失败也一样）才开始 `RELAUNCH_SEAT_MS` = 10 s 的等待。实测：keeper §20 (b) 另一客户端在 teardown 期间先连、被 block 且广播已写 pL 活跃，发起者应答后连上即活跃；§11 (4) 两个真页面：选刻度的页面在继任者上 `active`、无遮罩、没按 Resume，另一页 blocked。③ **xterm 的外层 ✕**：WM_DELETE_WINDOW 是被遵守的——xterm 给子进程发 SIGHUP、子进程退了它就退；交互式 bash 第一次 ✕ 即结束（两边窗口 375–418 ms, two runs 后消失）；验证者的裸 `xterm` 跑的是 $SHELL = zsh、HOME 里没有 .zshrc，zsh 首次运行菜单扛得住 SIGHUP（Xvfb 上手测：同一个 HOME 放一个空 .zshrc 就退）——这时第二次 ✕（toast 已写明）就是 Stop；不做自动 Stop（用自己的「保存？」对话框回应的应用从外面看一模一样）。确定性替身：忽略 SIGHUP 的子进程（第一次 ✕ 后 2 s 记录仍 `ready`，3.0 s 后第二次 ✕ ⇒ Stop，两边窗口 846–847 ms 后消失）。④ 两个 lane 提交的 Co-Authored-By 行改正。⑤ 两行 CLAUDE.md 索引缩到 300 字符内。⑥ seamless 设计（中英）§3.2 与影响表、D2 行改为 5 s。门：test-vnc-view §8（73）、test-desktop-viewers §6（102）、test-desktop-apps（367）、heavy test-desktop-app-keeper §20 (b)（331）、heavy test-desktop-xpra-window §9 / §10 (3b) / §11 (4)。

**未决（A1）。** (a) 用**鼠标**复制（应用的 编辑 ▸ 复制 菜单）仍是 chip：给点击盖 stamp 会让应用里一次点击之后的任何复制（agent 的、定时器的）在用户背后写剪贴板——seamless 设计把菜单点击列为可能，等 owner 定。(b) RFB 级（vnc-display / 单例）不传 stamp（noVNC 自己管画布的按键）——chip。(c) Firefox / Safari 未实测（退路是 chip）。(d) Chrome flag 这条 HTTPS 路线是文档行为，本机未实测。

## 8. 决定（owner 已批：按建议）

| # | 决定 | 建议 |
|---|---|---|
| DA1 | 后端顺序 | `xpra` > `vnc-display` > `desktop-singleton`；装了 xpra 自动升级新会话，老会话不迁 |
| DA2 | 每应用一个显示还是共享一个 | **每应用一个**（隔离、独立 idle、独立 stop）；共享桌面只是兜底 |
| DA3 | idle 默认 | 0 = 不停（owner 2026-09-25："30分钟那个暂停也默认关掉"）；设置项 `desktop.idleTimeoutMin` 分钟数给想要停的人 |
| DA4 | 谁能起应用 | 只有人（对话框）；agent 经 P9 只能操作已开的窗口 |
| DA5 | xpra 客户端 | D21 (c) 原样 |

## 9. 未验证

1. xpra 6.5（本机）与 3.1（bookworm 镜像）的 HTML5 协议差异——x1 只测了本机 6.5.3（6.5.3 上 `--mmap=no` 会让每条连接被拒、`--commands=no` 连 `--start*` 一起关、缺失的 XAUTHORITY 文件会让它写真 ~/.Xauthority、setproctitle 抹掉自己的 environ——3.1 是否同样未测）；镜像那边仍是 OPEN，绝不从这里对机队实测。**x3 记录（2026-09-22）：deploy/docker/Dockerfile 的注释点名 3.1.3 vs 6.5.3 并指回本条；x1–x3 在 6.5.3 上实测的每条规则（包名 `display-configure`/`keyboard-config` 及其旧别名回退、native `x11_keycodes` 路径、greedy 剪贴板 token、`size_notify_clients` 的纠正规则、四个陷阱）在 3.1 上都是未知量。**
2. Wayland-only 应用（无 Xwayland 回退）在 Xvfb 下起不来——注册表行加 `needsWayland` 标记并诚实拒绝。
3. 200 ms / 1 Mbps 下 `vnc-display` 级的可用性只按 §4.7 的排名推断，未实测。
4. （x2）机队镜像的 xpra 3.1.3 及其自带 html5 客户端：窗口加载的是那台机器自己的 `Protocol.js`（包管理器保证与服务器匹配），但 hello 与报文形式是 6.5.3 的（`display-configure` / `keyboard-config` 按服务器的 packet-types 回退；native `x11_keycodes` 路径与剪贴板形式在 3.1 上**未实测**）——仍 OPEN，绝不从这里对机队实测。
5. （x2）剪贴板图片：只有文本（携带 `image/png` 的 `clipboard-token` 两个方向都忽略）。
6. （x2）应用把 override-redirect 弹出窗放到 pane 之外时，与 X 在 root 边缘的裁剪一致（Xt 按连接时缓存的屏幕尺寸摆放）——没有客户端能移动它；只有更大的 pane 能解决。
7. （x2）HiDPI：pane 的 CSS px 就是 X px（UI 缩放下 net zoom 1）；2× 屏幕看到的是 1:2 放大的应用，不是设备分辨率的渲染。**2.369.158 已关（§7.6）**：设备像素端到端 + 启动时的应用缩放；剩下的是 Qt 旋钮未实测、另一台不同 DPR 的客户端按启动缩放显示。
8. （x4；r5 已实测，2026-09-22）有窗口管理器时的贴合路径（机队镜像有 xfwm4）：用机队镜像**自带的** xfwm4 4.18（从镜像里跑，接本机一个临时 X；另经真实 keeper 跑，test-desktop-app-keeper §13 (g)，`VIBESPACE_TEST_WM_DIR`）实测。x4 的计划在那里是错的：重设父窗口的 WM 把客户窗口放进一个无名框架的下一层，并在 depth 1 留着一个**已映射**、有 class 的 5x5 "Xfwm4" 辅助窗口（-1000,-1000），depth-1 规则把它当成了主窗口。现在计划贴合的是**客户窗口**（`appWindows`），`wmctrl -i -r <客户窗口> -b add,maximized_*` 让框架恰好等于帧缓冲（xterm 1280x776+0+24，标题栏 24 px），应用自己缩放、根窗口缩放（1000x700 再回来）时 WM 都保持最大化，`appTitle` 取客户窗口自己的名字。仍然绝不从这里对机队本身实测；bookworm 的 xfwm4 4.18 就是镜像自带的那个二进制。
9. （x4）override-redirect 弹窗（菜单）与对话框在裸 X 上无法区分（都是 root 的直接子窗口）：贴合步骤只在**越界**时推回（尺寸不动）——菜单通常在帧缓冲内所以不受影响；一个被打开时越界的菜单会被移动，未观察到副作用但也未专门实测。
10. （x4 收尾）vnc-display 级的窗口**图标**：xpra 级的图标走协议（x2）；vnc-display 级只有标题（`appTitle`，来自已有的枚举）。读 `_NET_WM_ICON` 需要每个 tick 多一次 xprop spawn 再在服务端编码 PNG（spawn 的 fork 税与 RSS 成正比）——未做，OPEN。COMPOUND_TEXT 标题（没有 `_NET_WM_NAME` 的 xterm 用非 Latin-1 标题时）读不出，窗口显示 label。
11. （r8，2026-09-22 实测；**x5 已关**——`configure-window` 与 `unmap-window` 离开 watch 名单，前者保留并在接管时重放；视图决定按 owner 裁定：Watch 缩放适配、非 active 的人类观看者整个挡住，§7.5）Watch 观看者的 `configure-window` 曾会改变持有者在共享显示里的**应用窗口**尺寸：桥已经把被拒观看者的键盘映射（r7）和显示尺寸报文（r8，保留并在其接管时重放）隔开，但 `configure-window` 仍是 watch 类型——经真实桥，一个观看者的 480x360 把持有者的 xterm 从 898x589 改成 478x355，观看者离开后也不恢复（xpra seamless.py 的 `do_process_window_configure` 对任何非只读客户端都应用其几何）。隔开它之前要先定**视图**：xpra 窗口按 net zoom 1 绘制，比持有者窗口小的 Watch pane 必须缩放或裁剪画面（随附客户端乐观地贴合，否则会把更大的窗口画进更小的 canvas）。rfb 级没有逐窗口几何（noVNC 缩放整个帧缓冲）。
12. （B-bfe6，§7.7）浏览器应用：重度浏览可能触及 runaway 守卫的 2 GiB 会话 RSS（启动期间实测 133–487 MB）；保留的配置尚不能复用；Firefox 的 `user.js` 与非 snap Firefox 本机未实测。
