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
| `vnc-display` | 每应用一个 `Xvnc :N -localhost -rfbport <port>`（镜像里有）或 `Xvfb :N` + `x11vnc -display :N -localhost -rfbport <port>`（本机现状）+ 一个轻量 WM（`xfwm4`/`openbox` 有则用，无则裸） | 否（整显示，但显示里只有这一个应用） | 否 | `Xvnc` 或 `Xvfb`+`x11vnc` | 今天两边都能跑的那一级，P8-1 先落这级 |
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
| **P8-2** | `xpra` 级端到端：D21 (c)——先托管上游 HTML5 客户端做验证切片（200 ms / 1 Mbps 实测写进 kb），再用 `xpra-html5-client` 在 `desktop-app-window` 里自己画；逐窗口标题/图标 | 4–7 |
| **P9** | 见 browser 设计 §4.9：`src/window-targets.js` 复用 `desktop-display.js` 的枚举，`vibespace-window` CLI | 按原排期 |

## 8. 决定（owner 已批：按建议）

| # | 决定 | 建议 |
|---|---|---|
| DA1 | 后端顺序 | `xpra` > `vnc-display` > `desktop-singleton`；装了 xpra 自动升级新会话，老会话不迁 |
| DA2 | 每应用一个显示还是共享一个 | **每应用一个**（隔离、独立 idle、独立 stop）；共享桌面只是兜底 |
| DA3 | idle 默认 | 30 min 无输入即停；设置项 `desktop.idleTimeoutMin`，0 = 不停 |
| DA4 | 谁能起应用 | 只有人（对话框）；agent 经 P9 只能操作已开的窗口 |
| DA5 | xpra 客户端 | D21 (c) 原样 |

## 9. 未验证

1. xpra 6.5（本机）与 3.1（bookworm 镜像）的 HTML5 协议差异——P8-2 两边都要实测。
2. Wayland-only 应用（无 Xwayland 回退）在 Xvfb 下起不来——注册表行加 `needsWayland` 标记并诚实拒绝。
3. 200 ms / 1 Mbps 下 `vnc-display` 级的可用性只按 §4.7 的排名推断，未实测。
