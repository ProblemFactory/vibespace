> 中文版 — 与英文原稿 docs/design-agent-browser-v2.md 同步于 86719ee0 + 本次第四轮修订；以英文版为准的只有代码标识符。

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

**第三轮（2026-09-10）** 回答 owner 的四个问题，并且是把每一个**折进**架构、阶段与决定里，而不是
附在后面：**Q1 会话持久化的 UX** —— 用户怎么用一个动作把一个会话钉到一个 profile 上、那个钉子怎么
活过 resume 与 fork、一个岗位怎么带默认值，以及中途钉住怎么在**不重启**的前提下到达一个**正在跑**的
agent（§3.2.5，D14–D16）；**Q2 活的 backend 切换** —— 把同一个 user-data-dir 交给另一个二进制的机制、
单向的 Chromium 版本阶梯、指纹变化的代价、席位这道门，以及"这个页面被挡住了"是 agent 提出的一条
**主张**、绝不是我们制造出来的一次检测（§7.4，D17）；**Q5 窗口绑定** —— 标签页组长出并排布局，
于是一个被 agent 驱动的浏览器不会丢失它的 owner（§4.6，D18–D19）；**Q6 原生客户端窗口** ——
在一条差网络上怎么渲染**一个**原生窗口，以及另一件事：agent 到底读不读得到那个客户端的消息
（§4.7–§4.8，D20–D21）。两个新阶段（P7、P8）与四个新套件承载它们，§10 的总量重新推导，§12 从 14 条
长到 22 条 —— §1 的实测数字未变，除了本轮在这台机器上重新测过的那几处。

**第四轮（2026-09-10）** 回应了对第三轮的对抗式批评：六条 finding，**全部成立**，核实证据在
**附录 C**。其中一条是渲染层面的、也是最要紧的 —— 一个空行终结了 §11 的表格，于是这一轮全部八条
新决定 **D14–D21 在任何渲染器里都是一堵竖线**；另外三条把三处"借来的机制"换成真正成立的那一条
（徽章的颜色源、`split` 的不变量、`task-group` 这个 origin 的合法性），一条把 §4.7 那句被产品自己
证伪的普遍断言换成具名例外，最后一条让 §10 那句封顶的话引用它自己表里的数字。**没有一条决定的推荐
值因此改变。**

**第五轮（2026-09-10）** 回答 owner 的三个问题，并且照旧把每一个都**折进**架构、阶段与决定里，而不是
附在后面：**Q7 多浏览器、多 agent** —— 一个会话可以同时驱动**好几个**浏览器，一个 agent 还可以派生
各自带浏览器的子 agent，于是"钉住一个 profile"变成**一个集合的默认值**而不是一个单例，每条命令都按
**handle** 寻址，而"用一个个人 profile 和一个工作 profile 对账"这种任务成为一等形状（§3.7，D22–D24）；
**Q8 显式选择 profile** —— 反默认失明的机制分三层落地：工具面的每条回答都点名它作用在哪个 profile 上、
附着集合一变就用一条 typed `profile_changed` 拒绝逼下一条命令写清楚、模型面的每轮微提醒、以及界面上
那枚在"agent 实际用的"与"你钉住的"不一致时变琥珀色的芯片（§3.8，D25–D26）；**Q9 本地窗口作为
computer-use 目标** —— 能不能像操作浏览器那样操作**任意一个本机原生窗口**：一个与浏览器目标并列的
`vibespace-window` 家族、按平台如实列出的能力矩阵（X11/Xwayland、Wayland 的三条道、我们自己起的嵌套
合成器、配对的 Mac）、把 AT-SPI2 无障碍树当作原生窗口的 DOM 来评估、租约与接管的安全模型、以及它
自己的阶段 P9（§4.9、§5.1.1、§6.6，D27–D30）。§2 增两条不变量，§9 增三个套件，§10 重新推导总量并把
P9 计入风险加权列，§12 从 23 条长到 31 条。**本轮所有关于这台机器的断言都是当天只读实测的**（GNOME
Wayland + Xwayland、AT-SPI 的 9 个应用与它的遍历速度、`org.gnome.Shell.Introspect.GetWindows` 的
AccessDenied、`/dev/uinput` 的 0600、portal 的接口清单、128 个 inotify instance 里已经被占掉 80 个），
每一条都写在它支撑的那句话旁边。

**第七轮（2026-09-11）** 回答 owner 的一条指令与一个队列里的问题，照旧把两个都**折进**架构、阶段与
决定里：**集成密钥的配置界面** —— owner 逐字「对于指纹浏览器和 communication panel 这种可能需要
配置自己的 key 的情况，要考虑怎么提供配置界面，让我们集群里的用户可以自行配置（当然 lark 这种集群里
能提供默认 oauth client 的就提供默认）」。本 track 是那个**共享集成与密钥层**的**消费方**（层本身
定义在 communication panel 那份文档里）：`cloak` 与每一个 `cloud:<name>` 的 key 成为
`src/integration-registry.js` 里的一行，由 `src/server/integration-store.js` 加密落盘、按
**用户自己的 > 集群默认 > 没有**解析，切换器上多一枚来源芯片，没配 key 是一条具名拒绝加一条
`app.openIntegration(id)` 的可执行出路（§7.5，I8，D32–D33）—— 其中有一条是在核实过程中发现的、
**今天就成立的**陷阱：`agentEnv()` 是一张 **DROP 清单加一条前缀规则**，所以一把按**供应商自己的**
env 名注入的集群 key 会出现在每一个 agent 的环境里（`src/ws-handler.js:112-121`），这就是为什么集群
只能按 `VIBESPACE_INTEGRATION_*` 注入。**Q10 检测阶梯** —— owner 2026-09-10 的问题「agent-browser
是 CDP 吗，Mercury 这类银行会不会检测……是不是还得一个纯 computer use 版本」：答案是 agent-browser
从头到尾就是 CDP（二进制实测）、今天的隐身只有一个用户自己写在 config 里的启动标志、上游 issue #120
仍然 open 地承认这不够、经典的 `Runtime.enable` 泄漏已经基本死了因而任何针对单个泄漏的补丁都是会
过期的资产、而**银行走的是设备指纹 + 行为 + 新设备升级验证**，于是一个指纹浏览器在那类站点上可能
比默认 Chromium **更糟**。落地是 §7.1 里三个并列的 provider 行（tier 1 CDP / tier 2 指纹 CDP /
tier 3 **纯 computer-use、打在用户自己真实浏览器上、没有 CDP 也没有自动化标志**）、`siteHints` 多一
个**只在还没选定 provider 时才合法**的 `tier` 且**永不自动升级**、以及 tier 3 自己的阶段 P10
（§7.6，D31）。§2 增一条不变量 I8，§3.3 与
§3.6 各增一条规则/一行，§9 增一个套件与四条 key 腿，§10 的 P4 从 9 轮变成 10 轮并多一条**跨 track
依赖**、新增 P10 并重新推导总量，§11 增 D31–D33，§12 从 33 条长到 39 条。**本轮关于已装 build 的每
一条断言都是当天对着 `bin/agent-browser-linux-x64` 与它的 README 只读实测的**，而关于本仓库的每一条
都带 file:line。

**第八轮（2026-09-11）** 回应了对第七轮的对抗式批评：八条 finding，**全部成立**，核实证据在
**附录 E**。三条 high 全部落在第七轮自己新写的那一节上，而且三条讲的是同一件事 —— **一条被声明
出来、却没有人去执行它的合约**：①六个注册表行声明了 `test` 却既没有 `test.kind`（共享层那是一个
**封闭集**）也没有 runner 注册点，还顺手带进来五个从没被声明过的第三方主机 —— 而共享层敢说"store
自己不构造任何 vendor 请求"的**前提**正是消费方已经声明过自己的主机；现在六行各有 kind、六个
runner 全部由 `src/server/browser-backend.js` 注册、`cloak` 那一行退成 `shape-only`（一次真的
启动式探测会同时触发那 200 MB 下载与 §7.2.1 的出网前置条件，而这两件事不该由"打开卡片贴一把 key"
触发），并且多出一条**按行推导**的出网声明（`browserless` / `kernel` 的主机**就是用户自己填的
字段**，所以一张常量白名单在这里是错的形状）。②席位的**总数**只有一个来源 —— 人点一次 Test ——
而 D32 推荐的配置恰恰保证了那一次点击**永不发生**；现在总数是**三态**（已知且新鲜 / 已知但陈旧 /
**未知**），档位改由**第一次真正的启动**读回，`SEAT_TIER_STALE_MS` 与本仓的 `OVERAGE_STALE_MS`
同形，而**一个未知的总数永远不满足上限判定**。③失败形态是**三个**不是两个：一把机队共享的免费档
key 只有一个席位，而 keeper 只数得到本实例，于是上限拒绝在 D32 的推荐配置下**结构上到不了**，
用户看到的是一次没有名字的启动失败 —— 正是 §7.4 自己上面那句"把这件事藏起来，用户会排查半天"；
新增 `backend_seat_taken`，并把它定为 D32 推荐值的一条**明写前置条件**。四条 medium：key 今天没有
跨机通道却被放在一个 keeper 会跑在配对设备上的阶段里（`keyScope: 'local-only'` + 新的 **D34**）、
`siteHints.tier` 与 §3.3"不许存第二份 tier"自相矛盾（规则收窄成"`tier` 只在 `backend === null` 时
合法"，两份 schema 块同改，门禁改成断言这一句）、`consumers` 六行里有五行写的是**它自己**（换成
真正调用 `resolveIntegration` 的两个模块路径）、`local-window` 被当成一个可以被"切换"过去的
provider（新增能力格 `keyScope` / `canSwitchTo` / `ownsDir` / `leaseKind`，外加 §7.6 的新规矩 3）。
一条 low 把 `cloak` 走 env 的理由改对（三条通道里不落盘的有**两条**，而按 §6.5 自己的威胁模型 env
是弱的那条；真正的理由是 `cloakserve` 是**独立进程**，进程内那个选项根本够不着）。§7.1 增一张能力
格表，§7.4 的席位与失败形态重写，§7.5 增 Test 合约表、出网声明与 runner 注册点，§7.6 从四条规矩
变成五条，§9 的 key 腿从四条变成八条并给 `test-browser-backend` 加了席位三态与来源分岔，§11 增
**D34**，§12 从 39 条长到 41 条。**P4 的轮次没有动（仍然是 10），理由写在那一格里**。

**第六轮（2026-09-10）** 回应了对第五轮的对抗式批评：六条 finding，**全部成立**，核实证据在
**附录 D**。两条 high 各自指出一个**上线当天就是假话**的断言：反默认失明的整套机制住在
`vibespace-browser` 里，而本设计**自己的默认路径是一条直接的 `agent-browser` 调用**，于是 I6 被改窄成
"经我们 CLI 的命令"，同时把能结构性收口的那一半真的收了口（非默认附着的目录由服务器铸名、从不打印，
§3.7、§12.32）；而 §4.9 的能力律只对一个动词执法，可四个动作动词里 `key`（和弦）在无障碍树上**一条
路都没有**、`click @ref` 只对**自报动作**的节点成立 —— 本轮为此**重新实测**，得到比批评者更强的数字
（九个应用 503 个节点：`Action` 66 个、`EditableText` 33 个，而 **43 个 `button` 节点里只有 6 个**
导出 `Action`），于是那张矩阵的动作行拆成四行、§5.1.1 加了一张按动词的能力表、D28 收窄到它实测支持
的范围。三条 medium 各自杀掉一句"关于不存在的机制的话"：子 agent 那一行与 D23 的自相矛盾、
"零新机制"（`pendingNotice` 是**一个**槽、一个写死的渲染器、消费一条就 `break`）、以及那一行登不下
两个值、换成对象又让 digest 变成常量的 `LIVE_SESSION_FACTS`。一条 low 把 AT-SPI 遍历放回
"never block the event loop"这条法下（有界子进程、每调用超时、节点预算），并点名本轮每个数字所经的
那个绑定（`libatspi` 的缓存，§12.33）。**没有一条决定的推荐值因此改变** —— 变的是 D23 与 D28 各自被
收窄到实测支持的范围；§12 从 31 条长到 33 条。

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
| I6 | （隐含，Q7/Q8）一个会话可以同时握着好几个 profile | **一条经我们 CLI 的命令作用在它自己点名的那个 profile 上；当可选的不止一个时，它必须点名。** 歧义按名字被拒绝并列出可用的 handle，绝不由一个默认值替它决定；而每一条回答都说出它刚刚作用在哪个 profile 上——所以"用错了 profile"这件事在下一条命令就会被看见，而不是在任务做完之后。"经我们 CLI"这几个字是承重的，不是措辞上的谨慎：本设计的默认路径**就是**一条直接的 `agent-browser` 调用（§3.2 的全部是四个环境变量），它够不到我们任何一段代码。§3.7 把这条残留连同它那一半结构性收口一起写出来 —— 一个不能对默认路径成立的不变量，如果不改窄措辞，上线当天就是假的。 |
| I7 | （隐含，Q9）一个窗口目标就是用户的桌面本身 | **一个原生窗口像标签页一样被租，像 DOM 一样被观察。** 只有租约持有者是 agent、且用户没有接管时才允许注入输入；能读到无障碍树时就绝不靠像素猜坐标；而我们**没有启动**的窗口是另一条更严格的道（D27）。 |
| I8 | （隐含，owner 2026-09-11）集群里的用户要能自己配 key | **一把 provider key 由用户拥有、由集群提供默认值、并且一步都不靠近 agent。** 优先级恒为"用户自己的 > 集群默认 > 没有"；一个消费方**永远不自己读 `process.env`**，它问 `resolveIntegration(id)`；集群只按 `VIBESPACE_INTEGRATION_*` 注入，因为那正是 `agentEnv()` 结构性丢掉的前缀（`src/ws-handler.js:117`），而供应商自己的 env 名只在那**一个**被 spawn 的 provider 子进程里出现；没配 key 是一条**具名拒绝加一条可执行出路**（打开那张卡），绝不是静默回落。 |

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

#### 3.2.5 钉住 (pin)：一个会话怎么拿到一个持久 profile，以及那个选择怎么活下去

（Owner 问题 Q1。）§3.2 的默认值是**易逝的**，这是对的：绝大多数浏览要的就是"打开、读、扔掉"。
但有一类会话不是 —— 一个要登录供应商后台、要守着一个工作账号的会话，它每次都需要**同一个**
cookie 罐。这一节说：用户怎么用最少的动作把这件事说出来，以及那句话怎么活过 resume、fork 和重启。

**这是一个旋钮，而这个仓库已经有旋钮的阶梯。** `src/resume-continuity.js` 的 `resumeSpawnPick`
回答的正是这个形状的问题：**显式**选择压过一切；没有显式选择时，一次**续跑**恢复这个对话自己的
取值；一个**新建**会话拿实例默认值；而答案的**来源**（origin）是被陈述出来的，不是被推断的。
profile 的钉子逐字用这一条：

| 梯级 | 事实来源 | origin |
|---|---|---|
| 用户或 agent 为**这个会话**做的显式选择 | `session-meta.browserProfileId` | `chosen` |
| 这个**对话**上一次跑在哪个 profile 上（resume / restart） | 注册表 + `_sessionKeyMap` 的联结 | `conversation` |
| 这个会话所属**岗位**的默认 profile | `task-groups.json` 的 `browserProfileId` | `task-group` |
| 实例默认（设置项 `browser.defaultProfile`，默认为空） | 设置 | `instance` |
| 什么都没有 ⇒ 易逝，§3.2.2 的变体 D | —— | `harness` |

`hasSource` 在这里恒为 **true**，理由和 `browserKey` 一样：这个旋钮的来源不是某个 harness 的转录，
而是**我们自己的注册表**，它按构造是可读的。

**`task-group` 是往一个被冻结的四值词表里加第五个值，这是一次两处的改动，必须点名。**
`src/resume-continuity.js:56` 是 `const SPAWN_ORIGINS = Object.freeze(['chosen','conversation',
'instance','harness']);`，注释逐字写着"两层共说的词表（客户端在 `src/lib/agent-meta.js` 里给这些
字符串上标签；别的地方一律不许发明一个）"；而客户端那份镜像 `spawnValueOrigin`
（`agent-meta.js:338`）恰好白名单这四个，落不进就掉进 `responseStyleOrigin` —— 也就是说，一个第五
个字符串**不会报错，只会静默显示一个错标签**。所以两条路二选一，同一次改动里说清楚：**(a)**
`'task-group'` 同时加进 `SPAWN_ORIGINS` 和 `spawnValueOrigin` 的白名单（外加 zh/ja 词条），或者
**(b)** 钉子根本不借这个词表，自己带一个 origin 类型。本设计选 **(a)**，因为钉子的其余四级和它们
逐字同义，两套词表才是真的孪生。`test-browser-pin` 的 fast 腿要断言这一条：产品发出的每一个 pin
origin 都在 `SPAWN_ORIGINS` 里，且客户端镜像认得它（负控 = 一个词表外的字符串必须让它变红）。

**这一级不许改 `resumeSpawnPick` 的签名。** 那是一个 PURE 函数，服务着 model / effort /
response-style 每一个旋钮；往里加第五个梯级，就是让每一个旋钮背上一个只有 profile 需要的概念。
做法是先把"岗位默认 vs 实例默认"解析成一个值**再**调它，然后把 `instance` **换成**
`task-group`。**这不是 `applyOriginHint` 的降级**（上一版这么说，是错的）：那个函数自己的契约
逐字是"它只许把一个 `chosen` **降级**成一件用户没有声明过的事实，绝不上调、绝不重指"，即
chosen → instance/harness；而 `instance → task-group` 是一个**更具体**的主张，方向正好相反。
真正成立的理由是另一句：**`instance` 和 `task-group` 说的是同一件事 —— "这个值不是用户为这个会话
说的"** —— 所以用后者替掉前者只是**加了信息，没有改动那个主张**，更没有改动那个**值**。

**fork 拿到钉子，但不拿到 key。** 这是两件事：`browserKey` 是**身份**（一个 fork 是一个新对话，
它不该继承别人的 pinned 标签页，§3.2.1），而 profile 的钉子是**偏好**（"这类活儿用这个登录"），
分叉出来的那条继承它才是用户想要的。所以 fork 铸新 `browserKey`、**复制** `browserProfileId`，
并且日志把这两句都说出来。

**UX：钉子只有一个入口，但它出现在四个已经存在的面上。** 它们不是四份实现，是同一个命令
（`session.pinBrowser`，注册在 `contributions.js` 的命令表里）在四处的 `registerMenuItem`：

* **侧栏会话卡右键** —— `'session-card'` 菜单，`3_admin` 组，紧挨着 `session.switchBilling`
  （同一类动作：换一个这个会话跑在上面的身份）。这是最快的那条路：右键 →"浏览器 profile"→
  已有 profile 的列表，顶上两项是 **"从这个会话当前的浏览器新建持久 profile…"** 和 **"不钉（易逝）"**。
* **Session Properties** —— 一个"浏览器"段，和 `Billing` 段并列：当前 profile、它的**来源**
  （上表那一列，逐字："你为本会话的选择" / "这个对话自己的取值" / "岗位默认" / "实例默认"）、
  backend chip（§7.4）、attach 着的会话数，以及同一个选择器。这是**解释**那一面；右键菜单是
  **动作**那一面。
* **实时视图窗口的标题栏** —— profile 名字就是那个窗口的标题；点它开同一个选择器。一个正看着
  浏览器干活的用户，想改的就是**这一个**。
* **新建会话对话框** —— 一行选择器，若这个会话绑了岗位就默认取岗位的默认值。这一行发出去的是
  **显式**值，服务端只会读成 `chosen`，所以客户端要像 model / effort 那样把它自己算出来的 origin
  作为 `spawnOriginHint` 一并发出（B-6b6d r3 那一条：客户端替用户填的东西，线路上必须说出来它是
  替他填的）。

**"从这个会话当前的浏览器新建一个持久 profile"** 是那个菜单里的第一项，它做的事有名字：**adopt
（收养）**。在变体 C 下，这是把 `data/` 下那个按 `browserKey` 命名的 scratch 目录**移动**到
`~/.agent-browser/vs-bp-<id>` 并写一条注册表记录 —— 当下这个登录状态原地保住。在变体 D 下
**没有目录可以收养**（那正是 D 的全部意义），所以那一项在 D 下的诚实形态是"新建一个空的持久
profile 并**重开**这个浏览器"，菜单里就得这么写，而不是让用户以为他刚才那次登录被保下来了。
这是 §7.1 那条能力律的又一个实例：做不到的控件带着理由禁用，而不是在使用时失败。

**中途钉住必须到达一个正在跑的 agent，而且不许重启。** 三条路，各有各的诚实边界：

1. **环境变量到不了。** 一个已经 spawn 的 shell，它的环境不可变。所以我们不去改它，而去改它
   **指向的那个东西**：变体 D 下 `AGENT_BROWSER_CONFIG` 指着一个文件，那个文件对被钉住的会话变成
   **每会话一份**（按 `browserKey` 命名），钉一次就是一次 `writeJsonAtomic`；变体 C 下
   `AGENT_BROWSER_PROFILE` 指着一个**符号链接**，而重指一个符号链接（symlink-to-temp + rename）
   正是 `src/account-material.js` 的 `repointPoolSymlink` 已经在做的事 —— 这里逐字借它，不写第二份。
   **它的失败模式也逐字继承：重指对一个已经跑起来的浏览器无效。** 账号池那边的教训是"re-point 在
   CLI 的**下一个**请求才生效"；这里是"在**下一次浏览器启动**才生效"。所以钉住一个手上有活浏览器
   的会话，要么等那个浏览器空下来由 keeper 收掉，要么明说"新 profile 从下一个浏览器开始生效"——
   UI 说哪一句取决于此刻有没有租约，那是一个**可以查的事实**，不是一个猜测。
2. **agent 自己问。** `vibespace-browser status` 打印当前 profile、它的 origin 和租约。这是拉的
   那一半，永远可用，零成本。
3. **推给它，而且默认不花钱。** 钉住是一次**用户动作**，也就是说用户此刻就在那儿打字 —— 所以走
   `src/session-status.js` 已经有的 `pendingNotice` 通道：把一句 `<system-reminder>` 挂在用户
   **下一条**消息上。零计费 turn —— 但**不是**零新机制：那个槽今天是**一个**固定形状的位置、只有一个
   写死的渲染器、而注入点消费一条就 `break`，所以本设计的两个生产者（这条 `'browser-pin'` 与 §3.8
   第②层那条 profile 变更）会互相盖掉，也会盖掉状态覆盖那条。§3.8 第②层写出了那次改动 —— 队列化 +
   按 `kind` 分派 + 注入点排空 —— 而它是这两处共用的一次改动，不是各做一份。只有当会话**空闲**且用户明确要求时，才走 §4.3.1 那条
   投递梯（新的具名理由 `'browser-pin'`，和它的生产者在同一次改动里加进 `SPEND_REASONS`），
   设置项 `browser.announcePin` 默认 **OFF**。这就是 §4.3.1 那张"三个时刻三个答案"表的同一条规矩，
   套在第四个时刻上。

**岗位默认（一个岗位可以为它名下所有会话带一个默认 profile）** 是 `task-groups.json` 上的一个
字段和 task-detail 里的一行选择器，与 `contextDir` / `externalVisibility` 同级。它只是上表的
第三级：它**从不**压过一个会话自己的显式选择，也从不压过这个对话自己的历史取值。绑定或解绑一个
岗位**不会**去改已经在跑的会话的钉子 —— 一个默认值是新会话的起点，不是对既有会话的追溯改写。

**而这个钉子是一个集合的默认值，不是一个单例（Q7）。** 上面那张阶梯回答的是"一条**没有点名**的
命令落在哪个 profile 上"，而它的答案从第一天起就该被叫作**默认附着**：一个会话握着一个附着**集合**
（`attachments: [{profileId, alias}]`），其中恰好一个被标为默认。集合只有一个元素时，本节所写的一切
逐字不变，这也是绝大多数会话的形状。集合有两个及以上元素时，§3.7 接管：命令必须点名 handle，而钉住
（`pin`）改的只是那个**默认**。这不是把本节推翻，而是把它一直隐含的那个量词写出来。

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
    "provider": "chromium",                 // chromium | cloak | cdp | cloud:<name> | local-window
                                            //   THE BACKEND AND THE TIER (§7.4, §7.6). Never a key:
                                            //   the key lives in the integration store (§7.5).
    "fingerprintSeed": 118293,              // provider-specific; null for plain chromium
    "proxy": null,                          // proxy URL; the SECRET half never leaves the server
    "host": null,                           // null = this machine; else a hostId (ssh host / device)
    "allowedDomains": null,                 // see §6.3 — refused on a persistent profile
    "owner": { "kind": "task|session|instance", "id": "…" },
    "sharing": "owner",                     // owner | instance (§6.2)
    "record": false,                        // per-profile screencast opt-in
    "lastChromiumMajor": null,              // §7.4's version ladder — the highest major that has written `dir`
    "lastBackend": null,                    // which provider wrote it last (forensics beside the major)
    "createdAt": 0, "lastUsedAt": 0, "notes": ""
  }],
  "leases": [{ "profileId": "…", "browserKey": "bk-…", "sessionId": "…", "targetId": "…",
               "since": 0, "input": "agent", "viewers": 0 }],
  "siteHints": [{ "host": "portal.example", "tier": null, "backend": "cloak",
                  "by": "agent", "at": 0, "why": "…" }]   // §7.4 — a CLAIM, with who made it.
                                            //   `backend` MAY be null (a tier-only claim, made
                                            //   before any provider is chosen); `tier` is legal
                                            //   ONLY then — once `backend` names a provider the
                                            //   tier is DERIVED from it (§7.6 rule 2) and is
                                            //   never stored twice.
}
```

`browserKey` 是耐久的那一半，而 `sessionId` 是那个对话*当前*的载体（§3.2.1）：租约按 `browserKey`
查找，而 `sessionId` 存在是为了让开机对账（§3.5）能问出"还有人在扛着这个吗"而不用第二次推导。
一次 resume 就地改写 `sessionId`；它绝不会创建第二份租约。

关于这个文件的三条规则：

* **它是一份注册表，不是一份副本。** Cookie、storage 和指纹材料都留在浏览器自己的目录里。
  搬 98 GB 不是一次迁移，是一次故障。
* **`provider` 就是 backend，而 §7.4 改的就是这个字段。** 这里刻意**没有**第二个 `backend` 键：
  一个问题一个答案 —— 本文档对 `browserKey`、对读数槽讲的同一条规矩在这里同样成立。
  `lastChromiumMajor` 是**另一个**问题（"是谁写过这些字节"），也正是 §7.4 的版本阶梯不能只从
  目录里取的那个事实。**层（tier）同样不是 profile 记录上的一个新字段**：它由 `provider` 推导
  （§7.1 的两张表），因为一个 provider 只在一层上，而多存一份就是给自己造一个会漂移的孪生。
  **但 `siteHints` 里的那个 `tier` 是另一件事，而且不是孪生。** 一条站点主张可以在**还没有任何
  provider 被选中**的时候就成立（"这个站点要 tier 3"），那时 `backend` 是 `null`，而 `tier` 正是
  这条主张**唯一**携带的内容 —— §7.6 的规矩 2 说得很清楚，一次失败只产生一条**建议**，而一条建议
  能说的恰恰只有"换一层"，具体换到 tier 2 里的哪个 provider 是另一个问题。所以规则是一句可以执法
  的话：**`tier` 只有在 `backend` 为 `null` 时才合法**；`backend` 一旦写上，`tier` 就由它推导、
  绝不再存一份。§9 的 `test-browser-tier3` 按**这一句**断言，而不是按"记录里没有 tier 字段"断言
  —— 后者与 §7.6 自相矛盾，而一个与被测设计自相矛盾的门禁，红的是门禁自己。这条区分同样适用于
  §7.1 那张能力格表：**推导住在一张 PURE 表里，落盘的记录一个格子都不存。**
* **一个 profile 引用一个 provider 的 `id`，永远不引用它的 key。** 这个文件里没有、也不会有
  `apiKey` / `licenseKey` / `token` 这样的字段：key 住在 `data/integrations.json` 里、经
  secret-box 加密、由 `resolveIntegration(provider)` 在 keeper **spawn 的那一刻**解析（§7.5）。
  两个后果都是刻意的：**轮换一次集群 env 就轮换每一个 profile**（Drive presets 那条规矩，
  `src/mounts.js:2211`），而 `data/browser-profiles.json` 保持成一个可以整份贴进 issue 的文件。
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
* **子 agent 的租约是父亲的租约加一个后缀。** 一个子 agent 拿到的标签页记在
  `bk-<parent>.<n>` 名下（§3.7），于是父会话的 teardown **按前缀**收掉它们：一个子 agent 结束时
  不出声（它没有 onExit 能给我们），而"父亲没了、孩子还开着一个标签页"是 §1.2 那 53 个孤儿目录的
  同一个故事换了一层。子租约在注册表里是普通的一行，只是 `browserKey` 带后缀 —— 不是第二种记录类型。

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
  **2026-09-25 owner 裁定（取代上面"停掉 / park"两步）：**「不是就算是单一内存2G也不好啊，chrome这么吃内存，
  完全可能超过这个量吧。这个keeper到底是干啥的，没必要别乱加会影响使用的feature」——一个人或 agent 正在用的
  浏览器**绝不**因资源被停、被 park 或被拒绝启动：超过阈值（足迹 ΣPss，绝不是 VmRSS 之和）只在活记录上标出、
  越线开始时发一条通知（"… is using 4.0 GB (PSS) — Stop it from the Browser panel if that is not what you
  expect"）、记遥测 `browser-resource`。（2026-09-25 r2：读数在阈值上下摆动时原规则每隔一个采样就发一条——
  现在报告电平带回滞：连续 3 个采样低于阈值 90% 才重新布防、同一会话每小时至多一条、没有任何客户端收到的通知
  在下一个仍超标的采样用同一个 key 重发；RssAnon+RssShmem 只对单进程判定，多进程时它又是逐进程之和，只记录不判定。）只有产品自己跑的无头 OpenCode serve 仍会被停；唯一判定在
  `src/runaway-guard.js`。起因：一个作为桌面应用启动的 Google Chrome 就绪 3 s 后因 25 进程 VmRSS 之和 2.0 GB
  被停、配置被删、park 60 min。
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
| 钉子的阶梯（§3.2.5）+ backend 切换的判定与它的版本阶梯（§7.4） | `src/browser-profiles.js`（PURE 那半）+ `src/server/browser-backend.js`（ORCH：停/重启/按租约重开标签页） | **PURE + ORCH** | `test-browser-pin`（fast）+ `test-browser-backend`（fast 判定，heavy 切换） |
| provider 的 key（§7.5）—— **本 track 只是消费方**：注册表行 + keeper 在 spawn 前一次 `resolveIntegration(provider)` + 切换器读 `publicView(id)` + `app.openIntegration(id)` 深链 | 层本身是 `src/integration-registry.js`（PURE）、`src/server/integration-store.js`（ORCH）、`src/secret-box.js`（SHARED），**由 communication panel 那条 track 拥有**；本 track 只加自己的注册表行与两个调用点 | **PURE + ORCH + CLIENT**（层）· 本 track = 调用点 | 层：`test-integration-registry`（那条 track 的）· 本 track：`test-browser-providers` 的 key 那几条腿（§9）|
| 可分栏的标签页组（§4.6）：链上的 `layout`/`split`、分隔条、"生在链里"那条路 | `src/lib/tab-group.js`、`src/lib/layout.js`（持久化 + 同步键） | **CLIENT** | `test-window-binding`（headless chrome） |
| 附着集合、handle 解析、歧义拒绝、审计行（§3.7）+ 反默认失明的判定（§3.8） | `src/browser-profiles.js`（PURE：`resolveHandle`/`attachmentsFor`/`handleRefusal`/`profileChangeNotice`） | **PURE** | `test-browser-handles`（fast）+ `test-profile-blindness`（fast + heavy） |
| 原生窗口转发（§4.7）+ 聊天适配器（§4.8）+ 窗口目标的事实与动作（§4.9） | `src/xpra-serve.js`（SHARED 事实）+ `src/window-targets.js`（SHARED：枚举 / a11y 快照 / 输入后端阶梯；**那趟 AT-SPI 遍历跑在一个有界的子进程/worker 里，每次调用一个超时、整趟一个节点预算 —— 每节点一次 D-Bus 往返，而一个不应答的应用会挂到 libdbus 默认的 25 秒，绝不许落在服务器或 daemon 的事件循环上，§4.9**）+ `src/server/xpra-bridge.js` + `src/adapters-chat/<name>.js` + `data/bin/vibespace-window` | **SHARED + ORCH + agent 面** | `test-native-window`（heavy）+ `test-window-target`（heavy） |

`hostId` 是一个参数，绝不是一个分支：`browser-access.js` 挑传输（本地 keeper / `browser-serve`
设备 op / ssh），而下游没有任何东西再问一次"这是远程的吗"—— 和 `src/server/opencode-access.js`
同一个形状。`server.js` 只增加**接线语句块**；它的行数 ratchet 是一道 build 门禁。

### 3.7 一个会话，好几个浏览器 —— 附着集合、handle 与子 agent

（Owner 问题 Q7。）到这一节为止，本文一直隐含地假设"一个会话 = 一个浏览器"。这个假设对最常见的形状
成立，但它对 owner 真正要的那件事不成立：**一个会话可能同时驱动好几个浏览器**（一个个人 profile、
一个工作 profile，任务是把两边的数据对上），而**一个 agent 还可以派生各自要浏览器的子 agent**。本节
把那个量词写出来，并且回答"钉住"在多元情况下是什么意思。

**模型：一个会话握着一个附着集合，其中恰好一个是默认。** 注册表的 `leases` 已经是"哪个会话 attach
到哪个 profile"的记录（§3.3），所以这里不新增存储：一个会话的附着集合**就是**它名下的租约集合，
`session-meta.browserProfileId`（§3.2.5 的钉子）从"这个会话的 profile"改读成"这个会话的**默认**
profile"。`vibespace-browser use <label|id> [--alias <name>]` 往集合里加一个附着并给它一个短别名
（默认取 label 的 slug），`detach [--profile <handle>]` 拿掉一个，`pin` 只改默认。集合为空 ⇒ §3.2.2
的临时浏览器，逐字不变。

**寻址：handle 是命令的参数，不是 shell 的属性 —— 因为子 agent 的 shell 不归我们。** 这条是被一个
实测事实决定的，不是被口味决定的：**VibeSpace 不 spawn 子 agent**。claude 的子 agent 是同一个 CLI
进程里的 sidechain 记录（`src/session-store.js:308` 的 `isSubagentMessage` 读
`parent_tool_use_id || isSidechain`，`src/session-schema.js` 的 `_subNormalizers` 是"每个子 agent 一个
normalizer"的 map —— 一个进程，一条 stdout），codex 的子 agent 是它自己的 app-server 拥有的线程，
两者的环境都在父进程 spawn 的那一刻就冻住了。我们**能**给环境的只有我们自己 spawn 的东西：会话本身
（§3.2 的四个变量）和 Background Work 的 job（`src/jobs.js:375` 的 `jobEnv({…})`，`VIBESPACE_JOB_TOKEN`
已经从那里走）。所以：

| 命令的形态 | 它落在哪 | 集合恰好一个 | 集合两个及以上 |
|---|---|---|---|
| 裸命令（`vibespace-browser snapshot`） | 默认附着 | 正常执行，回答里点名 profile | **具名拒绝** `profile_required`，列出全部 handle 与哪个是默认 |
| `--profile <id\|alias>` | 点名的那个 | 正常执行 | 正常执行 |
| shell 里导出了 `VIBESPACE_BROWSER=<alias>` | 该 shell 的默认 | 正常执行 | 正常执行（等价于每条命令都带 `--profile`） |
| 子 agent 的裸命令 | 它继承来的那个环境 | 与父亲同一个浏览器 —— **这是今天的物理事实**，而 D23 恰恰建议在父亲的默认是一个持久登录 profile 时不要依赖它 | 同上 —— 拒绝（`profile_required`，与裸命令同一条）；"你是一个子 agent"那句附言只在服务端此刻**看得见**一个 sidechain 开着时才加，见下 |
| `--profile <一个路径>` | —— | **拒绝**：本 CLI 的 `--profile` 收的是注册表 handle，路径请用 `vibespace-browser new` 登记 | 同左 |
| 一条**直接的** `agent-browser` 命令（根本不经过我们的 CLI） | 会话 env 指着的那个 user-data-dir，也就是**默认附着** | 正常执行 | 仍然落在默认附着上 —— **我们拦不住它**，见下 |

最后一行是承重的：`agent-browser` 自己的 `--profile` 收的**就是**一个 name 或 path（§1.4），所以一个
已经会用 `agent-browser` 的 agent 会很自然地递给我们一个目录 —— 而那正是 §1.2 里那 53 个没人拥有的
目录的生成方式。同名不同义的旗标必须**大声**分开，并且拒绝里要带上那条能把路径变成 handle 的命令。

**而最后那一行是本节欠的残留，所以它被写出来，不是被绕过。** §3.2 的默认路径**就是**一条直接的
`agent-browser` 调用 —— P0 的全部是四个环境变量，"没有我们的进程、没有路由、没有守护进程"，而 §5.2
的第一条写着"一个一个字都不读的 agent 从 §3.2 拿到隔离"。既然如此，一条裸的直接命令不经过我们任何
一段代码，①层那条 `profile_changed` 拒绝**到不了它**，`profile_required` 也一样。这件事有一半可以
结构性收口，另一半必须承认：

* **可以收口的那一半：让非默认的附着在没有 handle 时根本够不到。** 会话 env 里那份 config（变体 D）
  或那个符号链接（变体 C）只命名**默认附着**的 user-data-dir；一个非默认附着的目录由服务器铸名，
  只交给 `vibespace-browser --profile <h>` 自己 exec 出来的那个子进程，**从不打印**（这就是 §5.1
  那条"`use` 不打印 CDP url"的规矩，推广到目录上）。于是一条直接命令**够不到浏览器 #2**：`--session`
  和 `--profile` 确实都是每次调用的旗标（§1.4），但它填不出一个它从没被告知过的值。I6 因此对
  "默认以外的一切"是**按构造**成立的，而不是靠自觉。
* **必须承认的那一半：一条裸的直接命令永远落在默认附着上，而我们拒绝不了它。** 这就是①层保证的
  边界，它的作用域是**经 `vibespace-browser` 发出的命令**，I6 的措辞已经按这条改窄。诚实的对照是
  §5.1 里关于 CDP url 的那段话，逐字同一个道理：在一台单 uid 的机器上这**不是**一条边界 —— 它去掉的
  是那个*意外*（一个从没被告知目录名的 agent 解析不出它），不是那个*能力*（同一个 uid 当然可以去
  `ls` 那个目录）。真正的强制执行仍然只有 §6.5 的那个代理。

`test-browser-handles` 把这两半分别钉住：有两个附着时，一条带着会话自己那份 env 的**直接**
`agent-browser` 调用解析到默认 profile 的目录、并且**解析不到另一个**；而经我们 CLI 发的同一条裸命令
拿到 `profile_required`。

**子 agent 的默认是它自己的临时浏览器，但它必须自己开口。** 环境到不了它（上一段），所以"每个子
agent 自动拿到一个新浏览器"是一句我们兑现不了的话：一个 claude 子 agent 的裸命令带着的
`AGENT_BROWSER_SESSION` **就是父亲的**。于是诚实的形态是一条动词：`vibespace-browser new-child`
铸一个子 handle `bk-<parent>.<n>`，打印它自己那一行 env（子 agent 在它自己的工具调用里 export，或者
直接每条命令带 `--profile`），而租约按前缀记在父亲名下（§3.4）⇒ **父亲的 teardown 收掉孩子**。父亲
也可以反过来把自己集合里的一个 handle 写进子 agent 的任务描述里（"用 `--profile work`"），那时孩子
**共用**父亲的标签页，`--pin-tab` 的那条互斥仍然成立：一个标签页一个 owner，两个子 agent 拿同一个
handle 就是排队，而不是互相偷标签页。哪一种是对的由任务决定，所以两条都提供，**默认是前者**（D23）：
一个子 agent 最常见的用途是"去查一下这个"，而把它放进父亲的登录态里是更大的授权。**所以上面那张表里
"集合恰好一个"那一格说的是物理事实而不是一句祝福**：一个从不调用 `new-child` 的子 agent 确确实实在
父亲的浏览器里干活，而在父亲的默认是一个持久登录 profile 时，那正是 D23 论证不该依赖的那件事。

**而"你是一个子 agent"这句附言必须有一个说得出它的机制，否则它就是一句关于不存在的机制的话。** 上一段
已经证明：CLI 拿到的 env 和 token 与父亲的**逐字节相同**，所以 CLI 自己分不出这次调用是谁发的 ——
把这句话写进 CLI 的拒绝文案，就是 §6.6 亲手杀掉的那一类（"把窗口捕获说成'走同一条脱敏'会是一句关于
不存在的机制的话"）。能分的只有服务器：它本来就在解析这条会话的 stdout，`session._subNormalizers` 是
"每个正在跑的子 agent 一个 normalizer"的 map（`src/server/stdout/claude-stream-json.js:288` 建、
:1065 在 `task_notification` 之后回收），而一个 claude 父亲在 Task 工具里是**阻塞着的**。于是这句附言
由**路由**在"此刻这条会话有 sidechain 开着"时加上，并且带着它的竞态：回收有 60 秒宽限，所以"刚跑完的
子 agent"与"父亲自己"在那个窗口里分不开。附言因此永远只是一句**诊断提示**，绝不是拒绝的**理由** ——
理由永远是 `profile_required` 那张 handle 列表，它对谁都成立。codex 的子 agent 是它自己 app-server
拥有的线程，我们的 stdout 上没有对等的信号，所以那一侧根本不加这句。

**跨 profile 的工作是一个一等形状，而它落在两条命令上。** owner 的例子（个人 profile 与工作 profile
对账）在这个模型里就是：

```
vibespace-browser --profile work     snapshot          # 工作账号里的那张表
vibespace-browser --profile personal snapshot          # 个人账号里的那张表
                                                       ... 模型自己对账，然后
