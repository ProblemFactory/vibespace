> 中文版 — 与英文原稿 docs/design-agent-browser-v2.md 同步于 96b05c56；以英文版为准的只有代码标识符。

# Agent-browser 系统 v2 — profile、隔离，以及一个由 VibeSpace 自己拥有的实时视图

**状态：** 仅为设计（DESIGN ONLY）。这里没有任何一行产品代码存在。没有一样东西已经发布，
也不要把这里的任何内容读成对当前行为的描述。

**Owner 的请求（三部分，按原意逐条）：**（1.a）加入一个指纹浏览器 (fingerprint browser)，
比如 CloakBrowser，以扩大 agent 能够访问的站点集合；（1.b）一套更好的 profile 体系 ——
不同任务拿到不同的 profile，并发且互不干扰地运行，*同时*一个 profile 可以被多个会话同时驱动，
像多个窗口那样，终结今天这种互相干扰；（1.c）把浏览器的画面放进 VibeSpace 里，让用户看着
agent 干活并且能亲手介入 —— 参考 Codex desktop 是怎么做的。

**基线：** master @ `9516bd8d`（2.369.87）。

**阅读顺序：** CLAUDE.md 的三层路由表决定这里每一块落在哪；§ban-safety、spawn 卫生律和
"永不阻塞事件循环"约束它；fork 税的实测（2026-09-10）定下了"谁有资格 spawn 一个进程"这条规矩。
**第二轮（2026-09-09）** 回应了对第一轮的对抗式批评 —— 八条 finding，全部成立，外加在核实它们
的过程中发现的三个缺陷；核实证据以及批评自身两处不精确的子主张放在 **附录 B**。对读过第一轮的
读者影响最大的改动是：§3.2 长出了一个 user-data-dir 的*决定*（第一轮指定了一个根本无法工作的
配置），§4.3.1 是新增的（往一个对话里发公告就是一个计费 turn，本设计欠它一道门），§3.4 不再
声称租约 (lease) 是一条边界，§10 公布的是一个区间而不是一个点估计。

---

## 0. 论点

今天，一个想用浏览器的 agent 会去跑一个 VibeSpace 从来没听说过的 CLI，打在一个所有其它 agent
也都在用的、单一的共享 profile 上。VibeSpace 什么都没贡献，因此什么都保护不了：它说不出那个窗口
是谁的，没法把正在发生的事展示给用户，也拦不住一个 agent 去关掉另一个 agent 的标签页。

解法不是自己写一个浏览器。上游已经把我们需要的每一个硬原语都发出来了 —— 隔离的会话、共享浏览器
内部的"一会话一标签页"绑定、带输入通道的 localhost 流服务器、provider。缺的是一个 **owner**：
一个知道哪个 profile 属于哪个任务、给每个会话发一个它有权触碰的标签页、让进程恰好活它该活的那么久、
并且透过 VibeSpace 自己的鉴权把画面渲染出来好让用户观看和接手的东西。

那个 owner 就是 VibeSpace。本文档就是它的规格。

三句话撑起整个设计：

1. **一个 VibeSpace 会话默认拿到自己的浏览器。** 隔离是默认值，不是一个选项，而它的代价是
   **四个环境变量**（在 spawn 时设）—— 没有我们的新进程，没有新守护进程。第一轮说的是"两个"；
   §3.2 说清楚另外两个（user-data-dir 和一个显式的 idle timeout）为什么不是可选的，以及其中第一个
   为什么是一个 owner 要做的决定（D12），而不是本文档可以不表态的东西。
2. **一个 profile 就是一个浏览器；一个会话是它里面的一个标签页。** "多个会话共用一个 profile"
   就是一个浏览器里的多个 pinned 标签页，每个恰好属于一个会话，配一份租约，于是两个会话永远不可能
   驱动同一个标签页。
3. **画面是一个由服务端桥接喂养的 VibeSpace 窗口** —— 和现有 `/api/vnc` 桥接同一个形状 ——
   于是流端口永远不会到达浏览器，流 token 永远不会到达 agent。

---

## 1. 今天实际存在的东西，实测

### 1.1 干扰的机制

Agent 直接从自己的 shell 里调 `agent-browser` CLI。完全没有任何 VibeSpace 集成：没有路由，没有窗口，
没有注册表，没有环境变量。在整棵被跟踪的树上 `git grep agent-browser` 返回 **恰好一处命中，而且那是一条注释** ——
`docs/screenshot-helper.js` 第 2 行，"Run via browser console or inject via agent-browser"。没有一行产品代码
曾经知道这个工具存在。

这台机器上的用户级配置是：

```json
{
  "args": "--no-sandbox,--disable-blink-features=AutomationControlled,--ozone-platform=wayland",
  "profile": "/home/<user>/.agent-browser/default-profile",
  "headed": true
}
```

那个文件不是"建议性"的。CLI 自己的 `--help` 写明了优先级，而这是本文档余下部分必须建在其上的事实：

> 从低到高优先级：1. `~/.agent-browser/config.json`（用户级默认值）·
> 2. `./agent-browser.json`（项目级覆盖）· 3. **环境变量（覆盖配置文件的值）** ·
> 4. CLI 标志（覆盖一切）

所以，出现在那个文件里的一个 key 会作用于**每一次**没有覆盖它的调用，而环境变量**确实是**一种合法的覆盖 ——
这正是 P0 之所以可能的原因，也正是 P0 必须对 `profile` 表态而不能绕过它的原因（§3.2）。

那个文件的三个属性造成了 owner 描述的每一个症状：

* **`profile` 是单一一条路径。** 每个没有传 `--profile` 的 agent 都落在同一个 Chromium user-data-dir 里：
  一个 cookie 罐，一份历史，一个窗口。
* **没有设 `session`，** 所以每个没有传 `--session` 的 agent 都落进那个 profile 的*默认*会话 ——
  同一个浏览器上下文，而且在上游的标签页绑定出现之前，是同一个活动标签页。两个 agent 交错发命令，
  就是在轮流从对方手里抢走活动标签页；`agent-browser close` 对两边都是关闭；`close --all` 会关掉
  这台机器上的每一个会话。
* **Wayland 桌面上的 `headed: true`** 意味着窗口是真实的、在桌面会话里可见的 —— 这就是为什么这种干扰
  对用户是*看得见的*，也是为什么桌面 VNC 窗口一直是唯一一种有人能看着 agent 浏览网页的方式。

### 1.2 蔓延，实测

这台机器上的 `~/.agent-browser`：**59 个目录，其中 53 个是 profile 目录，共 98 GB，其中 6.8 GB
是那一个共享的 `default-profile`。** 那 53 个 profile 目录是那些*确实*知道要传 `--profile` 的 agent
留下的化石记录：一个任务一个，临时创建，从不注册，从不回收，也从来没在任何地方被描述过。它们证明了
"每个任务一个 profile"这个直觉是对的，也证明了没有任何东西拥有它的结果。

2026-09-09 重新测量：59 个目录（其中 56 个带有 Chromium 的 `Default/` 或 `Local State`），仍然 98 GB，
`default-profile` 仍然 6.8 GB。这些计数会自己往上漂，而这正是重点。

**对第一轮的更正，已对着安装的二进制核实。** 第一轮写道没有浏览器守护进程在跑，"与上游 1 小时的
idle timeout 一致"。这个推断在我们实际拥有的这个 build 上不成立：0.32.0 自己的 `--help` 说
`AGENT_BROWSER_IDLE_TIMEOUT_MS  Auto-shutdown daemon after N ms of inactivity (**disabled by
default**)`。1 小时的默认值是在 0.33.1 才到的（§1.3）。所以在这台机器上，今天，**没有任何东西
会把一个 agent 的浏览器关掉** —— 守护进程不在，意味着最近没人用过它，或者别的什么东西把它杀了，
而不是某个超时把它回收了。§1.2 关于磁盘说的一切仍然成立；那句关于 CPU 的话是一个没有支撑的解释，
而 P0 的资源包线（§3.2）在定尺寸时没有用到它。

**一个浏览器在这里的常驻成本，2026-09-09 实测，没有启动任何东西**（四个空闲的 headless Chromium
实例，是本仓库自己的 headless-chrome 测试腿留下的 —— 这本身就是 gate 卫生笔记在跟踪的那个泄漏）：

| 每个 Chromium 实例 | 实测 |
|---|---|
| OS 进程数 | **6**（browser、2 个 zygote、gpu、network service、renderer） |
| 6 个进程 RSS 之和 | **573 MB – 1.07 GB** |
| 6 个进程 PSS 之和（诚实的那个数字 —— Chromium 大量共享） | **420 – 667 MB** |
| 持有的 inotify **instance** 数 | **2**（browser 进程 + network service） |

最后一行是最先咬人的那个：这台机器上 `fs.inotify.max_user_instances` 是**每 uid 128**，而 gate 卫生
笔记记录过套件在 122/128 就开始变红。十二个并发的、每会话一个的浏览器就是 24 个 instance —— 天花板的
五分之一 —— 而这还是叠加在已经各自持有一个的每个守护进程、watcher 和泄漏的 fixture 之上。§3.2 把
这些数字变成一个上界。

把注意事项写出来，免得这些数字被过度解读：这些是坐在测试 fixture 上*空闲*的 *headless* 实例。一个显示
真实页面的 headed Chromium 更重，而且两个数字都会随标签页增长。P0 发布之前该做的测量是同一件事，在
k = 1、4、12 上，用 P0 实际传的那套标志（§9、§12.10）。

### 1.3 已安装版本 vs 最新版本

已安装：**0.32.0**。最新：**0.37.1**。这个差距很关键，因为对 (1.b) 而言最重要的那一个原语是在
**0.34.0** 落地的，而它*不在*已安装的 build 里（0.32.0 上的 `agent-browser --help` 里 `pin-tab`
出现零次）。

| 版本 | 它给本设计带来什么 |
|---|---|
| 0.33.1 | 守护进程 **idle timeout，默认 1 小时**（`--idle-timeout`、`AGENT_BROWSER_IDLE_TIMEOUT_MS`、`0` 关闭）。headed 以及用户手动 attach 的浏览器豁免。这就是为什么今天一个无主的浏览器不会无限累积。 |
| 0.33.2 | 流服务器 **输入优先级**（读任务从写循环里拆出来，于是一次点击不会排在一次帧写入后面）、每客户端的 `{"type":"config","maxFps":N}`（1–120，0 = 不限）和可选开启的 `{"type":"config","pacing":"ack"}`；两者都可以在连接 URL 上设（`?pacing=ack&maxFps=10`）；帧带单调递增的 `seq`；`AGENT_BROWSER_STREAM_QUALITY` / `_MAX_WIDTH` / `_MAX_HEIGHT`。**帧投递是"最新者胜"。** |
| **0.34.0** | 共享 Chrome 下的**持久 session→tab 绑定**。每会话 `--pin-tab`；被外部关掉的标签页返回一个稳定的 `tab_gone` 错误，而不是悄悄接管邻居的标签页；JSON 带 `data.targetId`（跨守护进程重启保持稳定）和 `data.lastUrl`。明确修复了"并行会话共用一个 Chrome 时互相劫持标签页"。**这就是 (1.b) 的机制。** |
| 0.35.0 | `--ca-cert` / `AGENT_BROWSER_CA_CERT` —— 把私有代理 CA 的信任装进一个隔离的 NSS store（如果某个 profile 走在一个做 MITM 的企业代理后面，这就重要）。 |
| 0.35.2 | Dashboard / 反向代理加固：针对 DNS rebinding 和表单/头部走私的同源来源强制校验；被反向代理的 origin 需要精确的 HTTPS 白名单**加上生成的 token 鉴权**；无 token 的 loopback 仍然允许。 |
| 0.37.0 | `record start` / `record restart`，经 `Page.startScreencast` 以 **30 fps** 录制，`--fps 1-60`，WebM/MP4，`doctor` 会报告 ffmpeg 情况。新标签页在**首次导航之前**继承会话的 headers / credentials / UA / locale / timezone / geo / routes / init-scripts。 |
| 0.37.1 | Windows headless 隔离；守护进程退出或被强制终止时清理进程。 |

**本设计的版本下限：任何涉及共享 profile 的东西 ≥ 0.34.0；任何非 loopback 暴露之前 ≥ 0.35.2；
录制需要 ≥ 0.37.0。** 建议钉在 **0.37.1**，并把这个下限当作一个被检查的前置条件，而不是一个假设
（§9、§11 D1）。

### 1.4 白拿的原语（已对着已安装 build 自己的文档核实）

* `--session <name>` / `AGENT_BROWSER_SESSION` —— 隔离的上下文：cookie、local/session storage、
  IndexedDB、cache、历史、标签页。
* `--namespace <name>` / `AGENT_BROWSER_NAMESPACE` —— 隔离**守护进程 socket 和 restore-state
  目录**。一个 socket 路径一个守护进程；不同的 namespace 就是不同的守护进程。
* `--profile <name|path>` / `AGENT_BROWSER_PROFILE` —— 持久的 user-data-dir。
* `--restore` —— 按会话名为键自动保存/恢复 cookie + storage，配 `--restore-check-url|-text|-fn`
  校验和周期性自动保存（`AGENT_BROWSER_AUTOSAVE_INTERVAL_MS`，默认 30 秒）。
* `session id --scope worktree --prefix <p>` —— 一个*稳定的、派生出来的*会话 id。这是上游自己给
  agent 推荐的默认做法，因为并行 agent 运行就是靠 worktree 来编排的。我们**刻意不用**它（§3.2）。
* `--cdp <port|url>` / `AGENT_BROWSER_CDP`、`connect <port>`、`get cdp-url`、`--auto-connect`。
* `stream enable [--port]` / `disable` / `status`；`AGENT_BROWSER_STREAM_PORT`。串流是会话作用域的，
  而且在当前的 build 上总是在一个由 OS 分配的 localhost 端口上可用。
* `--allowed-domains` / `AGENT_BROWSER_ALLOWED_DOMAINS`、`--action-policy`、`--confirm-actions`、
  `confirm` / `deny`。
* `-p <provider>`（browserbase、browserless、kernel、browseruse、agentcore、ios）以及
  `plugin add` provider 插件 —— 这就是一个新 provider 接进来的形状。
