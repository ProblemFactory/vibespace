# 设计：桌面 v2 —— 入口、显示器选择、延迟 — q-030

owner 2026-10-12；设计台（Fable）2026-10-12。只设计，不建。≤ 2 屏；决策推荐在前。

**一句话**：「桌面」按钮变成选择器（本地 / 远程 / 最近），本地有物理桌面就影子它、没有就用自带虚拟桌面，远程 = 配对机器（从「应用」迁来，签入规则不变）；显示器选择 = **机器自己报的屏表**（新设备 op `display-facts`）+ RFB 的 ExtendedDesktopSize 两路合一张 PURE 屏表，客户端裁视口不重连；延迟先量（统计条）再改（Nagle 已派、质量阶梯、全屏键盘锁），WebRTC 直连作为 P2 给 owner 一个有数字的选项。

---

## 1 事实（生产 d8a709566 + 本次核对）
- **入口**：工具栏 `desktop.open`（src/lib/toolbar-fold.js:47；手机 mobile-nav.js:93 按 `app._vncAvailable`）→ `openDesktop`（src/lib/desktop-window.js:27，singleton，openSpec `{action:'openDesktop'}`，持久化）；配对机器的整机桌面在「应用」对话框 Run-on 行（desktop-app-launcher.js:88）→ machine-desktop.js `showMachineDesktopDialog` :213（状态、说明、Run on its desktop…、已装应用列表）/ `openMachineDesktop` :86（窗口类型 `machine-desktop`，`persist:false` :286，顶部一行说明 :97，`resizeSession:false`，每次签入 `machineViewOpts` :111）；最近运行的命令已按机器记在 localStorage（`RUNS_KEY` :30–31）。
- **noVNC 包**（public/novnc.js，由 node_modules/@novnc/novnc 打进来，**未入库 ⇒ 构建时可打补丁**）：`_handleExtendedDesktopSize` **只读第一块屏的 id/flags，其余每块跳 16 字节**（本次在包里核对）——每块屏的矩形**没有保留**；`Display.autoscale` 按 `_viewportLoc`（视口）算比例，`viewportChangePos/Size` 都在（6/4 处）；`qualityLevel`/`compressionLevel` 是可设属性（默认 6/2，vnc-view.js 未设）；`clipViewport` 与 `scaleViewport` 在 RFB 层互斥（上游源码「Disable viewport clipping if we are scaling」，包里字符串被压掉——**UNCONFIRMED** 在 1.7 是否仍如此 ⇒ 车道第一件事）。构造函数是否收 channel 对象（1.3+ 文档说收）同样待核。
- **链路**：浏览器 noVNC ⇄ WS /api/vnc（src/server/desktop-stream.js：RFB 输入筛 :105、DEV-ONLY `?netem=rtt:200,kbps:1000` :90–97 —— **现成的延迟实验台**）⇄ hub forward（desktop-access.js:136 / :1296）⇄ 设备链路 ⇄ agentd `tcp-connect`（agentd.js:2308）⇄ 机器 VNC。三个 `net` socket 无 `setNoDelay`（主开发已派 lane picture-path-nodelay）。
- **机器侧**：machine-window.js:120–136 已用 osascript JXA 读 `NSScreen.mainScreen.frame` + `backingScaleFactor` —— `$.NSScreen.screens` 就能列**每块显示器**的 frame（点）与缩放；Windows 侧 PowerShell `[System.Windows.Forms.Screen]::AllScreens`（Bounds 像素、Primary、DeviceName）。TightVNC MSI 由 src/machine-desktop-model.js:119–165 安装（有服务端「只共享某显示器」设置，注册表键名 **UNCONFIRMED**）。macOS 屏幕共享（RFB 003.889）把多屏拼成一个 framebuffer，是否下发 ExtendedDesktopSize 多屏矩形、fb 是点还是像素 —— **未量**。
- **本地物理桌面**：这台 dev 机的 seat0 是 **Wayland**（`loginctl`），x11vnc 遇 Wayland 直接退出（desktop-display.js:51）；xpra 6.5.4 的 `shadow` 有 `--backend`（pipewire 影子 Wayland —— **UNCONFIRMED**）；集群 pod 没有物理桌面。本地 rungs 表 src/desktop-backends.js（xpra / vnc-display …）。
- 设计 014 D1（kb-features.md:3154）：一机一窗、画面按缩放不 resize、签入每次问、agent 禁入——**保留**。