vibespace-browser --profile work     fill @e7 "…"
```

没有"跨 profile 事务"这种东西，也不该有：两个浏览器就是两个身份，任何试图把它们合成一次调用的 API
都会在第一次失败时说不清是哪一边失败的。注册表记下**哪个会话碰过哪个 profile**（`leases` 的
`since` 加一条 append-only 的 `data/browser-audit.jsonl`：`{at, sessionId, browserKey, profileId,
verb, ok}`）—— 这是审计，不是遥测：一个持久 profile 是一份活的登录凭据，"谁在什么时候用它做了什么"
是用户有权问的问题，而 §6.4 的保留期与归档规则原样适用（`fill` 的**内容**绝不入账，只记动词）。

**实时视图：一个绑定的面 + 一条 profile 切换条，而不是 N 个面。** §4.6 让实时视图窗口能与它的会话
并排绑在一个标签页组里；一个会话有 N 个浏览器时，那**一个**窗口内部长出一条切换条（每个附着一枚
标签，标签上带 §4.6 那枚按会话推导的 owner 徽章），而不是开 N 个面 —— 理由是 D19 已经量过的那条：
三个面在多数人实际使用的宽度下都不可用，而这里的第三个面还要再挤掉一半。切换条上的每枚标签显示它
自己的活动指示（哪一个在跑命令），标题栏显示**当前这个面**的 profile 名（点它打开 §3.2.5 的选择器）。
一个 profile 被**好几个会话**共用时的画法不变：§4.6 那枚徽章变成 N 个点，逐行列在 title 里，源是
`leases`。两个问题两个面：切换条回答"我这个会话有哪些浏览器"，徽章回答"这个浏览器还属于谁"。

**资源上界在多元下会咬人，而它是全机器的。** §1.2 实测每个 Chromium 6 个进程 / 420–667 MB PSS /
**2 个 inotify instance**，而 `fs.inotify.max_user_instances` 在这台机器上是 **128**；**2026-09-10
只读实测：这个 uid 已经占掉 80 个，还剩 48** —— 也就是全机器最多再开 **24 个**浏览器，而这个数字是
所有 inotify 用户共享的（我们的 daemon、watcher、每个 esbuild、每个测试 fixture）。所以 §3.2.3 的
并发上限是**每实例**的，而一个会话自己的附着集合**计入**同一个上限：三个会话各握三个 profile 就是
九个浏览器。keeper 在上限处的拒绝（§3.5）因此要点名**是哪个会话的哪个附着**触到了顶，并提供
"停掉那一个"的入口 —— 而不是只说"到上限了"，因为在多元模型下"谁占着"这个问题第一次有了非平凡的
答案。

### 3.8 "我现在在哪个 profile 上？" —— 反默认失明，三层

（Owner 问题 Q8。）痛点是具体的：一个 agent 在临时默认浏览器里开工，用户中途钉了一个真的 profile
上去，agent 从头到尾没注意到，继续在临时那个里干活；或者两个 profile 都在，它默默用了默认那个，
很久以后才发现两边都需要动。这两种形态的共同点是**沉默**：今天没有任何东西会告诉一个 agent 它的
profile 换了，而它自己也没有理由去问。三层，各自解决其中一段：

| 层 | 机制 | 它能覆盖的形状 |
|---|---|---|
| ① 工具面（到得了正在跑的 agent —— 只要那条命令经我们的 CLI） | 每条命令的**回答**都带 `profile: work (由用户 2 分钟前钉住)`；快照与截图的头部也写它；附着集合一变，**下一条**命令被一条 typed `profile_changed` 拒绝一次 | 一个正在跑的 agent —— 环境变量到不了它，但它自己下一次调用 CLI 一定到得了 |
| ② 模型面（每轮一次，免费） | `pendingNotice`（`src/session-status.js`）在用户**下一条消息**上追加一行 `<system-reminder>`：`浏览器 profile 变了：<旧> → <新>`；会话开始的上下文里列出当前附着集合 | 一个**停着**的 agent，或者一个正在跑但还没再调 CLI 的 agent |
| ③ 界面（给用户，不给模型） | 状态栏 Browser 芯片：agent **最后实际用过**的 profile vs **钉住的**默认；两者不一致时芯片转琥珀色，点开是"agent 还在临时 profile 上 —— 提醒它？"加一个一键推送 | 用户自己 —— 而这一层才是"我钉了，然后呢"这个问题唯一的答案面 |

**①的机制是拒绝，不是通知。** 这条区别是整节的重心：一条被塞进 stdout 的提示只是**希望**模型读它，
而一次 `profile_changed` 拒绝让那条命令**没有执行**，模型必须再发一次并写清 handle。它是**一次性**
的：拒绝之后新的默认就生效，之后的裸命令照常跑（否则一个中途钉住会把这个会话余下的每条命令都变成
两条）。触发条件是**附着集合的指纹变了**（默认变了、加了一个、去了一个），按会话记住"这个会话已经
被告知过这个指纹"，所以它对**每一次变化**恰好说一次话，而不是每条命令说一次。这也是为什么它必须
是 typed（`{ok:false, code:'profile_changed', was, now, handles}`）而不是一句自然语言：§5.1 已经为
`browser_paused` / `tab_gone` 立了同一条规矩 —— **一个 agent 必须能不靠猜就读懂它为什么被拒**。

**②只花它已经在花的钱，但它不是"零新机制"。** 一次钉住是**用户的动作**，所以用户就坐在那里打字，
那条 `<system-reminder>` 搭他下一条消息的车 —— 零计费 turn，与 D16 逐字同一条规矩。**钱这一半是免费的；
载体这一半不是**，而先前的措辞在这里说错了话。今天的 `pendingNotice` 是会话状态记录上的**一个槽**，
形状固定为 `{agent, user, at}`（`src/session-status.js:110/125/141`），`renderNotice`（:177–188）里
写死的是"用户改了你设的状态指示器"那一句，而唯一的注入点消费**一条**就 `break`：

```js
for (const k of [key, `webui:${id}`]) {                 // src/agent-routes.js:563–566
  const notice = sessionStatus.consumeNotice(k);
  if (notice) { parts.push(...); break; }
}
```

于是一条 browser-profile 通知要么得发明一个渲染器读不懂的第二种形状，要么就**盖掉**一条还没送达的
状态覆盖通知（并且被下一次 `setByUser` 覆盖回去）—— 一条被静默丢掉的 `<system-reminder>`，出现在一个
"通知不会被静默丢掉"就是全部意义的功能里。而这不是假想的冲突：本文自己已经要这个槽再背第三个生产者
（§3.2.5 第 3 条路的 `'browser-pin'`）。所以要说的是这个载体**实际需要**什么：把 `pendingNotice`
升格成每会话一条 typed 通知的**队列** `{kind, …}`，`renderNotice` 按 `kind` 分派（`'status-override'`
逐字保留今天的文案），注入点**排空**而不是在第一条上 `break`。这是一次小的机制改动，写成小的机制改动，
而不是写成"零新机制"；它进 P1 的内容行，`test-profile-blindness` 的 fast 那一半用"一条状态覆盖与一条
profile 变更同时挂着、两条都要到达下一条 prompt"来钉它，负控是今天那个单槽行为。

只有"会话是**停着的**、而用户明确要求现在就叫醒它"才走 §4.3.1 的投递梯，用它自己那条已声明的理由（`'browser-profile-notice'`，
与 `'browser-handback'` 同批加进 `SPEND_REASONS`），设置项默认 **OFF**。③里那枚芯片上的"提醒它"按钮
是**每次点击都是一次 owner 动作**，所以它可以走梯子 —— 但它仍然过同一个上限，因为它仍然开一个计费
turn（D26）。

**③要写进 `LIVE_SESSION_FACTS`，否则它画不出来。** `src/lib/sidebar.js:73` 的那张表是
`active-sessions` 载荷会带哪些每会话活事实的**唯一**清单，而 `_mergeAndRender()` 只在它的 **digest**
变化时才重画 —— 这个仓库为此付过六次代价（`worktree`/`outputStyle`/`remoteState` 都在这张表上死过）。
而这枚芯片按定义是**两个**事实并排（agent 最后实际用过的 vs 钉住的），所以先前写的那一行
`browserProfile: { digest: (v) => v || '' }` 是**错的，而且是两次错**：一个标量登不下两个值（钉住的
那一半住在 `session-meta.browserProfileId`，而按本文自己的论证，`LIVE_SESSION_FACTS` 是载荷发布这类
事实的**唯一**清单，于是客户端根本算不出"要不要转琥珀"）；而如果把值改成那个显而易见的对象
`{active, pinned}`，`liveFactsDigestPart`（`src/lib/sidebar.js:96–103`）做的是 `out += ':' + d(s[k])`
—— 在 node 里实测：`{active:'a',pinned:'b'}` 与 `{active:'x',pinned:'y'}` 都 digest 成
`":[object Object]"`，**逐字节相同**，于是这枚芯片在变化时**永不重画**，正好是上一段引用的那一类的
第七次。所以两半都要显式写出来，二选一：两行标量

```js
browserProfileActive: { digest: (v) => v || '' },   // agent 最后实际用过的
browserProfilePinned: { digest: (v) => v || '' },   // 钉住的默认
```

或者一行、但 digest **把这一对投影成字符串**（``{ digest: (v) => v ? `${v.active}|${v.pinned}` : '' }``）。
由此立一条通则，因为它比这枚芯片活得久：**一个对象上的 digest 必须投影，绝不能把对象原样返回** ——
那张表上每一个 `digest: null` 的行都是刻意只 carry 的，而一个**返回对象**的 digest 看起来在 gate、
实际上是个常量。这也改了它的门禁：`test-profile-blindness` 的 heavy 那一半不能只画两次（"一致时中性、
不一致时琥珀"是两次全新渲染，在这个 bug 下照样通过），它必须是一次**变异**：先渲染，再只改同一条会话
的 `active`，断言芯片在没有整表重建的情况下从中性翻成琥珀 —— 负控是把 digest 换成对象上的
`(v) => v || ''`，它必须变红。除此之外这两行属于那张表说的"该 gate 渲染"的那一类：每会话至多变几次的
廉价标量（一次钉住、一次 agent 用了别的 handle），与 `todo`/`auth` 那种每轮变几次、故意只 carry 不
gate 的对象相反。

**"显式选择"这条规矩，以及它的拒绝。** owner 还要一条更硬的：会话有 ≥2 个附着、而用户的消息里
**提到了**某个 profile 的别名时，什么都不许被推断 —— agent 必须点名。机制上这依然是①的那一条
（≥2 就必须带 handle），所以不需要第二套东西；需要的是**手册里写清楚**，以及一条负控：一个会话只有
一个附着时，同样的消息**不会**产生拒绝（否则这条规矩会把最常见的形状也变成两条命令）。这里刻意
**不做**"从用户消息里猜别名"——那是一个基于自然语言的隐式解析，而本节的全部意义是消灭隐式解析。

> **2026-09-25（lane H，日期注记）。** 第③层的芯片与会话卡片现在按记录的名字称呼 agent **自己的**浏览器：
> `Agent browser · (ephemeral) <会话名>`（以前写 `ephemeral (no profile)`，owner 对不上号）。卡片上的芯片只在
> 那个浏览器**运行时**出现（实时事实 `browserLive`）。状态路由的 `leases` 把运行中的一次性浏览器列成一行，标记
> `ephemeral`（owner 当时看到的是运行中的浏览器旁边写着 `leases: []`）。背后的规则：一个持有浏览器的东西，
> 在所有列出持有者的地方都是一**行**（browser-profiles `holderRows`）。
>
> **2026-09-25（lane H verify r1，日期注记）。** 对这一行生命周期的三处更正，外加一次重新测量。(1) 这一行跟随浏览器的
> **进程**，不跟随它的记录：记录在 5 秒一次的 tick 之前都写着 `ready`，在这个窗口里重连的视图会去问 CLI
> `stream status`，而它会**启动**一个没人持有的 daemon（在 0.38.1 上重新测过）。现在每个会按 `ready` 行事的读者都先判断
> pid，桥接也会报告一次性浏览器的 stream 关闭，所以这一行随浏览器一起离开（实测 25 ms，以前要等 tick）。(2) 3 秒的挂载
> 等待只属于**启动**浏览器的那条命令：之后的命令从不等待一个不是它发起的 tap，失败的 tap 在 30 秒内不会被命令重试。
> (3) 对会话自己的一次性浏览器执行 `detach` 会说清楚它做了什么：浏览器现在就停止，记录删除，下一条命令再启动它。它是对**那个**
> 浏览器的 detach（一个点名其会话的一次性接缝事件），所以不会留下陈旧的 tap。(4) `floorVerdict(...).sharedProfiles` 背后的门禁
> test-browser-resources（12 个真实 Chrome）在 0.38.1 上重跑**通过**（71/71，22 秒；k=12：199 个进程，RSS 17.6 GB / PSS 2.9 GB）：
> 同一个指定 profile 的主机上的两个会话各自拿到按 key 的目录，round 2 那一行作为对照复现 SingletonLock 冲突。floor 不变。
> 但那个套件从不把两个会话放在**同一个**具名 profile 上，而冲突的正是这个形状（verifier 的 L3、小白研究里的"bank"），已由 keeper
> 作为唯一启动者修复（见 §4.2 的日期注记），并由 test-browser-mediation-chrome ④ 在真实 0.38.1 上钉住。

---

## 4. 实时视图（1.c）

> **改名注记（takeover T5，2026-09-24，方向 B —— docs/design-browser-faces.zh.md）：** 本节的"实时视图"窗口（`browser-live`）在界面上叫 **Agent 浏览器 / Agent browser / エージェントブラウザ**；工具栏上的嵌入式浏览器叫 **网页视图 / Web view**；桌面应用里的浏览器卡片副标题为 **浏览器应用 / Browser app**。只改显示的名字 —— 窗口类型、openSpec、设置键、rail id 都不动。见 §11a。

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

> **2026-09-25（lane H verify r1 + 小白用户研究 2，日期注记）。** P2 构建时没有的两条规则。(1) **视图从不启动浏览器。**
> P2 让一个已停止的 profile 浏览器的实时视图等于一次启动（"就像 attach"），于是用户自己按了 Stop 之后一点重连就把它重新拉起来；
> 一个已停止的一次性浏览器的视图则显示 about:blank 并写着"Agent is driving"，像是又起了一个新浏览器。现在视图先判断浏览器的
> 进程，不问 CLI 就以 `browser_stopped` 拒绝，保留最后一帧并置灰，徽标写"Browser stopped"，并在摘要显示浏览器重新运行时自动
> 重连。(2) **keeper 是 profile 浏览器唯一的启动者。** 在租约自己的 session 下的每一次 CLI 调用（它的命令、流端口、确认、录屏）都
> 通过 keeper 那一个浏览器的 CDP 地址到达它，从不拿到 profile 目录。在 0.38.1 上 daemon 按 session 分开，第二个拿到目录的
> daemon 会在同一目录上再起一个 Chrome，死在 SingletonLock 上（研究里的"bank"配置，以及实时视图的"Live view unavailable …
> SingletonLock"画面）。每一次调用还会重复它那个 session 的启动视图（空闲超时、headed），因为在 0.38.1 上视图不同的调用会重启
> daemon 并重新拉起 Chrome。每个会话一个实时视图：手动"Open live view"会转到已有的窗口。子代理的浏览器会被记录（一个 `~child:`
> tap），但从不被观看。

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
* **两个尺寸，永远不是一个（lane J，2026-09-25，inc-muhgv0fb-9i4u —— owner："接管浏览器的时候鼠标
  操作位置不对"）。** 流里帧的 `metadata.deviceWidth/Height` 和 status 的 `viewportWidth/Height`
  是流服务器**配置的** 1280×720，从来不是页面（0.32.0 与 0.38.1 实测；Chrome 自己的 screencast
  metadata 说的是别的 —— 上游把它覆盖了）：headless 的页面是 1280×577、JPEG 也是 1280×577；一个
  2560×1440 屏幕上的 headed 窗口是 1265×1277 的页面、被**缩小**进一张 713×720 的 JPEG。所以指针映射
  用画出来那张图自己的尺寸（`naturalWidth/Height` —— `object-fit: contain` 按它留黑边）和页面真实
  的 CSS 视口（桥在服务端经 CDP 读 —— 活动标签页的 `Page.getLayoutMetrics`，在首帧 / 图尺寸变化 /
  活动标签页变化 / 接管时 —— 并给每个观看者发一条 `viewport` 记录）；metadata 只在它的宽高比**就是**
  图的宽高比时才用，否则按图 1:1（`frameGeometry`，src/browser-stream.js）。agent 光标覆盖层走同一个
  rect 基准（`getBoundingClientRect` → `toLocal`）。视口读取引起的守护进程 `cdp_url` 命令/结果对
  永不转发（原始端点永不离开服务器）。真实链路上的前后实测（test-browser-live ⑤，点网格 (10,5) =
  页面 (525,275)，DPR 2/1 × UI 缩放 100/125 % × 1400×800 与 700×900 窗口）：修前 headless 偏 71 px、
  headed 偏 132 px 或被丢弃；修后每个组合 0 px。
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

> **2026-09-25（lane H，日期注记）。** 这个一直开着的中间地带（P5 的动作记录）对会话**自己的一次性**浏览器
> 没有兑现。它只由实时视图的 tap 来挂上，而视图从没打开，所以 owner 的第一个 `open` 之后 `data/browser-trace/`
> 是空的。现在记录由**持有者**挂上，不由观看者：keeper 在 lease 接缝上宣布一次性浏览器的启动，记录器在没有人观看时
> tap **那个**浏览器（`EPHEMERAL_REF`），启动它的那条命令会等到 tap 接通（有上限，3 秒），所以第一个动作就在记录里。
> 实时视图在同一个事件上于对话旁边打开（§4.6 的自动绑定，因为它的持有者行是新的）。视图从不启动一个已停止的
> 一次性浏览器；它变灰，并在下一条命令时重新连接。

---

### 4.6 窗口绑定：一个组，两个并排的面

（Owner 问题 Q5。）实时视图是它自己的窗口（D9），这是对的 —— 但一个正被 agent 驱动的浏览器窗口
一旦被拖走，就**看不出是谁的了**。Owner 的提议是把**标签页组**（`src/lib/tab-group.js`）扩展成
可以并排显示两个标签页，同时仍然是**一个**组。这一节说数据模型、交互、生命周期，以及它为什么
几乎不需要新的几何代码。

**为什么这几乎是免费的：DOM 早就是对的形状了。** 链模型是
`chain = { tabs: [hostId, ...guestIds], active }`，host 拥有那个物理 `.window` 元素，而**每个
guest 的 `content` 元素已经被 append 进 host 的元素里**，靠 `.tab-hidden` 这个 class 决定谁可见
（`restoreTabChain` 里逐行就是这么做的）。也就是说，"两个标签页并排"在 DOM 层面只是**不要给其中
两个加 `.tab-hidden`**，把它们放进一个 flex 行，中间加一条分隔条。窗口的**外部**几何完全不变。

**数据模型：链多两个字段，`tabs` / `active` 一个字节都不动。**

```jsonc
chain = {
  tabs: ['win-1', 'win-2', 'win-3'],   // 不变：tabs[0] 是 host
  active: 0,                            // 不变：split 下 = 拿着焦点的那一面
  layout: 'tabs',                       // 新增：'tabs' | 'split'；字段缺失一律读作 'tabs'
  split: { pair: ['win-1','win-2'], ratio: 0.5, dir: 'row' }   // 新增：仅 layout==='split' 时有意义
}
```

`tabs` 和 `active` 保持原语义，是因为**每一条既有代码路径都读它们** —— `switchTab`、
`_detachFromChain`、`_renderTabBar`、`removeFromTabChain` 的焦点交接、layouts 的持久化、
多客户端同步。split 是同一个链的**另一种渲染模式**，不是第二种链。一个链完全可以有 5 个标签页
而其中 2 个并排：其余的照旧在标签条里，点它们发生什么是一个 owner 决定（D19）。

**`split` 是一份对 `tabs` 的引用，所以它欠一条不变量 —— 而今天没有任何地方在守它。** `pair` 里装
的是窗口 id，而每一处改动链的代码都只 splice `tabs`、别的什么都不碰：`addToTabChain`
（`chain.tabs.splice` / `push`）、`_detachFromChain`，以及 `removeFromTabChain` 经由
`_detachFromChain` 走的 **host 提升**分支（`src/lib/tab-group.js` 477-497：`idx === 0 &&
chain.tabs.length > 1` 时把 `tabs[1]` 提成新 host，把每个 guest 的 `content` 重新挂进新 host 的
元素，再把旧 host splice 出去）。而聊天窗口**通常就是 host**（它先存在，浏览器是被并进*它*的链
的），所以"在一个三标签页的 split 链里关掉聊天那个标签页"是一条**可达**路径：它删掉一个 `pair`
成员，而链还活着。下面那段生命周期只写了两种情况 —— "浏览器那一面消失"和"会话被 terminate" ——
后者对**终止**为真、对**关窗**不为真，而 host 提升与"把另一面拖出去"它一个字都没说。

不变量：**每一次链变动都要拿 `tabs` 校验 `split`。** `pair` 里任何一个 id 不在 `tabs` 里 ⇒
`layout` 塌回 `'tabs'` 并丢掉 `split`（不留悬空 id，也不猜一个替补 —— 猜出来的那一面正是"这个
浏览器归谁"要回答的东西）；而 host **换人**时，即使 `pair` 两个成员都还在，那两面也必须跟着
`content` 一起搬进新 host 的元素并重画 —— 因为 split 就渲染在 host 的元素**里面**（本节开头那条
"DOM 已经是对的形状"反过来就是这个代价）。这条规则住在**一个**地方：一个新的
`_normalizeChain(chain)`，由 `createTabChain` / `addToTabChain` / `_detachFromChain` 各调一次。
它今天**不存在**（`grep -rn '_normalizeChain' src/` 零命中），这正是它要被写下来的理由 ——
三个调用点各自手写一遍校验，就是这个仓库已经反复吃过的孪生漂移。

**持久化走既有的那一个口子。** `layout.js` 已经把 `winState.tabChain = { tabs, active }` +
`isTabGuest` 写进 layouts，恢复走 `restoreTabChain(validTabs, active)`；新增的两个字段跟着走，
写入照旧经 `writeLayouts` —— 那是每一次布局写入的唯一口子，也是布局回滚点挂载的地方。
**字段缺失即 `'tabs'`**，旧记录不需要迁移。

**多客户端同步有一个真的陷阱，现在就点名。** `layout.js` 用 `rw.tabChain.tabs.join(',')` 当键去
比对远端和本地的链。**那个键里没有 layout。** 于是一个远端客户端把同一组标签页从 tabs 切成 split，
本地会认为"这个链没变"而什么都不做 —— 一次静默的状态分叉，正是这个仓库反复吃过的那一类。键必须
变成 `tabs.join(',') + '|' + layout + '|' + (split ? 量化后的 ratio : '')`，或者在比对时显式比较
这两个字段。这一条要配一条会红的断言，不是一句注释。

**gridBounds 一个字都不用改。** `_syncChainBounds` 把 host 的 `gridBounds` 拷给每个 guest；
一个 split 链在外面仍然是**一个**矩形，比例只在它内部分割。所以按比例的网格跟踪、snap、桌面切换、
最小化全部原样工作 —— 这也正是"扩展标签页组"胜过"发明一种新的双窗口容器"的全部理由。

**分隔条的拖动按这个仓库既有的三条律写：** 每次拖动一个**自己的** `AbortController`（绝不是每次
渲染一个 —— 那会在拖动中途把自己拆掉），mousemove 走 rAF 合并，以及**坐标换算一次**：`uiScale`
的 body zoom 会缩放 rect 和 `clientX` 却不缩放 `clientWidth`，所以比例必须在同一种像素里算
（layout px）—— 这和 VNC 指针那次、以及 §4.4 画布那条是同一条律。比例夹在 `[0.15, 0.85]`，
**双击分隔条回到 0.5**。

**交互：**

* **绑定动作**在实时视图窗口的标题栏上（一个"贴到 <会话名> 旁边"的按钮）。点它 = 把这个窗口并进
  那个会话的聊天窗口所在的链，把 `layout` 设成 `'split'`、`pair` 设成这两个。已有的"拖图标到图标上
  合并"照旧工作并产生 `'tabs'`。**（2026-09-23 修订，docs/design-split-ux.zh.md R1–R5）拖动时不再有
  任何并排落区** —— 原先"拖到标题栏的左半 / 右半 = 并排"占了标题栏 80 %、零停留，owner 把窗口拖向
  左侧吸附时误入并排、而且方向由目标标题栏的半区决定（往左拖却落在右边）；它已整段删除，也不加
  body 落区。窗口拖动 = 移动 / 吸附 / 网格，**标签合并（图标堆 / 标签栏落点）是普通拖动吸附的唯一
  例外**。并排是合并之后**显式**的第二步：标签条上一枚两栏图标按钮 `.tab-split-btn`（当前标签在左、
  最近活动的另一个标签在右；合并刚发生时按钮脉冲一次 + 5 s toast "已合并为标签组 · 并排显示"一键）、
  窗口菜单（组内 ≥ 2 个标签时 "并排显示 ▸ 与 {name} 并排（在右侧）"，被点的窗口在左且保有焦点 ——
  每个用户入口都把焦点留在动手的那个窗口（split r1）；并排态改为
  取消并排 / 交换左右）、命令模式（`Ctrl+\` 后 `v` 开关并排、`V` 交换左右，没有组时 toast 提示先合并）。
  实时视图的"并排到 X 旁"也走同一个带撤销的入口。并排态由**同一枚**按钮当徽章（点开 取消并排 / 交换左右，分隔条右键
  同两项），标签条按**视觉顺序**画（左面的标签在左，中间一枚竖线，每面标签用归属色下划线），每次
  用户发起的并排 5 s 内可"撤销"。方向永远由动词点名（默认发起者在左），不由指针位置决定。
* **自动绑定**：设置项 `browser.autoBindLiveView`（默认 **ON**），一个会话的浏览器起来、并且它的
  聊天窗口开着时，实时视图**直接在那个链里出生**，而不是"先创建再合并"—— 后者会产生一次可见的
  跳动，外加一次布局自动保存的抖动。这要求 `createWindow` 能接受"生在这个链里"，那是本阶段唯一
  一处真正的窗口管理器新代码。
* **随时拆开**：从标签条把任一面拖出去，或者标题栏上的"取消绑定"，回到两个自由窗口 —— 走的是
  已经存在的 `_detachFromChain`。
* **移动 / 最小化 / 换桌面一起走**，因为它们本来就是一个窗口。这正是 owner 要的那个性质。

**生命周期：agent 会话结束、或者浏览器关掉，面塌回去，组留着。** 链绝不解散 —— 解散会把用户的
**聊天**窗口挪走，而那是他没要求过的事。所以浏览器那一面消失时，`layout` 回到 `'tabs'`，剩下的
标签页照旧；链只剩一个时走已有的 `_ungroupLast`。反过来，**聊天**那一面结束时（会话被 terminate）
什么都不动：一个死会话的历史仍然可读，而那个浏览器可能还归别人用。第三种情况上一版漏了，现在由
上面那条不变量统一回答：**关掉聊天那个窗口**（不是终止会话）会走 host 提升，于是 `pair` 里那个
成员没了 ⇒ `layout` 塌回 `'tabs'`，浏览器窗口作为普通标签页留在链里；**把任一面拖出去**同理，
经 `_detachFromChain` → `_normalizeChain` 收敛。三条路一个判定。

**归属徽章。** 浏览器那个标签页带上会话的颜色和名字，于是"这个浏览器是那个会话的"在一眼之内成立。
**颜色是按会话推导的，刻意不是会话卡今天那一份 —— 因为会话卡今天没有颜色。** `seqTaskColor` /
`taskGroupColor` 的消费者只有 `sidebar-tasks.js`、`task-detail.js` 和 `session-props.js:499`，
每一处都以一条**岗位**记录为键（`seqTaskColor(t.colorSeq, …)` / `taskGroupColor(g)`），
而 `session-card.js` 一次都没调过它们（`grep -n 'seqTaskColor\|taskGroupColor\|colorSeq'
src/lib/session-card.js src/lib/sidebar-render.js` 零命中）。借岗位色会在这枚徽章最需要它的两种
形态上直接失效：**没绑岗位**的临时会话根本没有颜色可画，而**同一个岗位下的两个会话**会拿到同一个
颜色 —— 后者恰好是徽章存在的理由。所以取的是 `task-color-seq.js` 那个纯序列函数本身，键换成
**会话自己的**计数器：webui id 是 `sess-<seq>-<ms>`（`src/ws-create.js:234`），把那个 `<seq>` 喂给
`seqTaskColor(k)` 就得到这个会话独占的一格（该序列的性质是任意前缀都保持足够远，所以前 N 个会话
两两可分）。岗位色不动，它继续作为**岗位**徽章画在旁边 —— 两个问题，两个颜色源。诚实边界：`<seq>`
跨服务器重启保持不变（`boot-restore.js:200` 复用 `meta.webuiSessionId`），但一次 resume 会铸一个新
的 webui key，颜色会跟着变；这可以接受，因为徽章回答的是"我此刻屏幕上这几个窗口谁是谁"，不是一条
跨 resume 的持久身份。**一个被多个会话用着的 profile 显示所有 owner**：徽章变成 N 个点，title 里逐条列出，数据源就是 §3.3 的 `leases`
（"谁 attach 着"已经是一个被记录的事实，这里只是把它画出来）。这也是这条设计给 (1.b) 那半
"多个会话共用一个 profile"的**可见性**答案。

* **移动端 = 只有标签页。** ≤768px 上 split 没有意义，`mobile-nav.js` 把一个 split 链渲染成标签页。
  但这里有一条必须写死的规矩：**移动端客户端绝不把它自己的这次拍扁写回 layouts.json** ——
  否则一个人在手机上看一眼，桌面那边的分栏就没了。这和多客户端布局同步那四道防乒乓守卫同类，
  实现上就是移动端同步布局时原样保留远端的 `layout` / `split` 字段。

### 4.7 原生客户端窗口：渲染一个窗口，而不是一整个桌面

（Owner 问题 Q6。）像微信这样的聊天工具在 Linux 上有原生客户端，WhatsApp 没有。问题是：在一条
**差网络**上（目标：200 ms RTT / 1 Mbps 下打字仍然可用），怎么把**一个**原生窗口放进 VibeSpace
的浏览器界面里。

**先把一个结论放在最前面，因为它重排了整张表：在 200 ms RTT 上，每一条 agent 也能驱动的路，都要
为每一次按键付一个 RTT。** 页面在这个部署里跑在服务器那台机器上而用户在另一头，所以回显必须走
一趟往返。差别不在"能不能"，而在**它怎么劣化**：带宽是随**一个窗口**走还是随**整个桌面**走，
以及协议在高延迟下会不会自己降质而不是排队。业界对遥控桌面的通行经验也是这一条：延迟压过带宽。

**这条结论有一个具名的例外，必须写出来而不是用一句"没有任何一条路"盖掉它：VibeSpace 今天就发着一
条真正本地回显的路。** `src/lib/browser-window.js` 的 `openBrowser(app, url, { syncId, proxy })` 是
一个带 URL 栏和 proxy 开关的内嵌浏览器窗口，proxy 打开时经挂在 `/proxy/` 的 node-unblocker 全量
改写代理取页（`server.js:636-647`，认证顺序在 `:236`，WebSocket upgrade 分发在 `:1853`）。那条路
渲染出来的是**用户自己浏览器里的 DOM**，打字就是本地回显，一个 RTT 都不欠。它在这里被否掉，理由
是两条具体的、而不是一句普遍断言：（i）页面跑在用户的浏览器里，cookie / localStorage 都在客户端，
**没有 CDP target** —— agent 驱动不了它，而"agent 能驱动"正是 §3 那整套 profile 存在的全部意义；
（ii）一个改写型代理带不动 WhatsApp Web 的 service worker 和它那条长连 WebSocket（§12.23 记着这
一条我没有实测）。所以它留在产品里当"人自己看一眼网页"的工具，不是这一节的候选。

由此，真正的建议是一条**架构**建议而不是一条协议建议：**能让 agent 对着协议或 DOM 说话的路，
永远优于让它对着像素说话的路。** 一个 web 版聊天工具，agent 走 CDP，画面只给人看；一个原生客户端，
画面**就是**两边唯一的接口 —— 这让原生客户端对 agent 而言结构性地更差，而不只是慢一点。

| 路 | 是什么 | 差网络下的排名 | 判定 |
|---|---|---|---|
| **(v) 跑它的 web 版，装在本设计的一个 profile 里** | WhatsApp Web 就是一个 web 应用，它活在一个指纹 profile 里，不需要任何原生客户端 | **1（最好）** | **首选，只要那个应用有可用的 web 版。** 零新技术栈：§3 的 profile、§4 的实时视图、§7.4 的 backend 全部照旧适用，而 agent 走 CDP 不走像素 |
| **(iii) Xpra seamless + HTML5 客户端** | 逐**窗口**转发 X11 应用，自适应编码（webp / jpeg / h264 / vp8 / av1），WebSocket 传输，Xvfb / Xdummy 下无头可跑 | **2** | **原生客户端的首选。** 带宽随那**一个**窗口走而不是整个桌面；MPL-2.0；6.6 起有 http digest / scram 认证与 http origin 校验，当前版本 7.0（2026-08-27） |
| **(ii) KasmVNC / TigerVNC 自适应编码** | 仍然是整个桌面，但有 WebP / JPEG 质量阶梯和 video mode | 3 | 备选。比今天好，但仍然为一个窗口付整个桌面的价 |
| **(i) 今天的整桌面 noVNC**（`src/vnc.js`） | 一个 framebuffer，一条输入队列 | 4（最差） | 保留为兜底（D10 已经这么决定），不作为这件事的答案 |
| **(iv) Wayland 那一族** | waypipe / wayvnc / weston-rdp / Broadway | —— | **没有一条通向浏览器。** waypipe 要求客户端那边有一个 Wayland 合成器，而浏览器不是；wayvnc / weston-rdp 是把问题变回 VNC / RDP；Broadway 只服务 GTK 应用 |

**Xpra 的接线，和 §4.2 是同一个形状。** Xpra 的 HTML5 客户端通过 WebSocket 连它自己的服务器；
我们**不**把那个端口暴露给浏览器，而是照 `/api/vnc` 和 `/api/browser/stream` 的老办法在服务端桥接
（`GET /api/xpra/stream?window=<id>`，cookie 鉴权，同一套背压纪律）。这不是我们发明的接法：
`jupyter-xprahtml5-proxy` 做的正是"用 Jupyter 自己的鉴权把 Xpra 包起来"。客户端那一半有两个选择
—— 把上游的 HTML5 客户端当静态资源自己托管（MPL-2.0，官方文档说明可以装到别的 web server 的路径
下；已知问题：在 iframe 里它会撞上 `sessionStorage` 的访问限制），或者用 `xpra-html5-client`
（npm，Apache-2.0，2.3.0，一个 TypeScript 客户端库）自己画 —— 后者更贴合 §4.4 那个"窗口是我们的"
的形态。**这是一个 owner 决定（D21）**，因为它是"托管别人的整个前端"与"自己写渲染层"之间的取舍，
而这个仓库对前一种有明确的偏见（§4.2 拒绝内嵌上游 dashboard 的理由逐字适用）。

**每个应用的建议：**

* **WhatsApp —— 走 (v)。** Linux 上没有官方桌面客户端，而 WhatsApp Web 是一个正经 web 应用；
  多设备模式下最多 4 个链接设备，且在主手机离线时可独立工作**最多 14 天**。那 14 天是一个真实的
  运维成本，要写进 UI（"这个链接设备需要在 <日期> 前见一次手机"），而不是等它某天静默掉线。
* **微信 —— 走 (iii)**，用官方 Linux 原生客户端（腾讯 2024 年 11 月发布，deb / rpm / AppImage）
  跑在 Xpra 的 seamless 模式里。web 版（`wx.qq.com` / `web.wechat.com`）在很多账号上被拒绝登录，
  **但这是账号级的策略，而我没能核实它今天的确切范围**（§12），所以流程上必须是"先拿 owner 自己
  的账号试一次 web 版，失败了再上原生客户端"，而不是直接假设需要装一个原生客户端。

**这条路的资源账要和 §1.2 用同一把尺子量。** 一个 Xvfb + 一个聊天客户端 + 一个 Xpra 服务器，是
又一份进程、RSS 和 inotify instance（那个 128 / uid 的天花板本机已经撞过）。所以它和浏览器共用
§3.5 的那个上限与 runaway 守卫，而不是自己再发明一套 —— keeper 已经是这个设计里数得清东西的
那个部件。（本机现状，只读实测：`Xvfb` 装了，`xpra` 和微信客户端都**没有**装 —— 所以这一节的
每一个数字在 P8 真装起来之前都是**未实测**的。）

### 4.8 数据那一半：读一个本地客户端自己的 store

把画面搬进来解决的是"人能不能用"。"**agent 能不能读到这些消息**"是另一个问题，而它的答案对两个
应用**不一样**，原因是可核实的加密事实，不是偏好。

**WhatsApp Web：元数据可读，正文只能在页面里读。** WhatsApp Web 把消息存在 IndexedDB 里，正文用
AES-CBC 加密；明文的那部分包括联系人、群，以及消息的元数据（发件人、收件人、时间戳、会话）。
关键在密钥：它们是通过 **CryptoKey API** 存的 **non-extractable** 密钥 —— 这个 API 的目的就是让
JavaScript 能**用**它们而无法**导出**它们。已知的读取正文的做法（一篇被广泛引用的公开写作）是
**在页面里跑代码**：monkey-patch `crypto.subtle.decrypt`，等它被用能解密的参数调用时把那把 key
留下来。

于是适配器的形态是被这个事实**决定**的，不是被我们选的：**它是一段注入到这个 profile 里的
init-script，在页面内部读那个 store 再把结果送出来** —— 而这正好是本设计已经握在手里的能力
（0.37 起新标签页在**首次导航之前**继承 session 的 init-script；CDP 本来就在）。它的诚实代价要
写清楚：这是在用户**自己的**登录会话里自动化 WhatsApp 自己的 web 客户端 —— 没有第三方协议实现，
没有新的设备注册，所以它**不是** Baileys 那一类风险；但它仍然是对 web 客户端的自动化，仍然在
ToS 的灰区里。

**为什么不用协议库。** `whatsapp-web.js` 本质上和我们这条路同类（它也是驱动一个真的 WhatsApp
Web），而 **Baileys 是从头实现协议**，也就是注册成一个**新的链接设备**。公开的经验报告一致地说
这一类"逆向 WhatsApp Web 的工具（Baileys / WAHA / Evolution API）带有严重封号风险，通常 2–8 周
被检出"，而 Meta 的检测面包括注册时的设备指纹和消息行为分析。所以取舍是清楚的：**读真客户端
自己的 DB（在它自己的页面里）** 优于 **另起一个协议客户端**。如果用途其实是"给客户发消息"，
那正确答案是官方 WhatsApp Business API（另一个产品、另一个号码、按政策做几乎零封号风险），
而不是把 owner 的私人号码接上自动化。

**微信：技术上做得到，建议不做。** 官方 Linux 客户端的本地库是 SQLCipher（腾讯的 WCDB），密钥
在进程内存里以一个可识别的格式存在，公开工具确实能在 Windows / macOS / Linux 上把它抠出来再解密
`msg_*.db`。三条理由让我不建议把它做成产品的一部分：

1. **它是在扒一个专有客户端的进程内存。** 这一类东西按构造在每一次客户端更新时都可能碎掉，
   而"碎掉"的形态是**安静地读到垃圾**。
2. **本机实测的边界：`/proc/sys/kernel/yama/ptrace_scope` 是 `1`**，也就是只有**祖先**进程可以
   ptrace（读 `/proc/<pid>/mem` 同样要过 `PTRACE_MODE_ATTACH`）。用户自己启动的微信，VibeSpace
   读不到；要读得到，就得由**我们**去启动它 —— 而"为了能读它的内存所以由我们来启动它"这句话，
   写出来就知道它不该是一个默认行为。
3. **它明确越过 ToS**，并且在某些法域里是一个法律问题，不是一个工程问题。

所以微信的建议是分开的：**画面**走 §4.7 的 Xpra（给人用），**数据**走官方渠道（公众号 / 企业微信
的开放 API），如果 owner 需要的是让 agent 收发企业消息。若 owner 明确要求本地库那条路，它是一个
**显式的、单独的 owner 决定（D20）**，并且应该活在一个**插件**里而不是核心里 —— 这正是 D2 给
CloakBrowser 划的那条线：专有的、带法律面的东西走同意流程。

**适配器怎么接进来。** VibeSpace 已经有这个接口，而且它不是新的：Communication Channels v1
（`src/msg-acl.js` + `src/server/conversation-deliver.js` + `data/bin/vibespace-msg`）的设计里就
写着"外部来源（Gmail / Lark / Slack）之后用它们自己的 `source` 标签喂同一条梯子；每一个 stash
信封本来就带一个"。于是一个聊天适配器**不是**一个新子系统：

* 它是一个**异步本地客户端源**：一个 `create(deps)` 工厂，暴露 `start()` / `stop()` / `state()`
  和一个产出**信封**的事件（`{source: 'whatsapp', threadId, from, text, at, attachments}`），
  而 `src/gmail-sync.js` 就是这个仓库里已有的形状（一个远端 store 被同步成本地事实）。
* 出站走**同一条投递梯** `deliverToConversation`，因此自动继承 stash、peer 卡片，以及 §4.3.1 的
  花钱门 —— 一条从 WhatsApp 进来的消息把一个**空闲**会话叫醒，就是一个计费 turn，它必须有一个
  已声明的理由（`'chat-inbound'`），并且和它的生产者在同一次改动里加进 `SPEND_REASONS`。
* 可达性走 `msg-acl.js` 那套岗位边界，而不是第二套 —— 并且逐字继承它的诚实声明：那是一条
  **协调**边界，不是安全边界。
* 每个适配器带一行**能力**（§7.1 的那条律）：能不能读历史、能不能发、正文可不可读、多久要见一次
  手机。做不到的控件带着理由禁用，而不是在使用时失败。

### 4.9 本地窗口作为 computer-use 目标

（Owner 问题 Q9。）能不能像操作浏览器那样操作**任意一个本机原生窗口** —— 把一个窗口当作一个对象
交给 agent，带 `snapshot` / `screenshot` / `click` / `type`？能，但**能到什么程度是按平台和按工具包
变化的**，而这一节的全部价值在于把那张表如实列出来，而不是给出一个到处都对的承诺。

**先说那条决定架构的分界，因为它和 §4.7 是同一条：agent 跟协议或 DOM 说话，永远胜过跟像素说话。**
浏览器之所以好驱动，不是因为它是浏览器，而是因为它同时给了两样东西：一棵可查询、元素有稳定引用的
**树**（DOM/无障碍树），和一条按元素动作的**协议**（CDP）。一个原生窗口默认只给像素 —— **除非它的
工具包导出了无障碍树**。于是本节的答案是：**AT-SPI2 就是原生窗口的 DOM**，像素是它的回退，而不是
反过来。

**这不是理论，本机 2026-09-10 只读实测。** `toolkit-accessibility` 这个开关是 `false`，而 AT-SPI 的
注册表照样是活的（`/usr/libexec/at-spi2-registryd` 在跑，`Atspi.get_desktop(0)` 报 **9 个应用**：
gnome-shell(clutter)、mutter-x11-frames(GTK)、ibus-extension-gtk3、update-notifier、
xdg-desktop-portal-gtk、gjs、snapd-desktop-integration 等）。往下走一棵真的应用树拿到的正是一个
snapshot 需要的东西：`role`（frame / panel / label / button）、`name`、以及 `Text` / `Action` /
`Component` 这几个接口 —— `Component` 给几何（于是一个节点能映射成一个点击点），`Action` 给这个节点
**自己声明的**动作（实测到的字面值：`click`、`window.minimize`、`clipboard.copy`）。速度也够：
`mutter-x11-frames` 24 个节点 13 ms、一个真应用 61 个节点 10 ms ⇒ **约 1,800–6,100 节点/秒**。
`Action.do_action` 因此是一条**不经过任何输入注入**的动作通道：它按节点动作，Wayland 那条"不许全局
注入"的规矩根本管不到它 —— 这是本节最重要的一个结论，但它**是按节点成立的，不是按窗口成立的**，
而下一段就是那个覆盖率。

**覆盖率必须和那条结论一起量，否则那条结论会被读成一个到处都对的承诺（2026-09-10 只读实测）。** 把
九个应用各走一遍（每个应用 400 个节点封顶）共 503 个节点，按接口清点：`Component` **494**、`Action`
**66**、`EditableText` **33**、`Text` 51。换成广度优先、一个统一的 600 节点预算再走一遍（同一台机器、
同一时刻），是 `Component` 599 / `Action` **52** / `EditableText` 52 / `Text` 52 —— 两个采样都真实，
而按应用那次是更好的那个，因为统一预算会被单个应用的 panel 子树吃掉。三个数字直接决定三条不同的动词：

* **`click @ref` 只在自报动作的节点上成立。** 66/503（统一预算下 52/600）。更要紧的是按角色拆开：
  实测 43 个 `button` 节点里**只有 6 个**导出 `Action`，而 `button` 恰恰是一个 agent 最想点的那个角色。
  其余那些节点唯一的路是该节点的 `Component` 几何 —— 也就是一次坐标点击，也就是注入，也就是这张矩阵
  的动作行说 Wayland 的规矩"管不到"的那样东西。顺带一提，实测 66 条动作里有 **32 条的名字是空字符串**，
  所以"按名字挑一个动作"这件事本身也不是处处能做。
* **`type` 要 `EditableText`。** 33/503（统一预算下 52/600），而这一条上本节引的那份来源自己就写着
  "GTK3/GTK4/Qt5/Tk 各要各的文本输入路径"，所以它同时还是**按工具包**的。
* **`key`（和弦）根本没有树这条路。** 实测到的动作名是 `click`、`activate`、`edit`、
  `expand or contract`、`menu`、`clipboard.*`、`window.*`、`link.*`、`selection.*` —— 全是应用自报的
  语义动作，里面没有"和弦"这个概念。AT-SPI 唯一的键盘原语是**注册表级**的
  `Atspi.generate_keyboard_event`（实测存在，与 `generate_mouse_event` 并列），而它就是 XTEST，也就是
  注入，于是它继承注入那一行的全部限制。（`Action.get_key_binding` 是一个**读**：它告诉你这个节点自报
  绑了什么键，它不替你按。）

结论不变但收窄了：无障碍树是**观察**的主通道，也是**动作**的首选通道 —— 而"首选"这两个字对四个动词
是四个不同的答案，所以下面那张矩阵按动词分了四行，§5.1.1 的能力律也按四个动词分别执法。

**别人在这件事上做了什么（owner 要的对比）。** 三个来源，方向一致：**Anthropic 的 computer use 是
纯像素的** —— 当前工具集 `computer_toolset_20260801` 有 17 个成员工具（`screenshot`、`zoom`、
各种点击、`type`、`key`、`scroll`、`wait`…），坐标就是**截图的像素坐标**（缩放要调用方自己映射回去），
官方文档里没有无障碍树这条通道；而**同一家的 browser use 读的是无障碍树**。**OpenAI 的 ChatGPT
桌面版 "Work with Apps" 用 macOS 的 Accessibility API 去读应用内容**（VS Code 另外装扩展），只在
macOS 上有 —— 也就是说，两家厂商各自的**本地应用**集成都是**无障碍树的读**，不是像素机器人，而
Codex 桌面版给浏览器的那条通道（§4.1）本身就是 DOM 那条路。第三方实现同样：cua 的 Linux driver
"用 AT-SPI 2 over D-Bus 取无障碍树"、输入走 XTEST，而**原生 Wayland 仍是 preview**（它自己的开关
`CUA_DRIVER_RS_ENABLE_WAYLAND=1`，明说缺屏幕捕获与 AT-SPI parity）；MIT 的 `agent-sh/computer-use-linux`
则把窗口枚举做成一条按后端下降的梯子（GNOME Shell 扩展 → GNOME Introspect → COSMIC → KWin scripting
→ hyprctl → i3 IPC → 通用 X11/EWMH），输入在 Wayland 上优先走 RemoteDesktop portal、回退 uinput。

**能力矩阵（本机实测 + 文档，两者分别标注）。**

| 能做什么 | X11 / Xwayland（本机现状） | Wayland 经 portal | Wayland 经 uinput | 我们自己起的嵌套 X（Xvfb+Xpra，§4.7） | 配对的 Mac（§7.3） |
|---|---|---|---|---|---|
| 枚举窗口 | **可以，但只看得见 X11 客户端**（实测 `xwininfo -root -children` 只列出 19 个 Xwayland 顶层：mutter-x11-frames、ibus、一个 X11 对话框；原生 Wayland 窗口结构上不可见） | GNOME 的 `org.gnome.Shell.Introspect.GetWindows` **本机实测 AccessDenied**（Shell 只放行一张 D-Bus 发送者白名单 = XDG portals，或 unsafe mode）；其它合成器各有自己的 IPC | 无（uinput 只管输入） | **可以，完整**：我们起的那个 X 服务器里只有我们启的应用 | CGWindowList / ScreenCaptureKit 可枚举 |
| 捕获**单个**窗口的像素 | 可以（XComposite / `ffmpeg -f x11grab`；本机 `xwd`/`import` 均未安装，`ffmpeg` 在） | ScreenCast portal（PipeWire，一次交互式授权） | 无 | 可以，且**按窗口**就是 Xpra 的本职 | ScreenCaptureKit `SCContentFilter` 可指定单窗口（`CGWindowListCreateImage` 自 macOS 15 起弃用） |
| 注入指针 + 键盘 | 可以（XTEST；本机 `xdotool`/`wmctrl` 在），**但只到 X11 客户端** | RemoteDesktop portal：`NotifyPointerMotion*` / `NotifyKeyboardKeycode`，或 `ConnectToEIS` 交给 libei（本机 portal 有这个接口，`libei.so.1`/`libeis.so.1` 1.3.901 在） | ydotool + `/dev/uinput`（**本机不可用**：实测 `crw------- root root`，且 uinput 模块没有加载） | 可以（我们自己的 X，XTEST 全权） | 需要 Accessibility 权限（非沙箱 + 已签名） |
| 读无障碍树（= 这个窗口的 DOM） | **可以，且与显示协议无关**（AT-SPI 走 D-Bus；本机实测 9 个应用、约 1,800–6,100 节点/秒） | 同左（AT-SPI 不经过合成器） | 同左 | 同左 | AXUIElement（同一条权限） |
| **动作**：`click @ref`（一个自报动作的节点） | `Atspi.Action.do_action` —— **但只在节点导出 `Action` 的地方**：九个应用全走一遍实测 **503 个节点里 66 个**，而 **43 个 `button` 节点里只有 6 个** | 同左 —— **Wayland 的"不许全局注入"管不到这条** | 同左 | 同左 | AXUIElement 的 `AXPress` 等 |
| **动作**：`type` 往一个输入域打字 | `Atspi.EditableText.insert_text` / `set_text_contents`，只在节点导出 `EditableText` 的地方（实测 33/503）；且按本节引的来源，文本输入还**按工具包**各走各的路 | 同左 | 同左 | 同左 | 设 `AXValue` |
| **动作**：`key` / 一个和弦（`ctrl+s`） | **根本没有树这条路** —— AT-SPI 的动作词表里没有"和弦"这个概念（实测动作名见上），唯一的键盘原语是注册表级的 `Atspi.generate_keyboard_event`，也就是 **XTEST = 注入** | 只剩注入 ⇒ portal（D29，未验证） | 只剩注入 ⇒ uinput（本机不可用） | 可以（我们自己的 X，XTEST 全权） | 投 `CGEvent`（Accessibility 权限） |
| **动作**：`click --at <x>,<y>`（坐标） | 只剩注入（XTEST），且只到 X11 客户端 | 只剩注入 ⇒ portal（D29，未验证） | 只剩注入 ⇒ uinput（本机不可用） | 可以 | 投 `CGEvent`（Accessibility 权限） |

**四条从这张表里直接掉出来的结论：**

1. **无障碍树是唯一一条在每一列里都成立的通道**，所以它是 `snapshot` 的**主**实现、也是 `click` 的
   首选实现，像素只在它答不出时补位（一张图片、一个 canvas、一个自绘控件）。这与浏览器那半是同一个
   形状：`agent-browser snapshot` 给的也是无障碍树加 `@e3` 这样的引用。**但"每一列"不等于"每一个
   节点"**：上面量到的 66/503（按钮 6/43）是这条结论的诚实上界，而 `key` 这个动词在树上一格都没有 ——
   在一个没有注入后端的列里，一个和弦是**做不到的**，而 §5.1.1 因此让它带着探测结果拒绝，和
   `click --at` 一模一样。
2. **输入注入是按平台降级的三条道，而它们的可用性必须在运行时探测、不能从平台名推断**（本机就是
   反例：一台 Wayland 桌面，X11 注入对 Xwayland 客户端可用、portal 接口在、uinput 不可用）。
3. **枚举窗口是最脆的一环**，而它恰好是"把一个窗口当对象交出去"的第一步：本机两条路各自有名的失败
   （X11 看不见 Wayland 客户端；GNOME 的 Introspect 拒绝我们）。所以窗口目标的第一版**只列我们自己
   起的窗口**（D27），那一格是"完整"的，且不需要向任何人要权限。
4. **"我们自己起的嵌套 X"这一列全是绿的**，而它正好就是 §4.7 已经为原生聊天客户端设计的那套
   （Xvfb + Xpra seamless）。所以窗口目标**不是新的一层**：它是 §4.7 的传输 + 一个新的观察/动作面。

**它怎么插进实时视图。** 完全复用：`GET /api/xpra/stream?window=<id>` 是同一条服务端桥接（§4.7），
窗口目标只是让那个面多一个 `window-live` 的形态与一枚"哪个窗口"的标题。§4.6 的绑定、§4.3 的三态
（Watch / Take over / Hand back）与 §4.3.1 的花钱门逐字适用 —— 一个窗口目标的接管与交还和一个标签页
的接管与交还是同一件事，因为它们共用同一个 `lease.input`。

**背景服务这一条要先量再设计。** VibeSpace 的服务器跑在 `systemd --user` 下，而 portal 的会话是
交互式授权的（`Start` "通常会让 portal 弹一个对话框让用户选择要共享什么"），公开报告里也写着
**portal/D-Bus 在后台/systemd 上下文里会被拒**。所以"服务器自己持有一个 RemoteDesktop portal 会话"
是 P9 的**第一件事去测**，不是一个可以先写进架构的假设；它若不成立，Wayland 那一列就只剩
`persist_mode=2` + `restore_token`（文档：权限"持续到被显式撤销"，token 一次性）这条需要用户点一次
同意的路，或者干脆只做第 4 列。

**这趟遍历跑在一个有界的子进程/worker 里，绝不在服务器或 daemon 的事件循环上。** 本文 §0 引了
"never block the event loop"这条法，§4.2 也据它否掉了 CDP `Page.startScreencast`（"把一个每帧的
消费者放进服务器的事件循环"）—— 而 §4.9 自己的数字把同一条法摆在了脸前：一次 snapshot 是**每个节点
一次 D-Bus 往返**，600 个节点在实测的约 1,800–6,100 节点/秒下就是 0.1–0.33 秒的往返；而一个**停止
应答自己 a11y 总线的应用**会把每一次调用挂到 D-Bus 超时为止（libdbus 的默认值是 25 秒），那正好是
写下这条法的那几次事故（FUSE 线程池、`execFileSync` 扫描冻结）的形状。而 `src/window-targets.js` 在
§3.6 里是 **SHARED**，也就是说 daemon 会 bundle 它，于是那次阻塞会同时落在 daemon 上。所以：遍历走
`transcript-worker.js` / SafeFs 已经立下的先例 —— 一个有界的子进程或 worker，**每次调用一个超时、
整趟一个节点预算**，一个在预算内不应答的节点被报成**一棵读不出来的子树**，而不是把整趟遍历拖住。

**还有一个必须点名的决定：node 这一侧用哪个绑定。** 本轮每一个 AT-SPI 数字都是经 `python3` + GObject
introspection 量的（附录 A 的证据行就是这么写的），而那条路走的是 `libatspi`，它自带 AT-SPI 那套
**缓存**（[Linux Foundation 的 AT-SPI D-Bus 页面](https://wiki.linuxfoundation.org/accessibility/d-bus)
把"最常访问的数据随对象一起传、由绑定缓存，并尽可能用异步信号替掉同步方法调用"写成这套协议的设计
要点）。P9 因此有两条路，而**上面那些速度数字对第二条不成立**：要么在 node 里直接说 AT-SPI 的 D-Bus
接口（[`dbus-next`](https://github.com/dbusjs/node-dbus-next) 这类通用 D-Bus 客户端，本轮没有找到
维护中的 node 专用 AT-SPI 绑定 —— 但没找到不等于没有，P9 先查），此时**没有 libatspi 的缓存**，每节点
的成本要重新量；要么 spawn 一个 GI helper，此时要付 §1.6 已经量过的那笔 fork 税。这是 P9 的输入，
不是一个可以留白的实现细节，所以它进 §12。

**诚实边界（本节没有任何一个数字是关于"多快"的）。** 本机没有装 `xpra`（§4.7 已记），所以窗口目标
的端到端延迟一个字都没量；AT-SPI 的速度量的是**遍历**，不是"一次 `do_action` 到界面变化"；而那 9 个
应用全是 GTK/clutter —— **Qt 与 Electron 的覆盖度在本机零测量**（Electron 通常只在检测到 AT 客户端
时才导出树）。这些全部进 §12。

## 5. 面向 agent 的那一面

### 5.1 `vibespace-browser`（STATIC 跟踪，在 `AGENT_TOOLS` 里）

照着 `data/bin/vibespace-page` 建模：`VIBESPACE_API` + `VIBESPACE_SESSION_TOKEN`（或
`VIBESPACE_JOB_TOKEN`），不含任何 VibeSpace 内部细节，完整手册在 `vibespace-docs browser` 后面。

```
vibespace-browser profiles                       # what exists, who owns it, who is attached
vibespace-browser attachments                    # MY set: every handle, which one is the default (§3.7)
vibespace-browser use <label|id> [--alias <a>]   # attach THIS session to a profile (adds to the set);
                                                 #   prints the env to export, or execs a subshell