* `auth save|login`、`--credential-provider <plugin>` —— 凭据由一个插件解析，永不回显。
* `mcp` stdio 服务器，万一我们哪天更想用 MCP 工具而不是 CLI。

### 1.5 塑造安全一节的那条约束

来自已安装 build 自己的 `--help` 和 `trust-boundaries.md`：

> `--allowed-domains` … **拒绝 CDP、auto-connect、profile、restore/state 回放**、
> 直接页面（direct-page）provider、不安全的启动参数、iOS/Safari

第二轮从已安装二进制自己的拒绝字符串里逐条枚举出来（`grep -a` 打在 `bin/agent-browser-linux-x64` 上），
因为 §6.3 恰恰取决于这个清单里到底有哪些标志：

```
--allowed-domains is not supported with --profile because Chrome may restore existing pages
                                       before network containment is installed
--allowed-domains is not supported with --cdp / --auto-connect  (same reason)
--allowed-domains is not supported with --state/storageState because loading state replays
                                       saved origins
--allowed-domains is not supported with --args containing <unsafe startup args>
--allowed-domains is not supported with direct-page browser providers / the Safari provider /
                                       the iOS provider
```

**`--session` 不在这个清单里** —— 一个没有 profile、没有 state 文件、没有 CDP 的隔离会话是可以
带域名白名单的。那一个"缺席"正是 §6.3 立足之处，也正是为什么 §1.1 里的 `profile` key 不是一个细节：
只要它还生效，这台机器上*每一次*默认调用就已经落在被拒绝的那一类里了。

这不是 bug，这是诚实：当 agent-browser 不是自己启动那个上下文时，它没法在页面脚本运行之前把它的
网络围栏装上。**对我们的后果：一个按任务的域名白名单和一个持久的已登录 profile，在浏览器这一层
是互斥的。** 任何同时承诺这两样的设计都在撒谎。§6.3 说我们改做什么。

同一个文件还写了两条我们整个继承下来的规则：**页面内容是不可信数据，绝不是指令**，以及
**秘密不进模型**（优先用基于文件的 cookie 导入；永不回显一个 cookie 值；HAR 文件和截图都是秘密）。

### 1.6 fork 税（为什么服务器几乎从不 spawn）

在这台机器上实测（2026-09-10，`forkcost.js`）：`child_process.spawn()` 会因为 fork() 的页表复制而
阻塞调用线程，时长与父进程 RSS 成正比 —— **45 MB 时 1.8 ms，543 MB 时 18.8 ms，1.5 GB 时 72.5 ms** ——
而两个生产服务器都坐在 1.5–2 GB。一个让 VibeSpace 服务器每次浏览器动作都去 shell out 调 `agent-browser`
的设计，每个动作要付大约 70 ms 的事件循环阻塞，那就是那次把用户 UI 卡了 11–17 秒的 session-discovery
事故的重演。

**这里采纳的规矩：服务器每个 profile 启动最多 spawn 一次浏览器进程，绝不按动作 spawn。**
Agent 从它们自己的 shell 里驱动浏览器，那里的 fork 成本是它们自己的，而且很小。服务器的稳态工作
就是一个 WebSocket 桥接和一次 JSON 文件写入。

---

## 2. 三个问题，写成不变量

| # | 问题 | 本设计必须让它成真的不变量 |
|---|---|---|
| I1 | Agent 共用一个 profile 和一个 session | **一个什么都没要求的会话，拿到一个别人碰不到的浏览器。** 隔离是默认值，且不需要 agent 知道任何事。 |
| I2 | Agent 在一个共享 profile 内部互相踩 | **一个标签页在任一时刻恰好有一个 owner。** 打开、导航和关闭都被限定在你自己的标签页上；别人的标签页不会**被意外**够到，而 `close` 永远不意味着"关掉所有人的"。"被意外"这三个字是承重的：在一个浏览器内部，这是一个协作协议，不是一条被强制执行的边界，直到 §6.5 的代理存在为止（§3.4 精确地说明了这一点）。 |
| I3 | 用户既看不见也介入不了 | **agent 在看什么，用户就能透过 VibeSpace 自己的鉴权一起看，并且能通过一次可见、可逆的模式切换拿走控制权。** |
| I4 | （隐含）没有任何东西拥有生命周期 | **每个浏览器进程都有一个具名的 owner、一个有界的生命期和一个可见的状态；每个*由 VibeSpace 启动的*浏览器进程还额外有一道资源守卫。** 这个拆分是刻意的，而且它是诚实的那一半：P0 的浏览器是由 agent 自己的 CLI 启动的，所以 keeper 看不见它们。P0 能给它们的是那个*上界*（一个显式的 idle timeout，§3.2.3）和那个*名字*（`vs-<browserKey>`）；守卫和被强制执行的天花板要等 P1 的 keeper。P0 到 P1 之间，默认路径是有界但无守卫的，而这一点是被写出来的，不是被暗示的。 |
| I5 | （隐含）扩大站点访问面 | **指纹规避是每个 profile 自己的 provider 选择，绝不是全局默认，也绝不是第一个答案** —— 对任何有账号的站点，通过实时视图做一次人工登录都胜过它。 |

---

## 3. 架构

### 3.1 四个对象

```
PROFILE            a browser identity: user-data-dir + provider + fingerprint seed + proxy
  └─ BROWSER       at most one running process per profile, owned by VibeSpace, with a CDP url
       └─ TAB      one per attached VibeSpace session, pinned, leased to exactly one owner
            └─ VIEW  N viewers (browser windows / clients) over one server-side bridge
```

* **PROFILE** 是持久状态，以及 `data/browser-profiles.json` 里的一条记录。
* **BROWSER** 是一个进程，带 keeper、失控守卫和 idle timeout。
* **TAB** 是所有权的单位。`--pin-tab` 在 CLI 这一层让它成真；租约在 VibeSpace 这一层让它可被执行。
* **VIEW** 是一个窗口类型；多个观看者共享一条上游流连接。

### 3.2 会话模型 —— 默认是四个环境变量，其中一个是一个决定

在 spawn 时（`src/ws-create.js`，就是那段已经在设 `VIBESPACE_API`、`CLAUDE_WEBUI_SESSION_ID`
和每会话 `vsst_` token 的语句块），一个打开了集成的会话还会额外拿到：

```
AGENT_BROWSER_SESSION=vs-<browserKey>
AGENT_BROWSER_NAMESPACE=vs-<browserKey>
AGENT_BROWSER_IDLE_TIMEOUT_MS=<bound, §3.2.3>
<the user-data-dir decision, §3.2.2>
```

仍然没有我们的进程、没有路由、没有守护进程 —— 但第一轮把它叫做"两个变量"，而那句话藏了三个缺陷：
那个**值**是错的（它取的那个 key 每次 resume 都会变，§3.2.1），还有两个变量是**缺失的**，
而它们各自独立地决定 P0 到底能不能工作（user-data-dir，§3.2.2；idle timeout，§3.2.3）。
这三个都不是细节：第一个每次 resume 泄漏一个浏览器，第二个让整个配置不可能成立，第三个让这个功能
创造出来的每一个浏览器都没有任何东西去回收它。

#### 3.2.1 `browserKey` 是那个对话，而 webui id 不是它

第一轮写的是 `vs-<webuiId>`，理由是"我们的身份是对话，不是目录"。理由是对的，而拼写和它矛盾：
`src/ws-create.js` 铸的是

```js
const seq = ++sessionCounterRef.value;
const id  = 'sess-' + seq + '-' + Date.now();          // ws-create.js:233-234
```

而且就在处理 resume（`data.resume && data.resumeId`）和 fork 的**同一个 `create` case 里面**。
CLAUDE.md 独立地陈述了同一个事实 —— "一个对话 ⇒ 跨 resume 有多个 key"。所以用 `vs-<webuiId>`，
**每一次 resume 都是一个新浏览器**：一个新 namespace，一个新守护进程，一个新的 pinned 标签页，
外加一份磁盘上、指名了一个再也不会有人去查的会话 id 的租约。而由于一份活着的租约恰恰就是那个把
`AGENT_BROWSER_IDLE_TIMEOUT_MS=0` 设上去的东西（§3.5），这个泄漏就不只是不整洁 —— 那份陈旧的租约
被读成"活着"，于是撑着一个 Chromium 不退出，而没有任何东西被指定去回收它。

修法就是本仓库已经有的那把梯子，用来回答"一个对话自己的值要活过 resume"：

* `browserKey` 只铸**一次**，`bk-<8 hex>`，写进那个会话的 `session-meta`。
* 当一次 create 带着 `data.resume && data.resumeId && !data.fork` 时，服务器去解析出先前那个 key：
  `data.resumeId` 是*对话* id，`session-meta` 的文件名带着 webui key，而 `reading-repair.js` 的
  `_sessionKeyMap(dataDir)` 就是这两个命名空间之间现成的那个 join（一个对话 ⇒ 多个 webui key，
  最新的在前）。找到 ⇒ 复用；找不到 ⇒ 铸一个新的，并且在日志里说出来。
* **一次 fork 铸一个新 key。** fork 是一个新对话；它不该继承另一个对话的 cookie 或 pinned 标签页。
* 这个形状刻意取自 `src/resume-continuity.js`：一次续跑恢复对话自己的值，一个新会话拿一个新的，
  而这个答案的*来源*是被陈述出来的，不是被推断出来的。这是一次引用，不是重新发明 ——
  `browserKey` 没有 harness 来源，所以它拿注册表自己的记录当作来源。

因此 `vs-<browserKey>` 活过 resume、原地重启和重连，并且只在唯一那个它应该变的事件上改变。

#### 3.2.2 user-data-dir 是一个决定，绝不是一次省略

第一轮在 §1.1 里说 `~/.agent-browser/config.json` 里的 `profile` 是"单一一条路径"，每个不传
`--profile` 的 agent 都落进去 —— 然后又在 §3.2 里说一个默认会话是"临时的 —— 没有 `--profile`"。
这两句不可能同时为真。经得起核实的是 §1.1 那一句（CLI 自己写明的优先级，引用在那里）：只要那个
key 还生效，一个只设了 `SESSION` 和 `NAMESPACE` 的会话仍然解析到那个共享的 6.8 GB `default-profile`，
于是 P0 在两个方向上同时坏掉 —— 它不是临时的（而那正是 D3 的全部理由），而且 N 个每会话一个的
守护进程会各自试图对着**同一个** user-data-dir 启动 Chromium，而 Chromium 的进程单例机制不允许这样。

所以 P0 必须表态它到底做哪一种。它们并不等价，而它们之间的差别就是整个功能：

| 变体 | 会话拿到什么 | Chromium 目录冲突 | `close --all` 的爆炸半径 | 能否带 `--allowed-domains` | 之后的 cookie 罐 |
|---|---|---|---|---|---|
| **A.** 只设 `SESSION`，配置里的 `profile` 仍然生效 | 独立的上下文，**一个**共享浏览器 | 无（一个守护进程拥有该目录） | 仍然是所有会话 | 否（存在一个 profile） | 共享，永远变大 |
| **B.** `SESSION` + `NAMESPACE`，配置里的 `profile` 仍然生效 | 自己的守护进程 | **冲突** —— N 个守护进程，一个目录 | 有作用域 | 否 | 共享 |
| **C.** `SESSION` + `NAMESPACE` + `AGENT_BROWSER_PROFILE=<per-session scratch dir>` | 自己的守护进程，自己的目录 | 无 | 有作用域 | 否 | 每会话一个，**必须被清扫** |
| **D.** `SESSION` + `NAMESPACE` + `AGENT_BROWSER_CONFIG` 指向一份由 VibeSpace 写出的、**没有** `profile` key 的配置 | 自己的守护进程，**没有** user-data-dir | 无 | 有作用域 | **是** | 没有 —— 真正临时 |

第一轮描述的是 **D** 的行为，而指定的是 **B** 的配置。这就是那个缺陷。

**建议：D，以 C 作为回落**（owner 决定 D12）。D 是唯一一个能兑现 §3.2 和 §6.3 同时承诺的东西的变体，
而且它只是一个环境变量。它的代价是真实的，并且写在这里：

* `AGENT_BROWSER_CONFIG` 会**替换掉**默认的那些配置文件，所以生成出来的那份文件必须把用户自己的
  `args`（`--no-sandbox`、`--ozone-platform=wayland`、…）带过去，否则浏览器在这个桌面上根本起不来。
  它是按实例生成的，不是按会话 —— 一份文件，在用户的配置变化时重写，像其它每一个 store 一样走
  `writeJsonAtomic`。
* 如果 `--config` 指向一个不存在或无效的文件，CLI 会**带错误退出**（它自己的 `--help` 这么说）。
  这是一个朝*不安全*方向的硬依赖：我们写入器里的一个 bug 会弄坏一个今天本来能用的工具。因此这个
  环境变量**只有在**该文件于 spawn 时被验证为可读之后才设；如果不可读，我们回落到 C；如果 C 的目录
  也建不出来，那两个都不设并把原因记进日志 —— P0 的保证降级成 A，而不是降级成"没有浏览器"。
* C 的临时目录是我们拥有的状态，必须在会话结束时以及开机时清扫；它们**不是** D3(b)（"每会话自动
  创建一个持久 profile"）从侧门溜回来，因为它们由 `browserKey` 命名、住在 `data/` 下面、而且会被
  删除。如果它们哪天被*保留*下来，那它们就是有 owner 的注册表记录，否则就是那 53 个孤儿问题按计划
  重演一遍。

无论 D12 怎么定，P0 的门禁断言的是**两个并发会话解析出来的 user-data-dir**，而不是那两个环境变量
字符串（§9）。第一轮那道门禁在变体 B 上是会通过的。

#### 3.2.3 那个上界，因为 P0 把一个浏览器变成 N 个

P0 诚实地讲是"没有**我们的**新进程" —— 但它同时也是"一个共享 Chromium 变成每个浏览会话一个"的那一刻。
§1.2 实测出来的包线（每个实例 6 个 OS 进程、420–667 MB PSS 和 **2 个 inotify instance**，对着一个
这台机器已经踩到过的 128/uid 天花板）就是它的代价。由此得出三件事，而且没有一件能等 keeper：