## 2 决策表
| # | 决策 | 推荐（理由） | 谁定 |
|---|---|---|---|
| **D1 入口形态** | 「桌面」按钮 → 选择器 | **按下弹一个 popover（不是模态）**，三组：**最近**（上次的 机器 · 显示器，Enter 即开）· **本地**（一行：有物理桌面 ⇒「这台主机的屏幕」，否则「VibeSpace 虚拟桌面」；状态词）· **远程**（每台配对的 Windows/macOS 一行：就绪 / 先设置 / 离线 + 显示器芯片「1 内建 · 2 DELL」）。「应用」对话框的 Run-on 行只留应用启动，整机桌面那行改成一条「打开它的桌面 → 桌面」的链接；`showMachineDesktopDialog` 的「Run on its desktop…」部分留在应用对话框。持久化：本地桌面窗口照旧 singleton 持久；远程不持久（签入每次问，014 D1 不变），但**最近选择**（host + display）记 localStorage，reload 后 popover 第一行就是它 | owner（形态）|
| **D2 显示器选择的退路** | RFB 没有「选显示器」请求 | 主路 = **两路合一张屏表**：① 新设备 op `display-facts`（Mac JXA `NSScreen.screens` + scale；Win PowerShell AllScreens）② RFB ExtendedDesktopSize 的矩形（客户端自己的 PURE skimmer，§3）。PURE `screenMap({fb, screens, dpr})` 把 OS 屏表换算成 fb 像素矩形，**并集 bbox ≠ fb 尺寸 ⇒ `unknown`（整屏，不猜）**。退路顺序：有表 ⇒ 裁视口；无表 ⇒ 「框选一次」（按机器 + 显示器名记矩形）；TightVNC 服务端「只共享显示器 N」**不做默认**（影响所有观看者、要重启服务、键名未核），列为 Windows 的可选机器 op | 设计台 |
| **D3 做不做 WebRTC（P2）** | 绕过 hub 桥 | **先量再定**：P0 的统计条给出 浏览器↔hub RTT、hub↔设备 RTT、更新往返（FramebufferUpdateRequest→Update）、动态帧率；Nagle 修后再看。估算 §5：~2 100 行 + 各 OS 采集编码（macOS 要 q-024 的签名 helper 或 ffmpeg+录屏 TCC；Windows ffmpeg ddagrab）+ STUN/TURN（跨 NAT 多半仍经 hub 中继，但走 SRTP/H.264 而非 RFB 矩形）。收益只在**动态画面**（滚动、视频）大：30 fps @ 3–6 Mbps、输入到画面 ≈ 1 RTT + 30–60 ms 编码；静态桌面 RFB 已够 | **owner**（看数字后）|
| **D4 Linux hub 的物理桌面 rung** | 影子 :0 | **P0 不做**。X11 seat ⇒ `x11vnc -display :0` / `xpra shadow :0` 即可成 rung `shadow`；Wayland seat（这台机、新 Ubuntu 默认）⇒ 只能 pipewire/portal 影子，xpra 6.5 是否支持 **先探**（P1 的一条探针：`xpra shadow --backend=pipewire`），不行就 popover 本地行说「这台主机的屏幕是 Wayland 会话，暂不能影子；用虚拟桌面」。集群 pod 永远是虚拟桌面 | **owner**（要不要 P1 探）|