vibespace-browser new <label> [--provider …] [--proxy …] [--fingerprint …]
vibespace-browser new-child                      # mint a CHILD handle bk-<parent>.<n> for a sub-agent
vibespace-browser detach [--profile <handle>]    # drop that lease, close my tab
vibespace-browser watch                          # print the live-view path for the user
vibespace-browser status                         # my tab, my lease, who holds input,
                                                 #   my profile AND ITS ORIGIN (§3.2.5)
vibespace-browser pin <label|id> | --none        # pin THIS session (or unpin); a mid-session pin
                                                 #   applies from the next browser launch (§3.2.5)
vibespace-browser backend [<name>]               # which backend, what else exists, propose a switch (§7.4)
vibespace-browser blocked --url <u> [--why <c>]  # I was blocked here — a CLAIM, never a detection (§7.4)
vibespace-browser -- <agent-browser args…>       # run agent-browser with this session's flags

  --profile <id|alias>                           # WHICH browser this command acts on (§3.7);
                                                 #   REQUIRED once this session has >1 attachment,
                                                 #   never a filesystem path — that is a named refusal
  env VIBESPACE_BROWSER=<alias>                  # the same choice, pinned for one shell
```

**每一条回答都点名它作用在哪个 profile 上（§3.8 的第①层）。** 这不是一句装饰：`snapshot` 的头部、
`screenshot` 的元数据、以及每条动词的退出行都带
`profile: work (bp-3f9a1c02) · 由用户 2 分钟前钉住 · 本会话共 2 个附着`。附着集合的指纹一变，下一条
命令拿到的是一次 typed 拒绝 `{ok:false, code:'profile_changed', was, now, handles}` —— 一次性，之后
新的默认生效。理由见 §3.8：一条被塞进 stdout 的提示只是希望模型读它，一次拒绝让那条命令**没有执行**。

**`use` 不打印 CDP URL。** 第一轮让它打印

```
AGENT_BROWSER_CDP=<the profile's cdp url>       # ← removed
```

作为主要的上手步骤，那等于把对那个浏览器里每一个标签页的、无作用域的权限交给 agent —— 也就是 §3.4
更正后的读法 —— 而且是在文档化的幸福路径上，而不是通过某个不寻常的举动。所以 `use`：

* **默认 `exec` 一个子 shell**，环境已经设好，于是那个 URL 从不出现在 agent 的 stdout、它的转录、
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
`connect`、`get cdp-url`）以及租约检查。**也就是说 `snapshot`/`fill`/`click` 本来就会以裸
`agent-browser` 的形式跑，这正是 §3.7 那条残留的由来**：包装是一个子集，所以①层的保证也只覆盖那个
子集。可以结构性收口的那一半在那里 —— 非默认附着的 user-data-dir 由服务器铸名、只交给我们自己 exec
出来的子进程、从不打印，与本节这条"`use` 不打印 CDP url"是同一条规矩，同样只去掉*意外*而不制造边界。

#### 5.1.1 `vibespace-window` —— 与浏览器目标并列的窗口目标（§4.9）

同一个家族、同一套鉴权、同一条租约，唯一的差别是被寻址的东西不是标签页而是一个窗口：

```
vibespace-window list                            # window targets I may address (§4.9's column 4 first)
vibespace-window open <app> [--title <t>]        # start an app under OUR Xvfb+Xpra and return a handle
vibespace-window attach <handle>                 # take the lease on it (same lease object as a tab)
vibespace-window snapshot <handle>               # THE a11y tree: role/name/text/actions/bounds + @refs
vibespace-window screenshot <handle> [--out p]   # pixels — the FALLBACK, never the primary read
vibespace-window click <handle> @e7              # act on a NODE (AT-SPI do_action), not on coordinates
vibespace-window click <handle> --at <x>,<y>     # act on a POINT — refused when no injection backend
vibespace-window type <handle> "…"               # text into the focused node
vibespace-window key  <handle> ctrl+s            # a chord
vibespace-window watch <handle>                  # print the live-view path (the 'window-live' pane)
vibespace-window detach <handle>                 # drop the lease; the app keeps running
```

三条规矩，都是 §4.9 那张矩阵直接翻译过来的：**（i）`@ref` 优先于坐标**（`snapshot` 铸的引用来自
无障碍树，与 `agent-browser snapshot` 的 `@e3` 同一个习惯，于是一个已经会用浏览器那半的 agent 不用
学第二套东西）；**（ii）做不到的动词带理由禁用而不是在使用时失败**（§7.1 的能力律）—— 而这条律
**按动词逐个执法，不是只管 `click --at` 那一个**，因为 §4.9 的矩阵按动词给出四个不同的答案：

| 动词 | 树上那条路要什么 | 没有注入后端的那一列（Wayland，D29 未验证）会怎样 |
|---|---|---|
| `click <h> @e7` | 该节点导出 `Action`（实测 66/503，按钮 6/43） | 节点有 `Action` ⇒ 照常可用；节点**没有** ⇒ **带探测结果拒绝**，绝不悄悄降级成一次坐标点击 |
| `type <h> "…"` | 该节点导出 `EditableText`（实测 33/503，且按工具包） | 有 ⇒ 可用；没有 ⇒ 同上拒绝 |
| `key <h> ctrl+s` | **没有这条路**（AT-SPI 的动作词表里没有和弦） | **一律拒绝**，理由就是探测结果 —— 这个动词在这一列里做不到 |
| `click <h> --at <x>,<y>` | **没有这条路**（按定义就是坐标） | **一律拒绝**，理由就是探测结果 |

这里最要紧的一条**是"节点没有 `Action` 时绝不悄悄降级成坐标点击"**：那次降级会把一个被明确拒绝的
通道（注入）从后门放回来，而且是在 agent 以为自己在用树的时候。**（iii）`list` 默认只列我们自己起的
窗口**，用户桌面上那些要 D27 明确打开，且开着的时候每一行都标出它是"你的桌面"。

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

* 会话卡片 / Session Properties：这个会话 attach 在哪个 profile 上、观看者计数、谁持有输入 ——
  外加**钉子**与它的来源（§3.2.5）和 **backend chip**（§7.4）。钉子是**一个**命令
  （`session.pinBrowser`）注册在四个面上，不是四份实现。
* 实时视图窗口的标题栏：profile 名字（点它 = 选择器）、backend chip，以及把它贴到所属聊天
  窗口旁边的**绑定**动作（§4.6）。
* 聊天状态栏的 **Browser 芯片**（§3.8 第③层）：agent **最后实际用过**的 profile，与**钉住**的默认
  并排；两者不一致时转琥珀色，点开写"agent 还在 <旧> 上 —— 提醒它？"并给一个一键推送（D26）。它要在
  `LIVE_SESSION_FACTS` 里有**两个**标量（`browserProfileActive` 与 `browserProfilePinned`），或者一行
  但 digest 把这一对**投影**成字符串 —— 一个标量登不下它要比较的两个值，而一个原样返回对象的 digest
  是个常量，芯片永不重画（§3.8）。
* 一个会话有多个附着时，实时视图窗口内部是一条 **profile 切换条**（每个附着一枚标签 + owner 徽章），
  而不是 N 个并排的面（§3.7；理由是 D19 已经量过的宽度）。
* 一个 ⚙ 面板（或侧栏分区）：profile 列表、owner、最后使用时间、磁盘大小、"停止"、"忘记"、
  "打开实时视图"。§1.2 里那些未注册的目录（第一轮 53 个，重新测量时 56 个 —— 这个计数会自己往上漂）
  在这里作为可收编的候选出现（§8）。
* 任何新设置项都要落在一个列在 `SETTINGS_CATEGORIES` 里的分类下 —— 那个数组**就是**设置渲染循环，
  而一个没有任何一行列出的分类就是一个没人够得到的设置项（那道 build 普查之所以存在，就是因为有十个
  设置项、包括每一个花钱天花板，都是够不到的）。

* **命名（2026-09-23，B-d03a）：** 这一节里的每个面都是产品里第二张叫"浏览器"的脸（另两张：工具栏的 iframe 网页视图、作为桌面应用的 Chromium）。地球图标今天同时指三者；三个方向的渲染稿、打分与建议（改名为 网页视图 / **Agent 浏览器** / 浏览器应用，agent 面统一用 `browser-live` 的"带点的窗口"图标）见 `docs/design-browser-faces.zh.md`。 **已交付 2.369.168（方向 B，takeover T5）：** 本节的各个面现在都叫 **Agent 浏览器** —— ⚙ 行 *Agent 浏览器…*、rail 项、芯片 *Agent 浏览器 · <profile>*、卡片命令 *Agent 浏览器配置…* / *Agent 浏览器 — 实时视图* / *交还 Agent 浏览器*、Session Properties 分区、Settings 分类 —— 全部用 `UI_ICONS.browserLive`；id、openSpec action、设置键不变。

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

### 6.6 一个窗口目标就是用户的桌面（§4.9 的安全模型）

浏览器那半的每条规矩在这里原样成立（同一个 `lease.input`、同一个 §4.3 三态、同一条服务端桥接、
同一条"stream 端口绝不到浏览器"），下面是**只有窗口目标才有**的那几条：

* **两类窗口，两条道，界面上必须分得开。** **我们自己起的**窗口（`vibespace-window open`，跑在我们
  自己的 Xvfb+Xpra 里）是默认那一类：它们的存在、生命周期与像素都归我们，agent 在里面动作不比在一个
  浏览器标签页里动作更危险。**用户桌面上的**窗口是另一类，默认**不列出、不可寻址**（D27），因为对它
  们的一次点击是对用户真实会话的一次点击 —— 包括他此刻正在里面打字的那个窗口。打开它是一个明确的
  owner 决定，打开之后每一行都要标出"这是你的桌面"，而实时视图的标题也要这么说。
* **输入只在租约持有者是 agent、且用户没有接管时才允许注入。** 这条与 §4.3 逐字相同，但它在这里有
  第二个执行点：**用户随时可以直接用他自己的键鼠动那个窗口**，而那不经过我们。所以窗口目标的
  "take over" 还额外**停止注入**并在面上说明"你在直接操作它了"；恢复注入是一个显式动作。协作式的
  边界在这里的诚实程度和 §6.5 一样 —— 我们能保证的是**我们不注入**，不是"没有别人能注入"。
* **像素与树都是秘密。** 一个窗口的无障碍树里**有正文**（`Text` 接口就是拿来读文本的），所以一次
  `snapshot` 可能比一张截图泄露得更多，而不是更少。§6.4 原样适用：截图与录像默认关、有保留期、
  归档而不销毁。**这里没有"脱敏钩子"这种东西，而这一点必须写出来而不是借用**：本设计今天没有任何
  一处做过内容脱敏，把窗口目标说成"经过同一套脱敏"会是一句凭空的话。存在的原语只有三条 —— 录像默认
  关（D7）、"秘密不进模型"（§1.5 从上游继承）、以及每动作一张缩略图的转录形态；真的要脱敏，那是一个
  独立的、要自己举证的功能。
* **portal 的同意是用户的，不是我们的。** 如果 Wayland 那条道最终要用 RemoteDesktop portal，那次
  授权对话框是**用户**点的，`persist_mode=2` + `restore_token` 让它不必每次都点（文档：权限"持续到
  被显式撤销"，token 用一次即失效）。那个 token 是一份长期授权，所以它按 §6.4 的规矩存在服务端，
  绝不进 `agentEnv`、绝不进 CLI 输出；而"哪个会话在什么时候用它做了什么"进 §3.7 的审计流水。
* **`--at <x>,<y>` 是需要理由的那一条。** 按节点动作（`@ref`）是可审计的：审计行能记下"点了名为
  Minimize 的按钮"。按坐标动作记不下任何有意义的东西，而且它是唯一一条能点到**我们没在看的**东西的
  路径。所以它在没有注入后端时被拒绝（§5.1.1），在有的时候仍然要求租约、要求窗口目标是"我们起的"
  那一类，并在审计行里显式标注 `by:'point'`。

## 7. Provider

### 7.1 抽象

一个 provider 回答**六**个问题：**我怎么给这个 profile 起一个浏览器**、**我发出去的 CDP URL 是
什么**、**它要多少钱**、**它做不了什么**、**它的 key 从哪来**（§7.5）、**它在访问阶梯上是哪一层**
（§7.6）。上游的 `-p <provider>` 和它的 provider 插件就是模板；我们的注册表加上 profile 身份。

| Provider | 层（§7.6） | 启动 | CDP | 指纹 | 成本与 key（§7.5） | 备注 |
|---|---|---|---|---|---|---|
| `chromium`（默认） | 1 | 本地 `agent-browser` 带 `--profile <dir>` | keeper 读 `get cdp-url` | 除了 `--disable-blink-features=AutomationControlled` 之外没有 | 免费；不要 key | 今天的行为，只是现在有主了 |
| `cloak` | 2 | CloakBrowser 二进制作为 `--executable-path`，或者它的 `cloakserve` CDP 端点 | `ws://127.0.0.1:9222`（loopback，§6.1） | 号称 73 个源码级 C++ 补丁，每连接一个 seed | 免费档 1 会话 / $19 5 / $49 20 / $199 200 / $499 2000（2026-09 观察到的标价）；key = 注册表行 `cloak` | §7.2 |
| `cdp`（远程） | 1 | 什么都不做 —— 那个浏览器是别人的 | 一个 `hostId` + 一个远程 loopback 端口，隧道过来 | 那个浏览器是什么就是什么 | 免费；不要 key | §7.3 |
| `cloud:<name>` | 2 | 上游的 browserbase / browserless / kernel / browseruse / agentcore | 该 provider 的 | 该 provider 的 | 按供应商；key = 注册表行 `cloud:<name>`，**服务端秘密，绝不进 `agentEnv`** | §7.5 点名了每一行的字段 |
| `local-window`（新，§7.6） | **3** | 什么都不启动 —— 它是用户**自己**桌面上一个已经开着的真浏览器窗口 | **没有** —— 观察走 AT-SPI 无障碍树 + 像素（§4.9），动作走 §4.9 的注入阶梯 | 就是用户那台机器本身 | 免费；不要 key，但要一个活着的桌面会话 | §7.6、D31；需要 D27 的 (b) 与 §10 的 P10 |