* **idle timeout 在 spawn 时显式设置。** 它是第三个环境变量，和前两个一样便宜。不要继承默认值：
  已安装的 0.32.0 是**关闭**的（§1.2），而即使在 ≥ 0.33.1 上，那个 1 小时的默认值也**豁免 headed
  浏览器** —— 而这台机器的配置正是 `headed: true`，所以那个豁免是常态而不是角落情形。建议值：
  一个没有租约的会话 15 分钟。
* **是否 headed 变成由我们来表态**（owner 决定 D13）。一个 Wayland 桌面上 N 个 headed Chromium
  就是 N 个可见窗口，而这正是 owner 请求里"多个窗口"要的东西 —— 同时它也是 N 个没有任何超时会去
  回收的 framebuffer。一旦 §4 的实时视图存在，对 agent 这个场景来说 headless + 实时视图严格更优；
  headed 仍然按 profile 可用。
* **一个每实例的并发浏览器天花板**，并且在天花板处有一个明确的行为（拒绝启动，点名当前持有浏览器
  的那些会话，并提供停掉其中一个的选项）。P0 可以*陈述*这套算术并通过 `src/browser-facts.js`
  把计数暴露出来；只有 keeper（P1）能*执行*它，因为执行需要一个会数数的东西。这个缺口在 I4 里被
  点名，而不是被糊过去。

#### 3.2.4 为什么要两个名字

`--session` 隔离浏览器上下文；`--namespace` 隔离**守护进程 socket 和 restore-state 目录**。
两个都有，一个会话的守护进程崩溃、`close --all`、或者 idle-timeout 关机，就都够不到另一个会话的
浏览器。`close --all` —— 一个正在收拾的 agent 最可能敲的命令 —— 按构造就变成只作用于调用者。
这仍然是本设计里价值最高的一行，而且它仍然大约就是五行代码；§3.2.2 就是这五行为什么不是 P0 全部
内容的原因。

为什么*不*用上游的 `session id --scope worktree`：同一个 worktree 里的两个 VibeSpace 会话会派生出
*相同*的 id，把干扰重新造出来。我们的身份是对话，不是目录 —— 而 §3.2.1 就是让这句话为真而不是
停留在愿望层面的东西。远程会话通过已经在承载 `VIBESPACE_API` 的那套 `envPairs` / `fsWrite` 路径
拿到同样的变量；集成关闭的会话不带任何 agent 可见的东西，在这里也必须什么都不带。

**默认 profile 行为：在变体 D 下没有** —— 没有 user-data-dir，没有 `--restore`，没有 cookie 罐，
而且 `--allowed-domains` 可用。一个需要保持登录状态的 agent 必须去要一个 profile，而"去要"正是
VibeSpace 得知这个 profile 存在的方式。

### 3.3 profile 注册表

`data/browser-profiles.json`，经 `writeJsonAtomic`（tmp+rename）写入，并且像其它每个 store 一样
在 SIGINT/SIGTERM 时 flush；变化时广播（`browser-profiles-updated`），于是每个打开着的客户端实时
更新 —— 多客户端律。

```jsonc
{
  "version": 1,
  "profiles": [{
    "id": "bp-<8 hex>",                     // minted here; never user-supplied
    "label": "Vendor portal",               // human name, shown in UI, never a path component
    "dir": "~/.agent-browser/vs-bp-<id>",   // the user-data-dir; adopted dirs keep their path
    "provider": "chromium",                 // chromium | cloak | cdp | cloud:<name>
    "fingerprintSeed": 118293,              // provider-specific; null for plain chromium
    "proxy": null,                          // proxy URL; the SECRET half never leaves the server
    "host": null,                           // null = this machine; else a hostId (ssh host / device)
    "allowedDomains": null,                 // see §6.3 — refused on a persistent profile
    "owner": { "kind": "task|session|instance", "id": "…" },
    "sharing": "owner",                     // owner | instance (§6.2)
    "record": false,                        // per-profile screencast opt-in
    "createdAt": 0, "lastUsedAt": 0, "notes": ""
  }],
  "leases": [{ "profileId": "…", "browserKey": "bk-…", "sessionId": "…", "targetId": "…",
               "since": 0, "input": "agent", "viewers": 0 }]
}
```

`browserKey` 是耐久的那一半，而 `sessionId` 是那个对话*当前*的载体（§3.2.1）：租约按 `browserKey`
查找，而 `sessionId` 存在是为了让开机对账（§3.5）能问出"还有人在扛着这个吗"而不用第二次推导。
一次 resume 就地改写 `sessionId`；它绝不会创建第二份租约。

关于这个文件的三条规则：

* **它是一份注册表，不是一份副本。** Cookie、storage 和指纹材料都留在浏览器自己的目录里。
  搬 98 GB 不是一次迁移，是一次故障。
* **`id` 是铸出来的，`label` 是自由文本。** 那个 label 永远不会进到路径、argv 或一个被 spawn 的
  命令里 —— 显示字符串绝不进 spawn 那条律（一个带 host 标签的 cwd 曾经进去过，那就是这条律存在的
  原因）。
* **一份租约不是"有东西在跑"的证据。** 它是一次开机写下、下一次开机读到的、关于某个进程的主张；
  §3.5 的对账才是让这个主张保持诚实的东西，而没有任何东西可以基于一份它还没对过账的租约去行动。

### 3.4 租约语义 —— I2，精确版

一份**租约**是 `(profileId, sessionId) → targetId`。它在一个会话 attach 到一个 profile 时创建，
在该会话结束或 detach 时销毁。

* Attach 会跑 `--cdp <the profile's cdp url> --session vs-<browserKey> --pin-tab`，而如果该会话
  还没有绑定的标签页，再跑一次 `tab new`。之后上游会跨命令、跨守护进程重启维持这个绑定，而
  `data.targetId` 是稳定的。
* **你只能作用于你自己的标签页。** 有了 `--pin-tab`，在你的标签页被关掉之后再动作会返回带
  `data.targetId` 的 `tab_gone` —— 一个有类型的错误，而不是悄悄接管邻居的标签页。
* **`close` 对共享 profile 被重新定义。** 包装 CLI（§5）把 `close` 变成"关掉我的标签页并丢掉我的
  租约"，并且在一个共享 profile 上拒绝 `close --all`，附带一条点明还有多少个其它会话 attach 着的
  消息。底下那个浏览器只由它的 keeper 停掉。
* **输入只有一个持有者。** `lease.input` 是 `agent` 或 `user`。实时视图的接管会把它翻过来（§4.3）。
  一个会话和一个*人类*共享一个标签页，而租约说明此刻是他们中的哪一个在开车。

**租约到底是什么，精确地说，因为第一轮把它说过头了。** 第一轮把"两个*会话*永远不共享一个标签页"
断言成一条*性质*。它不是。一个 profile 的 CDP 端点按设计是不鉴权的（§6.1），而且它授予对那个浏览器里
**每一个** target 的权限，所以任何能够到那个端点的会话都能驱动它里面的任何标签页，包括在一次人类
接管期间。在一台单 uid 的机器上，这个端点甚至不是秘密：它可以从 `agent-browser get cdp-url` 拿到、
从守护进程 socket 拿到、也能从同一用户拥有的任何进程的 `/proc/<pid>/environ` 里拿到。

所以正确的说法是：**一个共享 profile 是一条共享权限边界，而租约是协作各方彼此不进对方标签页的
那个协议。** 在同一个 owner 自己的那些会话之间，这就是这里其它每一个 VibeSpace agent 面所运行的
同一个信任级别。在*不同的* owner 之间，它根本不是一条边界 —— 这就是为什么 `sharing: "instance"`
被门控在 §6.5 的中介代理之后，而不是和这个协作式租约一起发布（§6.2、D6）。

### 3.5 keeper（I4）

`src/server/browser-keeper.js`，直接照着 `src/opencode-serve.js` 建模，它的疤痕组织我们应该继承
而不是重新挣一遍：

* **惰性。** 在一个 profile 被启动之前什么都不跑。没有定时器、没有 socket、没有 fs 句柄会为一个
  没人用过的功能而存在 —— OpenCode 插件学了两遍的那条规则。
* **每个 profile 一个进程，reuse-or-spawn，** 并在磁盘上留一条记录，于是一次 VibeSpace 重启是
  **adopt** 而不是把它变成孤儿。`stop()` 只清它自己拥有的记录（一条指名另一个进程的记录永远不被清）。
* **先取得所有权，再发信号。** "决定要拿这个"和"把它发布出去"之间的每一个 `await` 都重新检查一个
  取消 epoch；一条被记录的进程 pid 在任何信号之前先被分类（`ours` / `other` / `unknown` / `blind`），
  而一个无法验明的 pid 是*带理由 park*，绝不被杀也绝不被覆写。`src/cli-identity.js` 已经拥有
  "这个进程是不是我以为的那个"外加那把存活性梯子（`kill -0` → `/proc` → `ps`）；一个浏览器 pid
  去问那个模块，绝不自己新写一个 `ps` grep。
* **失控守卫。** 一个开了 200 个标签页的 Chromium 和那个烧掉 209 CPU 分钟的 OpenCode serve 是同一个
  故障类：采样 `/proc`；在持续高 CPU 或 RSS 爆掉时，停掉它、带一个具名理由 park 它、发遥测、告诉用户。
  Chromium 的正常地板比一个 serve 高，所以阈值是**按 provider**的，不是全局的。
* **Idle。** 不要委托给一个默认值：把超时显式设上（§3.2.3 —— 在已安装的 build 上它是关闭的，而在
  更新的版本上它豁免 headed 浏览器）。一个至少有一份**已对账**的活租约的 profile 设
  `AGENT_BROWSER_IDLE_TIMEOUT_MS=0`，并在它最后一份租约掉落时由 keeper 停掉（外加一个宽限期，
  这样一次会话重启不至于要付一个冷启动浏览器的代价）。
* **开机对账，在任何东西被保活之前。** `IDLE_TIMEOUT_MS=0` 是本设计里最危险的一行：它把"磁盘上
  存在一份租约"变成"一个 Chromium 永不退出"。所以在启动时，并且在任何超时被关闭*之前*，keeper 走一遍
  持久化的租约，对每一份问：**它的 `browserKey` 是否被一个活着的会话扛着**（`activeSessions`，
  其它每条恢复路径查的同一张表）。没人扛的租约被丢掉，它的 `targetId` 被关掉，它的 profile 回到
  普通的 idle timeout —— 并按 key 和按理由记日志。这跑在和 `restoreSessions()` 同一条开机路径上，
  而且跑在第一个 `IDLE_TIMEOUT_MS=0` *之前*，不是之后。第一轮只规定了跨重启保活浏览器的那一半；
  `test-browser-keeper` 现在证明两半（§9）。
* **一个天花板，并且在天花板处有明确行为。** keeper 是本设计里第一个会数数的东西，所以 §3.2.3 那个
  并发浏览器天花板在这里被执行：在天花板处，一次启动被拒绝，当前持有浏览器的那些会话被点名，
  并明确提供一个"停掉那一个"。大声拒绝胜过在一台其 systemd unit 部分就是为了熬过 OOM 而存在的机器上
  OOM 一次。
* **spawn 卫生。** `agentEnv()` 式的净化环境；秘密（代理密码、provider 授权 key）走环境或文件，
  **绝不走 argv** —— argv 在这台机器上是全局可读的，而且正是 writer sweep 读的东西。

### 3.6 每一块落在哪（套用 CLAUDE.md 的路由表）

| 块 | 模块 | 层 | 门禁 |
|---|---|---|---|
| 注册表 schema、id/label 校验、租约判定、provider 能力表、`browserEnvFor(session)` | `src/browser-profiles.js` | **PURE**（不 import 任何东西） | `test-browser-profiles`（fast） |
| "这台机器上存在/正在跑哪些浏览器"、版本下限探测 | `src/browser-facts.js` | **SHARED**（daemon 把它打进 bundle） | parity 套件 —— 单边修改会让它变红 |
| 设备 op `browser-serve`（在一台配对机器上 start/stop/status/cdp-url） | `src/agentd/agentd.js` handler + hello-ack 里的能力位 + 客户端方法 | **DEVICE** | `test-browser-providers`（heavy）：真守护进程测试 + 能力门断言（旧守护进程绝不被问 —— 未知 op 会挂住） |
| keeper、路由、WS 桥接、访问层（`hostId` 是一个参数） | `src/server/browser-keeper.js`、`browser-routes.js`、`browser-access.js` | **ORCH** | `test-browser-live`（heavy，真二进制） |
| 实时视图窗口、profile 面板 | `src/lib/browser-live-window.js`（+ `registerWindowType`） | **CLIENT** | headless-chrome 腿 |
| Agent CLI + 手册 | `data/bin/vibespace-browser`、`docs/agent/browser-manual.md`、`AGENT_TOOLS` | agent 面 | `test-browser-cli` |

`hostId` 是一个参数，绝不是一个分支：`browser-access.js` 挑传输（本地 keeper / `browser-serve`
设备 op / ssh），而下游没有任何东西再问一次"这是远程的吗"—— 和 `src/server/opencode-access.js`
同一个形状。`server.js` 只增加**接线语句块**；它的行数 ratchet 是一道 build 门禁。

---

## 4. 实时视图（1.c）

### 4.1 Codex desktop 实际在做什么，以及我们取哪些

根据 OpenAI 自己的文档和同期报道调研得来：

* Codex desktop 应用有一个**内置浏览器面板**，提供"在一个 chat 内部对网站和本地 web 应用的共享视图" ——
  用户和 agent 看到同一个渲染出来的页面。
* **控制权交替。** 用户手动开车，或者把控制权交给 agent（通过开口要求，或者通过引用那个浏览器）；
  当 agent 开车时，**一个独特的 agent 光标接管鼠标**，而且这个设计明确允许*多个 agent 各自持有
  自己的光标*，而不是抢占用户的屏幕。
* **审批门。** 它在使用一个网站之前会问，并且对敏感动作要求确认 —— 提交信息、购买、权限变更、删除 ——
  外加在开发者模式下做完整 CDP 检查之前要显式批准。
* **隔离是默认：**"一个和你常规浏览器分开的浏览器 profile。它不会自动共享你已有的标签页或浏览器会话。"
* Agent 通过渲染出来的截图和 DOM 检查来汇报它的工作，和代码 diff 并排审阅。