## 3 显示器选择的路径（P0，量过的那条）
1. **屏表**：连上后 `display-facts`（机器 op，复用 machine-window 的 JXA/PS 外壳）→ `[{id, name, x, y, w, h, scale, primary}]`；同时客户端自己持有 WebSocket（把 channel 交给 noVNC——待核；不收则退回 hub 桥里加一个只读 skimmer 从 server→client 流里抽 -308 矩形，随 `/api/desktop/<id>/screens` 下发），PURE `rfbScreens(bytes)` 只认 FramebufferUpdate 里编码 -308 的矩形表。`screenMap` 合并：OS 表给名字与顺序，RFB 表给 fb 像素；只有一方时按 §2 D2 的规则。
2. **裁剪**：选中显示器 N ⇒ `Display.viewportChangeSize(w,h)` + `viewportChangePos(x,y)` + `autoscale(容器)`（包里已核：按视口算比例）；RFB 层若仍把 clip 与 scale 互斥 ⇒ **构建时补丁**（我们打包 @novnc/novnc；补丁 = `_updateClip` 在「有裁剪矩形」时不关 clip，≤ 20 行，test 钉它）。指针坐标经 Display 的视口偏移，自动正确（chrome 腿用假服务器收到的 PointerEvent 坐标证）。**切换显示器不重连**，只改视口；「全部」= 视口回整幅。选择按 (hostId, displayId) 记住。
3. **切换条**（窗口顶部一行，替代今天那句说明）：`[机器 ▾] [显示器 1 · 2 · 全部] [⤢ 全屏] [⌨ 捕获快捷键] [状态：已连接 · 48 ms · 12 fps]`；说明句折进状态芯片的 title。手机：同一行可横滚，显示器为分段控件；手势沿用 noVNC（单指=鼠标，长按=右键，双指=滚动）。
4. **探针（主开发，owner 的 Mac + Windows，不改代码）**：Node 小客户端经 hub forward 连一次，记 fb 尺寸、有无 -308、各屏矩形、Retina 系数（fb 像素 ÷ NSScreen 点）；两台各一份 JSON 存 desktop-design/q030-probe/。

## 4 延迟与 UX 计划（P1）
- **统计条**先行（P0 带上）：浏览器↔hub = WS ping/pong；hub↔设备 = 设备链路的 ping；**更新往返** = 我们的 channel 在 FramebufferUpdateRequest（type 3）出站打点、下一个 FramebufferUpdate（type 0）入站对账（PURE 计时表）；动态帧率 = 每秒 Update 数。`?netem` 台子复现 200 ms 的体感。
- **质量阶梯**（PURE `qualityPlan({moving, idleMs, kbps})`）：有输入/画面在动 ⇒ `qualityLevel 3 / compressionLevel 1`；静止 500 ms ⇒ `8 / 2`（下一次更新即高清）；慢链路（统计条量的 kbps）再降。编码仍由 noVNC 协商（Tight 优先，Mac 的 ZRLE 作对照测一次）。
- **输入**：noVNC 自带 17 ms 指针节流；键盘：全屏时 `navigator.keyboard.lock()`（安全上下文才有——又一次指向 q-029 的 H0 https）吞 Esc/Alt+Tab，按钮说明白；剪贴板：远程→本机走 `clipboard` 事件 + `deliverCopy`（已有），本机→远程 = paste 事件转 ClientCutText。
- **源端缩放**：RFB 整机桌面没有（Mac/TightVNC 都是客户端缩放，像素全传）—— 选单块显示器本身就是减半；本地 xpra 桌面已有 `--desktop-scaling`。
- Nagle：lane picture-path-nodelay 的前后数字进统计条的对照段。

