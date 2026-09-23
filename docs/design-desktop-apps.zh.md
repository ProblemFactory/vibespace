# 设计：通用桌面应用窗口（浏览器内 X11 渲染）

> owner 2026-09-13："顺便把通用桌面 app 支持（浏览器 based X11 渲染啥的）都支持一下，注意维护良好的代码结构确保后续可维护性，组件合理拆分。"
> 本文是 docs/design-agent-browser-v2.zh.md §4.7（原生客户端窗口）与 §4.9（窗口目标）的**实现规范**，把"一个原生窗口"推广成"任意本地桌面应用"。它取代原 P8 的范围；P9/P10（agent 操作窗口）建立在它之上。英文孪生：docs/design-desktop-apps.md。

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
| ORCH | `src/server/desktop-app-keeper.js` | 生命周期：spawn（setsid、detached）X 显示 → 应用 → 画面服务器；`data/desktop-apps.json` 原子写 + `desktop-apps-updated` 广播；开机**收养**（按 pid+starttime+端口）；数量上限、runaway 守卫（>150% CPU 5 min 或 RSS 上限 ⇒ 停 + park + 通知，与 opencode-serve 的守卫同形）；每应用 idle timeout；stop/kill；退出即广播 | 不认识具体应用；不碰 ws |
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
- 每应用 idle timeout（默认 30 min 无输入 ⇒ 停，状态栏可见倒计时；"保持运行"是一次显式动作）。

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

## 8. 决定（owner 已批：按建议）

| # | 决定 | 建议 |
|---|---|---|
| DA1 | 后端顺序 | `xpra` > `vnc-display` > `desktop-singleton`；装了 xpra 自动升级新会话，老会话不迁 |
| DA2 | 每应用一个显示还是共享一个 | **每应用一个**（隔离、独立 idle、独立 stop）；共享桌面只是兜底 |
| DA3 | idle 默认 | 30 min 无输入即停；设置项 `desktop.idleTimeoutMin`，0 = 不停 |
| DA4 | 谁能起应用 | 只有人（对话框）；agent 经 P9 只能操作已开的窗口 |
| DA5 | xpra 客户端 | D21 (c) 原样 |

## 9. 未验证

1. xpra 6.5（本机）与 3.1（bookworm 镜像）的 HTML5 协议差异——x1 只测了本机 6.5.3（6.5.3 上 `--mmap=no` 会让每条连接被拒、`--commands=no` 连 `--start*` 一起关、缺失的 XAUTHORITY 文件会让它写真 ~/.Xauthority、setproctitle 抹掉自己的 environ——3.1 是否同样未测）；镜像那边仍是 OPEN，绝不从这里对机队实测。**x3 记录（2026-09-22）：deploy/docker/Dockerfile 的注释点名 3.1.3 vs 6.5.3 并指回本条；x1–x3 在 6.5.3 上实测的每条规则（包名 `display-configure`/`keyboard-config` 及其旧别名回退、native `x11_keycodes` 路径、greedy 剪贴板 token、`size_notify_clients` 的纠正规则、四个陷阱）在 3.1 上都是未知量。**
2. Wayland-only 应用（无 Xwayland 回退）在 Xvfb 下起不来——注册表行加 `needsWayland` 标记并诚实拒绝。
3. 200 ms / 1 Mbps 下 `vnc-display` 级的可用性只按 §4.7 的排名推断，未实测。
4. （x2）机队镜像的 xpra 3.1.3 及其自带 html5 客户端：窗口加载的是那台机器自己的 `Protocol.js`（包管理器保证与服务器匹配），但 hello 与报文形式是 6.5.3 的（`display-configure` / `keyboard-config` 按服务器的 packet-types 回退；native `x11_keycodes` 路径与剪贴板形式在 3.1 上**未实测**）——仍 OPEN，绝不从这里对机队实测。
5. （x2）剪贴板图片：只有文本（携带 `image/png` 的 `clipboard-token` 两个方向都忽略）。
6. （x2）应用把 override-redirect 弹出窗放到 pane 之外时，与 X 在 root 边缘的裁剪一致（Xt 按连接时缓存的屏幕尺寸摆放）——没有客户端能移动它；只有更大的 pane 能解决。
7. （x2）HiDPI：pane 的 CSS px 就是 X px（UI 缩放下 net zoom 1）；2× 屏幕看到的是 1:2 放大的应用，不是设备分辨率的渲染。
8. （x4；r5 已实测，2026-09-22）有窗口管理器时的贴合路径（机队镜像有 xfwm4）：用机队镜像**自带的** xfwm4 4.18（从镜像里跑，接本机一个临时 X；另经真实 keeper 跑，test-desktop-app-keeper §13 (g)，`VIBESPACE_TEST_WM_DIR`）实测。x4 的计划在那里是错的：重设父窗口的 WM 把客户窗口放进一个无名框架的下一层，并在 depth 1 留着一个**已映射**、有 class 的 5x5 "Xfwm4" 辅助窗口（-1000,-1000），depth-1 规则把它当成了主窗口。现在计划贴合的是**客户窗口**（`appWindows`），`wmctrl -i -r <客户窗口> -b add,maximized_*` 让框架恰好等于帧缓冲（xterm 1280x776+0+24，标题栏 24 px），应用自己缩放、根窗口缩放（1000x700 再回来）时 WM 都保持最大化，`appTitle` 取客户窗口自己的名字。仍然绝不从这里对机队本身实测；bookworm 的 xfwm4 4.18 就是镜像自带的那个二进制。
9. （x4）override-redirect 弹窗（菜单）与对话框在裸 X 上无法区分（都是 root 的直接子窗口）：贴合步骤只在**越界**时推回（尺寸不动）——菜单通常在帧缓冲内所以不受影响；一个被打开时越界的菜单会被移动，未观察到副作用但也未专门实测。
10. （x4 收尾）vnc-display 级的窗口**图标**：xpra 级的图标走协议（x2）；vnc-display 级只有标题（`appTitle`，来自已有的枚举）。读 `_NET_WM_ICON` 需要每个 tick 多一次 xprop spawn 再在服务端编码 PNG（spawn 的 fork 税与 RSS 成正比）——未做，OPEN。COMPOUND_TEXT 标题（没有 `_NET_WM_NAME` 的 xterm 用非 Latin-1 标题时）读不出，窗口显示 label。
11. （r8，2026-09-22 实测；**x5 已关**——`configure-window` 与 `unmap-window` 离开 watch 名单，前者保留并在接管时重放；视图决定按 owner 裁定：Watch 缩放适配、非 active 的人类观看者整个挡住，§7.5）Watch 观看者的 `configure-window` 曾会改变持有者在共享显示里的**应用窗口**尺寸：桥已经把被拒观看者的键盘映射（r7）和显示尺寸报文（r8，保留并在其接管时重放）隔开，但 `configure-window` 仍是 watch 类型——经真实桥，一个观看者的 480x360 把持有者的 xterm 从 898x589 改成 478x355，观看者离开后也不恢复（xpra seamless.py 的 `do_process_window_configure` 对任何非只读客户端都应用其几何）。隔开它之前要先定**视图**：xpra 窗口按 net zoom 1 绘制，比持有者窗口小的 Watch pane 必须缩放或裁剪画面（随附客户端乐观地贴合，否则会把更大的窗口画进更小的 canvas）。rfb 级没有逐窗口几何（noVNC 缩放整个帧缓冲）。