一个 provider 是**一行，不是一条 `if` 链** —— backend-caps 那套纪律。一个 provider 缺的能力
（"不能 headed"、"不能带 `--allowed-domains`"、"没有 CDP"、"没配 key"）是一个 UI 会读的字段，于是
一个不可能工作的控件是带理由地禁用掉，而不是在使用时才失败 —— 而 `local-window` 那一行把"没有 CDP"
从一个尴尬变成了这张表里的一个**值**，这正是它作为一行而不是一条特例存在的理由。

**那些机制真正会读的能力格。** 上表回答"它是什么"；下表回答"注册表里的每一个机制拿它怎么办"。
两张表分开是因为它们被读的时刻不同：上表是给人看的，下表是 §7.4 的切换、§3.3 的目录归属、P5 的
清扫、§7.5 的 key 与 §3.4 的租约在**动手之前**要问的 —— 而 backend-caps 的纪律是一行而不是一条
`if` 链。

| Provider | `keyScope` | `canSwitchTo`（§7.4） | `ownsDir` | `leaseKind`（§3.4） |
|---|---|---|---|---|
| `chromium` | `none` | `in-place` | 是 | `tab` |
| `cloak` | `local-only` | `in-place` | 是 | `tab` |
| `cdp`（远程） | `none` | `no` —— 那是别人的浏览器，"切到 cdp"其实是另建一个 profile | 否 | `tab` |
| `cloud:<name>` | `local-only` | `export-only` —— 供应商的目录不是我们能打开的（§7.4 的导出/导入那一段，它自己就说了会丢什么） | 否 | `tab` |
| `local-window` | `none` | **`no`** | **否** —— 它的状态是用户自己那个 Chrome/Firefox 的 profile，不是记录上的 `dir` | **`window-target`** |

三条读法，每一条都关掉一个本来会静默出错的地方：

* **`keyScope: 'local-only'` 是一条拒绝，不是一个标签。** 一个要 key 的 provider 在 `host != null`
  的 profile 上**被拒绝**，切换器那一行带理由禁用（`provider_needs_local_key`）。理由与 D34 一起
  写在 §7.5：那把明文 key 今天**没有**一条通往另一台机器的通道，而 §6.4 逐字写着它"活在服务端的
  注册表里"。
* **这里故意没有 `swept` 这一格。** P5 的保留清扫作用在 `dir` 上，所以"会不会被扫"**就是**
  `ownsDir`，多一格就是 §3.3 第三条禁止的那种孪生。P5 扫的正好是 `ownsDir: true` 的那些行，这句话
  是 `test-browser-housekeeping` 的一条断言而不是一句注释。
* **`local-window` 那一行的三个"否"合起来就是 §7.6 的规矩 3**：升级到 tier 3 **不会**把一个已有
  profile 重指过去。它没有 `dir`、没有 `fingerprintSeed`、永远不是 §7.4 版本阶梯的对象、也永远不
  被 P5 的清扫碰到 —— 因为那些机制全都作用在一个**我们拥有的目录**上，而这一层里根本没有这样一个
  目录。

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

### 7.4 把一个活着的 profile 切到另一个 backend

（Owner 问题 Q2。）用户或 agent 撞上一个默认 Chromium 打不开的页面，需要**立刻**换一个 backend，
而且**不丢 cookie / localStorage / 登录**。这一节说机制、UX、agent 工具、花钱的门，和失败形态。

**机制：backend 是 profile 的一个属性，不是浏览器的。** 注册表里 `provider` 那个字段本来就在
（§3.3）；切换就是改那个字段，然后让 keeper 重来一遍。三个已核实的事实决定了它能做到什么：

* **CloakBrowser 接受一个显式的持久目录。** 仓库文档里的 `launch_persistent_context("./my-profile")`
  就是这条路；agent-browser 自己从 0.8.7 起也支持自定义可执行文件路径。所以"同一个 user-data-dir，
  换一个二进制去打开"在两边都是被支持的形态。
* **指纹 seed 是一个启动参数，不存在 profile 里。** 仓库文档逐字：`--fingerprint=seed` ——
  "同一个 seed = 跨启动同一个指纹。session 持久化（回头访客）用这个。" 于是耐久的那一半是
  **我们注册表里的 `fingerprintSeed`**，而不是那个目录。§3.3 本来就有这个字段，现在它有了职责。
* **Chromium 的 profile 版本戳是单向的。** 一个被**更新**的 Chromium 写过的 user-data-dir，
  旧版打开会被拒绝（"Your profile can not be used because it is from a newer version of Google
  Chrome"）。而这里的版本差是真实存在的：CloakBrowser **免费档是 Chromium 146，Pro 档是 151**
  （仓库文档逐字，补丁数分别是 58 / 73）。所以**升级是单向的**：这个目录一旦被更高的那个大版本
  打开过，就回不去了。

由此得到**版本阶梯**，它是这次切换的核心判定，而且必须在动任何字节**之前**跑：

| 情形 | 做什么 |
|---|---|
| 目标 backend 的大版本 **≥** 这个目录上次被写的大版本 | 直接切，记下新的大版本 |
| 目标 backend 的大版本 **<** 上次被写的大版本 | **拒绝**，点名两个版本，给两条出路：升级那个 backend，或者**克隆**这个 profile（下面导出那一半，明说会丢什么） |
| 这个目录**没有**被记过版本（收养来的，或本设计之前就存在的） | 只读地读它自己的 `Last Version`；读不出来就当"未知"，**拒绝自动降级**，要用户显式确认一次 |

"上次被谁的哪个大版本写过"记在**注册表**里（`lastChromiumMajor` + `lastBackend`），理由是这个
仓库反复学到的那一条：**守卫读的那个事实，不能是坏写会产生的那个事实**。目录里的 `Last Version`
是浏览器自己写的，它当然是主证据；注册表这一份是我们自己写的，它让"这个 profile 被 Pro 打开过"
在目录读不出来时仍然可判。两者矛盾时取**更高**的那个 —— 保守方向：拒绝一次合法的降级，比放行
一次会毁掉 profile 的降级便宜。

**切换的动作序列，以及租约为什么活得下来：**

1. 记下每一份租约的 `lastUrl`（0.34 起 JSON 里就带这个字段）和 `browserKey`。
2. **停掉浏览器进程**（`--pin-tab` 的绑定、CDP endpoint、`targetId` 全部随进程死掉）。这一步不是
   可选的：Chromium 的进程单例意味着一个 user-data-dir 同一时刻只能被一个浏览器打开
   （Chromium 自己的 `user_data_dir.md` 逐字："two running Chrome instances cannot share the same
   user data directory"），所以**不存在**"活着交接"这回事。
3. 用新的 backend、**同一个目录**、**同一个 `fingerprintSeed`** 启动。
4. 按租约表逐条 `tab new` 到它自己的 `lastUrl`、重新 `--pin-tab`、把新的 `targetId` 写回租约。
5. 租约**从没有被销毁过** —— 它按 `(profileId, browserKey)` 查找（§3.3），只有 `targetId` 被重铸。
   所以会话不用 re-attach，agent 的下一条命令落在它自己的标签页上。

对 agent 和对用户，中间那一段是**一次 `browser_restarting` 的具名拒绝**，不是一个超时 —— 和
`tab_gone` / `browser_paused` 同一族。

**指纹变了，站点看到的就是一台新机器。** 这一条要在对话框里说满，因为它是这次切换唯一会**丢**
东西的地方：cookie 罐原封不动地过去了，但一个把 session 绑在指纹上的站点（反爬厂商做的正是这件事）
会把你当成新设备，于是**可能要求重新登录**。所以：

* 一个 profile 的 `fingerprintSeed` **创建时铸一次**，之后每次切换都带着它走；
* 从 `chromium`（没有 seed）切到 `cloak`（有 seed）**按定义**就是一次指纹变化，对话框据此措辞：
  "这个 profile 之前没有稳定指纹，切过去之后站点可能要求你重新登录一次"；
* 反过来（`cloak` → `chromium`）同样成立，而且**还要**过版本阶梯 —— 那正是降级被拒绝的常见路径。

**"导出 / 导入"是明说会丢东西的那条备用路**，留给跨机器、跨 provider（云 provider 的目录不在我们
手里）的情形。agent-browser 自己的 `--state` / `--restore` 走的是 Playwright 的 `storageState`
形状：cookie、localStorage，以及**可选打开的** IndexedDB 快照（Playwright 文档逐字："Set to `true`
to include IndexedDB in the storage state snapshot"），**不含** sessionStorage。而且有一条硬边界，
它同时也是 §4.8 的关键：**一个不可导出的 `CryptoKey` 不可能被 storageState 带走**（那正是"不可
导出"的定义），所以像 WhatsApp Web 那样把本地解密密钥存成 non-extractable CryptoKey 的应用，
导出 / 导入之后**登录不会跟过去**。这不是我们的缺陷，是那个 API 的目的；对话框必须点名"这条路会
丢掉哪些站点"，而不是笼统地说一句"可能需要重新登录"。

**UX：**

* **backend chip**，画在两个地方：实时视图窗口的标题栏，和 profiles 面板里那一行。它显示当前
  backend + 大版本（`chromium 14x` / `cloak 146 (free)`），点开就是切换器。它是 chip 不是藏起来的
  菜单，因为"我现在跑在哪个浏览器上"正是用户在被挡住那一刻唯一想知道的事。
* **切换器里每一行都带一枚来源芯片（§7.5）。** 一个需要 key 的 backend 旁边写的是
  `集群默认` / `你自己的 key` / `未配置`，取自 `publicView(id)`（**遮蔽后的**视图，切换器永远不读
  明文）。`未配置` 那一行是**禁用并写明理由**的 —— §7.1 的能力行纪律 —— 而它的行动是
  `app.openIntegration('cloak')`：一次点击直接落到 ⚙ → Integrations 里那张卡上，带 focus。所以
  "没配 key"在用户**点下去之前**就已经被说出来了，而 D33 那条具名拒绝是最后一道网，不是第一道。
* **被挡住那个状态上的一键"用 CloakBrowser 打开"。** 这个状态从哪来见下面 agent 那一段 ——
  关键是这个按钮**只在有人主张被挡住时**出现，而且旁边写着**是谁**主张的。
* **每个 profile 的默认 backend**（注册表字段），于是"这个 profile 就是干这类活的"只说一次。
* **每站点记忆**："这个站点需要 cloak"。键用**精确 host**，不用可注册域 —— 用可注册域要引入一份
  public suffix list，那是一个会过期的第二份事实源；精确 host 的代价只是同一个站点的两个子域各记
  一次。这条记忆存的是一条**主张**，所以它连**谁在什么时候为什么主张的**一起存
  （`{host, tier, backend, by: 'agent'|'user', at, why}` —— `tier` 是 §7.6 加的那一格，`backend`
  留着，因为"tier 2 里选哪个 provider"是另一个问题），并且在 profiles 面板里可以逐条删除。
  **永不自动升级**：一次失败只产生一条建议（§7.6 的规矩 2）。

**agent 工具：**

```
vibespace-browser backend                    # 我现在跑在哪个 backend 上，可选的有哪些，各自能不能用
vibespace-browser backend <name>             # 提议切到 <name>
vibespace-browser blocked --url <u> [--why <code>] [--evidence <text>]
                                             # 我在这个页面上被挡住了 —— 这是一条主张，不是一次检测
```

**`blocked` 是 agent 报的，不是我们测的，而且这句话要写进协议里。** 我们没有可靠的办法从一个页面
看出"这是反爬拦截"：能确定性拿到的只有 HTTP 403/429 和已知挑战页的签名。所以服务端**永不**自己
声称检测到了拦截；它记录一条带署名的主张，UI 显示"agent 说这个页面被挡住了"，而那个一键按钮是
**用户**的动作。反过来，当一次导航确实拿到 403/429 时，`vibespace-browser` 的错误里带上
`hint: 'may-need-cloak'` —— 这是一条**提示**，措辞上必须和一次检测能区分开（和 §4.3.1 那条"我们
自己发的生产者必须有名字"同族：一条主张必须带上它的来源）。

**切换是一个提议，要过 owner / 租约那一关。** 一个 profile 可能有好几个会话 attach 着（§3.4），
而切换会**停掉所有人的浏览器**。所以：`sharing: "owner"` 下只有 owner 的会话可以直接切；其余情况
（有其它会话持着租约、或者有人持着 `input: 'user'`）一律降级成一条**提议** —— 一条写给 owner 的
"For you" 条目，点名是谁提的、为了哪个 URL、会影响哪几个会话。**正在被人接管（`input:'user'`）的
profile 永远不会被一个 agent 的提议打断。**

**花钱的门：CloakBrowser 是按并发 session 计费的。** 免费档是**一个**并发 session（需要 GitHub
登录），Pro 是 5 / 20 / 200 / 2000（仓库文档逐字）。所以切换对话框必须显示**席位**：已用 / 总数 /
这次切换之后。这个计数是 keeper 的活（它是这个设计里第一个数得清东西的部件），而且它是
**每 provider** 的，不是全局的。免费档那个"一个并发 session"意味着：第二个 cloak profile 想跑，
必然要么等，要么买 —— 把这件事藏起来，用户会对着一个看起来随机失败的浏览器排查半天。

**那两个数字来自两个不同的地方，而总数有三种状态不是两种。** *已用*是 **keeper 自己数的**，因为
我没有找到任何一个能回答"这把 key 现在被占了几个席位"的供应商接口（§12.35）。*总数*（档位）
**不来自 Test**：§7.5 把 `cloak` 那一行的 `test.kind` 定成 `shape-only`（零网络，只验 `cb_…` 的
形状），理由写在那里 —— 一次真的探测要先有那 200 MB 二进制、又要先有 §7.2.1 的出网证据记录，而这
两件事都不该由"打开一张卡片贴一把 key"触发。档位因此来自**第一次真正的启动**：keeper 起
`cloakserve` 的时候它自报计划，读回来记成 `{tier, at}` —— 这是一次**用户已经要求发生**的启动的
副产品，不是一次轮询（§ban-safety 管的是配额轮询，而这里连一个定时器都没有）。于是总数有三种
状态，而第三种在集群默认下是**常态**：

| 总数 | 什么时候 | 对话框显示什么 | 到顶时 |
|---|---|---|---|
| 已知且新鲜 | 这把 key 在 `SEAT_TIER_STALE_MS`（7 天）内成功启动过至少一次 | `已用 N / 总数 M`，并**带上那次读数的年龄**（"档位读自 3 小时前的一次启动"） | 按下面的措辞拒绝 |
| 已知但陈旧 | 上一次成功启动早于 7 天 | 退化成"未知"，并说出**上一次**读到的档位与它的日期 —— 一个过期的判决可以当线索，不能当约束 | **不拒绝** |
| **未知** | **这把 key 从没成功启动过**。集群默认下这是常态：D32 的建议正是集群注入默认 key，而那样的用户**根本不会去打开那张卡片** | "席位上限未知 —— 它会在这把 key 第一次真正启动浏览器时变成已知"，**绝不编一个数字** | **不拒绝** |

**一个未知的总数永远不能满足上限判定。** 这条要写成不变量而不是措辞：`未知` 既不是 `0` 也不是
`∞`，它不参与比较；上限拒绝**只在总数已知且新鲜时**才可能发生。那个 7 天不是随手定的 —— 它是本仓
已经在用的同一个形状（`OVERAGE_STALE_MS = 7 * 24 * 3600 * 1000`，`src/spend-authorizer.js:259`：
一个会**拒绝**东西的主张必须有日期），也是共享层自己写下的那条规矩的同一形状（"一个 `testedAt`
不会永远绿着；一个判决绝不比它描述的那次读数活得更久"）。而它在这里几乎不咬人：这个读数由它约束
的那个动作（一次启动）自己刷新，所以只有一把"很久没启动过"的 key 会变陈旧 —— 而那样的 key 在本
实例上的*已用*本来就是 0。

**三个失败形态，三条具名拒绝。** **(1) 那个二进制没装**：`backend_unavailable`（带 provider 名和
它缺什么）。**(2) 那把 key 没配**：`backend_no_key`（带 provider 名、注册表行 id，以及那条**可执行
的**出路 —— 打开 Integrations 里那张卡，D33）。**(3) 席位被别人占着**：`backend_seat_taken`。
两条都不是超时、都不是静默回落，理由见 D33。和别处一样：一条**具名**拒绝，profiles 面板与切换
对话框里一行**禁用并写明理由**的控件，外加 Manage Agents 里的一个安装动作（`cloakbrowser` 是一个
npm 包，装它是一次用户动作，并且要过 §7.2.1 的出网前置条件 —— **先测量，再安装**，不是反过来）。
**永不**在用户没说要装的时候自动去下那 200 MB。

**第三条不是补全，它是集群默认下的默认失败形态，而前两条都盖不住它。** 理由是结构性的：D32 建议
集群注入的是**免费档**（一个并发 session），而*已用*是 keeper 数的、**只数得到本实例**。于是另一个
pod 占着那唯一一个席位时，本实例读到的是"已用 0 / 总数 1"（更常见的是"已用 0 / 总数未知"），上限
判定**根本不会触发**，spawn 照常发出去，用户看到的是 `cloakserve` 自己吐出来的东西 —— 正是上面那
句话要防的那个下午。所以 keeper 把一次**因授权/并发校验失败**的 `cloakserve` 启动分类成
`backend_seat_taken`，而那条拒绝必须说三件事：**是哪个 provider**、**这把 key 是集群默认因而席位
与整个机队共享**（所以"停掉你自己的那一个"是错的建议 —— 本实例可能一个都没开），以及那条一键出路
`app.openIntegration('cloak')` → "用我自己的 key"。

**到顶时的措辞按 key 的来源分岔，因为两边可说的事实不一样。** key 是**用户自己的** ⇒ 席位都在这台
实例上 ⇒ 照 §3.5 的浏览器上限那个形状：**大声拒绝、点名此刻占着席位的那几个 profile、给出"停掉那
一个"**。key 是**集群默认** ⇒ 本实例根本列不出那些 profile（它们在别人的 pod 里）⇒ 那条拒绝
**不许**假装能列，它说的是"集群默认（席位与其他用户共享，本实例已用 N）"外加那条一键出路，绝不是
一个假装全局的分数。**一条拒绝只能说出它自己的原因知道的事** —— 这是本仓 2.369.x 那一批自动续跑
事故写下的同一条法，而这里它恰好把 D32 那句"到顶时的建议是换成你自己的 key"从一个**结构上到不了**
的上限里救了出来。

**这条拒绝的措辞依赖一个我没有量过的事实**，而它写在 §12.40：一把免费档 key 的那个席位被**另一台
机器**占着的时候，`cloakserve` 到底返回什么。公开材料只说"并发的本地免费 session 会被串行化"
（§12.35），那是**同机**的说法。所以 P4 的第一批动作里多一条：拿一把免费档 key 在两台机器上同时
起，把回答逐字记下来 —— 分类器认的是那个回答，不是我的猜测；在它被测出来之前，`backend_seat_taken`
的判据只能是"启动失败且错误里带着授权/并发字样"，而这句话本身就要写进代码注释里等着被收窄。

### 7.5 Provider 密钥来自哪里

（Owner 指令，2026-09-11，逐字：「对于指纹浏览器和 communication panel 这种可能需要配置自己的 key
的情况，要考虑怎么提供配置界面，让我们集群里的用户可以自行配置（当然 lark 这种集群里能提供默认
oauth client 的就提供默认）」。）

§7.1 那张表里有几行需要一把**用户自己的 key**：`cloak` 的 CloakBrowser license key，以及每一个
`cloud:<name>` 的供应商 API key。本节说这些 key 住在哪、集群怎么给默认值、用户怎么覆盖它、以及它
为什么一步都不能靠近 agent。

**它不是本设计自己的机制，本节是它的消费方。** 共享的**集成与密钥层 (Integrations & keys)** 定义在
**`docs/design-communication-panel.zh.md` 的集成密钥一节**（本节这一版对的是
`design-communication-panel-r2` 分支 commit `d02afcbb` 上的第八轮正本，那边的共享层现在是
`## 14. 集成密钥与配置界面`，而 `## 13. 密钥、过期、失败` 留给 adapter 自己的 token）。
**两份文档的权威锚点是模块名，不是节号**（§12.34）—— 本节逐字使用这些名字：

| 名字 | 是什么 | 本 track 怎么用它 |
|---|---|---|
| `src/integration-registry.js` | **PURE** 表，不 import 任何东西：一行一个集成 `{id, label, fields:[{key,label,secret,required,placeholder,help,validate}], clusterEnv, setup:{callbackUrl,callbackNote,prerequisites}（可选）, test:{kind,describe,caveat}, consumers:[…], docs}` | 本 track 贡献下面那六行；`test.kind` 取自共享层那个**封闭集**，`consumers` 写的是**模块路径**（那条普查要求每个名字既是一个存在的文件、又真的调用 `resolveIntegration('<id>')`）。**本 track 这六行一个 `setup` 都不声明**，而这一句要说出来而不是默认：`setup` 装的是"在同意页能成功之前用户必须先在对方控制台里做完的事"（回调 URL、scope、已发布的版本），而 CloakBrowser 与五个 `cloud:*` 都是**纯 key**——没有同意页，也没有任何一个要抄进对方控制台的值。所以共享层那条"一行只要声明了 `setup.prerequisites`，就必须声明 `test.caveat`"**对本 track 的六行不生效**（它约束的是 Lark 那种 OAuth 行）；卡片"永远不只画一个绿勾"那一条仍然照旧适用 |
| `src/server/integration-store.js` | **ORCH**：`data/integrations.json` 经 `writeJsonAtomic` 写入、secret 字段经 secret-box 加密。**记录里只有两样东西**：`values`（用户自己打进去的）与 `clusterKey`（用户挑中的那个集群预设的 key）——**`source` 是读的时候推导出来的，绝不落盘**（一个落盘的 `source` 会和"集群默认消失了就答 `none`"打架，而一个只挑了预设、没填任何密字段的记录**不是**"用户自己的凭据"）。`resolveIntegration(id)` → `{source:'user'\|'cluster'\|'none', clusterKey, values, label, fromEnv, testedAt, lastOk, lastError, missing:[]}`；`publicView(id)` 把每个 secret 字段遮成 `••••` + 末 4 位；`setIntegration(id, patch)`（缺省字段=不变，`''`=清空）、`clearUserValues(id)`、`useClusterDefault(id)`、`test(id)`；每次写广播 `integrations-updated`（携带**遮蔽后**的视图） | keeper 在 spawn 一个 provider **之前**问 `resolveIntegration`，从不自己读 env |
| 路由 | `GET /api/integrations`（遮蔽列表，每一行还携带 `setup`、`clusterKey`、`clusterOptions`、`testCaveat`）· `PUT /api/integrations/:id` = `setIntegration`（缺省字段=不变，`''`=清空）；载荷带 `{use:'cluster'}` 时走的是 `useClusterDefault(id)`，**没有集群默认就具名拒绝**；载荷带 `{clusterKey:'<key>'}` 时存的是那个**选择器**（记录里一个值都不落）· `POST /api/integrations/:id/test` · `DELETE /api/integrations/:id` = `clearUserValues(id)`，也就是**"把我的 key 清掉"：永远允许**，丢掉用户覆盖之后**落在优先级落到的地方**（有集群默认就是 `'cluster'`，没有就是 `'none'`）——它**不是** `useClusterDefault`，后者是那颗单选、并且在没有集群默认时拒绝 | §7.4 的切换器读遮蔽列表拿来源与 Test 判决；**永远不读明文** |
| ⚙ → **Integrations**（集成与密钥） | 窗口类型 `integrations`（`registerWindowType`，openSpec `{openIntegrations, focus:<id>}`），像 Plugins 卡片那样一行一张卡：**来源芯片**（集群默认 / 你自己的 / 未配置）、"用集群默认"（走 `PUT {use:'cluster'}` → `useClusterDefault(id)`，没有集群默认时置灰**并说明原因**）与"用我自己的 key"二选一、声明的字段（secret 只给 **Replace** 不给 Reveal）、Test 按钮与它上一次的判决（含被转义的供应商原文）、一行"这个 key 被谁用"；**≤768px 渲染同一批卡片，单列** | 每个消费方深链到自己那张卡：`app.openIntegration(id)` |
| 优先级 | **用户自己的 > 集群默认 > 没有**，无例外 | §7.4 的切换器、keeper、以及将来任何一个 provider 行都问同一个答案 |

这个形状在本仓库已经跑着两份，本节没有发明它：`MountManager.drivePresets()` / `_driveClient()`
（`src/mounts.js:2189` / `:2211`）从 `VIBESPACE_GDRIVE_CLIENTS` 读集群预设、**记录只存 preset KEY**
于是轮换 env 就轮换每一个消费方，优先级逐字是"记录上的自定义 client > 选中的 preset > 单个/`default`
preset > 工具内建"，而 UI 里那一项叫 "Custom (own client id/secret)"、secret 字段是 `type:'password'`
（`src/lib/sidebar-mounts.js:1750-1771`）；`PluginManager._frpCfg()`（`src/plugins.js:569-580`）让
`data/plugins.json` 里的**用户覆盖**压过集群 env 默认、用 `fromEnv` 告诉 UI 这个值来自集群
（`:686`）、状态里只暴露 `hasToken` **从不暴露 token**（`:694`），并且在集群注入了 env 时**默认开启**
这个插件（`_frpEffectiveEnabled`，`:584-589`）。

**本 track 贡献的注册表行。** 字段名不是我编的 —— 它们是已安装 0.32.0 二进制自己的 env 名
（`strings bin/agent-browser-linux-x64` 实测，外加它 README 的 provider 表）：

| `id` | 字段（`secret` 标 †） | 供应商自己的 env 名（**只**出现在那个子进程里） | 集群可注入 | 消费方（`consumers`） |
|---|---|---|---|---|
| `cloak` | `licenseKey` †（空 = 免费档） | `CLOAKBROWSER_LICENSE_KEY`（`cb_…`） | `VIBESPACE_INTEGRATION_CLOAK_LICENSEKEY` | `src/server/browser-backend.js`、`src/server/browser-keeper.js` |
| `cloud:browserbase` | `apiKey` † | `BROWSERBASE_API_KEY` | `VIBESPACE_INTEGRATION_CLOUD_BROWSERBASE_APIKEY` | 同上 |
| `cloud:browserless` | `apiKey` †、`apiUrl`、`stealth` | `BROWSERLESS_API_KEY` / `BROWSERLESS_API_URL` / `BROWSERLESS_STEALTH` | 同形 | 同上 |
| `cloud:kernel` | `apiKey` †、`endpoint`、`stealth` | `KERNEL_API_KEY` / `KERNEL_ENDPOINT` / `KERNEL_STEALTH` | 同形 | 同上 |
| `cloud:browseruse` | `apiKey` † | `BROWSER_USE_API_KEY` | 同形 | 同上 |
| `cloud:agentcore` | 供应商自己的一组（未核实） | 同上游 provider 表 | 同形 | 同上 |

**`consumers` 这一列六行全同，这是个结论不是偷懒**：本 track 里读 `resolveIntegration(id)` 的地方
只有两个 —— `src/server/browser-backend.js`（切换器的来源芯片，以及下面那个注册进去的 Test runner）
与 `src/server/browser-keeper.js`（spawn 之前的那一次解析，§9 第 (ii) 条腿点名的就是它）。
**这一列里绝不能写"§7.1 的 `cloak` 行"这种东西**：共享层那条普查要求每个名字**是一个存在的文件**
并且**真的调用** `resolveIntegration('<id>')`，一个指向自己的名字既满足不了"存在"，也正好把这个
字段存在的理由（"这个 key 被谁读"）取消掉。§7.1 的行与 §7.4 的切换器是**这段散文**里的说法，它们
在散文里是对的，在 `consumers` 里是假的。

那两个 `stealth` 字段是**值**，不是能力承诺：它们是各家自己的实现、没有公开规格、本轮零测量
（§12.38）。它们出现在这里是因为它们是用户/集群**可以设**的东西，而一个可以设的东西属于这张表。

**`cloak` 的 license 为什么走 env，理由要说对。** 供应商认三条通道：`CLOAKBROWSER_LICENSE_KEY`、
一个进程内的 `licenseKey` 选项、以及 `~/.cloakbrowser/license.key`（§12.35）。第一版理由写的是
"三条里唯一一条不落盘的" —— 那是错的，进程内那个选项同样不落盘，而且按本文档 §6.5 自己的威胁模型，
env 恰恰是两条不落盘通道里**弱**的那条（同一 uid 下的进程读得到 `/proc/<pid>/environ`）。真实的
理由站得住：我们把 `cloakserve` 起成**一个独立进程**（§7.2 的 Docker/loopback 形状），所以那个
**进程内**的选项在这里根本够不着 —— 可选的只剩 env 与文件两条，而 env 赢是因为写文件会把这把 key
以明文留在 `data/integrations.json` 的 secret-box 加密**之外**、也在 §7.5 那份 `sensitive` 导出
清单**之外**，于是它既不跟着密钥轮换，也不跟着配置导出的口令门走。§6.5 那条
`/proc/<pid>/environ` 的边界因此是**被接受**的，不是被否认的：本节去掉的是那个**意外**（一把躺在
每个 agent 环境里的 key），不是在制造一条边界。