## 5 WebRTC（P2，D3 的成本页）
| 部件 | 内容 | 行数（估）|
|---|---|---|
| 设备侧 | werift（纯 JS WebRTC）进 agentd；采集编码：macOS = ffmpeg avfoundation（录屏 TCC）或 q-024 的 `vs-capture` helper + VideoToolbox；Windows = ffmpeg ddagrab + nvenc/amf/x264；RTP → werift 轨道；信令走设备链路 | ~900 + helper |
| hub | 信令路由 + 同一套 human_only / 签入门；TURN（可选，hub 自带 UDP 中继）| ~300 |
| 客户端 | RTCPeerConnection + `<video>` 进同一窗口壳，统计条读 `getStats`，失败回落 VNC；**输入仍走 VNC 链**（保留输入筛与签入；P2 后期再谈数据通道）| ~500 |
| 测试 | chrome 腿两端自环（假视频轨）、信令假服务器、回落 | ~400 |
风险：机器上要有 ffmpeg（静态包 ~80 MB/OS）或 helper；macOS TCC 弹窗；NAT 穿透失败率；电池/CPU。收益条件：P0 统计条显示 更新往返 ≫ 两跳 RTT 之和，或动态帧率 < 10 fps。

## 6 分期与车道种子
- **P0 desktop-v2-entry**（~1 300 行）：WHAT = popover 选择器（PURE `pickerRows({local, machines, recent})`）+ 应用对话框的 Run-on 改链接 + `display-facts` op（JXA/PS 外壳复用）+ PURE `screenMap`/`rfbScreens` + 裁视口与切换条 + 统计条（RTT/更新往返/fps）+ 记住 (host, display) + i18n/手机。TESTS = test-desktop-picker（行、状态词、最近置顶、reload 后第一行）；test-screen-map（真值表：Mac 点×2、Windows 负坐标副屏、并集≠fb ⇒ unknown、单屏、-308 表与 OS 表矛盾 ⇒ 以 fb 为准）；假 VNC 服务器带两块屏的 ExtendedDesktopSize（扩 test-desktop-vnc-fit 的 harness）+ chrome 腿：只见第二块屏的像素、PointerEvent 坐标带偏移、切换不重连、「全部」复原、1280 + 390 PNG；op 测试用 JXA/PS 输出 fixture；machine-desktop 不持久/签入每次问 不变（回归腿）；record-clear 新字段行。控制：noVNC 补丁的突变体（去掉）⇒ 裁剪腿红。
- **P1 desktop-v2-latency**（~700 行）：质量阶梯 + 全屏键盘锁 + 粘贴到远程 + 统计条对照段（Nagle 前后）+ D4 探针（`xpra shadow --backend=pipewire`，成则 rung `shadow` 另开车道）。TESTS = test-quality-plan（真值表）；netem 台子上的 chrome 腿量阶梯切换的 SetEncodings；键盘锁只在安全上下文。
- **P2 desktop-v2-webrtc**（owner D3 后，~2 100 行 + helper）：§5。
- 验证镜头（一轮）：① 裁剪不漏别的屏的像素（PNG 差分）；② 坐标偏移在缩放 + 裁剪叠加下仍对（假服务器收点）；③ agent 仍进不了远程桌面（human_only 回归）；④ 统计条数字与 netem 设定一致（±10 ms）。

## 7 需 owner 定（推荐在前）
1. **【推荐：popover 三组：最近 / 本地 / 远程】D1 入口形态**。你会看到：按「桌面」弹一个小面板，上次用的桌面在第一行，回车就开；应用对话框里只剩启动应用。答「否」请说要模态对话框还是直接开上次的。
2. **【推荐：先量，P0 的统计条看完再定】D3 WebRTC**。答「现在就做」= P2 立项（§5 成本）。
3. **【推荐：P1 探一次】D4 这台 Linux 主机的物理桌面**（它是 Wayland 会话，只有 pipewire 影子可能行）。答「不探」= 本地永远是虚拟桌面。