我们取的是：共享视图、带**可见光标身份**的显式控制权交接、对敏感动作的审批门，以及把 profile 隔离
当作默认。我们额外加的，因为我们的处境不同：一个实例上有很多并发会话，所以视图是*按会话*的，
而光标身份是*按租约持有者*的，不是全局的。

### 4.2 传输：桥接那个流服务器（`/api/vnc` 的形状）

上游的流服务器恰恰就是我们需要的东西，而它的约束替我们做了选择：

* WebSocket 在 `ws://127.0.0.1:<port>` 上；**客户端必须来自 localhost / `127.0.0.1` / `::1` /
  `file://` —— 其它任何来源一律 403。**
* 服务端→客户端 JSON：`frame`（base64 JPEG + `seq` + 设备尺寸、滚动位置、捕获时间戳）、`status`、
  `tabs`、`url`、`console`。帧是"最新者胜"；其余是有序的。
* 客户端→服务端 JSON：`input_mouse`、`input_keyboard`、`input_touch`、
  `{"type":"config","maxFps":N}`、`{"type":"config","pacing":"ack"}`、`{"type":"ack","seq":N}`。

因为那个 origin 检查会拒绝一个真实浏览器的 origin，这个连接**必须**在服务端建立 —— 而这本来就是
我们想要的。`GET /api/browser/stream?session=<id>` 升级一个带 cookie 鉴权的 WebSocket，并把它桥到
那个会话的流端口上，形状照抄 `bridgeVncSocket()`，包括它的背压纪律（当 `ws.bufferedAmount > 8 MB`
时暂停上游侧，低于 1 MB 时恢复 —— 一个快速 framebuffer 配一个慢客户端，否则就是一颗内存炸弹，
这是 VNC 桥接吃过苦头学来的）。

| 选项 | 判决 |
|---|---|
| **通过 `/api/browser/stream` 桥接那个流 WS** | **选中。** 复用一个被验证过的模式；单点登录；流端口以及将来任何 token 都不会到达客户端；输入路径就是文档化的那一条，带 0.33.2 的优先级；多观看者就是一条上游连接扇出。 |
| 用 iframe 嵌上游的 dashboard（`:4848`） | 拒绝。它是一个*完整的应用*（活动流、AI chat、会话创建），有它自己的鉴权面；把它嵌进来就是在我们的控制面里再放一个控制面，并且把通往守护进程的直达路线交给浏览器。作为一个*调试*目标有用，作为产品不行。 |
| 通过现有的桌面窗口 VNC 那个 headed 浏览器 | 作为主方案拒绝。这就是今天在发生的事，也正是干扰为什么可见：一个 framebuffer、一个输入队列、所有 agent 一起上。把它留作 headed profile 在桌面上的回落。 |
| 我们自己上 CDP `Page.startScreencast` | 拒绝。这是把 0.33.2 的 pacing/优先级工作重新实现一遍，并且把一个逐帧的 CDP 消费者塞进服务器的事件循环。 |
| 周期性截图 | 作为实时视图拒绝；保留作为*转录*产物（§4.5）。 |

**多观看者：** 每个会话一条上游连接，扇出给 N 个客户端。发给上游的 `maxFps` 取所有观看者中的
**最大值**；每个观看者按它自己的速率被服务。输入只接受来自持有租约用户侧的那个观看者。

### 4.3 接管与交还

窗口上有三个模式，永远可见，永不含糊：

| 模式 | 帧 | 用户输入 | Agent 命令 | 徽标 |
|---|---|---|---|---|
| **Watch**（默认） | 有 | 忽略 | 正常运行 | "Agent is driving" |
| **Take over** | 有 | 转发 | 以 `browser_paused` 拒绝 | "You are driving — agent asked to pause" |
| **Hand back** | — | — | — | 过渡（§4.3.1 决定到底有没有东西被*投递*） |

* 接管把 `lease.input` 翻成 `user`。一个下一条命令被拒绝的 agent 必须能读到*为什么*而不用猜 ——
  `tab_gone` 的先例：一个有类型的、稳定的错误码胜过一次超时。`browser_paused` 携带是谁接管的、
  以及什么时候接管的。
* 交还把它翻回 `agent`，并且带上**当前 URL** 让 agent 重新定位 —— 人类可能已经导航过、登录过、
  或解掉了一个验证码，而这正是重点。
* **空闲交还**：在一个可配置的静默窗口之后触发，于是一次被人走开丢下的接管不会把一个 agent 永远停在那里。
* 徽标说的是 "agent asked to pause"，不是 "agent paused"，因为 §3.4 对租约能执行什么是诚实的。
  在 §6.5 的代理存在之前，这是一个 agent 会遵守的请求，而 UI 不可以承诺得比机制能兑现的更多。
* **光标身份**借用 Codex 的点子：在 agent 开车时，视图在最后一次 CDP 输入坐标处画一个带标签的
  agent 光标；在用户开车时，用户自己的指针就是光标，而 agent 的被隐藏。两个观看者看同一个标签页，
  看到的是同一幅画面。
* **敏感动作审批**骑在上游自己的机制上，而不是再造一套：`--confirm-actions <categories>` 加上
  `confirm` / `deny`。一个待确认项会在实时视图*以及*对话里冒出一张卡片，而任何一边都能回答它。

#### 4.3.1 宣告一次交还就是在花钱，而本设计欠它一道门

第一轮写了三次"announced into the conversation"，却一次都没说清一次公告**是什么**。在这个代码库里，
它就是一个没人打字的 turn。CLAUDE.md 的路由表明确点了这一类的名 —— "*一个没人打字的 turn*
（auto-resume 的 continue、Stop nudge、Background Work 通知、agent 消息 …… 任何在没有逐次 owner
动作的情况下开启一个计费 turn 的东西）" —— 并把它路由到 `src/spend-authorizer.js` +
`src/server/spend-guard.js`。第二轮已对着源码核实：

* 投递梯 `src/server/conversation-deliver.js` 是**唯一**的实现（`deliverToConversation`），而且它
  被完整地插上了仪表：在各级 rung 之前 `authorizeSpend`，授权被**扣住**直到结算，在唯一那个
  `finally` 里 `releaseSpend`。
* `src/spend-authorizer.js` 里的 `SPEND_REASONS` 是一个**封闭的**冻结集合，恰好五个理由；一个未声明的
  理由会 fail closed（`unknown-reason`）。这个集合自己的注释说，它只装今天确实有生产者传进来的理由，
  而 `scripts/test-spend-paths.mjs` 断言*两个方向* —— 一个声明了却没被用的理由，和一个未声明的理由，
  失败得一样响。所以一个理由和它的生产者要么落在**同一次改动**里，要么两个都不落。
* 那个套件的普查是**按站点，不是按文件**：`deliver-ladder: /deliverToConversation\s*\(/` 是它的
  primitive 之一，所以 `src/server/browser-*.js` 里一个上方作用域内没有门的调用**会让 fast 档变红，
  也就是挡住 push**（`scripts/ci.mjs` 把这个套件列为 `fast`，而 fast 档就是那个被跟踪的 pre-push
  hook）。不存在一个能悄悄跳过这道门的版本。
* 通道决定账单：`backend-caps.notificationDelivery()` 只对一个带 `inputModes.steer` 的 `rpc-queue`
  harness（codex）返回 `steer`。对一个 claude peer，通道是 `cli-inbox`，而一个**空闲**的接收方
  意味着一个计费 turn。"它只会插进一个正在跑的 turn"对一个 harness 为真，对另一个为假。

第一轮自己的文字让最坏的版本变得可达：一次**空闲交还由定时器触发**，所以它是一个由没有任何人的动作
产生的计费 turn，可重复，每次被丢下的接管一次，而 800 行里哪儿都没有一个天花板。

**本设计改做什么 —— 三个时刻，三个不同的答案：**

| 时刻 | Owner 动过手吗？ | 投递进对话吗？ | 为什么 |
|---|---|---|---|
| **接管** | 是（那次点击） | **否** | Agent 会在它下一条命令上从那个有类型的 `browser_paused` 学到 —— 即时、精确、免费。一次投递等于告诉它一件它马上就会被告知的事。 |
| **显式交还** | 是（那次点击） | **是**，走投递梯 | Agent 可能正*空闲等着*；除了一个 turn，没有别的能叫醒它，而它重新定位所需要的那个 URL 就骑在那个 turn 上。这是一次逐次 owner 动作，恰恰是 CLAUDE.md 那一类所排除的东西 —— 但它仍然开启一个计费 turn，所以它仍然走投递梯，仍然吃一个天花板。 |
| **空闲交还** | **否**（一个定时器） | **默认否** | 按构造零花费：翻转租约、更新实时视图和会话卡片、归档一条说明"接管已失效"的"For you"条目，然后让 agent 在它下一条命令**成功**时自己发现。设置项 `browser.announceIdleHandback`，默认 **OFF**，为想要那个 turn 的人把它路由到同一个理由和同一个天花板上。 |

机制上：

* 一个新声明的理由 —— `'browser-handback': { turn: true, what: 'the browser control
  handback announcement' }` —— 和它的生产者在同一次改动里加进 `SPEND_REASONS`。
* **每一次**公告都走 `deliverToConversation(cid, text, { spendReason:
  'browser-handback', kind: 'notification' })`。绝不第二条投递路径：投递梯拥有那把 rung 梯子、
  stash、peer 卡片和结算，而一个把其中任何一样重新实现一遍的浏览器模块，按构造就是一个孪生。
* `kind: 'notification'` 在这里是对的（是 VibeSpace 在说话，没有人在等回复），这白拿到
  codex-带一个正在跑的-turn 那个情形，而对 claude 什么都不改变。
* 一次拒绝**不丢失任何东西**：投递梯会 stash，而那些话骑在下一个 turn 上。租约翻转是一次*状态变更*，
  无论如何都会发生 —— agent 绝不会因为一份预算被花光而被卡住。
* 有一处精确之处批评说得略微不对，记在这里因为这个差别很重要：走投递梯而**不带** `spendReason`
  并不会被拒绝 —— 投递梯默认成 `'peer-message'`（`conversation-deliver.js`，"一个未知/缺失的理由
  就是 'peer-message'"）。那可以说比被拒绝**更糟**：这个 turn 被计费了，但记在另一个生产者的名下，
  而日志和"For you"通知两边都在关于是谁花了这笔钱这件事上撒谎。声明理由是让账本可读的东西，
  而不仅仅是让这次调用合法的东西。

### 4.4 那个窗口

一个新的窗口类型 `browser-live`，在它自己的模块里通过 `registerWindowType` 注册，于是标题栏图标、
任务栏、标签栏和 `replayOpenSpec` 都从这一次注册里学到它 —— 这个注册表存在的意义恰恰就是不要把一个
kind 加在三个地方（并且让一个未知的 openSpec 动作是响的而不是静静消失）。

* `openSpec: { action: 'openBrowserLive', sessionId, profileId }` → 跨刷新、跨桌面、跨其它客户端
  持久化并重放。
* `persist: true`。它不是临时的：一个在接管中途刷新了页面的用户必须把窗口拿回来 —— 而且是以
  **Watch** 模式，因为一次重载绝不能悄悄地重新夺回控制权。
* 窗口 chrome：模式切换器、URL 行（来自流的 `url` 消息）、标签页列表、观看者计数、录制指示器，
  以及一个交给现有内嵌浏览器窗口的"我自己打开这个 URL"入口。
* **DPI：** 桌面窗口那条教训逐字适用：在 body zoom 下，把 viewport px（`clientX`、rect）和
  layout px（`clientWidth`）混着用，会让远端指针偏掉一个 zoom 倍数，而且随着离原点的距离增长。
  画布活在净 zoom 1 上（`zoom: calc(1 / var(--ui-scale, 1))`），而指针坐标只在一个 helper 里
  转换一次，并配一个测试。
* **XSS：** 页面标题和 URL 是页面控制的字符串，而且会同步到每一个客户端。它们走 `escHtml`，
  绝不走 `innerHTML`，而帧是通过 `.src` 属性画到一个 `<canvas>` / `<img>` 上 —— 绝不插值成标记
  （图片覆盖层那条律）。
* **主题/UI 约定：** 只用主题变量、只用 SVG 图标、任何对话框用 `createModalShell`、不用原生
  `confirm()` —— 那几条常驻 UI 律。

### 4.5 为转录做录制

0.37 给了 `record start`，经 `Page.startScreencast` 以 30 fps 录制，`--fps 1-60`，WebM/MP4，
ffmpeg 是否可用由 `doctor` 报告。按 profile 选择开启（`record: false` 是默认），写在
`data/browser-recordings/<profileId>/<sessionId>-<ts>.webm` 下面，从对话里链接过去，并像其它每个
buffer store 一样有一个按年龄的清扫。

默认**关**，有两个理由：一个已登录 profile 的视频是秘密（上游自己的信任边界对截图已经这么说了），
而一个长会话的 30 fps WebM 是一笔没人预算过的存储账单。存在一个便宜的、可以一直开着的中间地带：
把桥接本来就在内存里持有的最后那些帧留着，并且每个 agent 动作写一张 JPEG 作为转录缩略图。

---

## 5. 面向 agent 的那一面

### 5.1 `vibespace-browser`（STATIC 跟踪，在 `AGENT_TOOLS` 里）

照着 `data/bin/vibespace-page` 建模：`VIBESPACE_API` + `VIBESPACE_SESSION_TOKEN`（或
`VIBESPACE_JOB_TOKEN`），不含任何 VibeSpace 内部细节，完整手册在 `vibespace-docs browser` 后面。

```
vibespace-browser profiles                       # what exists, who owns it, who is attached
vibespace-browser use <label|id>                 # attach THIS session to a profile;
                                                 #   prints the env to export, or execs a subshell
vibespace-browser new <label> [--provider …] [--proxy …] [--fingerprint …]
vibespace-browser detach                         # drop the lease, close my tab
vibespace-browser watch                          # print the live-view path for the user
vibespace-browser status                         # my tab, my lease, who holds input
vibespace-browser -- <agent-browser args…>       # run agent-browser with this session's flags
```