**每一行的 Test 是一份合约，而它的 `kind` 来自共享层的封闭集。** 共享层把 `test.kind` 定成
`credential-exchange` / `shape-only` / `reachability` 三选一，并且**按它推导按钮上的字** —— 一个
宣称"测试连接"却从没联网的按钮就是在撒谎。本 track 六行的合约：

| `id` | `test.kind` | runner 真的做什么（`describe`） | 它**唯一**可以到达的主机 | 按钮上的字 |
|---|---|---|---|---|
| `cloak` | `shape-only` | 零网络：验 `cb_…` 的形状，**不起任何进程**、不下任何字节。档位由第一次真正的启动给出（§7.4） | 无 | 检查格式（不联网） |
| `cloud:browserbase` | `credential-exchange` | 用这把 key 对供应商自己的 sessions 端点发一次有界的只读请求；不建 session、不跑页面 | 这一行的常量主机（§12.41） | 测试连接 |
| `cloud:browserless` | `credential-exchange` | 同上 | **这一行自己 `apiUrl` 字段里的那个主机** —— 它是用户填的 | 测试连接 |
| `cloud:kernel` | `credential-exchange` | 同上 | **这一行自己 `endpoint` 字段里的那个主机** | 测试连接 |
| `cloud:browseruse` | `credential-exchange` | 同上 | 这一行的常量主机（§12.41） | 测试连接 |
| `cloud:agentcore` | `credential-exchange` | 同上（字段本身未核实，§7.5 的表已经这么写了） | 由这一行自己的区域字段推出的主机（§12.41） | 测试连接 |

**为什么 `cloak` 那一行是 `shape-only`，而不是"起一个一次性 `cloakserve` 读回档位"。** 那种 Test
有**两个前置条件**，而它们都与这张卡片被打开的时机冲突：那 200 MB 的二进制 —— §7.4 逐字写着**永不**
在用户没说要装的时候去下它 —— 以及 §7.2.1 那份出网证据记录。一张用户只是打开来**贴一把 key** 的
卡片，不该是这两件事的触发器。那本轮为什么不去共享层要一个第四种 kind（比如 `local-launch-probe`）？
因为那个集合封闭是有理由的：按钮上的字由 kind 推导，多一种 kind 就是多一句需要被解释的按钮文案，
而它买到的东西 —— 档位 —— 我们在**第一次真正的启动**上免费就能拿到，而那次启动本来就排在那两个
前置条件后面。所以这里接受封闭集给的诚实答案，并把代价明写进 §7.4 的那张三态表里。

**runner 由谁注册。** 共享层的 `test(id)` **自己不构造任何 vendor 请求**：它调的是消费方在接线时
注册进来的 runner（`registerIntegrationTest(id, fn)`），而"一行声明了 `test` 却没有注册 runner =
一个死控件 ⇒ 普查变红"。本 track 的六行**全部**由 `src/server/browser-backend.js` 在接线时注册 ——
与 `consumers` 列里的第一个名字是同一个模块，这不是巧合：**声明这一行的人、注册它 runner 的人、和
读 `resolveIntegration(id)` 的人必须是同一个模块**，否则那条普查能查到的只是三个各自为政的名字。

**本 track 自己的第三方出网声明。** 共享层之所以敢说"store 自己不构造任何 vendor 请求、这一层也不会
变成第二个持有 N 个 vendor 主机的文件"，**前提**正是消费方已经声明过自己的主机；而 §9 的
`test-vendor-whitelist` 逐字写着它是一次**只针对 Anthropic** 的源码普查，所以它既看不见也不该看见
这几行。本 track 的声明就是下面这三条，它是设计的一部分而不是实现细节：

1. **CloakBrowser** —— 它在这张声明里**没有 Test 条目**（`shape-only`，零网络）。它的出网面是
   §7.2.1 那条**容器出网白名单**：安装时是那个被钉住的下载主机，之后只剩这个 profile 真正要去的
   站点。一份测量是某一个版本行为的快照，一条白名单是部署的性质 —— 后者才是供应商换二进制之后还
   活着的那个。
2. **五个 `cloud:*` 行** —— 每一行**恰好一个**主机，而它从哪来是**按行推导**的，不是一张常量表：
   `browserless` 与 `kernel` 的主机**就是用户自己填的那个字段**（`apiUrl` / `endpoint`，上表里
   就有），`agentcore` 的主机按区域变。所以声明写成一条**规则**：**一个 runner 只能到达由它自己
   那一行的字段推导出来的那一个主机，别的一个都不行**；推导不出来就是一次具名拒绝，不是一次"用
   默认主机试试"。一张常量白名单在这里是**错的形状**，因为它对两行根本表达不出正确的答案。
3. **没有第三条。** 本 track 的服务端在这些 Test 之外**不发任何**第三方请求：provider 的流量走的是
   浏览器进程自己（`cloak` 在容器里、`cloud:*` 在供应商那边），那是 §6.3 与 §7.2.1 的题目。

§9 的 `test-browser-providers` 因此多一条腿：**这几个 runner 能到达的主机集合，恰好等于上面这条
规则推导出来的集合**；负控是一行把主机写成常量的 runner —— 它必须变红，因为常量正好绕过"用户自己
填的 `apiUrl`"这件事，而那正是这条规则存在的理由。

**那把 key 一步都不能靠近 agent，而这里有一个必须点名的陷阱。** `agentEnv()`
（`src/ws-handler.js:112-121`）不是一张**允许**清单，它是一张 **DROP 清单加一条前缀规则**：它丢掉
`AGENT_ENV_DROP` 里那 6 个名字、所有 `npm_*`、以及所有不在 `AGENT_ENV_KEEP`（9 个名字，`:101-105`）
里的 `VIBESPACE_*`。**任何其它名字它原样传下去。** 所以如果集群按**供应商自己的名字**注入
（`BROWSERBASE_API_KEY=…`），那把 key 会出现在**每一个** agent CLI 的环境里，一条 `env` 就读到了 ——
而那正是这个函数上方的注释（`:88-100`）逐字写着要防的形态（"the helm chart injects
VIBESPACE_PASSWORD (the login password!), S3/CephFS/Drive/frps credentials and the telemetry
token — an agent could read all of them with one `env`"）。于是这条规则不是卫生，是构造：

* **集群只能按 `VIBESPACE_INTEGRATION_<ID>_<FIELD>` 注入**，外加那张 JSON 列表
  `VIBESPACE_INTEGRATIONS=[{id,label,values:{…}}]`。理由是结构性的：`VIBESPACE_` 这个前缀正是
  `agentEnv` 会丢掉的那一类，而这些名字**不在** `AGENT_ENV_KEEP` 里 —— 那份 9 个名字的清单是一张
  显式表，往里加一行要有人去写，所以"忘了加"的方向是安全的那个方向。
* **供应商自己的 env 名只在 keeper 为那个 provider spawn 的那一个子进程的环境里出现**，值由
  `resolveIntegration` 在 spawn 的那一刻取出 —— 不写文件、不进 argv、不进日志、不进 `agentEnv`。
  这与 §6.4 那条"代理密码和 provider 授权 key 活在服务端的注册表里"是同一条；本节只是给了它一个
  实现，以及一种它会被违反的具体方式。
* **一个消费方永远不自己读 `process.env`。** 那条常驻普查由共享层拥有，而它查的是 **env 名字**、
  不是取值的写法：正则 `/VIBESPACE_INTEGRATIONS?\b|VIBESPACE_INTEGRATION_/` 出现在
  `src/server/integration-store.js` **之外** = 红，文件集由 `git ls-files` 推导（经
  `scripts/git-env.mjs` 的净化 git 环境）并由套件**打印出来**，两种绕法各当一条负控 ——
  方括号形式 `process.env['VIBESPACE_INTEGRATIONS']` 与解构形式
  `const { VIBESPACE_INTEGRATIONS } = process.env`。本 track 的模块是它的**被扫描对象**，
  而 §9 为此多一条腿。
* 与 §6.1 那条"流 token 永不到达 agent"完全同形：一个不进 `agentEnv` 的秘密，仍然可以被同一个 uid
  下的进程从**服务器自己的** `/proc/<pid>/environ` 读到（§6.5 已经把这个诚实边界写过一遍）。本节
  去掉的是那个**意外**（一把躺在每个 agent 环境里、`env` 一敲就有的 key），不是在制造一条边界。
* **那把 key 今天没有一条通往另一台机器的通道，所以它不许上路。** 上面这条规则整条都活在**本进程**
  里：`resolveIntegration` 的答案与 spawn 之间那段路没有跨过任何传输。而一个 `host != null` 的
  profile 的 spawn 发生在 ssh 主机或配对设备上（§7.3、D5 的 (b)、§10 的 P4 —— 和 key 这一半是**同一
  个阶段**），把明文 key 顺着 agentd 的 mux 送过去会让 §6.4 那句"provider 授权 key 活在服务端的
  注册表里"当场变成假话，而且今天没有承载它的通道、没有规则、也没有一条测试。于是 §7.1 的能力格
  给出 `keyScope`：**`local-only` 的 provider 在 `host != null` 时被拒绝**
  （`provider_needs_local_key`，切换器那一行带理由禁用），而不是悄悄地少一把 key 去 spawn 然后在
  远端失败。这是一个**判定**不是一个遗漏 —— 要不要修它是 **D34**：唯一体面的通道是 daemon 已有的
  **凭据材料**那条路（sealed orders 的形状，`src/account-material.js`），而它欠自己的决定行、§6.4
  的一句话、以及 §9 第 (ii) 条腿的一条**远端臂**（由真 daemon 驱动）。三样今天一样都没有，所以今天
  的答案是拒绝，而且是写在能力表里、UI 读得到的那种拒绝。

**导出。** 集成 key 加入 `/api/config/export-info` 的 `sensitive` 清单
（`src/routes/persistence.js:679-686`，今天是 vsPassword / claudeCreds / codexCreds / hosts /
mounts / accounts 六项），于是它们只在用户**显式勾选并给出口令**时才随配置导出（`:708-712` 那道
≥4 字符的口令门）。**绝不进设置项。** settings 那个 SyncStore 把每一个值广播给每一个客户端、并且
在配置导出里是明文；`SETTINGS_CATEGORIES`（`src/lib/settings-schema.js:935-948`，它**就是**
SettingsUI 的渲染循环，test-architecture §44）今天已经有 `Integration` 这一类，但那一类装的是
**开关**不是**秘密** —— 一个秘密进设置，就是把它发给每一个打开着的标签页。所以本设计新增的任何
浏览器开关（自动绑定、录制、每站点记忆）可以进 `SETTINGS_CATEGORIES`（并且**必须**进，否则它渲染
不出来），而 key 一律进 Integrations 窗口。

**at-rest 加密是一个 P0 前置条件，不是本 track 的代码。** 今天那对 `aes-256-gcm` 原语住在
`MountManager._enc` / `_dec`（`src/mounts.js:369-382`；密钥文件 `data/.mounts-key`，`0600`，首次
使用时铸出来，`src/mounts.js:47` + `:360-367`）。共享层把它抽成 `src/secret-box.js`（**SHARED**，
**一个**原语），mounts 带一条 parity 测试迁到它后面。本 track 不实现它，只**依赖**它 —— §10 的 P4
因此有一条明写的跨 track 依赖线。

**集群管理员怎么给默认值。** helm 的 `integrations:` 块 → 一个 Secret → env，形状与已经在跑的
Drive presets 一模一样：`deploy/helm/vibespace-user/templates/main.yaml:159-170` 逐字是
`valueFrom: { secretKeyRef: … }`，**绝不是**明文 `value:`（同一段里 `VIBESPACE_GDRIVE_CLIENT_ID`
是明文而 `…_SECRET` 走 secretKeyRef，因为只有后者是秘密）。确切的 values 块与 `deploy/README.md`
的那一节由共享层那份文档拥有；本 track 只声明它要的那几个 `id` 与字段名（上表）。

**机队的重定向 URI —— 本 track 不消费它，但两份文档必须说同一句话。** 一个只注册一次的集群 OAuth
client 要服务 N 个各有各公网地址的实例（helm 给每个实例注入 `VIBESPACE_PUBLIC_URL`，
`main.yaml:172-176`），有两条路：**(a) 现有的 loopback + 粘回流程** —— 重定向落在**用户自己机器上
的浏览器**里，UI 让他把地址栏那一串粘回来，我们再转发给本地监听器；`src/mounts.js:2172-2183` 逐字
写着这个形状已经在 Drive 上跑着（"Remote deployment: the redirect to 127.0.0.1 fails in the USER'S
browser, but the code is in the address bar — the UI asks them to paste that URL back"），而它对一个
**集群** app **一行都不用改**，因为实例的公网地址从来就不是重定向目标。**(b) 一个集群 auth relay**
（`https://auth.<cluster>/cb`，带签名 state，再转发到实例的公网地址）—— UX 更好，但那是新基础设施、
新的可信中间人、新的可用性依赖。**建议 v1 走 (a)，(b) 作为后续阶段并留给 owner 决定。** 各家允许
什么：**Lark 要求精确匹配的重定向 URI**（所以 (a) 用一个**固定**的已注册 loopback URL，共享层
§12.4 的决定 4）；**Google 允许多个精确 URI，且对 loopback 放宽端口**；**CloakBrowser 是一把 API
key，根本没有重定向** —— 本 track 上表里的每一行都是纯 key，所以这整段对本文档是**背景**而不是
依赖，写在这里只是为了让下一个读者不会以为它被漏掉了。

### 7.6 三层访问阶梯 —— CDP、指纹浏览器、纯 computer-use（D31）

（Owner 2026-09-10 的问题，本轮才折进架构：「agent-browser 是 CDP 吗，Mercury 这类银行会不会
检测……是不是还得一个纯 computer use 版本」。）

**先把事实摆出来，每一条都点名它的来源。**

* **agent-browser 从头到尾就是 CDP。** 这不是推断：已安装 0.32.0 的 `bin/agent-browser-linux-x64`
  里 `strings` 拿得到 `struct CdpMessage` / `struct CdpReply` / `struct CdpError` /
  `Target.createTarget` / `Page.navigate` / `Input.dispatchMouseEvent` / `GetFullAXTreeResult`
  （= `Accessibility.getFullAXTree`），而 `--cdp` / `connect` / `get cdp-url` 在 §1.4 已经列过。
  唯一的例外是一条 **WebDriver** 后端（同一个二进制里的
  `src/native/webdriver/{client,backend,appium,ios}.rs`，错误串逐字 "… is not supported on the
  WebDriver backend"），而它服务的是 iOS / Safari / Appium，不是规避。
* **今天的"隐身"只有一个启动标志，而且它是用户自己写在 config 里的。**
  `--disable-blink-features=AutomationControlled` 出现在这台机器的 `~/.agent-browser/config.json`
  里（§1.1 逐字），而在二进制里它只出现在 `--args` 的**示例文本**中
  （`e.g., --args "--no-sandbox,--disable-blink-features=AutomationControlled"`）。上游自己没有
  隐身层。
* **但上游有一个一等的接口可以挂一个。** 0.32.0 自己的 README 记载了插件能力 `launch.mutate`：
  "Use a launch mutator plugin for **stealth** or local launch customization. The plugin can append
  Chrome args, extensions, and init scripts before the browser starts"；示例插件名逐字就是
  `stealth` / `agent-browser-plugin-stealth`，而它按能力门控
  （`agent-browser --confirm-actions plugin:stealth:launch.mutate open …`）。同一页还写着
  "agent-browser keeps browser automation, redaction-sensitive output, and policy enforcement in
  core" —— 也就是说插件是**进程外**的。**这给 tier 2 多了一条不换二进制的道**（§7.4 是换二进制的
  那条）。是否存在一个已发布的实现，未核实（§12.37）。
* **上游自己承认这不够。** `vercel-labs/agent-browser` 的 issue **#120**（"Feature Request: Add
  stealth mode via AGENT_BROWSER_STEALTH environment variable"，shkumbinhasani，2026-01-15，
  **仍然 open**）写着现代 bot 检测（点名 Cloudflare / DataDome / PerimeterX / reCAPTCHA）查的
  信号远不止一个，而 `--disable-blink-features=AutomationControlled` 这类启动标志"只覆盖一个检测
  向量"，并列出 WebGL vendor/renderer 指纹、插件与 mime 类型枚举、Chrome runtime 属性、浏览器
  特性检测不一致等等。
* **经典的 `Runtime.enable` 泄漏已经基本死了，而这恰恰是不能把补丁当答案的理由。** 2025 年的一次
  Chrome 更新改掉了那个经典检查所观察的序列化路径，于是那个 getter 在当前版本上不再触发；而
  rebrowser / Patchright 那一代补丁的做法是**干脆不发**那条命令 —— 两边打了一场"补丁战"，结果是
  这**一个**信号到 2026 年基本无效。留下来的是四层：**协议副作用**（任何"挂了调试器就表现不同"的
  东西都是可用探针）、**注入残留**（`$cdc_`、`__playwright__binding__` 这类可观测对象）、
  **求值指纹**（经 CDP 注入的代码与随页面到达的代码执行方式不同），以及**缺席模式**（一个完全
  安静的 session 本身就是信号，配上服务器级渲染与数据中心网络特征）。换句话说：**一个针对某一个
  泄漏的补丁是一个会过期的资产**，而这正是本设计**不自己写**隐身层、而把它做成一个 provider 行的
  理由（§7.1 的能力行纪律）。
* **银行走的是另一条道，而这条道对"指纹浏览器"是不利的。** 行为生物识别与设备情报这条产业
  （某厂商 2026-03 发布的 DeviceIQ 逐字点名要识别 device spoofing、emulators、**cloaked
  browsers**、越狱设备与数据擦除；同一厂商自称持续采集 3,000+ 匿名信号，含键击与鼠标行为、AI
  agent 使用；截至 2026 Q1 全球前 100 大银行里 30 多家、共 357 家金融机构在用）意味着银行判断的
  依据是**设备指纹 + 行为 + 新设备升级验证**，而不是一道 JS 挑战。**后果是反直觉的**：一个指纹
  浏览器让你看起来像**一台新设备**，而"新设备"对银行的正确反应就是**要求二次验证** —— 于是
  **tier 2 在这类站点上可能比 tier 1 更糟**，而这正是 owner 那个问题问对了的地方。
* **具体某家银行到底挡不挡，只能按站点实测。** 本轮没有对任何一个被点名的站点做过一次真实尝试，
  owner 那个"给我 2–3 个具体挂掉的站点"的要求**仍然成立**，而它是 D31 唯一能被证据推动的那一半
  （§12.36）。

**于是三层，而且它们是 §7.1 里三个并列的 provider 行，不是一条 `if` 链：**

| 层 | provider | 观察 / 动作 | 站点看到什么 | 成本 | 延迟与精度 | 用在哪 |
|---|---|---|---|---|---|---|
| **1** | `chromium`（可选挂一个 `launch.mutate` 插件） | CDP：DOM + 无障碍树 + `Input.*`，按元素引用动作 | 一个自动化的 Chrome，除了一个启动标志之外没有掩饰 | 免费；本机每实例 6 进程 / 420–667 MB PSS（§1.2） | 最快、最精确 | 默认；一切不主动拦的站点 |
| **2** | `cloak` / `cloud:*`（含各家自己的 `*_STEALTH` 开关，§7.5） | 仍然是 CDP —— 同一套动词、同一个 profile 模型 | **另一台机器**：源码级指纹补丁、每连接一个 seed（§7.2） | CloakBrowser 免费 1 并发 / $19 起；云 provider 按量（key 见 §7.5） | 与 tier 1 同量级，加一次启动与可能的网络跳 | 内容站与反爬栈；**对任何有账号的站点，先试通过实时视图人工登录（I5）** |
| **3** | **`local-window`（新）** | **没有 CDP、没有自动化标志**：像素 + AT-SPI 无障碍树（§4.9），输入走 §4.9 那条按平台的注入阶梯 | **用户自己真实的浏览器 profile** —— 一个普通的 Chrome/Firefox 窗口；除了**行为**之外没有东西可被检测 | 免费，但要一个活着的桌面会话 + §4.7 那条传输 | 最慢、最不精确：一次 `snapshot` 是**每节点一次 D-Bus 往返**（实测 1,800–6,100 节点/秒，§4.9），`click @ref` 只在**自报动作**的节点上成立（503 个节点里 66 个，**43 个 `button` 里只有 6 个**），`key`（和弦）在树上**一条路都没有** | 银行，以及任何做新设备升级验证的站点；**需要用户在场** |

五条从这张表直接掉出来的规矩：

1. **tier 3 不是 tier 2 的"更强版本"，它是另一种取舍。** tier 2 买的是"看起来像一台没被自动化的
   机器"；tier 3 买的是"**就是**那台机器" —— 代价是精度与速度各降一个数量级，而且它把 §4.9 那张
   矩阵的每一个空格原样继承下来（本机：X11 枚举看不见 Wayland 客户端、GNOME 的 `Introspect` 对
   我们 AccessDenied、`/dev/uinput` 不可用）。
2. **每站点记忆长出一个 `tier` 字段，而它只在 `backend` 为 `null` 时合法。** §7.4 的
   `siteHints` 从 `{host, backend, by, at, why}` 变成 `{host, tier, backend, by, at, why}`，
   `backend` 留着，因为"tier 2 里选哪个 provider"是另一个问题。但这两个字段**不能同时**携带
   同一个事实：一个 provider 只在一层上（上表），所以 `backend` 一旦写上，`tier` 就是从它推导出
   来的 —— 再存一份就是 §3.3 第三条禁止的那种孪生。而 `tier` 之所以仍然需要存在，恰恰是本规矩的
   下半句：一次失败只产生一条**建议**，而一条建议能说的**只有**"换一层"（"这个站点要 tier 3"），
   那时根本还没有任何 provider 被选中，`backend` 就是 `null`。于是规则是一句可执法的话：
   **`tier` 只在 `backend === null` 时合法**，§3.3 与 §9 的 `test-browser-tier3` 都按这一句断言。
   **永不自动升级**：真正的升级是 §3.8 那条反默认失明规则下的一次**带公告的用户动作**，因为升到
   tier 3 意味着这个 agent 开始操作用户**真实**的登录态。
3. **升级到 tier 3 不会把一个已有 profile 重指过去 —— 它开的是一个窗口目标。** 这一条必须明写，
   因为 §7.4 的"backend 是 profile 的一个属性、切换就是改那个字段"对 tier 3 **不成立**，而按那句
   话去做的后果是静默的：一个 tier-3 目标的状态住在用户自己那个 Chrome/Firefox 的 profile 里，
   **不在**记录的 `dir` 里，于是"切换"会把这个 profile 存在的理由（那罐 cookie）悄悄丢在原地，
   同时把 P5 的保留清扫指向一个要么是我们自己的空目录、要么是用户真实浏览器目录的地方。§7.1 的
   能力格因此对 `local-window` 给出三个"否"（`canSwitchTo: no`、`ownsDir: 否`、
   `leaseKind: window-target`），而 §7.6 这条规矩是它们的读法：一条 `siteHints` 的 tier-3 建议
   命中时，用户的动作打开的是一个 §4.9 的**窗口目标**（那正是那条记录点名的东西），而不是改写某个
   profile 的 `provider`；一条 tier-3 记录**没有** `dir`、**没有** `fingerprintSeed`、永远不是
   §7.4 版本阶梯的对象、也永远不被 P5 的清扫碰到。它的租约是 §4.9 的窗口目标那种（按窗口句柄，
   不是按 `browserKey`/`targetId`），而 §6 的 owner 规则原样适用 —— 那是下一条。
4. **tier 3 的安全模型是 §6.6 的，不是 §6.2 的。** 一个 tier-3 目标就是用户桌面上的一个真窗口，
   里面是他自己的登录。§6 的租约与 owner 规则原样适用，外加两条只属于这一层的：**用户的接管永远
   赢**（`lease.input` 翻给用户的那一刻 agent 的注入立即被拒，§4.3），以及**它需要 D27 的 (b)**
   （"用户真实桌面上的窗口"那一格，要一次明确开启与它自己的同意）—— 第一版窗口目标只列**我们自己
   起的**窗口，而银行这个用例恰恰不在那一格里。这就是 tier 3 有自己一个阶段（§10 的 **P10**）的
   原因，而不是 P4 里的一个勾选框。