## 8 落地（P0，lane desktop-v2-entry，2026-10-12，base 2baa66aaf）
- **§1 的三个 UNCONFIRMED，先在包里的 noVNC 1.7.0 量了：** ① clip 与 scale **仍互斥**（`_updateClip` 在 `_scaleViewport` 时把 newClip 置 false；不 clip 时 `viewportChangeSize` 回整幅）⇒ 构建时补丁 src/novnc-patch.js（15 行）：`rfb.vsCrop = {x,y,w,h}` 时 clip 与 autoscale 并存，切换只改视口，不重连；② `_handleExtendedDesktopSize` **只留第一块屏的 id/flags，其余每块跳 16 字节** ⇒ 同一补丁把 4 + 16·n 字节以 `vsscreens` 事件交给页面（PURE `rfbScreens`）；③ `RFB` **收 channel 对象**（Websock.attach 校验属性）⇒ 机器窗口自己开 WebSocket 交给 noVNC，出站的 FramebufferUpdateRequest 计时 —— 不需要 hub 里的 skimmer，也没有 `/api/desktop/<id>/screens`。补丁由 scripts/build-novnc.mjs 打（package.json 的 build 调它），锚点对不上就构建失败；`--unpatched` 造突变体，chrome 腿 ⑪ 证明去掉补丁裁剪腿就红。
- **D1：** 工具栏 `desktop.open` 与手机的「桌面」行 → popover（src/lib/desktop-picker.js，PURE `pickerRows`）：最近（host + display，置顶、聚焦、Enter 即开，reload 后仍第一行）· 本机（「VibeSpace 虚拟桌面」，持久单例照旧；Wayland seat 显示 D4 的说明 —— 判据 = hub 自己的 WAYLAND_DISPLAY / XDG_SESSION_TYPE，`/api/vnc/status` 的 `seat`）· 远程（就绪 / 先设置 / 离线 + 该机窗口上次映射出的显示器）。「先设置」行打开机器对话框。应用对话框的「打开它的桌面」改为「打开它的桌面 → 桌面」：**仍直接打开窗口**（inc-mv51w0ow-crw3 的 owner 要求，test-mac-ard-signin-chrome 钉着），并成为桌面选择器的最近项。远程窗口不持久、签入每次问、human_only 都不变。
- **D2 / §3：** 新设备 op `display-facts`（machine-window.js 的 JXA `NSScreen.screens` + backingScaleFactor / PowerShell `Screen.AllScreens`，DPI-aware，10 s 上限；agentd 能力位 + client 门控 + hub `displayFacts` / `linkPing` + `GET /api/desktop/machine-desktop/displays|link`，都 human_only）。PURE `screenMap`：OS 表依次试 ×1 / 共同缩放 / dpr，并集 bbox 与 fb 差 ≤ 2 px 才算对上；≥ 2 块的 -308 表对上 fb 且与 OS 表矛盾 ⇒ 以 fb（RFB）为准，一致 ⇒ OS 的名字放在 RFB 的位置上；否则 `unknown` = 只给整屏（状态芯片 title 说明）。切换条 `[机器 ▾] [1 · 2 · 全部] [⤢ 全屏] [已连接 · N ms · F fps]` 替代说明句（说明句进芯片 title），手机上一行横滚。
- **§4 统计条（P0）：** 更新往返 = 一个 FramebufferUpdateRequest 出站 → 下一个（noVNC 画完它要的更新立刻发下一个；≥ 2 s 的间隔算静止，不算延迟），fps = 最近 1 s 的请求数（PURE `clientMessages` + `updateTimer`）；浏览器 ⇄ hub = 页面对 `GET …/link` 的计时减去 hub 自报的 `took`（浏览器发不了 WS ping）；hub ⇄ 机器 = 一次 mux PING。`?netem` 台子只接在 xpra relay 上（stream-relay-rfb 没有），所以 chrome 腿 ⑥ 让假服务器每次更新晚 200 ms：读到 201 ms、5 fps。
- **没做（P0 内的退路 / 留给 P1）：** 「框选一次」（unknown 时只给整屏）、⌨ 捕获快捷键按钮（键盘锁属 P1）、TightVNC 只共享某显示器的机器 op、popover 里现取显示器芯片（只显示各窗口上次映射的）。
- **测试：** test-screen-map（30，fast）· test-desktop-picker（13，fast）· test-desktop-v2-chrome（18，heavy：picker.png / display2.png / strip.png / phone.png）。
- **P1（lane desktop-v2-latency，2026-10-12，base aae7bac78）：**
  - **质量阶梯：** PURE `qualityPlan`（src/desktop-quality.js）：输入（键、按下 / 拖动 / 滚轮；悬停不算）或画面在动（最近 1 s 里 ≥ 2 个增量请求的回答、合计 ≥ 24 KB —— 光标闪烁、时钟不算）⇒ 流畅 3 / 1；静止 ≥ 500 ms ⇒ 清晰 8 / 2，**并对当前显示的那块屏补一次非增量请求**（静止的屏不再发更新，按 3 画的部分会一直糊）。慢链路 = 最近 5 个 ≥ 32 KB 更新的速率中位数（从首字节计，不含服务器的挂起与往返）< 2000 kbps（回到 ≥ 3000 才算正常）⇒ 降一档：静止 均衡 6 / 4、在动 省流 1 / 6，条上显示「慢链路」。换档 = **一条** SetEncodings：压缩级别随质量写一起发（noVNC 每次写这两个属性各发一条）；首档随 noVNC 自己的第一条 SetEncodings。
  - **实测的坑：** 在 noVNC 的 flush() 里（我们的 channel send 包装内）写质量 ⇒ SetEncodings 被追加进正在发的队列、输入字节发两遍 —— 判定放到 send 之后的 microtask。字节加权的速率会被一次大的快刷新淹没 ⇒ 用中位数。
  - **粘贴：** Ctrl/⌘+V 不交给 noVNC（它的 keydown 会 preventDefault，被取消的键不会触发 paste —— Chrome 154 实测），浏览器的 paste 落在聚焦的 canvas 上：text/plain → ClientCutText（CRLF → LF），然后补发 V（Ctrl 在远端仍按着）。没东西可贴 ⇒ 只发 V。「粘贴」按钮留给手机。
  - **全屏 + 键盘锁：** ⤢ 全屏 = 窗口内容（条 + 画面）；安全上下文里 ⌨ 捕获快捷键 开着就 `navigator.keyboard.lock()`（全部键），关 / 退出全屏即 unlock；http 页按 ⌨ 只说要用 https 地址打开，不锁。headless Chrome 里 Esc 无论锁不锁都不退出全屏，所以重腿只能断言 lock / unlock 调用与 Esc 作为按键到达机器。
  - **对照段：** 点状态芯片展开「本次」数字 + picture-path-nodelay 记录的参考（按键 42.0 → 0.70 ms，同样的各跳，中位数）—— 只是文字，不做现场 A/B。
  - **D4 探针（只报告）：** xpra 6.5.4 的 pipewire / portal 影子后端在这台机器上加载不了（xpra-codecs-extras 的 `codecs/gstreamer/capture.py` 引入 `CSC_ALIAS`，xpra-common 的 `codecs/constants.py` 没有）；portal 每次启动都要在物理屏上点 GNOME 的共享对话框（代码里没有 restore_token）。见 /var/tmp/vibespace-lanes/desktop-v2-latency/d4-probe.md。本地仍只有虚拟桌面。
  - **测试：** test-quality-plan（24，fast，两个 RED 突变体）· test-desktop-v2-latency（23，fast：真的 vnc-view + noVNC 自己的 setter / _sendEncodings / clipboardPasteFrom / sendKey；RED：公有 setter = 2 条）· test-desktop-v2-latency-chrome（18，heavy：ladder.png / fullscreen.png / phone.png）。