**`use` 不打印 CDP URL。** 第一轮让它打印

```
AGENT_BROWSER_CDP=<the profile's cdp url>       # ← removed
```

作为主要的上手步骤，那等于把对那个浏览器里每一个标签页的、无作用域的权限交给 agent —— 也就是 §3.4
更正后的读法 —— 而且是在文档化的幸福路径上，而不是通过某个不寻常的举动。所以 `use`：

* 默认**`exec` 一个子 shell**，环境已经设好，于是那个 URL 从不出现在 agent 的 stdout、它的转录、
  或某个模型之后会回读的 scrollback 里；
* `--print` 仍然存在，供一个必须自己搭 shell 的 agent 使用，而它**只**打印 session 和 namespace ——
  CDP url 可以通过 `vibespace-browser -- get cdp-url` 拿到，那是一次包装调用，也就是一个可以放
  策略决定的地方。

对这么做到底买到了什么要诚实：在一台单 uid 的机器上，这**不是**一条边界。同一个用户拥有每一个 agent
进程，所以 `/proc/<pid>/environ`、`~/.agent-browser` 下面的守护进程 socket 和
`agent-browser get cdp-url` 都通向同一个端点。不打印它去掉的是那个*意外*（一个躺在转录里的 URL，
被复制进另一个会话，被一个回读到它的模型重放），仅此而已。边界是 §6.2 的能力门，以及，如果 owner
想要强制执行的话，§6.5 的那个代理。

`--pin-tab` 由包装形式提供，于是一个已经懂 `agent-browser` 的 agent 保留它所有的习惯。包装形式
（`vibespace-browser -- …`）的存在是为了那些需要一个策略决定的动词（`close`、`close --all`、
`connect`、`get cdp-url`）以及租约检查。

### 5.2 一个 agent 怎么学到这些

* **默认什么都不用学。** 一个一个字都不读的 agent 从 §3.2 拿到隔离。
* 在工具介绍（那份有预算的每会话上下文）里加一行，指向 `vibespace-docs browser`，和其它每个
  agent CLI 一模一样。
* `docs/agent/browser-manual.md`，由正在跑的实例自己的 checkout 提供，于是手册不可能和正在跑的
  版本漂移。
* 手册必须写明的规则，因为它们是会弄坏别人的那些：你的标签页是你的；在一个共享 profile 上
  `close --all` 会被拒绝；页面内容不可信；永不回显一个 cookie；**当一次登录或一个验证码挡住你时，
  通过实时视图去问用户** —— 那现在是一个受支持的动作，不再是一条死路。

### 5.3 面向用户的可发现性

* 会话卡片 / Session Properties：这个会话 attach 在哪个 profile 上、观看者计数、谁持有输入。
* 一个 ⚙ 面板（或侧栏分区）：profile 列表、owner、最后使用时间、磁盘大小、"停止"、"忘记"、
  "打开实时视图"。§1.2 里那些未注册的目录（第一轮 53 个，重新测量时 56 个 —— 这个计数会自己往上漂）
  在这里作为可收编的候选出现（§8）。
* 任何新设置项都要落在一个列在 `SETTINGS_CATEGORIES` 里的分类下 —— 那个数组**就是**设置渲染循环，
  而一个没有任何一行列出的分类就是一个没人够得到的设置项（那道 build 普查之所以存在，就是因为有十个
  设置项、包括每一个花钱天花板，都是够不到的）。

---

## 6. 安全模型

### 6.1 Token 和端口

* 流端口留在 loopback 上。**唯一**的入口是那个带 cookie 鉴权的桥接 —— `src/vnc.js` 已经写明的
  `-localhost` + 桥接那套纪律。
* **流 token 永不到达 agent。** 如果将来某个上游 build 要求那个生成出来的 token（0.35.2 的反向
  代理路径），由服务器持有它：不进 `agentEnv`，不进 CLI 的输出，不进手册。
* Agent 打印出来的实时视图 URL 是一条**路径**，在客户端侧针对用户实际打开 VibeSpace 的那个地址解析 ——
  发布页那条规则（服务器不知道自己是怎么被访问到的；有一次猜 origin 把一个机器主机名放进了一条聊天回复）。
* CDP 按设计不鉴权。一个 profile 的 CDP 端点绑在 loopback 上；一个远程的只通过守护进程的 mux
  （§7.3）到达，绝不是一个监听在 LAN 上的端口。

### 6.2 谁可以 attach 到一个 profile

`sharing: "owner"`（默认）= 只有拥有它的那个任务的会话。`sharing: "instance"` = 这个实例上的任何
会话。没有跨实例共享：一个 profile 就是活的凭据，它只以一次显式的、人驱动的导出的形式移动。

**`sharing: "instance"` 有一个前置条件，而它是 P6。** 因为一个共享 profile 是一条共享权限边界（§3.4）
而它的 CDP 端点不鉴权（§6.1），"这个实例上的任何会话"意味着"任何会话都可以驱动这些标签页中的任何
一个，包括在一次人类接管期间"。在同一个 owner 自己的会话之间，那就是每一个 VibeSpace agent 面已经
在跑的信任级别，而 `sharing: "owner"` 说的恰恰就是这个。`sharing: "instance"` 把它扩大到 owner
自己的工作之外，所以它在中介代理存在之前是**在 schema 里被定义、在 API 上被拒绝** —— 带理由地拒绝，
按 §7.1 的能力行纪律，而不是一次沉默的缺席。这是相对第一轮的一个改动，第一轮把两个值都列为可用，
同时 §6.5 又承认了那个执行缺口；owner 请求 (1.b) 里"一个 profile 被多个会话同时驱动"今天由
`sharing: "owner"` 交付，在 D6/P6 之后由 `"instance"` 交付。

### 6.3 域名限制，诚实版

因为 `--allowed-domains` 拒绝 profile / CDP / restore（§1.5），一个持久 profile 带不了它。所以：

* **一个完全没有 user-data-dir 的会话可以、也应该用它** —— 那正是它被造出来的那个场景，也是
  agent 最常撞上的那个场景：打开一个页面，读它，扔掉。已在 §1.5 核实：`--session` **不在**那个拒绝
  清单里，所以一个没有 profile、没有 state 回放、没有 CDP 的隔离会话可以愉快地带一份白名单。
  **这只在 §3.2.2 的变体 D 下为真。** 在 B 或 C 下，默认会话有一个 user-data-dir，于是
  `--allowed-domains` 会被二进制拒绝 —— 第一轮断言了这个好处，同时指定了一个把它放弃掉的配置，
  而 D12 就是这件事被决定、而不是被假设的地方。
* **持久 profile 在低一层拿到围栏**：那个 profile 自己的代理（本来就是注册表的一个字段）在代理侧
  配白名单，或者用主机/容器出网控制。注册表为一个临时 profile 记录 `allowedDomains`，并在一个持久
  profile 上**拒绝**它，附一条说明为什么的消息，而不是接受一个之后会被悄悄丢掉的标志。

### 6.4 静态数据

* profile 目录是 `0700`，在仓库之外，绝不进入一份会离开这台机器的备份，除非有一次显式的动作。
* 代理密码和 provider 授权 key 活在服务端的注册表里（或者现有的 credential-provider 插件路径）：
  绝不进 argv，绝不进 `agentEnv`，绝不进一行日志。
* 录像和 HAR 是秘密；清扫按计划删除它们，而 UI 会说明这一点。
* 对一个 profile 执行 `forget` 是先归档、再移除；它绝不静默销毁 —— 这里每个 store 都遵守的
  archive-never-destroy 律。

### 6.5 租约不是什么

任何能够到一个 profile 的 CDP 端点的进程，都能驱动那个浏览器里的任何标签页，包括在一次人类接管期间。
这不是一个 agent 特意绕路去做的事：这就是 CDP 本身，而且在一台单 uid 的机器上，这个端点可以从守护
进程 socket、从 `get cdp-url`、以及从另一个 agent 的 `/proc/<pid>/environ` 里被发现。第一轮把它写成
"如果一个 agent **手动**跑 `agent-browser --cdp <url>`"，那说轻了 —— §5.1 不再打印那个 URL，
而那去掉的是一个意外，不是那个能力。租约是协作式的。两个诚实的立场：

* **就按协作式发布**，并在 UI 里说清楚（"agent paused" = 一个 agent 会遵守的请求）。今天每一个
  VibeSpace agent 面都恰恰是以这种方式协作的。
* **或者中介 CDP**（决定 D6）：keeper 给每个会话发一个每会话的 CDP URL，由一个小代理提供，它把
  `Target.*` 限定在被租的那个 target 上，并在用户持有输入时拒绝 `Input.*` / `Page.navigate`。
  真正的强制执行 —— 以及在一条对延迟敏感的路径上多一个活动部件。

建议：在阶段 0–5 里保持协作式，**且仅限 `sharing: "owner"`**，`"instance"` 在那个代理存在之前
被拒绝，而代理本身被规定下来并门控在 D6 之后。一个 owner 自己的会话之间的协作式租约，和这里其它每一个
面是匹配的；而一个被当作*不同* owner 之间的隔离来卖的协作式租约，就是 UI 在承诺机制守不住的东西。

---

## 7. Provider

### 7.1 抽象

一个 provider 回答四个问题：**我怎么给这个 profile 起一个浏览器**、**我发出去的 CDP URL 是什么**、
**它要多少钱**、**它做不了什么**。上游的 `-p <provider>` 和它的 provider 插件就是模板；我们的注册表
加上 profile 身份。

| Provider | 启动 | CDP | 指纹 | 成本 | 备注 |
|---|---|---|---|---|---|
| `chromium`（默认） | 本地 `agent-browser` 带 `--profile <dir>` | keeper 读 `get cdp-url` | 除了 `--disable-blink-features=AutomationControlled` 之外没有 | 免费 | 今天的行为，只是现在有主了 |
| `cloak` | CloakBrowser 二进制作为 `--executable-path`，或者它的 `cloakserve` CDP 端点 | `ws://127.0.0.1:9222`（loopback，§6.1） | 号称 73 个源码级 C++ 补丁，每连接一个 seed | 免费档 1 会话 / $19 5 / $49 20 / $199 200 / $499 2000（2026-09 观察到的标价） | §7.2 |
| `cdp`（远程） | 什么都不做 —— 那个浏览器是别人的 | 一个 `hostId` + 一个远程 loopback 端口，隧道过来 | 那个浏览器是什么就是什么 | 免费 | §7.3 |
| `cloud:<name>` | 上游的 browserbase / browserless / kernel / browseruse / agentcore | 该 provider 的 | 该 provider 的 | 按供应商 | API key 是服务端秘密；绝不进 `agentEnv` |

一个 provider 是**一行，不是一条 `if` 链** —— backend-caps 那套纪律。一个 provider 缺的能力
（"不能 headed"、"不能带 `--allowed-domains`"）是一个 UI 会读的字段，于是一个不可能工作的控件是
带理由地禁用掉，而不是在使用时才失败。

### 7.2 CloakBrowser —— 已核实的部分，以及仍然欠着的尽职调查

从供应商网站、npm registry 和仓库核实（2026-09）：

* npm `cloakbrowser`，最新 **0.5.10**，MIT，维护者 `cloakhq`，仓库 `CloakHQ/cloakbrowser`，
  一个依赖（`tar`），可选 peer 依赖 `playwright-core` / `puppeteer-core` / `socks-proxy-agent` /
  `mmdb-lib`，**没有 postinstall 脚本**。也发布在 PyPI 和 Docker Hub 上。
* **包装层是开源的；Chromium 补丁不是。** 仓库里放的是包装（Python / JS / .NET）、示例和测试。
  那"73 个源码级 C++ 补丁"被编译进一个二进制，由包装层在首次启动时从供应商主机
  （`CLOAKBROWSER_DOWNLOAD_URL`）下载（约 200 MB），缓存在 `~/.cloakbrowser`
  （`CLOAKBROWSER_CACHE_DIR`）。
* 文档说下载会在解压之前，对着**一个被钉住的 Ed25519 签名、覆盖已发布的校验和**做校验。
* 免费 = 一个较旧的 Chromium 大版本、一个并发会话，由登录门控；Pro = 当前大版本以及 5–2000 个会话，
  由 `CLOAKBROWSER_LICENSE_KEY` 门控（存在 `~/.cloakbrowser/license.key`）。
  **校验是离线还是回传，没有文档说明。**
* CDP 是一等入口：`--remote-debugging-port=9222`，外加一个 `cloakserve` 模式
  （`docker run -d -p 127.0.0.1:9222:9222 …`），它接受每连接一个的 `?fingerprint=<seed>` ——
  恰好就是我们每 profile 一个 seed 想要的形状，而且白送一条容器边界。
* "CloakBrowser Manager" 是一个自托管的反检测 profile 管理器（无限 profile，每个有自己的指纹 /
  代理 / cookie）—— 和 §3.3 大量重叠，而在我看来**不该**采纳：它会是第二份注册表，对"谁拥有一个
  profile"有它自己的主张，而且完全不知道一个 VibeSpace 会话是什么。

两条我不解决就不会发布的告诫：

1. **围绕这个名字的搜索面被污染了。** 至少有四个 GitHub 仓库带着几乎一样的描述，其中几个标题就叫
   "Download CloakBrowser"。那是一个诱饵的形状。我们唯一可以使用的入口是由 `cloakhq` 发布的
   npm/PyPI 包，以及它自己声明的那个仓库；任何被搜索引擎抛出来的"下载"链接按政策一律不在范围内。
2. **我们会在一个活的 cookie 罐旁边跑一个未经审计的、有网络访问的专有二进制。** 签名钉住是对的控制，
   而它是供应商自己的主张；我们应该自己核实一次、钉住一个版本，并且在它在一次性 profile 上跑过一段
   时间之前，让这个二进制离任何持有我们在乎的凭据的 profile 远一点。

#### 7.2.1 "它会不会回传"这件事的控制，写成一个前置条件

第一轮把这件事放在一个旁注里，并且点名 `test-vendor-whitelist` 作为它"会被抓住"的地方。那个套件抓不到
它（§9），所以这个控制在这里被陈述为一个**带记录结果的 P4 前置条件**，用的是这个仓库本来就为这个
问题准备好的形状。