5. **升级阶梯必须说出它为什么升。** `vibespace-browser blocked` 那条**主张**（§7.4）现在带一个
   建议的 tier，而 UI 显示的仍然是"agent 说这个页面被挡住了，它建议 tier N"，**永远不是**"我们
   检测到了拦截"；403/429 那条 `hint` 同理，`hint:'may-need-cloak'` 变成 `hint:{tier:2|3, why}`，
   措辞上仍然必须和一次检测区分得开（与 §4.3.1 那条"我们自己发的生产者必须有名字"同族）。

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
| `test-browser-providers` | fast + heavy | **P4** | fast：provider 能力行，以及一个 provider 对它缺失的能力产出的确切拒绝（一个被禁用的控件说出它的理由），外加 CloakBrowser 出网证明记录的存在与形状（§7.2.1）—— 一个带 `blocks:` 主张而其 caps 行并不是 false 的 provider 行会 FAIL，`local-oracles` 那套纪律。heavy：真的 `browser-serve` 守护进程 op 打在一个真守护进程上，**并断言它的能力门**（旧守护进程绝不被问 —— 未知 op 会挂住），以及通过 `tcpForward` 的远程 `cdp` provider。**外加 key 那四条腿（§7.5）**：(i) **一个消费方永远不自己读 env** —— 把一整套假 provider key 放进服务器的 `process.env`，跑**真的** `agentEnv()`（它是导出的，`src/ws-handler.js:1657`），断言返回的对象里一个都没有，负控是**按供应商自己的名字**注入的那一版（`BROWSERBASE_API_KEY=…`），它必须变红（今天它会原样传下去，`:112-121`）；(ii) keeper 在 spawn 前**恰好一次**问 `resolveIntegration(provider)`，而 spawn 出去的那个子进程的环境里有那个供应商的 env 名、**它的父进程环境里没有**；(iii) 优先级三态（用户 / 集群 / 无）在同一个 fixture 上给出三个不同的 `source`，而 `publicView` 从不吐出一个明文 secret（断言的是**返回的对象**，不是它的渲染）；(iv) 一条**具名拒绝**：没配 key 的 backend 切换回 `backend_no_key` 且**不 spawn 任何东西**（负控 = 回落 `chromium`，D33 明确否掉的那个）。**再加本轮的四条**：(v) **六行全部注册了 runner** —— 把 `src/server/browser-backend.js` 的接线跑一遍，断言 `registerIntegrationTest(id, fn)` 对这六个 id 各调用过一次（负控 = 一行声明了 `test` 而没注册，它必须变红：那正是共享层普查里"死控件"的形状，而本 track 自己也要能抓到它）；(vi) **出网声明是推导出来的** —— 每个 runner 能到达的主机集合恰好等于 §7.5 那条规则推出来的集合，`browserless` / `kernel` 两行的主机取自**那一行自己字段里**的值（用两个不同的 `apiUrl` 各跑一次，主机必须跟着变），负控 = 一行把主机写成常量的 runner，它必须变红；(vii) **`cloak` 的 Test 零网络** —— 跑它的 runner，断言**零**子进程、零 socket、零字节下载，而它对一个形状错的 key 给出的是一次具名的 `validate` 抱怨（负控 = 一个会起 `cloakserve` 的 runner，它必须变红，因为那会绕过 §7.4 的两个前置条件）；(viii) **`keyScope` 是一条拒绝** —— 一个 `host != null` 的 profile 切到 `cloak` / `cloud:*` 得到 `provider_needs_local_key` 且**不 spawn、不解析、不把任何值交给任何传输**（负控 = 允许它通过的那一版，它必须变红；这条腿也是 D34 将来被翻牌时第一个要长出远端臂的地方）。那条**按 env 名字**（`/VIBESPACE_INTEGRATIONS?\b\|VIBESPACE_INTEGRATION_/`，文件集由 `git ls-files` 推导并打印出来，两种绕法各当一条负控）出现在 store 之外就变红的普查由共享层的 `test-integration-registry` 拥有，本 track 的模块只是它的被扫描对象 —— 而本 track 在 §10 的 P4 里为此有一条跨 track 依赖线。 |
| `test-browser-housekeeping` | fast | **P5** | 把保留/收编这个**判定**当作一个 PURE 函数来测，并打印它放过了什么以及为什么；**清扫的范围恰好是 `ownsDir: true` 的那些 provider 行**（§7.1 的能力格），负控是一个 `cloud:*` 或 `local-window` 记录被排进清扫名单的那一版，它必须变红 —— 那个目录不是我们的 —— 本仓库自己的清扫律：**绝不要求一次没有任何东西被允许执行的移除**（对任何可能正在飞的东西给一个宽限窗口，并连同它的年龄一起点名）。负控：在没有一次显式人类动作的情况下，永远不会有任何东西被提议删除；以及 `forget` 在移除**之前**先归档。 |
| `test-browser-pin` | fast | **P0、P1** | 钉子的阶梯当作一个 PURE 判定来测：显式 / 对话 / 岗位 / 实例 / 无，以及每一级陈述出来的 ORIGIN，还有 fork **复制钉子并铸新 key**（§3.2.5）。中途那一半是一条 WIRING PIN：被重指的符号链接（或被重写的每会话 config）才是下一次启动解析的东西，而套件断言**正在跑的那个浏览器不受影响** —— 那诚实的一半。另加词表那一条：产品发出的每一个 pin origin 都必须在 `SPAWN_ORIGINS` 里、且客户端的 `spawnValueOrigin` 白名单认得它（§3.2.5 的两处改动，负控 = 一个词表外的字符串必须让它变红，因为线上它只会静默显示一个错标签）。负控：岗位默认永远压不过会话自己的选择；绑定一个岗位不会改写一个正在跑的会话的钉子。 |
| `test-browser-backend` | fast + heavy | **P4** | fast：版本阶梯当作一个 PURE 判定跑一张矩阵（目标 ≥ / < / 无记录，注册表与 `Last Version` 矛盾时取**更高**那个）、带着**是谁主张**的 site-hint 记录（外加 §7.6 规矩 2 的那条：带 `backend` 的记录**不许**携带 `tier`，负控是两个都写上的那一版），以及 `blocked` 是一条服务端绝不自己制造的主张。**席位是三态不是一个数**：已知且新鲜 / 已知但陈旧 / **未知**，三态各自的对话框文案与到顶行为各一条腿，而承重的两条是 —— **一个未知的总数永远不满足上限判定**（负控把 `未知` 当作 `0` 或 `∞`，两种都必须变红），以及**一个陈旧的判决退化成未知**（时钟推过 `SEAT_TIER_STALE_MS` 之后同一个 fixture 必须改口，负控是把年龄丢掉的那一版）。还有一条**来源分岔**：key 是用户自己的 ⇒ 拒绝点名占着席位的 profile；key 是集群默认 ⇒ 拒绝**不许**列出任何 profile，只说"席位与其他用户共享，本实例已用 N"加那条一键出路（负控 = 在集群默认下也去列本地 profile 的那一版）。heavy：一次真的切换 —— 停、按租约逐条把标签页开回它的 `lastUrl`、重新 pin、改写 `targetId`，**租约对象从未被销毁**；外加**三条**具名拒绝各一条腿（"没装" `backend_unavailable`、"没配 key" `backend_no_key`、以及把一次授权/并发校验失败的启动分类成 `backend_seat_taken` 并说出"这把 key 是集群默认" —— 最后这条的输入是一份**录下来的** `cloakserve` 失败输出，而录哪一份取决于 §12.40 那次测量，在它做完之前这条腿钉的是分类器的**形状**而不是供应商的措辞）。 |
| `test-window-binding` | fast + heavy | **P7** | fast：带 `layout`/`split`/`ratio` 的链模型 —— 缺失的 `layout` 读作 `'tabs'`、比例被夹住，以及**只有 layout 变化时多客户端同步键也必须变**（§4.6 点名的那个陷阱，以修前的键作它的负控）。另加三条：**在一个三标签页的 split 链里关掉 host 标签页 ⇒ `layout === 'tabs'` 且 `split` 里没有悬空 id**（`_normalizeChain` 那条不变量，负控 = 不调它的修前形状会留下一个悬空 `pair`）；**同一个岗位下的两个会话拿到可分辨的徽章**；**一个没绑任何岗位的会话也画得出徽章**（后两条就是"借岗位色"会失效的那两种形态）。heavy（headless chrome）：绑定 → 一个窗口里两个面、非 1 的 DPI zoom 下分隔条拖动落在指针所在处、移动/最小化/换桌面一起走、关掉浏览器那一面塌回标签页**而聊天窗口不动**，以及移动端视口渲染成标签页**且不把这次拍扁写回去**。 |
| `test-native-window` | heavy | **P8** | 一个真 Xpra 服务器 + 一个跑在 Xvfb 下的真 X 客户端，经真正 cookie 鉴权的桥接：一个窗口到达、输入送得进去、流端口从浏览器永远够不着、背压纪律守得住。当 `xpra` 或 `Xvfb` 缺席时**带证据大声 SKIP**（2026-09-10 本机实测：`Xvfb` 装了，`xpra` 没装）。§4.7 需要的带宽/延迟数字在这里**产出**而不是断言 —— 套件把它们记在一个具名预算下，于是回归看得见。 |
| `test-browser-handles` | fast | **P1** | 附着集合当作一个 PURE 判定：集合恰好一个 ⇒ 裸命令解析到默认；集合 ≥2 ⇒ 裸命令得到具名拒绝 `profile_required` 且**拒绝里列出全部 handle 与哪个是默认**（一句不带 handle 列表的拒绝算 FAIL —— 它是这个 agent 唯一能拿到的诊断）；`--profile` 收到一个**文件系统路径**时的拒绝，附带那条能把它登记成 handle 的命令；子 handle `bk-<parent>.<n>` 按前缀被父会话的 teardown 收掉；每个动词一条审计行且**内容永不入账**（`fill` 只记动词）。**外加那条直接路径的两半（§3.7）**：两个附着时，一条带着该会话自己那份 env 的**直接** `agent-browser` 调用解析到默认 profile 的 user-data-dir、**且解析不到另一个那个**（非默认附着的目录由服务器铸名、从不打印），而经我们 CLI 的同一条裸命令拿到 `profile_required` —— 前一半是①层的诚实边界，后一半是它的保证，两半都要有断言，否则那条边界只是一句散文。负控：只有一个附着的会话**永远**不需要 handle（否则这条规矩会把最常见的形状变成两条命令）；一个指向本会话没有 attach 的 profile 的 handle 是**拒绝**，不是自动 attach。 |
| `test-profile-blindness` | fast + heavy | **P1、P2** | fast：`profile_changed` 是**一次性**的（同一个指纹说一次，之后裸命令照常跑）、它按**附着集合的指纹**触发而不是按命令数、它是 typed 的（`{code, was, now, handles}`）；`pendingNotice` 那条 `<system-reminder>` 的措辞与它零计费的投递路径（§3.8 第②层）；**外加那个载体本身**：一条状态覆盖通知与一条 profile 变更通知同时挂着时，**两条都到达下一条 prompt**（负控是今天那个单槽 + 首条即 `break` 的行为，它必须丢掉其中一条）。heavy（headless chrome，375×667）：这一腿是一次**变异**而不是两次全新渲染 —— 先渲染，再只改同一条会话的"agent 最后用过的"那个值，断言芯片在**没有整表重建**的情况下从中性翻成琥珀并写出两个名字；负控是把 digest 换成一个**对着对象**的 `(v) => v \|\| ''`（实测两个不同的对象都 digest 成 `":[object Object]"`），它必须变红。"一致时中性、不一致时琥珀"这两次全新渲染**不是**这条腿，因为在那个 bug 下它们照样通过（这个仓库在这张表上已经付过六次代价）。 |
| `test-browser-tier3` | fast + heavy | **P10** | fast：阶梯当作一个 PURE 判定 —— `tier(provider)` 从 §7.1 那两张表推导（**profile 记录上没有** `tier` 字段，§3.3；而一条 `siteHints` 的 `tier` **只在 `backend === null` 时合法**，负控是同时写上两者的那一版、以及只写 `tier` 就去改某个 profile 的 `provider` 的那一版，两种都必须变红）、`siteHints` 那条**永不自动升级**的规则（一次 tier 1/2 失败只产生一条**建议**，负控是把它写成自动切换、它必须变红）、`blocked` 主张与 403/429 的 `hint` 两者都携带**谁主张的**而**永不**自称检测、以及 `local-window` 那一行对它缺的每一项能力（无 CDP、无 `--allowed-domains`、无 `--pin-tab`）给出的确切拒绝。heavy：一个真 Chrome 窗口开在一个真 X 服务器上、**没有** `--remote-debugging-port`、**没有** CDP —— `snapshot` 从真的 AT-SPI 树来、一次 `click @ref` 落在一个自报动作的节点上、一次和弦**带着探测结果被拒绝**（§4.9：树上一条路都没有），全程断言那个浏览器进程的 argv 里**没有任何**自动化标志（这一腿就是 tier 3 的定义，所以它是一条断言而不是一句话）。 |
| `test-window-target` | heavy | **P9** | 真 Xvfb + 真 Xpra + 一个真 GTK 客户端：`list` 只列我们自己起的窗口、`snapshot` 从**真的 AT-SPI 树**里铸出 `@ref`（断言 role/name/bounds 都在）、`click @ref` 经 `do_action` 改变了那个应用的状态（由该应用自己的树复核，不是由像素）、`click --at` 在没有注入后端时**带探测结果拒绝**、**`key`（和弦）在没有注入后端时同样带探测结果拒绝**（树上没有这条路，所以这个动词在那一列里就是做不到的）、**`click @ref` 打在一个没有导出 `Action` 的节点上时是拒绝而不是悄悄降级成一次坐标点击**（负控：同一个节点在有注入后端时也仍然是拒绝 —— 这条规矩是关于那个节点的，不是关于那一列的）、`snapshot` 顺带**报出它这趟的接口清点**（`Action`/`EditableText` 各占多少节点）好让 §4.9 的 66/503 与 6/43 在别的桌面上可被复核、那趟遍历跑在一个**有界的子进程**里且一个不应答的节点被报成读不出来的子树而不是把整趟拖住、租约与 §4.3 三态与标签页共用同一个对象。能力矩阵的每一格都是一条**运行时探测**而不是一个平台名，套件把探测结果**打印**出来；`xpra`/`Xvfb`/AT-SPI 任一缺席时**带证据大声 SKIP**（2026-09-10 本机：`Xvfb` 在、`xpra` 不在、AT-SPI 在且报 9 个应用）。§4.9 承认没量过的那些数字在这里产出并记在具名预算下。 |
| `test-spend-paths` | fast | **P3** | 不是一个新套件 —— 是那个既有的普查，而这个功能不能把它弄红。它的 `deliver-ladder` primitive **按站点**匹配 `deliverToConversation(`，所以 `src/server/browser-*.js` 里任何一次公告都需要那道门在其上方作用域内；而它的封闭集断言意味着 `'browser-handback'` 与 `'browser-profile-notice'`（§3.8）都必须在同一次改动里既被声明又被使用（§4.3.1）。 |
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
| **P0 — 零干扰** | spawn 时的 `AGENT_BROWSER_SESSION` + `_NAMESPACE` + 显式 `_IDLE_TIMEOUT_MS`（本地 + 远程路径）、**§3.2.2 的 user-data-dir 变体及其回落梯子**、`browserKey` 连续性梯子（§3.2.1）、版本下限探测并给出一条诚实的"你的 agent-browser 对共享 profile 来说太老了"提示、k = 1/4/12 的资源测量（§1.2、§12.10）、工具介绍里的一行、`docs/agent/browser-manual.md`、`test-browser-profiles`（环境那一半，断言解析出来的目录），**外加钉子的环境间接层（§3.2.5）—— 每会话生成的 config 或那条被重指的符号链接 —— 于是中途钉住永远不需要重启**。 | **5** | 4–7 | 2.5 | **能 —— (1.b) 中"停止互相干扰"那整半。** |
| **P1 — 注册表 + keeper + 租约** | `src/browser-profiles.js`（PURE）、`browser-keeper.js` 含**开机对账和并发天花板**、`data/browser-profiles.json` + 原子写 + 广播、`/api/browser/*`、attach/detach/租约、`vibespace-browser` CLI + `AGENT_TOOLS` + 手册、迁移步骤 1–2、**钉子的阶梯 + 岗位默认 + 四个钉子面 + "收养这个会话的浏览器"（§3.2.5）**、`test-browser-pin`，**外加附着集合与 handle 寻址（§3.7）+ 反默认失明的第①②层（§3.8）—— `attachments`/`new-child`/`--profile`、`profile_required` 与 `profile_changed` 两条具名拒绝、审计流水，以及那条零计费的 `pendingNotice` —— 含把它**队列化**的那次小改动（typed `{kind,…}`、`renderNotice` 按 `kind` 分派、注入点排空而不是首条即 `break`），因为今天那个单槽会让本设计的两个生产者互相盖掉，也会盖掉状态覆盖那一条**、`test-browser-handles`、`test-profile-blindness`（fast 那一半）。 | **10** | 8–15 | 5 | 能 —— 按任务的 profile 并发共存，带 `--pin-tab` 语义；**而且一个会话第一次可以同时握着好几个**。 |
| **P2 — 实时视图** | `/api/browser/stream` 桥接（+ 背压）、`browser-live` 窗口类型、多观看者扇出、URL/标签页/console 面板、DPI 正确的画布、**一个会话有多个附着时窗口内部的 profile 切换条（§3.7）与状态栏那枚琥珀色 Browser 芯片（§3.8 第③层，含它在 `LIVE_SESSION_FACTS` 里的那一行与 digest）**、`test-browser-live`、`test-profile-blindness`（heavy 那一半）。 | **7** | 6–10 | 3.5 | **能 —— (1.c) 减去"手"。** |
| **P3 — 接管 / 交还** | 租约输入持有者、模式切换器、输入转发、`browser_paused`、**§4.3.1 的花钱接线**（`SPEND_REASONS` 里的 `'browser-handback'`、那次投递梯调用、默认 OFF 的 `browser.announceIdleHandback`、让 `test-spend-paths` 普查保持绿）、空闲交还、agent 光标、`--confirm-actions` 卡片。 | **5** | 4–7 | 2.5 | 能 —— 补全 (1.c)。 |
| **P4 — Provider** | Provider 行 + 能力门控；**先执行并记录 CloakBrowser 的出网前置条件**（§7.2.1），然后在免费档上通过 loopback `cloakserve` 加一份出网白名单可选开启；通过 `tcpForward` 的远程 `cdp` provider；`browser-serve` 设备 op（三触规则）；**活的 backend 切换（§7.4）—— 版本阶梯、带着走的 seed、按租约重开标签页、对话框里的席位、每站点记忆，以及 agent 的 `blocked` 主张**；**外加 §7.5 的 key 消费方那一半** —— 本 track 自己的注册表行、keeper 在 spawn 前一次 `resolveIntegration(provider)`、切换器的来源芯片、`app.openIntegration(id)` 深链、`backend_no_key` 那条具名拒绝，以及 §9 里 key 那八条腿；**外加第八轮那几条落在这一格里、不另计轮次的子句** —— 六行的 `test.kind`（`cloak` = `shape-only`，五个 `cloud:*` = `credential-exchange`）、六个 runner 由 `src/server/browser-backend.js` 注册、§7.5 那条**按行推导**的出网声明、席位的**三态**显示（含 `SEAT_TIER_STALE_MS` 与"未知不满足上限判定"）、档位改由**第一次真正的启动**读回、第三条具名拒绝 `backend_seat_taken`、以及 `keyScope: 'local-only'` 在 `host != null` 上的 `provider_needs_local_key` 拒绝；`test-browser-providers` + `test-browser-backend`。**这一格的第一批动作里多一条零代码的测量**：§12.40（一把免费档 key 的席位被**另一台机器**占着时 `cloakserve` 返回什么），因为 `backend_seat_taken` 的判据认的是那个回答。**跨 track 依赖（明写，不是暗示）：P4 不能先于 communication panel 那条 track 的 P0 落地** —— `src/integration-registry.js`、`src/server/integration-store.js` 与那个被抽出来的 `src/secret-box.js`（mounts 带 parity 测试迁到它后面）都属于那条 track 的 P0，而本 track 只写自己的行与两个调用点。这条依赖是**单向**的：那条 track 的 P0 不需要本 track 的任何东西，所以两条线可以并行，只有 P4 的合入点被门控。第一轮到第六轮这一格是 **9** 轮；key 那一半的消费方（行 + 两个调用点 + 一枚芯片 + 一条拒绝 + 四条腿）实测是 **+1**，所以这一格现在是 **10**。**第八轮没有再动这个数字，理由要说出来而不是默认**：它加的全部是**已经被算进这一格的那几个东西内部**的子句 —— 注册表行本来就要写（多写一个 `kind` 与一个 `describe`）、runner 本来就要注册（多一行 `registerIntegrationTest`）、席位本来就要显示（多两个状态）、拒绝本来就是一条一条写的（多一条），而 §12.40 那次测量**零代码**。唯一真正新增的实现是那条按行推导的出网规则，它是 runner 内部的一个 helper。所以这一格仍然是 **10**，多出来的是 §9 里从四条腿变成八条腿。 | **10** | 8–14 | 5 | 能 —— (1.a)，以及机队那条故事线。 |
| **P5 — 录制 + 家务** | **操作轨迹（D35，owner 2026-09-13）：每个 agent 动作记录动作前 / 动作后两张 JPEG、动作位置（点击坐标 / 目标元素框 / 输入落点）与命令本身，作为转录里工具卡上的可展开条目和实时视图窗口里的时间线供事后 review**、按 profile 的 screencast 可选开启、转录缩略图、保留期清扫、带大小的 profile 面板、孤儿收编（迁移步骤 3）、`test-browser-housekeeping`。 | **4** | 3–6 | 2 | 能 —— 转录那一半。 |
| **P6 — 硬中介** | 做 CDP 中介的代理：target 作用域限定 + 接管期间拒绝输入、每会话的 CDP URL。**这是 `sharing: "instance"` 的一个明确前置条件**（§6.2），而不只是在 D6 判定协作式租约不够时才有的一个选项。 | **6** | 4–9 | 3 | 只作为强制执行 —— 但 `sharing: "instance"` 在它落地之前一直被拒绝。 |
| **P7 — 窗口绑定** | 标签页链上的 `layout`/`split`/`ratio`、标题栏的绑定动作 + ~~标题栏左右两半的 drop 区~~（2026-09-23 删除，改为合并后的显式按钮 —— docs/design-split-ux.zh.md）、"生在链里"的 `createWindow` 路径、分隔条（每次拖动一个控制器、rAF、坐标只换算一次）、从 `leases` 来的归属徽章、layouts 持久化 + **同步键的修复**、移动端只用标签页且不写回、**切换条那些标签上的按面 owner 徽章（§3.7）**、`test-window-binding`。 | **6** | 5–9 | 3 | 能 —— 被 agent 驱动的浏览器不再丢失它的 owner。**需要 P2**（得先有实时视图可绑）；与 P3–P6 无关。 |
| **P8 — 原生客户端窗口** | Xpra 那一级（§4.7）：一个跑在 §3.5 那个上限与 runaway 守卫之下的 keeper、按 `/api/vnc` 形状的 `GET /api/xpra/stream`、按 D21 决定的客户端那一半、200 ms / 1 Mbps 的实测，以及按应用分路（WhatsApp → profile 里的 web 版；微信 → 原生客户端，且只在 web 版试过之后）。然后是 §4.8 里 owner 点名的那个应用的适配器，带自己的 `source` 标签喂既有的 Communication Channels 梯子，并带一个已声明的 `'chat-inbound'` 花钱理由。`test-native-window`。 | **7** | 5–11 | 3.5 | 能 —— 但它是本文档里核实程度最低的一个阶段，而它的区间就是这么说的。除了 §4.2 的桥接形状之外与任何阶段都无关。 |
| **P9 — 窗口目标** | §4.9 的窗口目标：`src/window-targets.js`（SHARED：枚举 / AT-SPI 快照与 `@ref` 铸造 / 输入后端的**运行时探测**梯子）、`data/bin/vibespace-window` + 手册（§5.1.1）、复用 §4.7 的桥接得到 `window-live` 面、与标签页共用的租约与三态、§6.6 的两类窗口分界与审计行。**第一件事是量四件东西**：portal 在 `systemd --user` 背景上下文里到底可不可用、AT-SPI 在 Qt/Electron 上的覆盖度、一次 `do_action` 到界面变化的端到端延迟，以及 **node 这一侧用哪个 AT-SPI 绑定、它每节点多少钱**（本轮的数字全是经 `python3` + GI 量的，走的是自带缓存的 `libatspi`；直接在 node 里说 D-Bus 没有那份缓存，而 spawn 一个 GI helper 要付 §1.6 那笔 fork 税 —— 两条都得重新量，§12.33）。**那趟遍历本身跑在一个有界的子进程/worker 里**（每次调用一个超时、整趟一个节点预算），绝不在服务器或 daemon 的事件循环上 —— 每节点一次 D-Bus 往返，而一个不应答的应用会挂到 libdbus 默认的 25 秒。`test-window-target`。**作用域仍然是 D27 的 (a)** —— 只列我们自己起的窗口；tier 3（§7.6，用户**真实**桌面上的浏览器）是 **P10**，不在这里。`test-window-target`。 | **8** | 6–13 | 4 | 能 —— agent 第一次能操作一个不是浏览器的应用。**需要 P8 的传输**（Xvfb+Xpra）与 P2 的桥接形状；与 P3–P7 无关。 |
| **P10 — tier 3（真实桌面上的窗口目标）** | §7.6 的 `local-window` provider 行落地：**D27 的 (b)**（用户真实桌面上的窗口，一次明确开启加它自己的同意）、§4.9 那张矩阵的第 1/2 列在**用户自己的会话**上重新验证一遍（X11 的 XComposite/x11grab，或 Wayland 的 ScreenCast portal —— 本机两条各有已具名的失败）、`siteHints.tier` 与那条永不自动升级的规则、tier 3 专属的安全面（§6.6 的两类窗口分界 + **用户接管永远赢**）、以及 §7.1 那一行对它缺的每一项能力的具名拒绝。**第一件事是量 §12.36 与 §12.39**：2–3 个被点名站点在哪一层挂掉，以及一次 `do_action` 到界面变化的端到端延迟 —— 而 §12.36 那次测量**今天就能做、一行代码都不用写**，所以它应该排在这个阶段**之前**而不是里面。`test-browser-tier3`。 | **6** | 4–12 | 3 | 能 —— 银行这一类站点第一次可达。但它是本文档里核实程度**最低**的阶段，区间就是这么说的。**需要 P9**（观察/动作层）；传输那一半复用 §4.7 的桥接**形状**，但**不是**它的 Xvfb+Xpra 那一格 —— 一个用户真实桌面的捕获走的是另外两列。 |

**总量，按区间而不是按点值公布**（第一轮只公布了一个区间的点估计，而它自己的风险段落指的正是那个
区间的上端）：

| 范围 | 区间 | 点估计 | **风险加权**（P2、P4、P8、P9 和 P10 取各自区间上端，其余取点值） |
|---|---|---|---|
| **P0–P5** | **33–59 轮 ≈ 16.5–29.5 天** | 41 ≈ 20.5 天 | **48 轮 ≈ 24 天** |
| **P0–P6** | **37–68 轮 ≈ 18.5–34 天** | 47 ≈ 23.5 天 | **54 轮 ≈ 27 天** |
| **P0–P8** | **47–88 轮 ≈ 23.5–44 天** | 60 ≈ 30 天 | **71 轮 ≈ 35.5 天** |
| **P0–P9** | **53–101 轮 ≈ 26.5–50.5 天** | 68 ≈ 34 天 | **84 轮 ≈ 42 天** |
| **P0–P10**（含 tier 3 —— owner 要的全部） | **57–113 轮 ≈ 28.5–56.5 天** | 74 ≈ 37 天 | **96 轮 ≈ 48 天** |

**相对第六轮，本轮动了两处，两处都写在上表里而不是藏在文字里**：P4 从 **9** 轮变成 **10**（§7.5 的
key 消费方那一半，一行 + 两个调用点 + 一枚芯片 + 一条拒绝 + 四条腿），而 **P10 是新的**（§7.6 的
tier 3，点值 6、区间 4–12）。P0–P9 那一行因此从 100 变成 101，而 owner 要的"全部"现在是 P0–P10。

风险加权那一列才是该拿来排期的那个，而它这么加权是有明确理由的：P2 和 P4 依赖的是一个第三方二进制
的真实行为，而不是我们自己的代码，这也正是 §12 把它们的三条假设列为未核实的原因；P8 与 P9 同理，
而且更甚 —— 它们依赖的是一台机器的桌面栈（合成器、portal、无障碍总线），而本文档对那一层的实测
全部来自**这一台**机器。**P10 比它们每一个都更甚，而它的区间（4–12，最宽的一条）就是这么说的**：
它依赖的不是我们的机器，是**用户自己的**那一台 —— 它的桌面、它的浏览器、它的登录态 —— 而本文档
对那一台的实测是**零**（§12.39）。另有两条诚实提醒：上一份样本里 55% 的 workflow 墙钟时间**没有任何 agent
在跑**（并发上限、会话限额、串行集成），所以这里的"天"是 agent 产能而不是自然流逝时间；而且上面
那些区间是按阶段的 —— 联合分布不是极值之和，所以 P0–P10 的 **113 轮**是极值之和给出的悲观上界，
不是一个预测 —— 该拿来排期的是同一行的风险加权 **96 轮**（只到 P0–P9 的话是 **84 轮**）。

**另一种排序，如果 owner 想最早拿到价值：** P0 → P2 → P1 → P3。P2 可以在注册表存在*之前*就打在
上游的每会话流上跑，因为 §3.2 已经给了每个会话它自己的浏览器。按本轮的点估计衡量：P2 在第 12 轮完成而不是
第 22 轮，也就是**早 10 轮 ≈ 5 天（跨 P1 自身 8–15 的区间是 4–7.5 天）**—— 第一轮说的是"大约早
一周"，那不是它自己的数字给出来的结果；第二轮的"约 3 天"、第三轮的"约 4 天"各自对当时那个更小的
P1 是对的，而 P1 在本轮长出了附着集合与 handle 寻址，所以这个差值跟着变大。代价是把 profile 选择器
回填进一个已经存在的窗口：大致多一轮，所以这个排序值大约 9 个净轮次的更早反馈。

**P7 会改变这笔账，而 owner 应该知道这一点。** 窗口绑定（§4.6）正是让"agent 在驱动时那个实时视图
是可读的"成立的那件事，而它只需要 P2。所以"最早拿到价值"的顺序是 **P0 → P2 → P7 → P1 → P3**：
按点估计，它在第 18 轮就到达"用户看着 agent 浏览，而那个窗口可见地绑在拥有它的那个对话旁边"——
(1.c) 的全部再加上绑定 —— 而标准顺序到第 22 轮只到达一个没有绑定的实时视图。P8 与 P9 刻意不在这个
序列里：它们回答的是另一个问题（§4.7、§4.9），而它们的区间说明了我们对它们了解得有多少。

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
| **D14** | **钉子住在哪，以及一个岗位要不要带默认值？**（§3.2.5 —— 钉子是一个命令；要问的是哪些面注册它，以及一个岗位可不可以为它名下的每个会话设一个默认。） | (a) 只在会话卡右键；(b) 四个面（卡片菜单、Session Properties、实时视图标题栏、新建会话对话框）；(c) (b) 再加一级岗位默认。 | **(c)。** 那四个面是**一个**命令的四次 `registerMenuItem` 注册，不是四份实现，所以代价就是那几条注册。岗位那一级正是让"这个岗位一直在供应商后台里干活"变成一句只说一次的话 —— 而它排在这个对话自己的取值**之下**，所以它永远不可能覆盖掉一个会话已经做过的事。 |
| **D15** | **fork 要不要继承 profile 的钉子？**（§3.2.5 —— `browserKey` 刻意不继承。） | (a) 继承钉子（身份仍然新铸）；(b) 两个都不继承；(c) 两个都继承。 | **(a)。** 钉子是**偏好**（"这类活儿用这个登录"），key 是**身份**。(c) 会把另一个对话的 pinned 标签页交给一个 fork，那正是 §3.2.1 存在要防的缺陷；(b) 则让一个后台会话的每一个 fork 都无缘无故重新登录一次。 |
| **D16** | **中途钉住要不要往对话里发公告？**（§3.2.5，与 D11 同一类 —— 一次公告就是一个计费 turn。） | (a) 永不 —— agent 从 `vibespace-browser status` 以及"下一次启动落进新 profile"这件事上学到；(b) 只走免费那条（挂在用户下一条消息上的 `<system-reminder>`）；(c) (b) 再加"会话空闲时走投递梯"，由一个设置项门控。 | **(c) 而且设置项默认 OFF**，实际效果就是 (b)。钉住是一次用户动作，也就是说用户此刻正在打字，而 `pendingNotice` 那条通道零成本。投递梯那条路留给那条通道服务不了的唯一形状 —— 一个 owner 现在就想改道的**空闲**会话 —— 而它像其它每一个无人值守 turn 一样：已声明、被门控、默认关。 |
| **D17** | **我们要不要发这个活的 backend 切换，以及 CloakBrowser 的席位谁来付？**（§7.4 —— 免费档**一个**并发 session；Pro 是 5 / 20 / 200 / 2000。） | (a) 不做切换 —— 一个 profile 的 backend 创建时定死；(b) 只在免费档上切，显示席位数并在到顶时大声拒绝；(c) (b) 再加一个预先买好的付费档。 | **(b)。** 切换就是 owner 要的那个功能，而免费档足以回答唯一重要的那个问题 —— 这个站点到底打不打得开。席位数属于那个对话框，而不属于事后的一次答疑；买档要针对一个**被点名站点**上的**实测**失败（D4 的规矩，未变）。**第七轮补一条，不改本决定的推荐值**：那个席位显示的两个数字来自两个不同的地方 —— *已用*是 **keeper 自己数的**，因为没有任何供应商接口能回答“这把 key 现在被占了几个席位”（§12.35）。**第八轮把另一个数字修正了，同样不改推荐值**：*总数*（档位）**不来自 Test** —— `cloak` 那一行的 `test.kind` 是 `shape-only`（零网络，理由在 §7.5：一次真的探测要先有那 200 MB 二进制和 §7.2.1 的出网证据，而这两件事不该由"打开卡片贴 key"触发），所以档位来自**第一次真正的启动**，而在那之前它是**未知**。于是席位显示是**三态**（已知且新鲜 / 已知但陈旧 / 未知），而**一个未知的总数永远不满足上限判定**：这一条不是措辞是不变量，因为 D32 推荐的配置恰恰保证了大多数机队用户停在第三态。而当这把 key 是**集群默认**时（D32），keeper 数得到的只有本实例，所以那一行必须说出它只是本实例的数字。 |
| **D18** | **自动绑定默认开吗？**（§4.6 —— 一个会话的浏览器起来且它的聊天窗口开着时，实时视图直接以 split 生在那个链里。） | (a) 开；(b) 关，绑定永远是一次点击；(c) 只在聊天窗口够宽时才开。 | **(a) 开。** 绑定就是"那是谁的浏览器"这个问题的答案，而一个要靠人自己发现的默认值回答不了它。它是一个设置项，按窗口可以随时把一面拖出去撤销，而且那个组永远不会自己解散 —— 所以"猜错了"的最坏代价是一次拖动。(c) 是一条藏起来的规则，它不触发的那天看起来就像个 bug。 |
| **D19** | **一个 split 链里有第三个标签页时，点它会怎样？**（§4.6 —— 一个链可以有五个标签页而其中两个并排。） | (a) 它替换掉非 owner 的那一面；(b) 整个链翻回 `'tabs'`；(c) 开出第三面。 | **(a)。** 它保住绑定（聊天那一面 —— 浏览器**绑到**的那个东西 —— 原地不动），而且最不意外：变的是你原本没在看的那一面。(c) 按实测理由拒绝 —— 在大多数人实际使用的宽度以下，三个面全都不可用，而比例模型将不得不变成一棵树。(b) 会悄悄毁掉用户自己搭起来的布局。 |
| **D20** | **我们要不要做一个微信本地库适配器？**（§4.8 —— 经 WCDB 的 SQLCipher，密钥在进程内存里；本机 `ptrace_scope` 是 `1`，也就是只有祖先进程读得到。） | (a) 不做 —— 画面走 Xpra，数据走官方的公众号 / 企业微信 API；(b) 做，进核心；(c) 做，但只在一个**插件**里，带显式同意，且只对由 VibeSpace 自己启动的客户端生效。 | **(a)，而如果 owner 坚持，答案是 (c)。** 它是在扒一个专有客户端的进程内存，每一次客户端更新都可能安静地碎掉；它明确越过 ToS；而唯一能让它在技术上成立的办法，是让 VibeSpace 去**启动**微信**以便**读它的内存 —— 这句话写出来就在反对它自己当默认。真要做，它是插件（D2 给"专有且带法律面的东西"划的那条线），绝不进核心。 |
| **D21** | **Xpra 的客户端那一半：托管上游的 HTML5 应用，还是自己渲染？**（§4.7 —— MPL-2.0 的应用 vs npm 上 Apache-2.0 的 `xpra-html5-client`。） | (a) 把上游 HTML5 客户端当静态资源托管在我们的鉴权后面；(b) 用那个客户端库在一个 VibeSpace 窗口类型里自己渲染；(c) 先 (a) 作为验证切片，再 (b)。 | **(c)。** (a) 是最快知道"这条传输在 200 ms / 1 Mbps 下够不够用"的办法，而那正是那个未决问题 —— 但 §4.2 拒绝内嵌上游 dashboard 的理由在这里同样适用（一个带自己控制面的整应用装进我们里面，外加一个已知的 iframe `sessionStorage` 限制），所以它是一个验证切片而不是产品。本设计已经规定的那个窗口（§4.4：DPI 正确的画布、被转义的标题、主题变量）就是 (b) 落地的形状。 |
| **D22** | **一个会话有 ≥2 个附着时，handle 是必填吗？**（§3.7 —— 今天"一个会话一个浏览器"是一个隐含的量词。） | (a) 必填：裸命令得到一条列出全部 handle 的具名拒绝；(b) 悄悄落到默认；(c) 只对会改状态的动词必填，读一律走默认。 | **(a)。** (b) 正是 Q8 那个痛点的机器：一次静默的默认解析，是"agent 在错的 profile 里干完了整件事"的**唯一**成因。(c) 听起来温和，实际更糟 —— 它让 `snapshot` 与它后面那条 `click` 落在**不同**的浏览器上，而那是一个读者根本想象不到的失败形态。代价是每条命令多 18 个字符，且只落在真正握着多个浏览器的那些会话上。 |
| **D23** | **一个子 agent 默认拿到什么？**（§3.7 —— VibeSpace 不 spawn 子 agent，所以我们给不了它环境。） | (a) 它自己的临时浏览器，经 `new-child` 铸一个子 handle；(b) 直接继承父亲的默认附着；(c) 什么都没有，直到父亲明确递给它一个 handle。 | **(a)。** 一个子 agent 最常见的用途是"去查一下这个"，而把它放进父亲的登录态里是一次更大的授权；子租约按前缀挂在父亲名下，于是父亲的 teardown 收得掉它（§3.4）。**但要如实说清 (b) 是今天的物理事实**：claude 的子 agent 与父亲同进程同环境，所以"默认 (a)"是靠子 agent **调一次 CLI** 实现的，不是靠环境隔离 —— 一个从不调 `new-child` 的子 agent 事实上就在 (b) 里。手册必须把这句话写在最前面，而 §3.7 那张表里"集合恰好一个"那一格现在**也**这么写 —— 它先前写的是"这是默认，也是对的"，那句话恰好祝福了本决定论证不该依赖的那次授权。还有一条随之而来的残留（§12.25）：一个从不调 `new-child` 的子 agent 在父亲的登录态里干活，而**产品今天既检测不到也阻止不了它** —— 服务端能看见一个 sidechain 正开着（`session._subNormalizers`），那足以在拒绝里加一句诊断附言，但不足以拿它当拒绝的**理由**。 |
| **D24** | **一个会话的 N 个浏览器怎么在实时视图里呈现？**（§3.7。） | (a) 一个绑定的面 + 窗口内部一条 profile 切换条（每标签一枚 owner 徽章）；(b) N 个并排的面；(c) N 个独立窗口。 | **(a)。** (b) 已经被 D19 量过的那条否掉了 —— 三个面在多数人实际使用的宽度下都不可用，而这里第三个面还要再挤一半。(c) 恰恰丢掉 §4.6 存在的理由（一个被 agent 驱动的浏览器不许丢失它的 owner）：三个自由窗口，一个用户，没人知道哪个属于谁。切换条另有一个 (b)/(c) 给不了的好处：它就是那张"我这个会话有哪些浏览器"的清单，而那正是 Q7 的问题本身。 |
| **D25** | **附着集合变了之后，那条 `profile_changed` 是"拒绝一次"还是"提示一下"？**（§3.8 第①层。） | (a) 拒绝一次：下一条裸命令不执行，必须带 handle 重发，之后新默认生效；(b) 只在回答里附一行提示，命令照跑；(c) 每条命令都提示直到 agent 显式确认。 | **(a)。** 一条被塞进 stdout 的提示只是**希望**模型读它，而这个功能存在的全部理由就是"它没注意到"。(c) 会把一次中途钉住变成这个会话余下每条命令的两倍开销。(a) 的代价恰好是一次往返，而它买到的是一条**结构性**保证：那条本会落在旧 profile 上的命令，没有执行过。 |
| **D26** | **那枚琥珀色芯片上的"提醒它"要花一个计费 turn 吗？**（§3.8 第③层，与 D11/D16 同一类。） | (a) 不 —— 只写 `pendingNotice`，等用户下一条消息；(b) 走投递梯，带自己的已声明理由，因为点击是一次 owner 动作；(c) 会话停着时自动推送。 | **(b)，而 (a) 是它在会话**活着**时的实际行为。** 那枚芯片变琥珀色的场景正是"agent 在跑、而且在错的 profile 上"，那时 `pendingNotice` 足够（用户就在那儿）。只有会话**停着**、用户点了那个按钮时才需要一个 turn 去叫醒它 —— 那是一次每次都有 owner 动作的点击，正是 CLAUDE.md 那条类别排除掉的东西，但它仍然开一个计费 turn，所以它仍然过同一条梯子、同一个上限，用 `'browser-profile-notice'` 这个已声明的理由。(c) 明确拒绝：那是一个没有任何 owner 动作的定时推送。 |
| **D27** | **窗口目标能寻址哪些窗口？**（§4.9 —— 本机实测：X11 枚举看不见 Wayland 客户端，GNOME 的 Introspect 对我们 AccessDenied。） | (a) 只有**我们自己起的**（Xvfb+Xpra 里的应用）；(b) 加上用户真实桌面上的窗口，需要一次明确开启；(c) 都不做。 | **(a) 先发，(b) 作为一个带自己那次同意的明确开关。** (a) 那一列在 §4.9 的矩阵里全绿、不需要向任何人要权限、而且它是"agent 用一个原生应用干活"这个用例的全部 —— 用户桌面上那个正在被他打字的窗口不在这个用例里。(b) 的每一行都要标"这是你的桌面"，而它真正的门槛不是技术，是 §6.6 那条：对它的一次点击就是对用户真实会话的一次点击。 |
| **D28** | **一个窗口目标的**主**观察通道是无障碍树还是像素？**（§4.9 —— 本机实测 AT-SPI 可用、9 个应用、约 1,800–6,100 节点/秒。） | (a) 无障碍树为主、像素为辅；(b) 像素为主、树为辅；(c) 只给像素（Anthropic 的 computer use 就是这一种）。 | **(a)。** 这不是偏好，是本设计里已经写了两遍的同一条：跟树说话胜过跟像素说话（§4.7 的结论、§4.1 里 Codex 自己的浏览器面）。而它有两个只有 (a) 才有的性质：`Action.do_action` 让**动作**也不必经过输入注入（于是 Wayland 那条"不许全局注入"管不到它），以及审计行能记下"点了名为 Minimize 的按钮"而不是"点了 (412, 88)"。**但那第一个性质要按它实测的范围来说**：`do_action` 免掉注入的，只是**那些自报了动作的节点**（2026-09-10 实测 503 个节点里 66 个，43 个 `button` 节点里 6 个），而 `type` 另有自己的条件（`EditableText`，33/503），`key`（和弦）在树上**一格路都没有**。所以本决定只管**观察**通道那一句"树为主"，是无条件的；动作那一句按动词分成四个答案，写在 §4.9 的矩阵与 §5.1.1 的能力表里。(c) 是我们**必须**能降级到的那一格（自绘控件、canvas、图片），所以它是回退而不是主路。 |
| **D29** | **Wayland 上的输入注入走哪条道？**（§4.9 —— portal 的 RemoteDesktop 接口在本机存在，`libei`/`libeis` 1.3.901 在，`/dev/uinput` 是 0600 且模块没加载。） | (a) RemoteDesktop portal（`ConnectToEIS` 优先），`persist_mode=2` + `restore_token` 记住那次同意；(b) ydotool/uinput，要求运维放开 `/dev/uinput`；(c) 不做 —— 只支持 X11/Xwayland 与我们自己的嵌套 X。 | **(a)，而 (c) 是它没跑通之前的现状。** (b) 明确不推荐：它要求把一个能合成全局输入的设备节点交给我们这个 uid，那是一次比这个功能本身大得多的授权，而且它绕过合成器所有的同意机制。(a) 有一个必须先量的前提 —— **我们的服务器跑在 `systemd --user` 下**，而公开报告写着 portal/D-Bus 在后台上下文里会被拒（§12）。所以 P9 的第一件事是去测它；测不通就落 (c)，而 (c) 加上 D28 的 `do_action` 仍然能覆盖相当一部分动作。 |
| **D30** | **配对的 Mac 上要不要做窗口目标？**（§4.9、§7.3 —— macOS 的两道 TCC 门。） | (a) 不 —— 机队那条线只做浏览器（§7.3 已定）；(b) 做，经 agentd op 走 ScreenCaptureKit + AXUIElement。 | **(a)，并把理由写下来而不是留白。** 两道门都不是"弹一次对话框"那么简单：Accessibility 要求进程**非沙箱且已签名**，而 Screen Recording 在 macOS 26 (Tahoe) 上被公开报告为**要求 app bundle** —— 一个非 bundle 的可执行文件根本不出现在系统设置的隐私列表里，于是它既拿不到授权也没法被授权（一个 computer-use 项目 2026-01 的公开 issue 记录了这个形态：窗口不出现在截图里，而 ScreenCaptureKit 即便数据库里有权限也回 TCC 错误）。而 VibeSpace 在一台配对机器上的存在形态恰恰是一个由 daemon 拉起的可执行文件。所以 (b) 的第一步不是写代码，是回答"我们要不要在 macOS 上分发一个签名的 app bundle"——那是一个产品决定，不是这一节的决定。 |
| **D31** | **我们发几层访问阶梯？**（§7.6 —— owner 2026-09-10 的问题：agent-browser 是 CDP 吗、Mercury 这类银行会不会检测、是不是还得一个纯 computer-use 版本。） | (a) 只发 tier 1+2（CDP + 指纹浏览器）；(b) 1+2+3，tier 3 排在窗口目标那个阶段之后（P10）；(c) tier 3 优先 —— 银行才是 owner 真正的用例。 | **(b)。** tier 1 与 tier 2 回答的是"内容站被反爬挡住"这个可以被 CloakBrowser 免费档回答的问题，而它们共用**同一条 CDP 通道、同一套动词、同一个 profile 模型** —— 增量就是 §7.1 里的一行，这也正是它们能一起发的理由。tier 3 是另一套物理：没有 CDP、没有元素引用、按平台各有各的空格（§4.9 的矩阵），而它**必须**先有 §4.9 的窗口目标与 D27 的 (b)（用户真实桌面），所以把它塞进 P4 会把一个已经最不确定的阶段再拉长一倍。(c) 被这一条否掉：银行那条路的第一步不是写代码，是**去量 2–3 个被点名的站点到底在哪一层挂掉**（§12.36），而那次测量今天就可以做、一行代码都不用写 —— 如果它们在 tier 1 上就过，P10 的优先级立刻降到最低；如果它们连 tier 3 都过不去（行为生物识别，§7.6），那 P10 也不该建。**先量，再排期**，这与 D4 对 CloakBrowser 的规矩是同一条。 |
| **D32** | **CloakBrowser 的 key：集群给一把团队 key，还是每人自己配？**（§7.5、owner 2026-09-11 指令里"集群能给默认就给"的那一半 —— 而这一行是按**并发 session** 计费的。） | (a) 只允许用户自己的 key；(b) 集群注入一把默认 key，用户可以覆盖；(c) 集群 key 且不允许覆盖。 | **(b)，但集群注入的那一把是**免费档**，而且席位显示必须写明它是全机队共享的。** (b) 与 Drive presets（`src/mounts.js:2189`）和 frp relay（`src/plugins.js:569`）是同一个形状，也是 owner 指令要的那一半。但它有一个**只属于按并发计费的集成**的后果，必须渲染出来而不是写在文档里：一把共享 key 的席位是**所有沿用同一个默认的用户**一起消耗的，于是 A 的一个浏览器会让 B 的切换失败，而 keeper 数得到的只有**本实例**的占用（§12.35：没有任何供应商接口能回答"这把 key 现在被占了几个席位"）。所以那枚来源芯片写的是"集群默认（席位与其他用户共享，本实例已用 N）"，而到顶时那条建议是**换成你自己的 key**（一次点击，§7.5），不是"让管理员升级团队档"。**第八轮给本推荐加一条明写的前置条件，因为上一版的那句建议指着一个在本配置下结构上到不了的上限**：共享 key 的席位被别人占着时，本实例读到的是"已用 0 / 总数未知"，上限判定根本不会触发，于是"到顶时"这三个字在集群默认下**永远不会发生** —— 用户看到的是一次没有名字的启动失败。所以 (b) 的前置条件是 §7.4 的第三条具名拒绝 `backend_seat_taken`（keeper 把一次因授权/并发校验失败的启动分类出来，点名这把 key 是集群默认、席位全机队共享、以及那条一键出路），而**不是**把这件事委托给那个本地上限。它还欠 §12.40 那次测量。(c) 被否：一个按 profile 的付费能力不该由管理员替用户决定，而覆盖是免费的 —— 这也正是 `useClusterDefault(id)` 与 `setIntegration(id, …)` 是两个动作的原因。 |
| **D33** | **切到一个没有配 key 的 backend 时怎么办？**（§7.4 / §7.5。） | (a) 大声拒绝并打开 Integrations 卡片；(b) 静默回落 `chromium`；(c) 回落 `chromium` 并发一条公告。 | **(a)。** 这与 §7.4 那条"那个二进制没装"是同一族的具名拒绝（`backend_unavailable` 旁边多一个 `backend_no_key`），而 Integrations 卡片就是那条**可执行的**出路 —— `app.openIntegration('cloak')`，一次点击，带 focus。(b) 被明确否掉：用户按下"用 CloakBrowser 打开"正是因为 `chromium` 已经打不开了，静默回落等于让他对着同一个失败再看一遍，并且不知道为什么 —— 这是本仓库"no silent failures"那条律的教科书形态。(c) 听起来温和但更糟：它花一个**计费 turn** 去说一句用户就在屏幕前的话（D11/D16 同一族的判据），而且它仍然把他留在打不开的那一页上。真正让 (a) 不刺人的不是拒绝本身，是**切换器在点开之前就说了**（未配置 = 一行禁用并写明理由的控件加一枚来源芯片，§7.1 的能力行纪律）—— 所以那条拒绝是最后一道网，不是第一道。 |
| **D34** | **一个要 key 的 provider 会不会跑在本机之外的机器上？**（§7.5、§7.1 的 `keyScope` 格 —— D5 的 (b) 把 keeper 放到了配对设备上，而且**就在 P4**，与 key 这一半同一个阶段。） | (a) **拒绝** —— `keyScope: 'local-only'` 的 provider 在 `host != null` 时是一行带理由禁用的控件（`provider_needs_local_key`）；(b) 让那把 key 走 daemon 已有的**凭据材料**通道（sealed orders 的形状，`src/account-material.js`）。 | **(a)，而且现在就写进能力表。** 这不是保守，是**今天的文档只支持这一个答案**：§6.4 逐字写着"provider 授权 key 活在服务端的注册表里"，而 (b) 会让这句话在一个远端 profile 上直接变假；§9 第 (ii) 条腿（"spawn 出去的子进程环境里有那个 env 名、父进程里没有"）是一条**进程内**才做得出的断言，它今天没有远端臂。所以 (b) 要落地就欠三样东西，缺一不可：**这一行决定本身**、**§6.4 的一句话**说明那把 key 什么时候可以跨过 mux、以及 §9 那条腿的一条由**真 daemon** 驱动的远端臂。在三样齐备之前，一个含糊的默认会让明文 key 悄悄上路 —— 而 (a) 的代价在 P4 里是**零**：远程浏览器那条故事线（§7.3、D5）今天的答案本来就是"那台机器上一个自己登录过的 profile"，它跑的是 `chromium` 或 `cdp`，两行的 `keyScope` 都是 `none`。 |
| **D35** | **要不要记录 agent 的操作轨迹？**（owner 2026-09-13："对于每个 agent browser session，agent 发送操作都记录前后画面变化（截图就行）以及操作位置，方便用户后面 review"。） | (a) 做成设置项，默认开：每个动作前后各一张 JPEG + 动作位置叠加层 + 命令，按 profile 保留 7 天或 200 MB 取小者，转录工具卡可展开、实时视图窗口有时间线；(b) 默认关，按 profile 开启；(c) 只记动作位置不记截图。 | **(a)。** 它是 D7 那张"每个动作一张 JPEG"的自然延伸——多拍一张"动作前"并把点击坐标 / 元素框画在图上，成本仍然接近免费，而 review 的价值全在"它点了哪里、页面变成了什么"；(b) 会让第一次需要 review 的那次操作恰好没有记录；(c) 没有画面就没有 review。保留期与 D8 同一套清扫；截图走 §6 同一套脱敏钩子。 |

---

## 11a. 接管（takeover，2026-09-24 —— docs/design-browser-takeover.zh.md 是它的权威设计）

> owner（2026-09-24，原话）："那就选B吧 我还是觉得浏览器操作有点奇怪，另外建议vibespace完全接管浏览器工具，不要再给agent留agent-browser单独的入口了，也不要兼容agent直接操作agent-browser的行为。最好就是直接从系统path隐藏agent-browser，也修改一下web-access这个skill。"

本节编号为 11a，是为了让 §11（D1–D35）和 §12 的锚点保持不变。它改写本设计里几条"两扇门"时代的前提：

* **一扇门（T1/T2，chunk 1）。** `vibespace-browser <verb>` 直接接收每个页面动词（§5 里的 `-- <agent-browser args>` 只剩作为新动词的阀门），由 PURE 的 `src/browser-verbs.js` 分类；原始 CDP、身份/启动旗标、用户的动词在本地就被按名拒绝。会话 PATH 上的 `agent-browser` 是一个只拒绝、从不转发的 shim；远端 prelude 的顺序修正为 finder → tools。教学文字（§5 的那几行）不再出现被隐藏的 CLI 名字（test-architecture §52）。
* **被管理的临时浏览器（T3，chunk 2 —— 替换 §3.2 "临时浏览器没人看着" 的那句）。** 一个对话在没有附着时的第一个页面动词，让 keeper 记下一条 `ephemeral:true` 的记录（归对话所有，ns = `vs-<browserKey>` —— P0 的四个会话变量**就是**它的身份，D1 保留它们），外加一条别名为 `ephemeral`、永远不算附着的租约；keeper 用会话**原样**的 spawn 变量启动它（或收养一个已经在跑的），**绝不**重跑 browser-env 的阶梯。它计入 `CONCURRENT_CAP`（与桌面应用共享的那一个，D2；第七个对话的第一个动词得到按名的 `browser_cap`，点出每个占位者和两条出路）、被失控守卫采样、空闲退出记为 `stopped`（不是错误）、重启后被收养；对话结束时租约掉落、浏览器停止、**记录自行删除**（具名 profile 永远不会）。实时视图的端口、接管键 `<bk>|ephemeral`、trace 作用域 `ephemeral` 一律不变（端口一致性有门禁钉住）。它是 `sharing:'owner'`、不经 CDP 中介：接管期间在 `/resolve` 处被 `browser_paused` 拦下。远端会话（rung H，D8）与关闭了 `browser.isolateSessions` 的实例（共享 rung，D7）仍然**不受管理**，如实写进手册。
* **attach 的缺口（T6）。** 一个由桌面应用启动的浏览器窗口（记录或其注册表行带 `browser` 或 `category: 'browser'`——后者是本树 `DEFAULT_REGISTRY` 唯一的标记，r1 更正；临时启动的浏览器可执行文件同样算）是用户自己的窗口：`vibespace-window attach` / snapshot / act / screenshot / watch 一律按名拒绝 `browser_is_human`，`list` 不列出它。
* **§4 的改名（T5，chunk 3，方向 B）。** 见 §4 开头的注记：三张"浏览器的脸"各有自己的名字 —— 网页视图 / Agent 浏览器 / 浏览器应用；id、openSpec、设置键和 rail id 一个都不动。

* **r1（对抗验证后）。** 旗标可出现在动词与名词之间（`get --json cdp-url` 同样被拒）；每个被拒旗标的环境变量孪生不再经 `vibespace-browser` 到达真二进制（子进程环境由服务器的 `spawnEnv` 与 `/resolve` 的对构造，agent 自加的 `AGENT_BROWSER_*` 按名说明后丢弃）；路由错误文案不再教被隐藏的 CLI（test-architecture §52b 扩到路由模块的字符串）。权威文本：takeover 设计 §3.3 的 r1 补充与 §8。
* **r2（第二轮对抗验证后）。** `get` 只由**名词**决定（`get attr @e cdp-url` 读的是名为 cdp-url 的属性，照常运行；布尔旗标可带的 `true`/`false` 随旗标一起跳过，所以 `get --json true cdp-url` 仍被拒——真二进制实测）；socket 根目录是身份——`/resolve` 点名 keeper 运行该浏览器所用的根，`vibespace-browser` 最后设置它，导出的 `AGENT_BROWSER_SOCKET_DIR` / `XDG_RUNTIME_DIR` 再也不能把命令指向 keeper 看不见的 daemon；桌面应用浏览器按可执行文件名、启动器运行的程序、app id 或正在运行的进程识别（Chrome、Edge、Brave、flatpak Chromium …），不再只认注册表的两行；§52b 扫描每个被跟踪的 agent CLI 与 window / trace 路由模块。权威：docs/design-browser-takeover.zh.md §3.3 r2 补充、§8 r2。
* **r3（第三轮对抗核验）。** 路由的全局旗标表改为对二进制**实测**（`get --idle-timeout 5m cdp-url` 曾泄漏：该旗标只在环境变量里有文档）；`get` 只放行它读的名词；元数未知的旗标两种读法都判；配置**文件**被点名、从不被搜索 —— keeper 用点名的文件运行每个浏览器，`/resolve` 点名它，`vibespace-browser` 最后设置（或按同一规则合成一个）—— 而**项目** `agent-browser.json` 只能收窄（它的启动键不再被分层进生成配置：这撤回 §3.2.2 r3「按 CLI 的方式分层」的一半，围栏那一半保留），任何文件里的原始调试开关都到不了浏览器。权威文字：接管设计的 §3.3 r3 补充与 §8。
* **r4（第四轮对抗核验）。** 二进制启动的每个浏览器都在随机的 `--remote-debugging-port=0` 上监听（实测），所以 §3.2.2 的「不留任何原始调试开关」指的是**固定**端口；让端点不出现在被认可的路上的是：`vibespace-browser` 拒绝离开 web 的导航（`open chrome://version` / `open file://…/DevToolsActivePort` 曾把它打印出来；`local_scheme_refused`，以这类 origin 做的 `state load` 也拒），「这台机器自己的配置」取自**账户**的 passwd home（从不取 `$HOME`），stdin 的 `batch` 以二进制自己的 JSON 形式交出，实测的旗标表只在测量过的版本上被信任。见 docs/design-browser-takeover §3.3 r4 / §9。

门禁：test-browser-verbs、test-remote-shell、test-architecture §52（chunk 1）；test-browser-ephemeral、test-browser-mediation ⑤、test-window-targets §4 的 T6 腿、test-browser-housekeeping 的"Ephemeral browsers"段（chunk 2）。

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

第三轮新增，全部是 owner 那四个问题的后果：

15. **版本阶梯所关于的那两个 Chromium 大版本。** CloakBrowser 自己的仓库说免费档是 Chromium 146、
    Pro 是 151；而我**没有**去读已安装的 `agent-browser` 打包的是哪个 Chromium 大版本，所以我今天
    说不出在这台机器上一次 `chromium → cloak` 的切换到底是升级还是降级。那是那个阶梯的第一个问题，
    P4 必须在切换上线之前用实测回答它。
16. **Chromium 真的会拒绝旧版打开这件事。** 拒绝文案与方向是有文档且被广泛报道的，但我没有拿两个
    大版本去打同一个目录 —— 理由与 §12.1、§12.11 相同。我要是错了，故障形态比假设的**更好**
    （阶梯拒绝了一次本来能成的切换），这也正是这个阶梯写成"偏向拒绝"的原因。
17. **指纹变化到底会不会把一个真站点登出。** §7.4 说一次切换"可能要求重新登录"，因为把 session 绑
    在指纹上的站点按构造就是这样 —— 但那是关于**技术**的陈述，不是对 owner 实际在用的任何站点的
    测量。它与 §12.4 是同一个缺口：**去问 owner 要两三个具体站点**。
18. **agent-browser 的 `--restore` 到底带走了什么。** Playwright 的 `storageState` 有一个可选打开的
    `indexedDB` 标志，是有文档的；而 agent-browser 有没有传它，不是我读过的东西。所以"导出/导入
    会丢东西"在 CryptoKey 这个方向上是确定的（那正是"不可导出"的含义），而对 IndexedDB 整体
    **未定**。P4 必须在对话框里说出确切的丢失集合，也就是说得先去测。
19. **可分栏的链在一个真的第二客户端上的表现。** §4.6 那个同步键陷阱是从读 `layout.js` 的
    `tabs.join(',')` 键推出来的，不是靠开两个浏览器、在其中一个上翻链得来的。它被点名为陷阱并配一条
    测试，恰恰是因为它只是一次阅读。
20. **§4.7 里的每一个数字。** 那里没有一个是我测的，而针对那个目标（200 ms RTT / 1 Mbps）我也没有
    找到任何别人测过的数字：我读到的那份 ssh -X / xpra / waypipe 的公开比较自己就声明是定性的，
    而本机有 `Xvfb`、既没有 `xpra` 也没有微信客户端。"逐窗口 vs 整桌面"这个**论证**是成立的；
    那个排名的确切间距不是证据。P8 的第一件事就是产出这些数字。
21. **微信 web 版今天的限制范围。** 很多账号登不进 web 客户端是被广泛报道的，但那是账号级策略而我
    没能确认它当前的范围。这也正是 §4.7 的流程写成"先拿 owner 自己的账号试一次 web 版"而不是
    "装一个原生客户端"的原因。
22. **WhatsApp Web 的密钥处理今天是否还和那篇写作一致。** 不可导出 `CryptoKey` 的设计与 monkey-patch
    的做法在一篇公开分析与取证文献里都有记载，而两者描述的都是比今天更旧的 build。§4.8 的适配器形态
    是从那个设计推出来的；厂商要是改了它，适配器的形态就跟着改，P8 必须在写代码之前重新核实。
23. **`/proxy` 那条本地回显的路带不动 WhatsApp Web —— 这是推理，不是实测。** §4.7 否掉
    `src/lib/browser-window.js` 的第一条理由（页面在用户浏览器里跑，没有 CDP target，agent 驱动
    不了）是从代码读出来的、确定的；第二条（node-unblocker 的改写代理带不动它的 service worker 与
    长连 WebSocket）我没有跑过。它不影响结论 —— 第一条理由单独就足以否掉这条路 —— 但如果将来有人
    想把 `/proxy` 当作"人自己看一眼某个站点"的路，这一条要先量。

第五轮新增，全部是本轮自己那三个问题带来的：

24. **`--pin-tab` 能不能让**同一个浏览器里**的 N 个标签页真的并发被驱动。** §3.7 的多附着模型里，
    "一个会话握着两个 profile"是两个**浏览器**（各自一个进程、一个 CDP 端点），那一半没有这个疑问；
    有疑问的是它的镜像 —— (1.b) 的"一个 profile 被好几个会话驱动"。changelog 说 0.34.0 修的正是
    "并发会话共享一个 Chrome 时互相劫持标签页"，但**并发命令是不是被那个守护进程串行化**我没有测过，
    而这是"两个 agent 同时在一个登录态里工作"到底快不快的全部。P1 要在真二进制上量它。
25. **子 agent 的环境继承，我读了代码没有跑。** claude 的子 agent 是同进程的 sidechain
    （`src/session-store.js:308`、`src/session-schema.js` 的 `_subNormalizers`），codex 的是它的
    app-server 拥有的线程，Background Work 的 job 走 `src/jobs.js:375` 的 `jobEnv({…})` —— 三条都是
    读出来的。D23 的"默认 (a)"依赖第一条，所以 P1 要真的派生一个子 agent、在里面跑一次
    `vibespace-browser status`，看它报出来的 `AGENT_BROWSER_SESSION` 是不是父亲的。**而无论那次测量
    结果如何，有一条残留今天就成立**：一个从不调 `new-child` 的子 agent 在父亲的登录态里干活，而产品
    里没有任何东西检测得到或阻止得了 —— CLI 拿到的 env 与 token 与父亲逐字节相同。服务端能看见一个
    sidechain 正开着（`session._subNormalizers`），那足以在拒绝里加一句诊断附言（§3.7），但那句附言
    带着 60 秒回收宽限的竞态，所以它永远不是拒绝的理由。
26. **k 个浏览器**同时**跑起来的资源包络，在多附着下。** §1.2 的每实例数字是在四个**空闲无头**泄漏
    上量的；本轮只新量了容量那一侧（**2026-09-10：128 个 inotify instance 里已占 80，剩 48**）。
    "一个会话三个 profile"这种形状一个数字都没有，而 D13 的上限提案（8）是在单附着假设下提的。
27. **`profile_changed` 这条拒绝到底能不能让一个模型改变行为。** 机制那一半是确定的（那条命令
    **没有执行**），但"于是它会带着 handle 重发"是一个关于模型行为的**预测**。手册与拒绝文案要写成
    可执行的一句话，而 P1 之后应该去读真实会话：拒绝之后那条重发到底带没带 handle。
28. **Xpra 的控制通道命令集。** 文档里 `xpra control [CONNECTIONSTRING] command` 与
    `xpra list-windows` 都在（`xpra control help` 会列出全部），但这台机器**没装 xpra**，所以窗口
    枚举在那条路上到底给出什么字段、能不能按 window id 动作，一个字都没验过。P9 的第一件事之一。
29. **portal 在一个 `systemd --user` 后台服务里到底可不可用。** 本机 portal **有** RemoteDesktop /
    ScreenCast / InputCapture 三个接口（实测），`Start` 的文档说它"通常会弹一个对话框"，而一个公开
    的 computer-use 项目报告 **portal/D-Bus 路径在后台/systemd 上下文里会被拒**。VibeSpace 的服务器
    恰恰就是那样一个进程。这条不成立的话 D29 落到 (c)，所以它必须先量，而不是先设计。
30. **AT-SPI 在 Qt 与 Electron 上的覆盖度，本机零测量。** 实测到的 9 个应用全是 GTK/clutter/gjs；
    Electron 通常只在检测到一个 AT 客户端时才导出树，而 `toolkit-accessibility` 在这台机器上是
    `false`（AT-SPI 仍然可用 —— 这本身就说明那个开关不是"总开关"，但它在别的工具包上意味着什么
    我没测）。§4.9 关于"无障碍树是主通道"的结论对 GTK 是实测的，对 Qt/Electron 是**推断**。**而即使在
    GTK 上，那条结论的诚实上界也是一个比例，不是一句"可以"**：九个应用各走 400 个节点封顶、共 503 个
    节点，`Action` 66 个、`EditableText` 33 个，而 43 个 `button` 节点里只有 6 个导出 `Action`；换成
    统一 600 节点预算的广度优先走法是 `Action` 52/600。这些数字是**这一台桌面在这一刻**的，不是一个
    关于 GTK 的常数 —— 所以 `test-window-target` 的 `snapshot` 那一腿要把自己这趟的接口清点报出来，
    好让它在别的桌面上可被复核。
31. **macOS 那两道 TCC 门的当前形状。** Accessibility 要求非沙箱 + 已签名、Screen Recording 在
    Tahoe 上要求 app bundle —— 两条都来自公开文档与一个 2026-01 的公开 issue，**不是我在一台 Mac
    上量的**（这台是 Linux）。D30 的"不做"因此是基于二手证据的，如果 owner 想推 (b)，第一步是在
    一台真 Mac 上复核这两条。

第六轮新增，两条都是本轮自己那些改动带来的：

32. **"一条直接的 `agent-browser` 命令够不到非默认附着"—— 这是按构造的推理，不是实测。** §3.7 那半
    收口靠的是：会话 env 里那份 config（变体 D）或那个符号链接（变体 C）只命名默认附着的
    user-data-dir，而别的目录从不被打印。这依赖 `agent-browser` 自己那条配置优先级**恰好**按 §1.1
    引的文档运转 —— 而 §12.12 已经把 `AGENT_BROWSER_CONFIG` 的确切语义列为未验证（"instead of the
    defaults"到底替不替掉项目级那一份、`extensions` 还合不合并，文档写得含混）。所以 P0 在提交变体 D
    的同时要顺手量这一条：起两个附着，用会话自己那份 env 跑一条直接命令，确认它解析到的目录**恰好**
    是默认那个。如果配置优先级不是这样，这一半收口就不存在，I6 要再改窄一次 —— 而这也正是它现在被
    写成"经我们 CLI 的命令"而不是"每一条命令"的原因。
33. **node 这一侧的 AT-SPI 绑定，以及它每节点的成本。** 本轮每一个 AT-SPI 数字（9 个应用、约
    1,800–6,100 节点/秒、66/503、6/43）都是经 `python3` + GObject introspection 量的，也就是经
    `libatspi`，而 AT-SPI 的 D-Bus 设计把**缓存**写成了它自己的要点之一。所以那些速度数字**只对这条
    路成立**：在 node 里直接说 D-Bus（`dbus-next` 这类通用客户端）拿不到那份缓存，每节点一次往返的
    真实成本要重新量；spawn 一个 GI helper 则要付 §1.6 已经量过的 fork 税。本轮**没有找到**维护中的
    node 专用 AT-SPI 绑定，但"没找到"不是"不存在"（这个仓库为这类断言付过代价），所以这条写成 P9 要
    先查、先量的一个输入，而不是一个已经有答案的问题。
34. **共享集成与密钥层那一节的最终标题。** 本 track 是它的**消费方**，而它与本文档在**同一轮**被
    写。本节这一版对的是 `design-communication-panel-r2` 分支上 commit `d02afcbb` 的
    `docs/design-communication-panel.zh.md`，那一节此刻是 `## 14. 集成密钥与配置界面`（第七轮我读的
    是 commit `14785475`，那时它还只是 `## 13. 密钥、过期、失败`）—— 两份文档都还在各自的分支上，
    所以这个标题**仍然不是最终的**，节号在下一轮就可能再动一次。所以本
    文档一律按**模块名**引用它（`src/integration-registry.js`、`src/server/integration-store.js`、
    `src/secret-box.js`、`resolveIntegration`、`publicView`、`app.openIntegration`），而不是按
    节号 —— **名字是契约，标题不是**。如果两份文档在某个名字上分叉了，分叉的那个就是缺陷，而不是
    一次措辞差异。
35. **CloakBrowser 有没有一个"已用席位"的查询。** 公开材料只说这个包带**自动的 license 档位识别**
    （已验证的免费 key 无需确认即可启动，而本地并发的免费 session 会被串行化），license key 的三条
    通道是 `CLOAKBROWSER_LICENSE_KEY` / `licenseKey` 选项 / `~/.cloakbrowser/license.key`，格式是
    `cb_…`。我**没有**找到任何一个能回答"这把 key 现在被占了几个席位"的接口。所以 §7.4 的席位显示
    是**我们自己数的**（keeper 数本实例）。**第八轮更正了这一条的后半句**：上一版写着"Test 的判决
    只能给出档位与一次成功的启动"，而那次 Test 本身在第八轮被取消了 —— §7.5 把 `cloak` 的
    `test.kind` 定成 `shape-only`（零网络），因为一次真的启动式探测要先有那 200 MB 二进制和
    §7.2.1 的出网证据记录，而这两件事不该由"打开卡片贴一把 key"触发。所以**档位来自第一次真正的
    启动**（keeper 起 `cloakserve` 时它自报计划），在那之前是**未知**，而 §7.4 的席位显示因此是
    三态。这正是 D32 那条"共享 key 的席位是全机队的、必须写在芯片上"为什么不能靠一次查询解决。
    `cloud:*` 各家可能不同，同样未核实。
36. **一个被点名的站点到底在哪一层挂掉。** 本轮没有对任何一个真实站点做过一次尝试 —— 没有 tier 1、
    没有 tier 2、更没有 tier 3。§7.6 的整张表是关于**机制**的，不是关于任何一个站点的读数，而
    owner 那个"给我 2–3 个具体挂掉的站点"的要求是这整条阶梯唯一能被证据推动的输入。**这次测量不
    需要写任何代码**（用已装的 0.32.0 手动跑就行），所以它应该排在 P10 **之前**而不是里面 ——
    D31 的推荐正是建在这一条上。
37. **`agent-browser-plugin-stealth` 是不是一个真的已发布的包。** 在 0.32.0 的 README 里它是一个
    **示例**：能力 `launch.mutate` 是真的、有文档、有能力门（`--confirm-actions
    plugin:stealth:launch.mutate`），协议请求类型也写明了；但我**没有**在 npm 上核实存在一个叫这个
    名字的实现，也没有跑过任何一个 launch mutator。所以 §7.6 说的是"上游有一个一等的接口可以挂一
    个"，**不是**"有一个现成的可以用"。
38. **云 provider 那些 `*_STEALTH` 开关到底改变了什么。** `BROWSERLESS_STEALTH` 与 `KERNEL_STEALTH`
    在已装二进制的 env 表与它的 README 里都在（README 记的默认值分别是 `true` 与 `false`），但它们
    背后是各家自己的实现、没有公开规格，我也没测过。§7.5 因此把它们当作**字段**（一个用户或集群
    可以设的值），而不是当作一个能力承诺 —— 这与 §7.1 那条"一个 provider 缺的能力是一个 UI 会读的
    字段"是同一条纪律的反面：一个**没被测量过的**能力不许进 caps 行。
39. **tier 3 的端到端延迟与成功率，零测量。** §4.9 已经记过"本机没装 `xpra`，端到端延迟一个字都没
    量"；tier 3 把这一条整个继承下来并且更重：一次银行登录是一串短表单加一次很可能出现的二次验证，
    而本文档对"一次 `do_action` 到界面变化"的延迟**一个数字都没有**，对**用户自己那台机器**的桌面
    栈更是零实测（§4.9 每一个数字都来自这一台）。所以 P10 的第一件事是量它，不是写它，而 P10 的
    区间（4–12，本文档最宽的一条）就是这个无知的价格。
40. **一把免费档 CloakBrowser key 的那个席位被**另一台机器**占着时，`cloakserve` 到底返回什么。**
    公开材料只说"本地并发的免费 session 会被串行化"（§12.35）—— 那是**同机**的说法，而 D32 推荐的
    配置（集群注入一把免费档 key）里，抢席位的那一方在**另一个 pod** 上。§7.4 的第三条具名拒绝
    `backend_seat_taken` 的**判据**就是那个回答：是一次启动失败、还是一次静默的串行化等待、错误
    里带不带可以匹配的字样。这次测量**需要两台机器和一把免费档 key，不需要写代码**，所以它排在
    P4 的第一批动作里；在它做完之前，那个分类器的判据只能是"启动失败且错误里带着授权/并发字样"，
    而这句话本身要写进代码注释里等着被收窄，§9 的那条腿钉的也只是分类器的**形状**。
41. **五个 `cloud:*` 行各自那一个 vendor 主机的确切名字。** §7.5 的出网声明是一条**规则**（"一个
    runner 只能到达由它自己那一行的字段推导出来的那一个主机"），而那条规则本身是可以现在就写下来
    并且可以被门禁执法的；但其中三行需要一个**常量**（browserbase / browseruse / agentcore 按
    区域），而本轮**没有**去核实它们的确切主机名 —— 那要么读已装二进制里那几个 provider 的实现、
    要么读各家的文档，而本文档对第三方 endpoint 的纪律是"要么实测要么写进这一节"。两行
    （`browserless` / `kernel`）**不需要**常量，因为它们的主机就是用户自己填的 `apiUrl` / `endpoint`
    —— 这也是为什么那条声明写成推导规则而不是一张常量白名单：**一张常量表对这两行根本表达不出正确
    的答案**。实现时的第一步是把那三个常量读出来填进注册表行，而 §9 的第 (vi) 条腿断言的是**集合
    相等**，所以它对"常量填错"是敏感的、对"常量还没填"是明确失败的（一行推导不出主机 = 一次具名
    拒绝，不是一次"用默认主机试试"）。
42. **两份文档的一致性是 grep 核的，不是一个语义工具核的。** 本轮把 §7.5 的合约按
    `design-communication-panel-r2` 分支 commit `d02afcbb` 上的第八轮正本重新对了一遍
    （`resolveIntegration` 的返回形状、`source` 绝不落盘、`clearUserValues` 与 `useClusterDefault`
    的分工、`GET /api/integrations` 载荷里的 `setup` / `clusterKey` / `clusterOptions` /
    `testCaveat`、以及那条按 **env 名字**的普查），而对法是**逐个标识符 grep**：我能证明的只是那几个
    名字与那几条形状两边逐字一致，**证明不了两边的散文说的是同一件事**。正本再动一轮，这一节就要
    再对一次 —— 而唯一会自己变红的东西是共享层自己的 `test-integration-registry`，它扫的是**代码**，
    不是这两份文档。

---

## 附录 A —— 资料来源

* **agent-browser**：已安装的 0.32.0 build（`--help`、`skill-data/core/references/*`，包括
  `session-management.md`、`trust-boundaries.md`、`commands.md`、`proxy-support.md`），
  外加上游的 `CHANGELOG.md`、`README.md`，以及 0.33.0–0.37.1 的当前 `streaming.md` /
  `session-management.md`。Apache-2.0，`vercel-labs/agent-browser`。