* **那次测量**，逐字照着 `src/local-oracles.js` 建模 —— 那份人工触发 CLI 读取的注册表里，*每一条*
  都带着自己的证明（`tool`、`date`、CLI `version`、每次运行的 **INET connect 计数**），用
  `env -i HOME=<empty dir> PATH=… strace -f -qq -e trace=network` 测量，统计每一次
  `connect(AF_INET|AF_INET6)`，并且把一次 DNS `connect(…:53)` 也当作 INET，因为解析一个供应商主机
  本身就已经是"要去和它说话"的决定。记录四次运行：首次启动（那 200 MB 下载理应会连网 —— 那个数字
  本身才是重点）、从缓存的第二次启动、带一个 license key 的一次启动，以及一个空闲 10 分钟的浏览器。
  一条没有计数的记录不算记录。
* **CloakBrowser 不是、也不可能是一条 `local-oracles` 条目。** 那份注册表是给*零网络*读取用的；
  浏览器按定义就是一个网络工具。它贡献的是那份证明的*形状*，不是那个判决，而那条记录就放在注册表里
  provider 行的旁边，于是 UI 可以展示测了什么、什么时候测的。
* **然后把那条边界从"被观察的"变成"被强制执行的"。** §7.2 已经伸手去够那个 `cloakserve` Docker
  容器了；那个容器要拿到一份**出网白名单 (egress allowlist)**（安装时是那个被钉住的下载主机，之后
  就只有一个 profile 实际服务的那些站点）。一次测量是对某一个版本行为的一张快照；一份白名单是这次
  部署的一条性质，而且它是两者中唯一一个能熬过供应商发布一个新二进制的。
* **版本钉住是这个控制的一部分**，不是卫生问题：那次测量描述的是它所针对的那个版本，而一次不钉版本的
  自动下载会悄悄地让它作废。
* 如果确实想要一个套件，它断言的是**容器的出网策略**以及一条格式良好的证明记录的存在 ——
  绝不是我们自己的源码文本，那是一次源码普查唯一能看见的东西。

**建议：** 把它当作一个*先在免费档上可选开启的 provider* 采纳，自托管，通过 loopback 上的 Docker
`cloakserve`，用在那些一开始没有凭据的 profile 上。只有当一个被测量过的站点确实需要时才买一档。
并且注意那个重要的次序：**对任何有账号的站点，通过实时视图（§4.3）做一次人工登录都胜过指纹规避** ——
它免费、风险中性，而且是这个设计本来就会给我们的一项能力。

### 7.3 远程与机队

"在一台配对的 Mac 上、用用户真实 profile 的一个浏览器"可以拆成两件不同的事：

* **传输几乎是免费的。** `PortForwardManager` 已经会绑一个本地 `127.0.0.1` 端口并把它经现有 agentd
  数据面灌进 `device.tcpForward(remotePort)` —— VNC 和设备挂载用的同一条 mux。一台配对机器上一个
  浏览器的 loopback CDP 端口就变成一个本地 URL；`--cdp <local url>` 搞定其余部分。穿 NAT，不对外暴露。
* **"用户的真实 profile"被 Chrome 自己挡住了。** 从 **Chrome 136** 起，`--remote-debugging-port`
  对默认 user-data-dir 不再生效；你必须指向一个非默认的 `--user-data-dir`，而一个非标准目录用的是
  不同的加密密钥，所以一个被复制过来的 profile 并不会就这么把它的 cookie 带过来。任何说"直接 attach
  到他们已经登录着的那个浏览器"的方案，在当前的 Chrome 上都是假的。

所以能发布的答案是：**在那台机器上开一个专用 profile，由一个人类通过实时视图登录一次。**
一次交互，可审计，而且不依赖任何未文档化的 profile 复制行为。（一个被复制的 profile 的 cookie
在 macOS Keychain / Windows App-Bound Encryption 下能不能活下来，列在 §12 的未核实项里。）

---

## 8. 从共享默认 profile 迁移

什么都不删，那 98 GB 一个字节都不搬。

1. **先只发 §3.2，单独发。** 新会话变成隔离的。已经在跑的会话保持旧行为直到重启。干扰在第一天就
   停止累积，而这发生在任何注册表或 UI 存在之前。
2. **把那个默认 profile 收编成一条注册表记录**，命名为 "Shared (legacy)"，`sharing: "instance"`，
   在 UI 里标为 legacy。它继续能用；显式要它的 agent 拿到的是一个 pinned 标签页，而不是一个被抢来的。
3. **提供对那些孤儿的收编**（第一轮到第二轮之间 53 → 56；§1.2）。面板列出未注册的目录，带大小和最后
   使用日期；用户给值得留的那些打标签，其余的连同大小一起列出来供删除。删除是一次人类动作，绝不是
   一次清扫 —— 一个 cookie 罐就是某个人的登录，而这个仓库已经有一次模式匹配杀掉一个活会话的事故。
4. **配置文件：绝不编辑，永远覆盖。** `~/.agent-browser/config.json` 保持用户写的原样 ——
   桌面上的 `headed: true` 是他们的选择，而且 VNC 那条路仍然能用 —— 但第一轮那句"别管它"不是一个
   完整的答案，因为别管它就意味着它的 `profile` key 会作用于 P0 创建的每一个会话（§1.1、§3.2.2）。
   所以迁移这一步是：**按会话通过环境把它中和掉，绝不通过重写那个文件。** 在变体 D 下那是一份生成
   出来的配置（它把用户自己的 `args` 带过去并省掉 `profile`），在他们的文件变化时重新生成；在 C 下
   那是一个每会话的 `AGENT_BROWSER_PROFILE`。无论哪种，用户的文件都是被读、绝不被写 ——
   一个 agent 去编辑人类的 dotfile 本身就是一个事故类别 —— 而由 keeper 启动的 profile 显式传它们的
   标志。
5. **回滚**在每个阶段都是"别再传那些环境变量" / "停掉 keeper" / "删掉那份生成的配置"。每条路径都在
   结构上回落到今天的行为 —— 三层重构那套激活开关纪律 —— 而且因为第 4 步从来没有写过用户的文件，
   回滚也就没有任何东西需要恢复。

---

## 9. 门禁

每个阶段带着它自己的套件落地，而 `scripts/ci.mjs` 里的档位表每个套件加一行，否则 build 普查失败 ——
一个不在任何档位里的套件就是一个没人跑的套件。第一轮写下了这句话，然后把 P4 和 P5 留成完全没有套件；
现在两个都有了。

| 套件 | 档位 | 覆盖 | 它证明什么 |
|---|---|---|---|
| `test-browser-profiles` | fast | P0、P1 | PURE 注册表：id 铸造、一个 label 永远不进路径、租约状态迁移、provider 能力行、本地 / 远程 / 集成关闭三种情况下的 `browserEnvFor(session)`。**环境那一半断言的是两个并发会话解析出来的 user-data-dir**（§3.2.2 —— 断言那两个环境变量字符串在变体 B（那个坏掉的）上会通过）、`browserKey` 连续性梯子（新建 / resume / fork），以及那个显式的 idle timeout 值。负控：一个集成关闭的会话拿到 **零** 浏览器环境变量。 |
| `test-browser-cli` | fast | P0、P1 | 包装 CLI 的动词表、在共享 profile 上对 `close --all` 的拒绝、有类型的 `browser_paused` / `tab_gone` 透传、没有 token 或没有 API 时的行为，以及 **`use` 永不打印 CDP URL**（§5.1）—— 以第一轮那种写法作为它的负控。 |
| `test-browser-keeper` | heavy | P1 | 真 `agent-browser` ≥ 版本下限：reuse-or-spawn、跨重启 adopt、**开机对账**（一份没有任何活会话扛着其 `browserKey` 的持久租约，会在任何 `IDLE_TIMEOUT_MS=0` 之前被丢掉、其 target 被关掉 —— 第一轮省略掉的那一半，配一个会泄漏一个浏览器的修前对照）、对一个无法验明的 pid 带理由 park、失控停止、只清你自己的记录、天花板处点名持有者的拒绝。当二进制不存在或低于下限时**带证据大声 SKIP**。 |
| `test-browser-live` | heavy | P2、P3 | 真浏览器 + 真流 + 真桥接：一个 profile 上的两个会话各自驱动自己的标签页、永远碰不到对方的（I2 的证明，配一个**能复现那次劫持的修前对照**）、一个观看者只靠 cookie 鉴权就看到帧、背压守得住、接管拒绝 agent 输入而交还恢复它。窗口在 375×667 以及一个非 1 的 DPI zoom 下各跑一条 headless-chrome 腿。 |
| `test-browser-providers` | fast + heavy | **P4** | fast：provider 能力行，以及一个 provider 对它缺失的能力产出的确切拒绝（一个被禁用的控件说出它的理由），外加 CloakBrowser 出网证明记录的存在与形状（§7.2.1）—— 一个带 `blocks:` 主张而其 caps 行并不是 false 的 provider 行会 FAIL，`local-oracles` 那套纪律。heavy：真的 `browser-serve` 守护进程 op 打在一个真守护进程上，**并断言它的能力门**（旧守护进程绝不被问 —— 未知 op 会挂住），以及通过 `tcpForward` 的远程 `cdp` provider。 |
| `test-browser-housekeeping` | fast | **P5** | 把保留/收编这个**判定**当作一个 PURE 函数来测，并打印它放过了什么以及为什么 —— 本仓库自己的清扫律：**绝不要求一次没有任何东西被允许执行的移除**（对任何可能正在飞的东西给一个宽限窗口，并连同它的年龄一起点名）。负控：在没有一次显式人类动作的情况下，永远不会有任何东西被提议删除；以及 `forget` 在移除**之前**先归档。 |
| `test-spend-paths` | fast | **P3** | 不是一个新套件 —— 是那个既有的普查，而这个功能不能把它弄红。它的 `deliver-ladder` primitive **按站点**匹配 `deliverToConversation(`，所以 `src/server/browser-*.js` 里任何一次公告都需要那道门在其上方作用域内；而它的封闭集断言意味着 `'browser-handback'` 必须在同一次改动里既被声明又被使用（§4.3.1）。 |
| `test-architecture` | build | 全部 | 层边界：PURE 不 import 任何东西、SHARED 绝不向上够、daemon bundle 不携带 orchestrator 标记、`server.js` 待在它的行数 ratchet 之内，以及 §44 —— 每个设置分类都会被渲染，于是 `browser.announceIdleHandback` 和其余各项都能到达一个用户打得开的分区。 |
| `test-session-schema` | fast | P1、P3 | 每一个新的 `session._field`（`_browserProfileId`、`_browserKey`、`_browserTargetId`、`_browserInput`）都有一条 owner 行。 |
| `test-vendor-whitelist` | fast | 全部 | **这个设计没有引入任何新的 Anthropic 调用。** 第一轮还声称这个套件是"一个 provider 回传时会被抓住的地方"—— 那个主张**已被删除**：它是一次打在 `src/`、`server.js` 和 `data/bin/` 上、在一个请求 primitive 上下 ±4 行内查找 Anthropic 端点字符串的源码普查。它观察不到一个第三方二进制的流量，而且 CloakBrowser 的主机不在它的正则里。那个风险的控制是 §7.2.1 那条被测量出来的证明记录，加上容器的出网白名单，而断言**容器出网策略**的那个套件是 `test-browser-providers`，不是这一个。 |

这个功能特别暴露在两条套件卫生规则下，而两条在这里都已经是律：**任何 fast 档套件都不得占用一个
机器全局的名字**（一个浏览器想要一个固定端口和 `~/.agent-browser` —— 用按 pid 的临时路径和空闲端口），
以及**一个 spawn 浏览器的套件拥有它孩子的生命期**，在退出时*以及*在超时时都要杀掉。2026-09-09 那次
清扫找到 2089 个泄漏的 fixture 进程，其中就有孤儿 chrome；一个浏览器套件是把这件事变得更糟的最容易的
一条路，而 §1.2 的测量正是**打在四个这样的泄漏上**做的。

## 10. 分阶段计划

一个 **agent 轮次**（agent-round）= 约 1 小时实现者 + 约 20 分钟对抗式验证（2026-09-10 在 32 个
workflow / 130 个 agent 上实测）。日历按**每天 2 轮**算。区间反映的是实测到的收敛离散度：32 个
workflow 中有 14 个一轮收敛，8 个需要 3–6 轮。

| 阶段 | 内容 | 轮次（点值） | 区间 | 天（点值） | 自身能否交付价值？ |
|---|---|---|---|---|---|
| **P0 — 零干扰** | spawn 时的 `AGENT_BROWSER_SESSION` + `_NAMESPACE` + 显式 `_IDLE_TIMEOUT_MS`（本地 + 远程路径）、**§3.2.2 的 user-data-dir 变体及其回落梯子**、`browserKey` 连续性梯子（§3.2.1）、版本下限探测并给出一条诚实的"你的 agent-browser 对共享 profile 来说太老了"提示、k = 1/4/12 的资源测量（§1.2、§12.10）、工具介绍里的一行、`docs/agent/browser-manual.md`、`test-browser-profiles`（环境那一半，断言解析出来的目录）。 | **4** | 3–6 | 2 | **能 —— (1.b) 中"停止互相干扰"那整半。** |
| **P1 — 注册表 + keeper + 租约** | `src/browser-profiles.js`（PURE）、`browser-keeper.js` 含**开机对账和并发天花板**、`data/browser-profiles.json` + 原子写 + 广播、`/api/browser/*`、attach/detach/租约、`vibespace-browser` CLI + `AGENT_TOOLS` + 手册、迁移步骤 1–2。 | **6** | 5–9 | 3 | 能 —— 按任务的 profile 并发共存，带 `--pin-tab` 语义。 |
| **P2 — 实时视图** | `/api/browser/stream` 桥接（+ 背压）、`browser-live` 窗口类型、多观看者扇出、URL/标签页/console 面板、DPI 正确的画布、`test-browser-live`。 | **6** | 5–9 | 3 | **能 —— (1.c) 减去"手"。** |
| **P3 — 接管 / 交还** | 租约输入持有者、模式切换器、输入转发、`browser_paused`、**§4.3.1 的花钱接线**（`SPEND_REASONS` 里的 `'browser-handback'`、那次投递梯调用、默认 OFF 的 `browser.announceIdleHandback`、让 `test-spend-paths` 普查保持绿）、空闲交还、agent 光标、`--confirm-actions` 卡片。 | **5** | 4–7 | 2.5 | 能 —— 补全 (1.c)。 |
| **P4 — Provider** | Provider 行 + 能力门控；**先执行并记录 CloakBrowser 的出网前置条件**（§7.2.1），然后在免费档上通过 loopback `cloakserve` 加一份出网白名单可选开启；通过 `tcpForward` 的远程 `cdp` provider；`browser-serve` 设备 op（三触规则）；`test-browser-providers`。 | **6** | 5–9 | 3 | 能 —— (1.a)，以及机队那条故事线。 |
| **P5 — 录制 + 家务** | 按 profile 的 screencast 可选开启、转录缩略图、保留期清扫、带大小的 profile 面板、孤儿收编（迁移步骤 3）、`test-browser-housekeeping`。 | **4** | 3–6 | 2 | 能 —— 转录那一半。 |
| **P6 — 硬中介** | 做 CDP 中介的代理：target 作用域限定 + 接管期间拒绝输入、每会话的 CDP URL。**这是 `sharing: "instance"` 的一个明确前置条件**（§6.2），而不只是在 D6 判定协作式租约不够时才有的一个选项。 | **6** | 4–9 | 3 | 只作为强制执行 —— 但 `sharing: "instance"` 在它落地之前一直被拒绝。 |