* **第五轮资料来源（2026-09-10），针对 owner 的三个问题：**
  * **XDG Desktop Portal** —— `org.freedesktop.portal.RemoteDesktop` 的官方文档：方法集
    （CreateSession / SelectDevices / Start / **ConnectToEIS** / NotifyPointerMotion(Absolute) /
    NotifyPointerButton / NotifyKeyboardKeycode / NotifyKeyboardKeysym / NotifyTouch*）、设备位
    （1 KEYBOARD / 2 POINTER / 4 TOUCHSCREEN）、绝对坐标必须点名一个 **PipeWire stream node**、
    `persist_mode` 的三个取值与一次性的 `restore_token`，以及 `Start` "通常会让 portal 弹一个对话框
    让用户选择要共享什么"。另有 whot 关于 libei 在 RemoteDesktop 与 InputCapture 两个 portal 里
    集成情况的说明。
  * **Anthropic computer use tool** —— 官方文档：当前工具集 `computer_toolset_20260801`（17 个成员
    工具，含 `zoom`）、`computer_20251124` 是旧的 beta 版本、**坐标就是截图像素坐标**且缩放要调用方
    自己映射回去、以及"1024x768 / 1280x720…避免超过 1920x1080"的分辨率建议；文档里**没有**无障碍树
    这条通道 —— 而同一家的 browser use 读的正是无障碍树。
  * **OpenAI ChatGPT 桌面版 "Work with Apps"** —— 官方帮助中心：**对大多数应用用 macOS 的
    Accessibility API 取内容**，VS Code 另需装扩展；终端类取最近 200 行，编辑器类取最前窗口里打开
    面板的全文（有截断上限）；只在 macOS 上。
  * **Linux computer-use 的第三方实现** —— cua 的 "Inside Linux computer-use"（AT-SPI 2 over D-Bus
    取无障碍树、键盘从 XSendEvent 换成 **XTEST**、原生 Wayland 仍是 preview 且缺屏幕捕获与 AT-SPI
    parity、GTK3/GTK4/Qt5/Tk 各写各的文本输入路径）与 `agent-sh/computer-use-linux`（MIT：窗口枚举
    的后端梯子 GNOME 扩展 → GNOME Introspect → COSMIC → KWin scripting → hyprctl → i3 IPC → 通用
    X11/EWMH；Wayland 输入优先 RemoteDesktop portal、回退 uinput；**明确记着 portal/D-Bus 在后台/
    systemd 上下文里会被拒**）。
  * **GNOME Shell Introspect** —— `org.gnome.Shell.Introspect.GetWindows` 对非白名单调用方返回
    AccessDenied，白名单是一张 D-Bus 发送者名单（主要是 XDG portals），或者 shell 处于 unsafe mode。
  * **macOS** —— Apple 文档：`CGWindowListCreateImage` 自 macOS 15 起弃用、ScreenCaptureKit 用
    `SCContentFilter` 指定单窗口、`AXIsProcessTrustedWithOptions` 带 `kAXTrustedCheckOptionPrompt`
    才会弹窗；以及一个 computer-use 项目 2026-01 的公开 issue：macOS 26 (Tahoe) 上非 bundle 的可执行
    文件不出现在 Screen Recording 隐私列表里，窗口不出现在截图中，ScreenCaptureKit 回 TCC 错误。
  * **Xpra** —— `xpra control [CONNECTIONSTRING] command`（`help` 列出全部）与 `xpra list-windows`
    是文档里的运行时控制面；seamless 模式"只把你选择转发的窗口与特性呈现给客户端"。
  * **这台机器，只读，2026-09-10：** `XDG_SESSION_TYPE=wayland` + `Xwayland :1 -rootless`；
    `xwininfo -root -children` 只列出 19 个 X11 顶层；`gdbus` 问 `Introspect.GetWindows` 得
    AccessDenied；portal 上有 RemoteDesktop / ScreenCast / InputCapture / Clipboard；
    `libei.so.1`/`libeis.so.1` 1.3.901 与 `/usr/libexec/gnome-remote-desktop-daemon` 在；
    `/dev/uinput` 是 `crw------- root root` 且 uinput 模块未加载；`grim` 在但 GNOME 上失败
    （"compositor doesn't support wlr-screencopy-unstable-v1"）；`xdotool`/`wmctrl`/`xprop`/
    `xwininfo`/`Xvfb`/`ffmpeg` 在，`xwd`/`import`/`ydotool`/`xpra`/`weston`/`cage` 不在；
    `toolkit-accessibility` 是 `false` 而 AT-SPI 注册表仍活着并报 9 个应用，遍历实测 24 节点/13 ms
    与 61 节点/10 ms（约 1,800–6,100 节点/秒），节点自报 `click` / `window.minimize` /
    `clipboard.copy` 等动作；`fs.inotify.max_user_instances` = 128 而本 uid 已占 **80**；
    `~/.agent-browser` 仍是 59 个目录 / 98 GB，`agent-browser --version` = 0.32.0。
  * **VibeSpace（第五轮）：** `src/session-store.js`（`isSubagentMessage`）、`src/session-schema.js`
    （`_subNormalizers`）、`src/jobs.js`（`jobEnv`）、`src/lib/sidebar.js`（`LIVE_SESSION_FACTS` 与
    它的 digest 半边）、`src/session-status.js`（`pendingNotice`）与 `src/agent-routes.js`
    （prompt-context 注入点）。
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
* **第三轮资料来源（2026-09-10），对应 owner 那四个问题：**
  * **Xpra** —— 项目自己的文档（Seamless 模式；Encodings：auto/webp/jpeg/avif/png 与
    VP8/VP9/H.264/HEVC/AV1，并有 `min-quality`/`min-speed` 调节）与 `docs/CHANGELOG.md`
    （7.0，2026-08-27；6.6 加入 http digest + scram 认证与 http origin 校验；6.5 加入 Wayland
    后端）。`Xpra-org/xpra-html5`（MPL-2.0，可装在别的 web server 路径下，已知 iframe
    `sessionStorage` 限制）与独立的 npm 包 `xpra-html5-client`（Apache-2.0，2.3.0）。
    `jupyter-xprahtml5-proxy` 作为"用宿主应用自己的鉴权包住 Xpra"的先例。
  * **KasmVNC** —— 项目 wiki 的 "Differences From TigerVNC" 与它的性能页
    （TightJPEG / TightWEBP / TightQOI 的质量阶梯、video mode）。
  * **CloakBrowser** —— `CloakHQ/cloakbrowser` 仓库，§7.4 依赖的三个事实都出自这里：
    免费档 = Chromium 146（58 个补丁）/ Pro = 151（73 个补丁）；`launch_persistent_context(dir)`；
    `--fingerprint=seed` 是一个**启动**参数（"同一个 seed = 跨启动同一个指纹"）；并发 session 档位
    （免费 1，然后 5 / 20 / 200 / 2000）；以及 `cloakserve` 的每连接 seed 查询参数与它自己的
    每 seed 临时 profile 目录。
  * **Chromium** —— `docs/user_data_dir.md`（"two running Chrome instances cannot share the same
    user data directory"），以及有文档的 profile 版本拒绝（"Your profile can not be used because
    it is from a newer version of Google Chrome"）。
  * **Playwright** —— `browserContext.storageState()` 那个可选打开的 `indexedDB` 选项，逐字。
  * **agent-browser 自己的 changelog** —— 自定义可执行文件路径（0.8.7）、把 Chrome profile
    **拷贝**到临时目录的 profile 支持（0.24.1）、`--restore` / `--restore-save`（0.31.0），
    以及 0.37.1（2026-09-08）仍然是最新发布。
  * **WhatsApp** —— 那篇讲"经多设备 web 客户端备份数据"的公开写作（IndexedDB、AES-CBC 正文、
    不可导出的 `CryptoKey`、`crypto.subtle.decrypt` 的 monkey-patch）以及关于 WhatsApp Web
    IndexedDB 的取证文献；还有多设备限制（4 个链接设备，主手机离线下最多 14 天）。
  * **微信** —— 官方 Linux 原生客户端（腾讯，2024 年 11 月；deb / rpm / AppImage），以及在
    Windows / macOS / Linux 上从运行中客户端内存里抠出 WCDB/SQLCipher 密钥的公开工具。
  * **非官方 WhatsApp 库** —— 关于协议级客户端（Baileys / WAHA / Evolution API）封号风险的公开
    报告，对照官方 Business API。
  * **本机，只读，2026-09-10：** `/proc/sys/kernel/yama/ptrace_scope` = `1`；
    `Xvfb` 在 `/usr/bin/Xvfb`；`xpra` 与微信客户端均未安装。
  * **第七轮资料来源（2026-09-11），针对 owner 的集成密钥指令与 Q10 检测阶梯：**
  * **已装的 agent-browser 0.32.0，二进制与 README 只读实测** —— `strings bin/agent-browser-linux-x64`
    给出的 CDP 面（`struct CdpMessage` / `CdpReply` / `CdpError`、`Target.createTarget`、
    `Page.navigate`、`Input.dispatchMouseEvent`、`GetFullAXTreeResult`）、那条只服务 iOS/Safari/
    Appium 的 WebDriver 后端（`src/native/webdriver/{client,backend,appium,ios}.rs`）、
    `--disable-blink-features=AutomationControlled` **只**出现在 `--args` 的示例文本里、以及云
    provider 的 env 名（`BROWSERBASE_API_KEY`、`BROWSERLESS_API_KEY` / `_API_URL` / `_STEALTH`、
    `KERNEL_API_KEY` / `_ENDPOINT` / `_STEALTH`、`BROWSER_USE_API_KEY`）。README 那一页给出插件能力
    （`credential.read` / `browser.provider` / `launch.mutate` / `command.run`）、示例插件名
    `agent-browser-plugin-stealth`、能力门 `--confirm-actions plugin:stealth:launch.mutate`、
    “agent-browser keeps browser automation, redaction-sensitive output, and policy enforcement in
    core”，以及 `BROWSERLESS_STEALTH` / `KERNEL_STEALTH` 的默认值。
  * **`vercel-labs/agent-browser` issue #120** —— “Feature Request: Add stealth mode via
    AGENT_BROWSER_STEALTH environment variable”（shkumbinhasani，2026-01-15，仍然 open）：现代
    bot 检测（Cloudflare / DataDome / PerimeterX / reCAPTCHA）查的信号远不止一个，启动标志“只覆盖
    一个检测向量”，并列出 WebGL vendor/renderer、插件与 mime 枚举、Chrome runtime 属性、特性检测
    不一致。
  * **CDP 检测在 2026 年的现状** —— 公开分析：2025 年一次 Chrome 更新改掉了经典 `Runtime.enable`
    检查所观察的序列化路径、那个 getter 在当前版本上不再触发，而 rebrowser / Patchright 那一代补丁
    干脆不发那条命令 —— 这**一个**信号基本失效；留下来的四层是协议副作用、注入残留（`$cdc_`、
    `__playwright__binding__`）、求值指纹、以及缺席模式（配合服务器级渲染与数据中心网络特征）。
  * **银行侧的设备与行为情报** —— 某行为生物识别厂商 2026-03 的 DeviceIQ 发布材料（明确点名要识别
    device spoofing、emulators、**cloaked browsers**、越狱设备、数据擦除；自称持续采集 3,000+ 匿名
    信号含键击与鼠标行为、AI agent 使用；截至 2026 Q1 全球前 100 大银行里 30 多家、共 357 家金融
    机构在用）。**用途仅限于说明这条产业的判据是设备 + 行为 + 新设备升级验证**，不是对任何一家被
    点名银行的读数（§12.36）。
  * **CloakBrowser 的 license 通道** —— `CLOAKBROWSER_LICENSE_KEY` / `licenseKey` 选项 /
    `~/.cloakbrowser/license.key`，格式 `cb_…`；免费档 1 个并发 session、付费档 5 / 20 / 200 /
    2000；自动的 license 档位识别与本地免费 session 的串行化。**没有**已用席位的查询接口
    （§12.35）。
* **VibeSpace（第七轮）：** `src/ws-handler.js`（`AGENT_ENV_KEEP` / `AGENT_ENV_DROP` / `agentEnv()`
  的 DROP-清单语义与它上方那段点名 helm 注入秘密的注释，`:88-121`，导出在 `:1657`）、
  `src/mounts.js`（`drivePresets()` `:2189`、`_driveClient()` `:2211` 的优先级、loopback 粘回流程
  `:2172-2183`、`_enc`/`_dec` `:369-382` 与 `.mounts-key` `:47`+`:360-367`）、`src/plugins.js`
  （`_frpCfg()` `:569-580` 的用户覆盖压过集群 env、`fromEnv` `:686`、只暴露 `hasToken` `:694`、
  集群注入即默认开启 `:584-589`）、`src/lib/sidebar-mounts.js`（“Custom (own client id/secret)” 与
  `type:'password'`，`:1750-1771`）、`src/routes/persistence.js`（`/api/config/export-info` 的
  `sensitive` 清单 `:679-686` 与那道 ≥4 字符口令门 `:708-712`）、`src/lib/settings-schema.js`
  （`SETTINGS_CATEGORIES` `:935-948` —— 已经有 `Integration` 这一类，仍然**没有** Browser 分类）、
  `deploy/helm/vibespace-user/templates/main.yaml`（Drive presets 的 `secretKeyRef` 形状
  `:159-170`、`VIBESPACE_PUBLIC_URL` `:172-176`）。
* **VibeSpace（第三轮）：** `src/lib/tab-group.js`（链模型、`_syncChainBounds`、
    `restoreTabChain`、`_detachFromChain`、`_ungroupLast`）、`src/lib/layout.js`
    （`tabs.join(',')` 同步键与 tabChain 持久化）、`src/lib/contributions.js` +
    `src/lib/session-card.js`（`'session-card'` 菜单与它的分组）、`src/resume-continuity.js`
    （`resumeSpawnPick` / `applyOriginHint`）、`src/task-groups.js`、`src/session-status.js`
    （`pendingNotice`）、`src/account-material.js`（`repointPoolSymlink`）、
    `src/lib/settings-schema.js`（`SETTINGS_CATEGORIES` —— 目前**还没有** Browser 分类），
    以及 `docs/kb-file-structure.md` 的 Communication Channels v1 条目。

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

---

## 附录 C —— 批评日志（第四轮）

一位对抗性批评者读了第三轮的修订，报了六条。**六条全部成立**，每一条都在改任何东西之前先按源码
核实过；下面记的是核实用的命令与它给出的答案，因为"已核实"是一句关于跑过什么的陈述，不是对一份
diff 的感觉。没有一条被判为错，所以这一轮没有"驳回"条目。

| # | 严重度 | 发现 | 判定 | 落在哪 |
|---|---|---|---|---|
| 1 | high | §11 里 D13 和 D14 之间的那个空行终结了 GFM 表格，于是**这一轮全部八条新决定 D14–D21 渲染成一堵竖线** | **成立** | 两份文档各删掉一行（`.md:1636` / `.zh.md:1414`） |
| 2 | medium | 归属徽章要复用"会话卡已经在用的颜色"，而会话卡**没有**颜色：`task-color-seq.js` 上色的是**岗位** | **成立** | §4.6 徽章段重写为按会话推导 + `test-window-binding` 两条新 fast 腿 |
| 3 | medium | `split.pair` 装的是窗口 id，却没有任何一条规则在链变动时守它；host 提升是一条可达路径，会留下悬空 id | **成立** | §4.6 新增 `_normalizeChain` 不变量 + 生命周期第三种情况 + 一条新 fast 腿 |
| 4 | medium | §4.7 那句"没有任何一条路能做本地回显"被产品自己证伪：`/proxy` + `src/lib/browser-window.js` 就是一条 | **成立** | §4.7 结论改写为"**agent 也能驱动**的每一条路"，并把那个例外和否掉它的两条理由写出来 + §12.23 |
| 5 | low | `task-group` 是往 `SPAWN_ORIGINS` 这个**被冻结**的四值词表里加第五个值，而借来的 `applyOriginHint` 规则方向正好相反 | **成立** | §3.2.5 点名两处改动 + 换掉那条错的理由 + `test-browser-pin` 词表断言 |
| 6 | low | 那句负责给估算封顶的话引用的 **46 轮**在自己的表里已经不存在了（第二轮的遗留） | **成立** | §10 改成 82（极值之和）对 66（风险加权） |

**核实记录。**

* **发现 1。** 用仓库自带的 `marked` 渲染两份文档的 §11：各只得到 **1** 个 `<table>`、14 个
  `<tr>`（表头 + D1–D13），而 D14 和 D21 都落在 `<p>` 里、竖线是字面量。全文扫一遍连续的竖线块：
  每份文档 18 块，恰好各有 1 块的首行之后没有分隔行 —— `.md:1637` 和 `.zh.md:1415`，两处的上一行
  都是空行。修完重渲染：各 1 个 `<table>`、**22** 个 `<tr>`（表头 + D1–D21），§11 里零个 `<p>`。
* **发现 2。** `grep -n 'seqTaskColor\|taskGroupColor\|colorSeq' src/lib/session-card.js
  src/lib/sidebar-render.js` **零命中**；全仓的消费者只有 `sidebar-tasks.js:258/270`、
  `task-detail.js` 和 `session-props.js:499`，每一处的键都是一条岗位记录。批评者提出的替代来源
  （webui id 里的 `sess-<seq>` 计数器）核实成立：`src/ws-create.js:234` 是
  `'sess-' + seq + '-' + Date.now()`。但他附带的那句"跨 resume 稳定"**不准确**，本轮据此收窄：
  `boot-restore.js:200` 只在**服务器重启**时复用 `meta.webuiSessionId`，而一次 resume 走 ws-create
  会铸一个新键。文档因此写的是"跨重启不变、跨 resume 会变"，并说明为什么这对一枚徽章可以接受。
* **发现 3。** `src/lib/tab-group.js` 的三个链变动点逐一读过：`addToTabChain`（176-181 行
  splice/push）、`_detachFromChain`（467）、`removeFromTabChain`（546，它自己不动 `tabs`，转手调
  `_detachFromChain`）。host 提升分支在 477-497，条件正是 `idx === 0 && chain.tabs.length > 1`。
  `grep -rn '_normalizeChain' src/` 零命中，所以"这条规则今天没有家"成立。批评者的定位把 host 分支
  归给了 `removeFromTabChain`，实际在 `_detachFromChain` 里，文档按后者写 —— 这不改变结论，只让
  "一个地方"指得准。另外补一条批评者没说、但同一条不变量必须回答的：split 渲染在 **host 的元素
  里**，所以即使 `pair` 两个成员都还在，host 换人也要把那两面搬过去重画。
* **发现 4。** `src/lib/browser-window.js:8` 就是 `openBrowser(app, url, { syncId, proxy = false })`，
  `:74` 是 `iframe.src = proxyMode ? '/proxy/' + u : u`；`server.js:636-647` 挂 node-unblocker 于
  `/proxy/`，`:236` 让 body parser 跳过它，`:1861` 分发它的 WebSocket upgrade。而
  `browser-window.js` 在正文里**零次**出现（只出现在附录 A 的来源清单，`.md:1785` / `.zh.md:1538`），
  `unblocker` 与 `/proxy` 一次都没出现过。结论按批评者的建议改写成"每一条 **agent 也能驱动**的路
  都要付一个 RTT"，排名一行未动。
* **发现 5。** `src/resume-continuity.js:56` 的 `SPAWN_ORIGINS` 是 `Object.freeze` 的四个值，注释
  逐字禁止发明第五个；`agent-meta.js:338` 的 `spawnValueOrigin` 白名单同样四个，落不进就转
  `responseStyleOrigin` —— 所以第五个值的后果是**静默错标签**而不是报错。`applyOriginHint` 的
  JSDoc 逐字是"只许把一个 `chosen` 降级成一件用户没有声明过的事实，绝不上调、绝不重指"，方向确实
  与 `instance → task-group` 相反。文档改用真正成立的那条理由（两级说的是同一件事，替换只加信息）。
* **发现 6。** 从阶段行重新算：5+8+6+5+9+4 = 37（P0–P5），区间 29–54；+6 得 43 / 33–63（P0–P6）；
  +5+7 得 55 / 42–82（P0–P8）；风险加权（P2、P4、P8 取区间上沿）得 44 / 50 / 66 —— 与表里发布的
  数字逐个吻合。`46` 在 §10 里再无第二处；它是第二轮的 P0–P8 数字（附录 B "25 / 31 / 46"）。

**一条核实过程中发现的缺陷，批评者没有报。** 发现 1 之后，我把两份文档整篇渲染一遍，去找**任何**
没被解析的强调标记（判据：渲染后的 HTML 里、代码块之外，还留着字面的星号对）。中文版 §5.1 有一处：
``默认**`exec` 一个子 shell**``。CommonMark 的 flanking 规则里，一个星号对前面是 CJK 字（既不是空白
也不是标点）、后面又是标点（这里是反引号）时**不能开启**强调，于是那一行渲染出来带着两个字面的
星号对。英文孪生那一行没事，因为它的星号对前面是空格。改法是把"默认"挪进强调里
（``**默认 `exec` 一个子 shell**``），语义不变。这与发现 1 同一类：**中文文档里紧贴汉字的星号对是
一种不会报错、只会静默渲染成字面星号的缺陷**，而它只有在渲染之后才看得见。全文扫完，两份文档在
代码块之外现在都是零处。

**第四轮刻意没做的事。** 它没有启动浏览器（§12.1 的理由仍然成立），没有改动任何一条决定的推荐值，
没有动阶段的轮数（发现 6 只是让那句封顶的话引用自己表里的数字），也没有软化"我没能核实的东西"里的
任何一条 —— 那份清单从 22 条长到了 23 条。

---

## 附录 D —— 批评日志（第六轮）

一位对抗性批评者读了第五轮的修订，报了六条。**六条全部成立**，每一条都在动任何东西之前先对着源码
核实过；下面写的是跑了什么命令、它答了什么 —— 因为"已核实"是一句关于**跑过什么**的断言，不是读完
diff 的感觉。本轮没有被判错的条目。

| # | 严重度 | 发现 | 判定 | 它落在哪 |
|---|---|---|---|---|
| 1 | high | 反默认失明的机制整个住在 `vibespace-browser` 里，而本设计**自己的默认路径是一条直接的 `agent-browser` 调用** —— 于是 ≥2 个附着时，一条裸的直接命令静默落到默认上，正是 Q8 点名的那个失败，也正是 I6 明令禁止的 | **成立** | §2 的 I6 改窄、§3.7 新增一行 + 两半（结构性收口 / 必须承认的残留）、§3.8 第①层表头、§5.1、§9 `test-browser-handles`、§12.32 |
| 2 | high | 能力律只对一个动词（`click --at`）执法，而四个动作动词里有两个在树上**一条路都没有**：`key`（和弦）没有 AT-SPI 原语，`click @ref` 只对**自报动作**的节点成立 —— 实测 600 个节点里 52 个 | **成立**（本轮把测量做得更细，结论更强） | §4.9 的动作行拆成**四行**、新增覆盖率一段、§5.1.1 的能力表、D28 收窄、§9 `test-window-target`、§12.30 |
| 3 | medium | §3.7 那张表的子 agent 行与 D23 互相矛盾（表说"这是默认，也是对的"，D23 说恰恰不该这样），而它承诺的那句"你是一个子 agent"附言，其判据是本节刚刚证明没人观察得到的东西 | **成立** | §3.7 该行重写 + 新增"这句附言要有说得出它的机制"一段、D23、§12.25 |
| 4 | medium | "零新机制"是假的：`pendingNotice` 是**一个**固定形状的槽、一个写死的渲染器、注入点消费一条就 `break`，于是两条通知会互相吃掉 | **成立** | §3.8 第②层重写、§3.2.5 第 3 条路、§10 P1 的内容行、§9 `test-profile-blindness`（fast） |
| 5 | medium | 规定的那一行 `LIVE_SESSION_FACTS` 登不下芯片要比较的两个值；而若把值换成那个显而易见的对象，digest 就是个常量 —— 正是那一段自己援引的那类失败 | **成立** | §3.8 第③层重写（两行标量或投影 digest + 那条通则）、§5.3、§9 `test-profile-blindness`（heavy，改成变异腿） |
| 6 | low | AT-SPI 遍历被放进一个 **SHARED** 模块（daemon 会 bundle 它）却没有一个字说它跑在进程外、有界；而本轮每一个数字都是经一条本设计从没点名的绑定量的 | **成立** | §4.9 新增两段（有界子进程 / 绑定决定）、§3.6 路由行、§10 P9、§12.33 |

**核实记录。**

* **发现 1。** §3.2 逐字写着"没有我们的进程、没有路由、没有守护进程"，§5.2 第一条逐字写着"一个一个字
  都不读的 agent 从 §3.2 拿到隔离"，而 §5.1 把包装形式的存在理由限定成一个动词子集
  （`close`/`close --all`/`connect`/`get cdp-url` 加租约检查）—— 三句话合起来就是"`snapshot`/`fill`/
  `click` 以裸 `agent-browser` 的形式跑"。§1.4 记着 `--session` 与 `--profile` 都是每次调用的旗标，
  §3.2.5 第 1 条路记着"已经 spawn 的 shell 的环境是不可变的"。所以①层够不到直接路径，这一条是结构性
  的。本轮把它拆成两半：可以收口的那一半真的收了口（非默认附着的目录由服务器铸名、从不打印），而剩下
  的那一半连同 I6 的措辞一起被改窄 —— 一个对默认路径不成立的不变量，不改窄就是上线当天的假话。
* **发现 2。** 本轮**重新量了一遍**，而且量出了比批评者更强的数字。批评者报的
  `Component` 599 / `Action` 52 / `EditableText` 52 / `Text` 52（600 节点统一预算）被**逐字复现**。
  再按应用各走 400 个节点封顶重量一次（九个应用共 503 个节点）：`Component` 494 / `Action` **66** /
  `EditableText` **33**，而按角色拆开 —— **43 个 `button` 节点里只有 6 个导出 `Action`**，也就是一个
  agent 最想点的那个角色恰恰是树这条路最常缺席的地方；另外实测 66 条动作里有 **32 条名字是空字符串**。
  `key` 那一半也复核了：`Atspi.generate_keyboard_event` 与 `generate_mouse_event` 都存在，但它们是
  **注册表级**的设备事件生成器（在 X11 上就是 XTEST = 注入），而 `Action` 上跟键有关的只有
  `get_key_binding`，那是一个**读**。`type` 那一半有树这条路：`EditableText.insert_text` /
  `set_text_contents`（实测方法名），条件是节点导出 `EditableText`。
* **发现 3。** 表里那句"这是默认，也是对的"与十二行之下的正文、以及 D23 的推荐值三者对不上；而
  `src/session-store.js:308` 的 `isSubagentMessage` 与 `_subNormalizers` 都确认了同进程 sidechain
  这件事，也就确认了 CLI 分不出调用者。本轮采纳了批评者提的那个机制而没有只是删掉那句附言：
  `src/server/stdout/claude-stream-json.js:288` 建 map、`:1065` 在 `task_notification` 之后带 60 秒
  宽限回收 —— 所以服务端**确实**知道此刻有没有 sidechain 开着，那足以当一句诊断附言，但那 60 秒宽限
  就是它永远当不了拒绝**理由**的原因。
* **发现 4。** 三处逐字核实：`src/session-status.js:110/125/141` 的 `pendingNotice` 是一个形状固定为
  `{agent, user, at}` 的槽，`:177–188` 的 `renderNotice` 写死了状态覆盖那一句，而
  `src/agent-routes.js:563–566` 的循环消费一条就 `break`。而本文自己已经要这个槽再背第三个生产者
  （§3.2.5 的 `'browser-pin'`），所以这次冲突在这一份文档内部就已经不是假想的。
* **发现 5。** 在 node 里实测：`(v) => v || ''` 作用在 `{active:'a',pinned:'b'}` 与
  `{active:'x',pinned:'y'}` 上，`liveFactsDigestPart`（`src/lib/sidebar.js:96–103` 的
  `out += ':' + d(s[k])`）两次都得到 `":[object Object]"` —— 逐字节相同。批评者关于门禁的那条同样成立
  且更要紧：**"一致时中性、不一致时琥珀"是两次全新渲染，在这个 bug 下照样通过**，所以那条腿改成了一次
  变异（只改一个值，断言芯片翻色且没有整表重建），负控是那个对着对象的 digest。
* **发现 6。** §0 引了这条法、§4.2 据它否掉了 CDP 截屏，而 §4.9 没有受到同样的对待 —— 尽管它自己的
  数字（每节点一次 D-Bus 往返、600 节点 0.1–0.33 秒）加上一个不应答的应用（libdbus 默认 25 秒超时）
  正是写下这条法的那几次事故的形状，而 §3.6 把 `src/window-targets.js` 列为 **SHARED**，于是 daemon
  也会中招。绑定那一条同样成立：附录 A 自己的证据行写着这些数字是经 `python3` + GI 量的，而那条路
  走 `libatspi`，它自带 AT-SPI 的缓存 —— 所以那些速度数字**不能**迁移到一个手写的 node D-Bus 客户端上。

**第六轮刻意没做的事。** 它没有启动浏览器（§12.1 的理由仍然成立），没有改动任何一条决定的推荐值
（D23 与 D28 的**答案**都没变 —— 变的是它们各自被收窄到实测支持的范围），没有动任何一个阶段的轮数
（发现 2、4、6 都在既有的 P1/P9 内容行里落地），也没有软化"我没能核实的东西"里的任何一条 —— 那份
清单从 31 条长到了 33 条。

---

## 附录 E —— 批评日志（第八轮）

一位对抗式批评者读了第七轮的修订，提了八条。**八条全部成立**，每一条都是先对着来源核实、再动文档
—— "核实过"是一句关于跑了什么的断言，不是对着 diff 的感觉。没有一条被判为错，所以本轮没有"被驳回"
的条目。**三条 high 全部落在第七轮自己新写的那一节（§7.5）上**，这件事本身就是一条读法：一节刚写完
的、把自己定位成"某个共享层的消费方"的文字，最容易漏掉的恰恰是**那个层要求消费方交出来的东西**。

| # | 严重度 | Finding | 判定 | 落在哪 |
|---|---|---|---|---|
| 1 | high | §7.5 那六行声明了 `test` 却**没有 `kind`**（共享层那是封闭集）、**没有 runner 注册点**，还带进来五个从没被声明过的第三方主机 | **成立** | §7.5 增 Test 合约表 + runner 注册点 + 出网声明；`cloak` 退成 `shape-only`；§9 `test-browser-providers` 增第 (v)(vi)(vii) 条腿；§12.41 |
| 2 | high | 席位**总数**只有一个来源（人点一次 Test），而 D32 推荐的配置保证那次点击**永不发生**；既没有"未知"状态也没有陈旧规则 | **成立** | §7.4 的席位改三态 + `SEAT_TIER_STALE_MS`；档位改由第一次真正的启动读回；D17、D32、§12.35 同改；§9 `test-browser-backend` 增三态与陈旧腿 |
| 3 | high | 失败形态是**三个**不是两个：机队共享 key 的席位被别人占着时上限拒绝**结构上到不了**，用户看到的是一次没有名字的启动失败 | **成立** | §7.4 增 `backend_seat_taken` + 到顶措辞按 key 来源分岔；D32 把它写成推荐值的前置条件；§12.40；§9 增一条腿 |
| 4 | medium | §7.5 的 key 规则整条写在"keeper 在本机"的前提上，而 D5 的 (b) 把 keeper 放到配对设备上、**就在同一个 P4** | **成立** | §7.1 增 `keyScope` 格；§7.5 增一条 bullet（`provider_needs_local_key`）；新增 **D34**；§9 增第 (viii) 条腿 |
| 5 | medium | §7.6 往 `siteHints` 加了 `tier`，而 §3.3 与 §9 的门禁都写着"不许有第二个 tier 字段" —— 门禁与被测设计自相矛盾，两份 schema 块也没改 | **成立** | §3.3 的规则与两份 schema 块同改；§7.6 规矩 2 收窄成"`tier` 只在 `backend === null` 时合法"；`test-browser-tier3` 与 `test-browser-backend` 改成断言这一句 |
| 6 | medium | `consumers` 六行里有五行写的是**它自己那一行**，共享层那条"名字必须是活的文件且真的调用 `resolveIntegration`"的普查因此落空 | **成立** | §7.5 的表换成两个真实模块路径 + 一段说明为什么六行全同、以及为什么"§7.1 的那一行"在散文里对、在 `consumers` 里假 |
| 7 | medium | `local-window` 被当作一个可以被"切换"过去的 provider，而它没有 `dir`、没有 seed、没有 CDP —— 版本阶梯、seed 携带、P5 清扫对它要么无意义要么危险 | **成立** | §7.1 增能力格表（`canSwitchTo` / `ownsDir` / `leaseKind`）；§7.6 增规矩 3；`test-browser-housekeeping` 增清扫范围断言 |
| 8 | low | "三条通道里唯一一条不落盘的"按它自己的说法就是错的（不落盘的有两条），而按 §6.5 自己的威胁模型 env 是弱的那条 | **成立** | §7.5 换成真正的理由（`cloakserve` 是独立进程 ⇒ 进程内那个选项够不着；文件会把 key 留在 secret-box 与导出口令门之外），并明写接受 §6.5 那条边界 |

**核实记录。**

* **发现 1。** 对两份文档各跑一次
  `grep -c 'registerIntegrationTest\|credential-exchange\|shape-only\|reachability'`，两边都是
  **0**；`grep -cE 'browserbase\.com|browserless\.|api\.kernel|browser-use\.com|bedrock'` 同样是
  **0**。而共享层（`design-communication-panel-r2` 的 `696c38f8`，§14.2/§14.3）逐字写着
  `test.kind` 是一个封闭集并**按它推导按钮上的字**、"一行声明了 `test` 却没有注册 runner = 一个
  死控件 ⇒ 普查变红"、以及"store 自己不构造任何 vendor 请求……这一层也不会变成第二个持有 N 个
  vendor 主机的文件"——而后面那句的**理由**就是消费方**已经**声明过自己的主机。两件事本 track 一件
  都没做。另外 §9 的 `test-vendor-whitelist` 那一行逐字写着它是一次**只针对 Anthropic** 的源码
  普查，所以它接不住这五个主机。`cloak` 那一行的 Test 还另有两个没被说出口的前置条件（那 200 MB
  二进制、§7.2.1 的出网证据），而它被画在一张用户只是打开来贴一把 key 的卡片上。
* **发现 2。** §7.4 逐字："*总数*（档位）来自 §7.5 那个注册表行的 **Test 判决**"；全文
  `grep -n 'testedAt'` 两处，都在那一句附近，没有第二个来源，也没有"从没测过"这个状态。而 D32 的
  推荐值是 (b)（集群注入默认 key）—— 那恰恰是**用户完全没有理由去打开那张卡片**的情形。共享层
  §14.3 自己还写着"一个 `testedAt` 不会永远绿着……一个判决绝不比它描述的那次读数活得更久"，而这
  一节引用了那个层却没有引用那条规矩。
* **发现 3。** §7.4 自己写着"*已用*是 **keeper 自己数的**"与"keeper 数得到的只有**本实例**的占用，
  而席位是整个机队共享的"；D32 的推荐是集群注入**免费档**（一个并发 session）。三句话放在一起就
  得出："另一个 pod 占着那一个席位 ⇒ 本实例读到 0/1 ⇒ 上限判定不触发 ⇒ spawn 发出去 ⇒ 用户看到
  `cloakserve` 自己的报错"，而 §7.4 上面三段刚写过"把这件事藏起来，用户会对着一个看起来随机失败的
  浏览器排查半天"。D32 那句"到顶时的建议是换成你自己的 key"因此指着一个在它自己推荐的配置下
  **结构上到不了**的上限；而既有的到顶措辞（"点名此刻占着席位的那几个 profile"）在机队情形下
  **根本组不出来**，因为那些 profile 不在这台实例上。
* **发现 4。** §3.3 的记录里 `"host": null, // null = this machine; else a hostId`；D5 的答案是
  "**(b)，在 P4**"；§10 的 P4 那一格把 `browser-serve` 设备 op 与"§7.5 的 key 消费方那一半"写在
  **同一个单元格**里；而 §7.1 与 §7.5 都没有一句话限制 `cloak` / `cloud:*` 只能 `host: null`。
  §7.5 的规则全文是本机口吻（"供应商自己的 env 名只在 keeper 为那个 provider spawn 的那一个子进程
  的环境里出现"），§9 第 (ii) 条腿断言的是"子进程有、**它的父进程**没有"——一条只有在**同一个
  进程里**才做得出的断言。于是 §6.4 那句"provider 授权 key 活在服务端的注册表里"对一个远端 cloak
  profile 是假的。本轮选 (a)（拒绝）并把它写成能力格，因为 (b) 欠的三样东西今天一样都没有。
* **发现 5。** §3.3 第三条逐字："**层（tier）同样不是一个新字段**：它由 `provider` 推导……多存一份
  就是给自己造一个会漂移的孪生"，而 `siteHints` 是**同一个文件**的顶层键（schema 块在 `.md:676` /
  `.zh.md:577`）；§9 的 `test-browser-tier3` 逐字"（**没有**第二个 `tier` 字段，§3.3）"。两份 schema
  块也都还印着不带 `tier` 的旧形状 —— 所以读者看到的记录不是 §7.6 描述的那个记录。修法不是删掉
  §7.6 的字段：一条**建议**能说的恰恰只有"换一层"，那时还没有 provider 被选中，`backend` 是 `null`，
  而 `tier` 是这条主张唯一携带的内容。所以规则收窄成"`tier` 只在 `backend === null` 时合法"，门禁
  改成断言**这一句** —— 一个与被测设计自相矛盾的门禁，红的是门禁自己。
* **发现 6。** 那六个单元格逐字是"§7.1 的 `cloak` 行"/"`cloud:browserbase` 行"……两种语言完全一致；
  只有 `cloak` 那一行还额外点了 keeper。共享层 §14.2 的要求是"每个名字既是一个存在的文件，又真的
  调用 `resolveIntegration('<id>')`"，而它自己的例子就是文件路径
  （`consumers: ['src/channels/lark.js', 'src/channels/live/lark.js']`）。一个指向自己的名字既满足
  不了"存在"，也正好取消掉这个字段存在的理由。本 track 里真正调用 `resolveIntegration` 的只有两个
  模块，而 §3.6 的路由表里它们都已经有名字了（`src/server/browser-backend.js`、
  `src/server/browser-keeper.js`）。
* **发现 7。** §3.3 的 `provider` 现在合法值里有 `local-window`；§7.4 写着"backend 是 profile 的
  一个属性……切换就是改那个字段"，而它的机器是"版本阶梯、带着走的 seed、按租约重开标签页"——对一个
  §7.1 自己写着"什么都不启动"、"**没有** CDP"的 provider，这三样全都没有对象。§7.6 规矩 2 又说升到
  tier 3 是"一次带公告的用户动作"，也就是切换器会提供它。而一个 tier-3 目标的状态在用户自己的
  浏览器 profile 里，不在记录的 `dir` 里，于是 `fingerprintSeed`、`lastChromiumMajor` 与 §10 的 P5
  清扫（它们都作用在 `dir` 上）要么无意义、要么危险。§7.6 规矩 3 因此明写"升级不会重指一个已有
  profile"，而能力格把三个"否"写成 UI 读得到的字段。
* **发现 8。** 那个单元格逐字："我们**只**用 env，三条通道里唯一一条不落盘的"。进程内的 `licenseKey`
  选项同样不落盘，所以这个计数是错的；而本文档 §6.5 自己写着同一 uid 下的进程读得到
  `/proc/<pid>/environ`，§7.5 四条 bullet 之后又把同一句话重复了一遍 —— 于是这个理由既数错了数，
  又按本文档自己的威胁模型选了两条不落盘通道里弱的那条。真实的理由站得住并且更短：`cloakserve` 是
  一个**独立进程**（§7.2 的 Docker/loopback 形状），进程内那个选项在这里根本够不着。

**第八轮刻意没做的事。** 它没有启动浏览器（§12.1 的理由仍然成立），没有改动任何一条决定的**推荐
值**（D17 与 D32 的答案都没变 —— 变的是 D17 里那个数字的来源被修正、D32 多了一条明写的前置条件），
没有动任何一个阶段的轮数（P4 仍然是 10，**理由写在那一格里而不是留白**：本轮加的全是已经被算进那
一格的那几件事**内部**的子句，唯一真正新增的实现是一个 runner 内部的 helper），也没有软化"我没能
核实的东西"里的任何一条 —— 那份清单从 39 条长到了 41 条，而且其中一条（§12.40）被明写成 P4 第一批
动作里的一次**零代码**测量，因为一条具名拒绝的判据不该是我的猜测。