**总量，按区间而不是按点值公布**（第一轮只公布了一个区间的点估计，而它自己的风险段落指的正是那个
区间的上端）：

| 范围 | 区间 | 点估计 | **风险加权**（P2 和 P4 取各自区间上端，其余取点值） |
|---|---|---|---|
| **P0–P5** | **25–46 轮 ≈ 12.5–23 天** | 31 ≈ 15.5 天 | **37 轮 ≈ 18.5 天** |
| **P0–P6** | **29–55 轮 ≈ 14.5–27.5 天** | 37 ≈ 18.5 天 | **43 轮 ≈ 21.5 天** |

风险加权那一列才是该拿来排期的那个，而它这么加权是有明确理由的：P2 和 P4 依赖的是一个第三方二进制
的真实行为，而不是我们自己的代码，这也正是 §12 把它们的三条假设列为未核实的原因。另有两条诚实提醒：
上一份样本里 55% 的 workflow 墙钟时间**没有任何 agent 在跑**（并发上限、会话限额、串行集成），
所以这里的"天"是 agent 产能而不是自然流逝时间；而且上面那些区间是按阶段的 —— 联合分布不是极值之和，
所以 46 轮是一个悲观上界，不是一个预测。

**另一种排序，如果 owner 想最早拿到价值：** P0 → P2 → P1 → P3。P2 可以在注册表存在*之前*就打在
上游的每会话流上跑，因为 §3.2 已经给了每个会话它自己的浏览器。按点估计衡量：P2 在第 10 轮完成而不是
第 16 轮，也就是**早约 3 天（跨 P1 自身区间是 2.5–4.5 天）**—— 第一轮说的是"大约早一周"，而那不是
它自己的数字给出来的结果。代价是把 profile 选择器回填进一个已经存在的窗口：大致多一轮，所以这个排序
值大约 5 个净轮次的更早反馈，不是一周。

## 11. 需要 OWNER 决定的事项

| # | 决定 | 选项 | 建议 |
|---|---|---|---|
| **D1** | **要不要把 `agent-browser` 升到 0.37.1？** 让共享 profile 变安全的 `--pin-tab` 绑定是 0.34+；已安装的是 0.32.0。 | (a) 升级并钉住；(b) 保持不动、只发 P0；(c) vendor 一份钉住的副本。 | **(a) 升到 0.37.1 并钉住**，下限在运行时被检查，低于下限时有一个具名的降级。没有它，(1.b) 的"多会话、一个 profile"没法安全地做，而我不会去建它。 |
| **D2** | **核心惰性还是插件？** | (a) 核心，惰性 —— 在有人要浏览器之前什么都不跑（`vnc.js` 的形状）；(b) 一个内建插件，默认 OFF（`opencode-serve` 的形状）。 | **(a) 注册表 / keeper / 视图走核心惰性；只有 CloakBrowser 走插件式的用户同意。** P0 就是几个环境变量，它们必须默认开着，否则什么都修不了；而一个第三方专有二进制恰恰就是一套同意流程存在的意义。 |
| **D3** | **一个什么都没要求的会话，默认 profile 策略是什么。** | (a) 临时的，不保留 cookie；(b) 每会话自动创建一个持久 profile；(c) 保持今天这个共享默认。 | **(a) 临时** —— 并见 **D12**，那是同一个问题在它真正被决定的那个层面上被问出来。持久化应该是一次请求，因为一次请求正是这个 profile 拿到 owner 和 label 的方式。(b) 是把那 53 个孤儿的问题自动地、按计划地重造出来；D12 的变体 C *不是* (b)，因为那些目录是有名字、有主、会被清扫的 —— 但前提是清扫和它们一起发布。 |
| **D4** | **现在采纳 CloakBrowser 吗，用哪一档？** | (a) 免费档，自托管，按 profile 可选开启，**在 §7.2.1 的出网测量被执行并记录之后**；(b) Solo $19/月；(c) Team $49/月；(d) 还不要 —— 先用"通过实时视图人工登录"。 | **(a)，并且把那次测量当作一个硬前置条件而不是一个旁注** —— 它不花钱，而且能告诉我们那些站点到底需不需要它。只有在一个被点名的站点上有一次被测量到的失败时，才升到付费档。永远不要作为全局默认。第一轮把 `test-vendor-whitelist` 点名为回传风险的控制；那是错的（§9），所以现在的控制是一条被记录的证明记录，加上容器上一份被强制执行的出网白名单。 |
| **D5** | **浏览器会不会跑在本机之外的机器上？** | (a) 暂时只有本机；(b) 通过 `browser-serve` op + `tcpForward` 跑在配对设备上（P4）；(c) 带 API key 的云 provider。 | **(b)，在 P4，而且只对已经配对的机器。** (c) 把一个供应商 key 和我们访问的每一个页面放到别人的基础设施上，它应该有它自己的决定和它自己的 §ban-safety 审查。 |
| **D6** | **协作式租约还是硬 CDP 中介？** | (a) 对 `sharing: "owner"` 用协作式，`sharing: "instance"` 在 P6 之前一律**拒绝**；(b) 现在就建 P6 并把两个都提供出来；(c) 两个都用协作式并在 UI 里说清楚。 | **(a)。** 在同一个 owner 自己的会话之间，一个协作式租约和这里其它每一个面是匹配的，而 §5.1 去掉了那个让它更糟的意外。在*不同* owner 之间它根本不是一条边界（§3.4），所以 `"instance"` 是带理由地被拒绝，而不是带着一个承诺机制守不住的隔离的徽标发出去。这是相对第一轮的一个改动，第一轮把两个值都列为可用，同时在 §6.5 里承认了那个缺口。 |
| **D7** | **录制默认值。** | (a) 关，按 profile 可选开启；(b) 对 attach 着的 profile 开启；(c) 缩略图一直有，视频可选开启。 | **(c)。** 每个 agent 动作一张 JPEG 几乎免费，而且让转录变得有用；一个已登录 profile 的 30 fps 视频是一个带存储账单的秘密。 |
| **D8** | **那些孤儿 profile 目录（53–56 个，98 GB —— §1.2）怎么办？** | (a) 列出来，让用户收编或删除；(b) 全部自动收编；(c) 自动删除超过 N 天的。 | **(a)。** 一个 cookie 罐就是某个人的登录；一次删掉它的清扫，和那次 `(deleted)` 匹配杀掉一个活会话的事故是同一类错误。 |
| **D9** | **实时视图拿自己的窗口类型，还是 chat 窗口里的一个面板？** | (a) 窗口类型 `browser-live`；(b) 一个像 Codex desktop 右侧面板那样的 chat 面板。 | **(a) 窗口类型。** VibeSpace *就是*一个窗口管理器；一个窗口可以平铺在 chat 旁边、被移到某个桌面、在手机上打开、跨客户端共享 —— 这些注册表全都白送给我们，而一个 chat 面板一样都没有。 |
| **D10** | **保留"Wayland 桌面上的 headed 浏览器"这条路吗？** | (a) 保留，作为 headed profile 的回落；(b) P2 发布之后就丢掉。 | **(a) 保留。** 它是流起不来时的逃生口，也是这台机器自己的桌面会话被调试的方式。它只是不再是唯一能看的方式了。 |
| **D11** | **一次进对话的公告值不值一个计费 turn，三个时刻里哪些该有一个？**（§4.3.1 —— 投递梯是完全花钱门控的，`SPEND_REASONS` 是一个 fail-closed 的封闭集合，而一次空闲交还是由**定时器**触发的，也就是 CLAUDE.md 说的"一个没人打字的 turn"。） | (a) 三个都不要 —— 只做状态变更，agent 从 `browser_paused` / 从它下一条命令成功中学到；(b) 只有显式交还；(c) 显式交还 + 空闲交还，两者都在一个新声明的理由下走投递梯；(d) 三个都要。 | **(b)，并把 (c) 作为一个默认 OFF 的设置项提供。** 显式交还是一次逐次 owner 动作，而且它是唯一一个*空闲的* agent 没有别的办法知道的时刻 —— 它重新定位所需要的那个 URL 骑在那个 turn 上。接管什么都不需要（那个有类型的拒绝是即时且免费的）。空闲交还是那个完全没有 owner 动作的，所以它默认零花费：翻转租约、更新实时视图、归档一条"For you"条目，然后让 agent 在它下一条命令能用时自己发现。无论答案是什么，理由都在 `SPEND_REASONS` 里被声明，而投递梯是唯一的投递路径 —— 一个用任何其它方式往对话里发帖的浏览器模块会把 `test-spend-paths` 弄红。 |
| **D12** | **P0 发布哪一个隔离变体？**（§3.2.2 —— 配置文件的 `profile` key 作用于每一次没有覆盖它的调用，所以"没有 `--profile`"不是默认值，它是一个决定。） | (A) 只有 `SESSION`；(B) `SESSION` + `NAMESPACE` 且配置里的 profile 仍然生效；(C) 再加一个每会话的临时 `AGENT_BROWSER_PROFILE`；(D) 再加一个指向由 VibeSpace 写出的、没有 `profile` key 的配置的 `AGENT_BROWSER_CONFIG`。 | **(D)，回落到 (C)，再回落到 (A)，每一次回落都带理由记日志。** D 是唯一一个真正临时的变体，唯一一个能带 `--allowed-domains` 的（§6.3），也是唯一一个没有 Chromium user-data-dir 争用的。**(B) 不是一个选项** —— 它就是第一轮意外指定的那个，而且它不可能工作：N 个守护进程，一个 user-data-dir。D 的代价是诚实且写明的：CLI 在 `--config` 缺失/无效时硬报错，所以那个文件在变量被设之前先被验证。 |
| **D13** | **默认 headed 吗，以及并发浏览器的天花板是多少？**（§3.2.3 —— 实测：每个 Chromium 6 个进程、420–667 MB PSS 和 2 个 inotify instance，对着一个这台机器已经踩到过的 128/uid inotify 天花板；而那个 1 小时的 idle timeout **豁免 headed 浏览器**，同时已安装的 build 根本没有默认超时。） | (a) 一切保持 `headed: true` 并只设 idle timeout；(b) 实时视图存在之后（P2）agent 会话默认 headless，headed 按 profile 按需；(c) 立即 headless，要么实时视图要么没得看。 | **(b)，并且从第一天起就有那个显式的 idle timeout。** 在 P2 之前，桌面 VNC 窗口是唯一能看的方式，所以 headed 必须保持可达；实时视图存在之后，对 agent 这个场景 headless 严格更优，而且它才是那个 idle timeout 真正会回收的变体。天花板：提议**每实例 8 个并发浏览器**，在天花板处大声拒绝并点名持有者 —— 但这个数字应该从 P0 自己的 k = 1/4/12 测量里重新定，而不是从这一段里定。 |

---

## 12. 我没能核实的东西

1. **流协议，没有对着一个真在跑的浏览器验过。** 消息形状、`seq`、输入 schema 和那条 403 origin
   规则都取自上游的文档和 changelog，不是取自一条活的 socket。我刻意没有启动浏览器：这台机器上跑着
   生产实例外加约 160 个 checkout，而机器卫生笔记明确说泄漏的浏览器和守护进程是一个常驻问题。
   **P2 的第一项实现任务就是抓一次真实会话的帧，并把那些形状钉进一个 fixture。**
2. **`--pin-tab` 在我们这个确切模式下的表现** —— N 个会话、一个 profile、并发命令、一个标签页被
   外部关掉。changelog 说它修的正是这件事，但我没跑过（已安装的 build 没有这个标志）。P1 必须在
   *旧*行为上复现那次劫持作为负控，并展示它在新行为上消失了；在这里，一个没有修前对照的绿测什么都
   证明不了。
3. **CloakBrowser 的授权检查会不会回传**、它的二进制发送什么、以及那个 Ed25519 签名校验是不是像
   描述的那样实现的。这三条都是供应商的主张。它们一个下午就能查完，而这次检查现在是一个**带记录结果
   的 P4 前置条件**（§7.2.1），用 `src/local-oracles.js` 那套证明形状 —— 不是一个旁注，也不是
   `test-vendor-whitelist` 做得到的事（§9）。
4. **真实的指纹收益。** "73 个补丁"和"30/30 测试"是供应商的营销。我没有测过任何一个 agent 今天真的
   过不去的站点，而且我手上没有这样一份清单。**去问 owner 要两三个具体站点**；没有它们，D4 就是在
   一本宣传册上被决定的。
5. **被复制的 profile 的 cookie 解密**，在 macOS（Keychain）和 Windows（App-Bound Encryption）上，
   针对"用用户真实 profile"这条路。Chrome 136 的限制是有文档且已核实的；一次 profile 复制之后还能
   活下来什么则没有，而我不会围着它做设计。
6. **桥接在真实负载下的成本** —— N 个观看者 × M 个会话的 base64 JPEG 穿过 node 事件循环。VNC 桥接
   是先例而且它守得住，但 JPEG-in-JSON 比裸 RFB 更重，而 `maxFps` 是那个旋钮。需要在 P2 里测量，
   而那个 8 MB / 1 MB 的背压阈值要重新核对，而不是照信抄过来。
7. **agent 到底会不会真的采用这个包装 CLI。** P0 无论它们用不用都能工作，这正是它是 P0 的原因。
   P1 以上的一切都假设一个 agent 会去要一个 profile；如果它们不去要，注册表就一直是空的，而诚实的
   结论是这个面做错了，不是 agent 错了。
8. **Codex desktop 确切的接管交互** —— agent 光标像素级的行为，以及交还是显式的还是定时的。我有的是
   文档化的行为和媒体报道，不是那个应用本身。§4.3 的空闲交还是我加的，不是我观察到的 —— 这也是
   D11 要问它到底该不该投递任何东西的部分原因。
9. **远程会话上这些变量的环境路径。** `envPairs` / `fsWrite` 已经在 ssh、dial 和 daemon-pipe 三种
   spawn 上承载 `VIBESPACE_API`；我读了调用点但没有跑过一次，所以 P0 必须在每一种传输上断言送达，
   而不是假设对称。变体 D（§3.2.2）让这件事以一种值得点名的方式变难：`AGENT_BROWSER_CONFIG` 指向
   一个**文件**，而一个远程会话需要那个文件在**它自己**的机器上 —— 所以在这份配置像 `AGENT_TOOLS`
   已经在分发 agent CLI 那样被分发过去之前，远程路径就是变体 C 或 A。

第二轮新增，全部是本轮自身改动的后果：

10. **N 个并发浏览器的资源包线。** §1.2 那些每实例的数字是真的，但它们是在四个*空闲的 headless*
    泄漏上测的，不是在 P0 会造出来的那个形状上（k 个并发、用 P0 确切的标志、headed 与否、页面已加载）。
    k = 1/4/12 的测量是一项 P0 任务，而 D13 里那个天花板在它做完之前只是一个提议。
11. **Chromium user-data-dir 单例，没有测量过。** §3.2.2 把变体 B 称作不可能，因为两次 Chromium
    启动不能共享一个 user-data-dir；那是 Chromium 文档化的进程单例行为，也是整张变体表存在的原因，
    但我**没有**启动两个浏览器去看它失败 —— 这台机器上跑着生产实例外加约 160 个 checkout，
    §12.1 里不启动浏览器的那个理由同样适用。如果我错了，那个故障模式比假设的**更好**而不是更坏
    （B 只是会慢，而不是坏掉），而且 P0 的门禁无论如何都断言那个解析出来的目录。
12. **`AGENT_BROWSER_CONFIG` 的确切语义。** CLI 的 `--help` 说一份自定义配置是"取代默认值"被加载，
    并且一个缺失/无效的文件是硬错误；但它到底是不是同时替换掉用户级*和*项目级两个文件，以及
    `extensions` 是否仍然合并，文档说得含糊而且没被测试过。P0 必须在承诺变体 D 之前先跑它一次 ——
    那个回落梯子的存在就是因为这一条。
13. **`browserKey` 跨一次 resume 的那次 join。** `_sessionKeyMap` 从 `session-meta` 文件名里读出
    webui key，而 `data.resumeId` 是对话 id；我把两边都读了，但没有真的驱动一次 resume 走过它们，
    所以 P0 欠一条真实的 resume/fork 腿，而不是一个"这两个命名空间对得上"的假设。
14. **花钱天花板的默认值对这个生产者来说是不是对的。** 声明出来的预算是按凭据 slot 的（12/小时、
    60/天），和 auto-resume 以及 Background Work 共享。一次显式交还很罕见，所以它本来永远不该顶到 ——
    但"本来永远不该"是一个预测，而诚实的检验是真实用上一周之后去读那份日志。

---

## 附录 A —— 资料来源

* **agent-browser**：已安装的 0.32.0 build（`--help`、`skill-data/core/references/*`，包括
  `session-management.md`、`trust-boundaries.md`、`commands.md`、`proxy-support.md`），
  外加上游的 `CHANGELOG.md`、`README.md`，以及 0.33.0–0.37.1 的当前 `streaming.md` /
  `session-management.md`。Apache-2.0，`vercel-labs/agent-browser`。
* **CloakBrowser**：`cloakbrowser.dev`、`cloakbrowser` 的 npm registry 元数据，以及
  `CloakHQ/cloakbrowser` 仓库。MIT 包装层，专有二进制。
* **Codex 内置浏览器**：OpenAI 自己的文档（`developers.openai.com/codex/browser`，会重定向到
  `learn.chatgpt.com/docs/browser`），以及关于桌面应用浏览器面板和 agent 光标的同期报道。
* **Chrome 136 远程调试限制**：Chrome for Developers，"Changes to remote debugging switches to
  improve security"。
* **第二轮测量（2026-09-09，本机，只读 —— 没有启动任何东西）：** 已安装 CLI 自己的 `--help`
  （配置优先级、环境变量表里那个"默认关闭"的 idle timeout、布尔覆盖语法）；对
  `bin/agent-browser-linux-x64` 做 `grep -a` 拿到 `--allowed-domains` 的拒绝字符串；
  `/proc` 拿到 §1.2 里每个 Chromium 的进程数、RSS、PSS 和 inotify instance 数字（四个由本仓库自己的
  测试腿留下的空闲 headless 实例），以及 `/proc/sys/fs/inotify/max_user_instances` 拿到那个天花板；
  `~/.agent-browser` 拿到重新计数的目录数，`du` 拿到 98 GB / 6.8 GB 的数字。
* **VibeSpace（第二轮新增）：** `src/spend-authorizer.js`、`src/server/conversation-deliver.js`、
  `scripts/test-spend-paths.mjs`、`scripts/test-vendor-whitelist.mjs`、`src/local-oracles.js`、
  `src/backend-caps.js`（`notificationDelivery`）、`src/ws-create.js`（铸 id 那几行）、
  `src/resume-continuity.js`、`src/reading-repair.js`（`_sessionKeyMap`），以及 2026-09-09..10 的
  gate 卫生 / fork 税测量。
* **VibeSpace**：`src/vnc.js` 和 `server.js` 里的 `/api/vnc` 桥接、
  `src/lib/desktop-window.js`、`src/lib/browser-window.js`、`src/lib/window-types.js`、
  `src/opencode-serve.js`、`src/port-forward.js`、`src/cli-identity.js`、`src/session-schema.js`、
  `src/lib/settings-schema.js`、`src/ws-create.js`、`data/bin/vibespace-page`、`scripts/ci.mjs`，
  以及 2026-09-09..10 的机器卫生 / fork 税测量。

---

## 附录 B —— 批评日志（第二轮）

一位对抗式批评者读了第一轮并提了八条 finding。每一条在任何东西被改之前都对着源码核对过；核对用的命令
和确切证据在下面，因为"已核实"是一个关于跑了什么的主张，不是一种对 diff 的感觉。**八条全部成立。**
其中两条带一处更正，是批评者的子主张不精确的地方，而两处更正都让那条 finding *更糟*，不是更弱。
在核对过程中另外发现了三个缺陷，记在最后。

| # | Finding | 判决 | 落在哪 |
|---|---|---|---|
| 1 | 空闲交还投递一个没人打字的 turn，而 804 行里哪儿都没提到花钱授权器 | **成立**（一条子主张已更正） | §4.3.1（新增）、§9 的 `test-spend-paths` 行、§10 P3、D11 |
| 2 | §1.1 和 §3.2 对 `config.json` 的 `profile` 断言了相反的东西，所以 P0 站不住 | **成立** | §1.1（优先级）、§1.5（拒绝清单）、§3.2.2（变体表）、§6.3、§8.4、§9、D12 |
| 3 | `use` 打印裸 CDP URL —— I2 被文档化的幸福路径击败 | **成立** | §5.1、§3.4、§6.2、§6.5、D6 |
| 4 | `vs-<webuiId>` 不是那个对话；每次 resume 泄漏一个 pinned 标签页和一份会关掉 idle timeout 的租约 | **成立** | §3.2.1、§3.3、§3.5（开机对账）、§9、§12.13 |
| 5 | 关于 `test-vendor-whitelist` 的那个主张是假的 —— 它是一次源码普查，看不见一个二进制的流量 | **成立** | §9（主张已删除）、§7.2.1（新增）、§12.3、D4 |
| 6 | P4 和 P5 没有套件，而 §9 自己的开篇句子就把这叫做不合格 | **成立** | §9（`test-browser-providers`、`test-browser-housekeeping`）、§10 |
| 7 | P0 把一个 Chromium 变成 N 个而全文从未测量它；I4 的措辞把默认路径排除在外了 | **成立** | §1.2（已实测）、§2（I4 重新措辞）、§3.2.3、§3.5（天花板）、D13、§12.10 |
| 8 | 头条排期只公布了一个区间的点估计，而风险段落指的正是那个区间的上端 | **成立** | §10（区间 + 风险加权头条；"大约一周"那个主张已更正为约 3 天） |

**核实笔记，包括那两处更正。**

* **Finding 1，被更正的子主张。** 批评者写道，把公告路由过投递梯"在每次触发时都会被拒绝（一个悄悄
  死掉的功能）"。那只在生产者声明了自己的 `spendReason` 时才为真。
  `src/server/conversation-deliver.js` 把一个未知或缺失的理由默认成 `'peer-message'`
  （"一个未知/缺失的理由就是 'peer-message'，和通道本身用的同一个保守默认值"），而那是一个**已声明的**
  理由 —— 所以一次不带理由的调用是被计费，不是被拒绝。那比批评者的版本更糟而不是更好：这个 turn 被记在
  另一个生产者的名下，而预算日志加上"For you"通知两边都归错了账。这条 finding 里其余部分完全精确：
  `SPEND_REASONS` 是 `Object.freeze({...})` 带五条条目，而 `authorizeUnattendedSpend` 对其它任何东西
  返回 `no('unknown-reason', …)`；`scripts/test-spend-paths.mjs` 声明了 "PER SITE, NOT PER FILE"，
  其 primitive 之中就有 `deliver-ladder: /deliverToConversation\s*\(/`；而 `notificationDelivery()`
  只对 `peerDelivery === 'rpc-queue'` 且带 `inputModes.steer` 的返回 `steer`，也就是说 claude 的通道是
  `cli-inbox`，而一个空闲的接收方就是一个计费 turn。
* **Finding 2，两个方向都已核实。** CLI 自己的 `--help` 打印出 §1.1 里引用的那张优先级表
  （配置文件 < 环境 < 标志），所以那个 `profile` key 确实作用于每一次没被覆盖的调用，而一个环境变量
  也确实是一种合法的覆盖 —— 而这正是这个修法之所以可能的原因。`--allowed-domains` 的拒绝字符串是从
  已安装的二进制里枚举出来的（对 `bin/agent-browser-linux-x64` 做 `grep -a`），而批评者引用的那条
  字符串是逐字准确的；真正有用的发现是那份清单里**缺席**的那个（`--session`），而 §6.3 现在就立在
  它上面。
* **Finding 5，已核实。** `scripts/test-vendor-whitelist.mjs` 走 `src/`（跳过 `src/lib`）、
  `server.js` 和 `data/bin/`，在一个请求 primitive 附近匹配
  `/api\.anthropic\.com|platform\.claude\.com|console\.anthropic\.com|claude\.ai\/|anthropic-beta/`；
  它自己的头部说这份契约是"哪些代码可以构造一个到 Anthropic 的请求，被钉在这里"。批评者的修法被采纳，
  并且通过指向 `src/local-oracles.js` 得到了改进 —— 那里已经实现了这里正需要的那套证明纪律
  （tool + date + version + 每次运行的 INET connect 计数，在 `strace` 和 CLI 都在场时实时重新测量，
  而被测量过并被否决的候选永远保留作为负控）。唯一值得说明的微妙之处：CloakBrowser 自己不可能成为一条
  `local-oracles` 条目 —— 那份注册表是给**零网络**读取的，而浏览器是一个网络工具。它借的是形状，
  不是判决。
* **Finding 8，算术已重新推导。** 第一轮各阶段的区间加起来是低 21 / 高 41，而公布的点值是 27；
  批评者的数字是准确的。第二轮的阶段变了（P0、P3、P4 和 P5 都长大了），所以新的数字是 25 / 31 / 46，
  风险加权 37。在重新推导的过程中，另一种排序那个 **"大约早一周"** 的主张，用第一轮自己的数字算
  也是错的：P2 在正常次序下第 15 轮完成，在另一种次序下第 9 轮完成，也就是 6 轮 = **3 天**，
  不是一周。已在 §10 更正。

**核实过程中发现的三个缺陷，批评者没有提。**

* **§1.2 那个 idle-timeout 推断在已安装的 build 上没有支撑。** 第一轮把守护进程不在解释成
  "与上游 1 小时的 idle timeout 一致"，但 0.32.0 自己的 `--help` 说
  `AGENT_BROWSER_IDLE_TIMEOUT_MS … (disabled by default)`。今天在这台机器上没有任何东西会回收一个
  agent 的浏览器。这让 finding 7 实质上更糟，也正是 §3.2.3 显式设置那个超时而不是依赖默认值的原因。
* **那个 1 小时的默认值，在它存在的地方，豁免 headed 浏览器** —— 而这台机器的配置是 `headed: true`，
  所以那个豁免是常态而不是一个角落。已并入 §3.2.3 和 D13。
* **`--session` 不在 `--allowed-domains` 的拒绝清单里。** 第一轮在没有检查到底哪些标志真正冲突的
  情况下就断言了那个临时性的好处；§1.5 的枚举既确认了 §6.3 的意图，也表明它取决于 D12 选中一个没有
  user-data-dir 的变体。

**第二轮刻意没做的事。** 它没有启动浏览器（§12.1 的理由仍然成立，而 §12.11 陈述了因此未被测量的那一条
主张），它没有改动 §3.6 的三层路由，而且它没有软化第一轮自己"我没能核实的东西"里的任何一条 ——
那份清单从 9 条长到了 14 条。
