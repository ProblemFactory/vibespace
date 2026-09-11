# 设计: Communication panel — Channels v2 的架构

> 中文版 — 与英文原稿 docs/design-communication-panel.md 同步于 921f61cb + 本次修订(r3: 接收模式与发送身份 · r4: 对 r3 的对抗式 review · r5: owner 对本地客户端库的更正 · r6: 对 r5 的对抗式 review · r7: 集成密钥与配置界面)；以英文版为准的只有代码标识符。

> **状态:** 架构提案, 无代码。**交互**设计已经定了(2026-08-21 的五张 artboard 记录
> 加上它的交互式画布), 本文不再翻案。本文决定的是: 每一块*住在哪里*、*扩展哪个既有
> 模块而不是分叉它*、*允许它花多少钱*、以及*用什么证明它能用*。
>
> **Owner brief:** "正式实现 communication panel, 初期先接入 lark 和 gmail, 复用
> 之前的 oauth client; 先根据我们之前讨论得到的那个 design 结果做架构设计, 给我
> 完整 review 之后再做."
>
> **r3(2026-09-10, owner 两条指示, 都改变了方向而不是修正笔误):**
> **(Q3)** adapter 在**两个轴**上互不相同, 接口必须把它们**建模**出来而不是抹平 ——
> 只读 vs 可发送(按会话、按身份), 以及同步 vs 异步接收(push / poll / scan)。Lark
> 能推送, 所以**推送是一等的接收模式**, 有它自己的活性与回落; r2 那句"v1 只轮询,
> WS 只当游标 kick"必须对着 owner 明确要的实时推送重新论证 —— 真的部分留下,
> 保守的部分改掉(§6.4)。
> **(Q4)** 发送身份的默认值是**以用户本人的身份发送、不加任何 "drafted by <agent>"
> 标记**, 在每一个允许这么做的 channel 上都是。r2 的决定 17("外部默认开启发送方诚实
> 行")被 **owner 推翻**; 取而代之的是 `identityMarking` 能力位驱动的**授权时刻的
> 警告**(§9.5)。
>
> **r4(2026-09-10, 对 r3 的对抗式 review —— 五条全部成立, 见 §18.1):** 一个事实被存在三
> 个地方而没有任何一个函数读得全, 于是 r3 新加的推送自动降级结构上赢不了 ⇒ `laneState`
> 成为唯一的通道解析器、`caps.pushExclusivity` 删除(§4、§6.4); `push.missRate` 补上计数
> 窗口与降级的撤回路径, 否则它是一个单向棘轮(§6.4); 决定 19 删掉的恰好是唯一有摄入契约
> 的那一格, 所以 `scanSource:'ui'` 现在自己有一份(§12.5); `convCaps` 拿到 TTL 与三个刷
> 新触发点, 其中一个是**批准那一刻**(§4、§9.2)。
>
> **r5(2026-09-10, 一条 owner 更正 —— 它改的是一个结论而不是一个细节):** WhatsApp
> Desktop 至少在 macOS 上把它本地库的至少一部分留成**未加密**的 —— owner 见过一个直接
> 读它的实现。于是 r4 那句"决定 19 把 `'store'` 对**两个**平台都排除掉了"对 WeChat 成立
> (密钥在进程内存里)、对 **macOS 上的 WhatsApp 不成立**(它根本没有加密), 而围栏 13 分
> 不开这两者, 是因为它从头到尾只说了自己拒绝什么。所以: 围栏 13 拿到一条**明确的边界**
> 与一条明确的允许(§3.13); `scanSource` 不再是标量, 换成按平台的 `caps.scanSources` 加
> 唯一的解析器 `scanState()`(§4、§12.5); macOS 拿到一条真的 `scanSource:'store'` 通道,
> 走一个 `channels-scan-store` 的 agentd op 且 `hostId` 是参数(§12.5、§6.3); 决定 19 从
> (b) 改成 (b)+(d); P6 拆成两条门控不同的腿(§19、§20、§18.2)。Linux 仍然只有
> web-in-profile 的界面扫描, Windows 仍然是 `'ui'`(它那份库**确实**是加密的), 而
> **WeChat 一个字都没变**。
>
> **r7(2026-09-11, 一条 owner 指示 —— 它新增了一整层而不是修一处):** "对于指纹浏览器和
> communication panel 这种可能需要配置自己的 key 的情况, 要考虑怎么提供配置界面, 让我们集群
> 里的用户可以自行配置(当然 lark 这种集群里能提供默认 oauth client 的就提供默认)"。于是新增
> **§14 集成密钥与配置界面** —— 一张 PURE 的 registry 表(`src/integration-registry.js`)、一个
> store(`src/server/integration-store.js`)、四条路由与一个 `'integrations'` 窗口, 优先级
> **用户自己的 > 集群默认 > 没有**, 而每一个消费者都问 `resolveIntegration` 绝不自己读
> `process.env`(§14.6 的常设普查)。它是一个**共享层**: 同一批名字也服务
> `docs/design-agent-browser-v2.md` 的 `cloak` / `cloud:<name>` 后端。连带改动: §13 的 token
> 存放只说一次并指向 §14(§14.11 第 8 条把两层的界限写死), `src/secret-box.js` 的抽取**从 P1
> 提前成 P0 的前置条件**并顺手不继承 `src/mounts.js:360-367` 那个会**铸新密钥覆盖旧密钥**的
> 裸 catch(§14.7), §12.1 拿到集群 redirect 的完整论证(§14.9: 一个应用服务 N 个实例**结构上
> 不是问题**, 真正的边界是**租户**), §12.2 把"加 scope 会让谁重新授权"说准并把决定 5 落成
> "多加一个预设 key", 阶段与轮次重算(§19), 决定 21–25 与未验证第 24–29 条。
>
> 先读: 交互记录(五张 artboard — Main / Adapters / AssignFilter / AgentReach /
> Outbox)、CLAUDE.md 的三层路由表、`docs/design-three-tier.md`、
> `docs/design-background-work.md` §7(权限与密钥)与 §12(owner 自动通知)、
> `docs/design-account-hardening.md` §4.4c(spend authorizer)。

---

## 0. 一段话概括

Channels v2 把**外部会话**(Lark、Gmail, 以后什么都行)接进一个已经会把消息投递进
agent 会话、已经为每一个没人打字的 turn 设了按凭据算的花钱上限、并且已经有一套只许放宽
(widening-only) 的 reachability ACL 的产品。所以这套架构主要是*组合*: 摄入侧一个新的
**会话存储**加一层薄薄的**adapter 接口**, 中间是一个 **PURE 的 filter / policy / ACL 内核**, 出向
到 agent 那一侧则是**既有的投递梯 (delivery ladder) 加 spend authorizer**。真正新的
机器很小而且都有名字: store、adapters、filter estimator、outbox 状态机, 以及 panel。
其余每一样都是对已经存在的东西的一次调用 —— 而每一处"分叉掉那个既有东西会更省事"
的地方, 下文都点名了那条说"别这么干"的事故。

---

## 1. 什么是定死的, 本文决定什么

**由交互记录定死 —— 本文不再打开:**

| # | 已定 | 对架构的后果 |
|---|---|---|
| ① | Adapter 只做**发送 / 接收 / 列会话**, 别的都不做。可见性、assign、filter 与审批策略全都建模**在 VibeSpace 里, 按会话**记 | Adapter 接口刻意做得极小; 策略状态从不住在 adapter 里, 所以换一个平台绝不会让你把规则重配一遍 |
| ① | 内部 agent 互聊是一个**内建、不可移除的 adapter**, 形状与外部的完全一样 | Channels v1(`msg-acl` + `conversation-deliver`)不被替换; 它变成其中一个 adapter 的实现 |
| ① | 连接状态是三值的: Connected / 需要重新授权(带倒计时) / Built-in | Store 为每个 adapter 保留一份诚实的 auth 状态, 含 `unknown` |
| ② | 侧栏 rail 一个入口带未读徽标; panel 按 adapter 分组; **assign / filter / review 以芯片形式画在行上**, 不藏进详情页; 一个会话以**窗口**打开, 带上下文条 | 一个新的 rail 项、一个新的窗口类型、一个新的 panel 渲染器。不新增任何 chrome 原语 |
| ③ | Assign 的目标 = 一个会话或整个分组; 接收方 = 一个 agent 或一个 agent 组(轮转)。模式 = 全部新消息 / 规则过滤。**规则编辑器显示实时命中量估计**("~4/day match vs 63/day total")。通知模式(唤醒 wake vs 摘要 digest)与回复权限(只能起草 vs 可以发送)是分开的, 而权限被 channel policy 封顶 | 这个 estimator 是一个建立在已存历史之上的一等 PURE 函数, 不是 UI 的小装饰 —— 每一次唤醒都是一个计费 turn |
| ④ | Agent reach **默认不可见**, 三态 visible / requestable / hidden, 按 agent 或 agent 组设; 有一条 request→approval, 而它**恰好放宽一条条目**。Invisible = 不存在(既列不出、搜不到, 也不能按 id 寻址) | 在 `msg-acl` 旁边多一套 ACL 词汇, 共享它的序关系与它的只许放宽律 |
| ⑤ | Agent 只能**提议**。策略按 channel 设(外部默认 review, 内部默认 direct)。护栏 (guardrail) 叠在上面: 所有出向一律审计, 链接/附件强制 review, 非工作时间强制 review。审批卡携带**为什么**, 可以就地编辑, **既出现在时间线里**也出现在中央 outbox 里, 并向 agent 回一份**结构化回执** `sent \| rejected \| edited` | 一个带显式状态机的 outbox store、一个 PURE 的策略判定, 以及一条本身绝不能变成计费隐患的回执通道 |

**由本文决定:** 模块落位与层级; store 格式及其不变量; **能力记录的两个轴**(只读 vs
可发送、push / poll / scan)以及它按会话的解析(§4); 摄入模型(**push 是一等的接收模式,
而 poll 是完备性机制** —— §6.4); 一次唤醒如何被授权与计费, 以及**推送的爆发在做唤醒
判定之前如何被合并**; **发送身份**以及"对面到底看见谁"这件事在哪里被说出来(§9.5);
outbox 如何让重复发送在结构上不可能; 客户端注册项; agent CLI 面; 测试 gate; 阶段计划。

**刻意推迟, 但缝已经留好:** 插件贡献的 adapter、跑在配对设备上的 adapter、富 HTML
邮件渲染、附件自动抓取、**本地客户端 adapter(WhatsApp / WeChat)—— 接口从 P0 起就把
它建模出来, 但 adapter 本身在 P6 且被一条 owner 决定门控**。每一项都有点名的落地处
(§15、§16)。

---

## 2. 每一块放在哪(路由表里的那一行)

CLAUDE.md 的路由表是"一个新改动该去哪"的法。这个功能横跨四行, 所以把映射一次写清:

| 部件 | 层级 | 文件 | 由谁把关 |
|---|---|---|---|
| 规则匹配 + 命中量估计器 | **PURE** | `src/channel-filter.js` | `test-channel-filter` (fast) |
| Reach ACL(三态、请求) | **PURE** | `src/channel-acl.js`(import `src/msg-acl.js` —— PURE 可以 import PURE) | `test-channel-acl` (fast) |
| 出向策略 + 护栏 + outbox 状态机 | **PURE** | `src/channel-policy.js` | `test-channel-outbox` (fast) |
| 归一化的消息记录 + 它的渲染器要的数据 | **PURE** | `src/channel-record.js` | `test-channel-record` (fast) |
| 能力判定(两个轴、按会话解析、身份警告、**通道解析 `laneState`**、**扫描来源解析 `scanState`**) | **PURE** | `src/channel-caps.js` | `test-channel-caps` (fast) |
| 集成凭据的那张表(行、字段、集群 env 名、Test 的声明、消费者) | **PURE** | `src/integration-registry.js` | `test-integration-registry` (fast) |
| 会话存储的*原语*(持久的 load/append/tail/trim/flush; 活索引归**引擎**所有, §5.1) | **SHARED**(只用 fs+path) | `src/channel-store.js` | `test-channel-store` (fast) |
| OAuth loopback 授权流(**双模**, §12.4) | **SHARED** | `src/oauth-loopback.js` | `test-oauth-loopback` (fast) |
| 落盘加密原语(一个原语, N 个密钥文件; §14.7) | **SHARED**(只用 fs+crypto) | `src/secret-box.js` | `test-secret-box`(fast, 与 mounts 的 parity) |
| Adapter 接口 + 注册表 | **ORCH** | `src/channels/index.js` | `test-channel-adapter-contract`(fast, 假 adapter) |
| Lark / Gmail / Agents adapter | **ORCH** | `src/channels/lark.js`、`gmail.js`、`agents.js` | 契约套件 + `test-channels-lark-shape`(fast, 录制的 fixture) |
| 摄入引擎(轮询调度、退避 (backoff)、每 tick 预算、故障出声) | **ORCH** | `src/server/channels-engine.js`(`create(deps)` 工厂) | `test-channels-engine` (heavy) |
| 推送通道(每个 vendor 一条; 活性、ack、独占度测量) | **ORCH** | `src/channels/live/<kind>.js` | `test-channels-push` (heavy) |
| 本地客户端库扫描(平台事实、TCC 授权、**只读打开**加从那条连接取的快照、按 rowid 游标读; SQLite 读者是一个**有界的 `sqlite3(1)` 子进程** —— 绝不是原生绑定, daemon 那唯一一个 `--external` 拒绝它; §12.5) | **SHARED**(daemon 打包)+ 一个 device op | `src/channels-store-scan.js` + `src/agentd/agentd.js` 的 `channels-scan-store` handler | `test-channels-store-scan` (heavy, 真 daemon) |
| 集成凭据的解析、遮蔽、广播 + 它的路由(§14.3、§14.4) | **ORCH** | `src/server/integration-store.js` + `src/routes/integrations.js` | `test-integration-registry`(fast)加那条 grep 普查 |
| 路由 + 广播 | **ORCH** | `src/routes/channels.js` | `test-restore-smoke` 里的路由弹幕、`test-channels-e2e` |
| 接线段落 | **ORCH** | `src/server/channels-wiring.js`, 由 `server.js` 调一次 | `test-architecture` 的尺寸棘轮 ratchet(server.js ≤ 2100 行 —— **今天正好顶格**, 见 §2.1) |
| Panel、窗口、filter 编辑器、审批卡 | **CLIENT** | `src/lib/channels-panel.js`、`src/lib/channel-window.js`、`src/lib/channel-filter-editor.js` | `test-channels-e2e`(heavy, headless chrome) |
| Integrations 窗口(卡片、来源芯片、Replace、Test、深链; §14.5) | **CLIENT** | `src/lib/integrations-panel.js` | `test-channels-e2e`(heavy, 含 375×667 那一腿) |
| Agent CLI | 纳入 git 的静态文件 | `data/bin/vibespace-channels` + `docs/agent/channels-manual.md` | `test-channels-agent-cli` (fast) |

有六条落位承重到值得写成规则:

- **Adapter 绝不碰 store、ACL、policy 或 spend guard。** 它返回带类型的记录, 接收一个
  发送请求。它能做的一切都在 §4 的接口里, 而**它没有声明的能力就是产品不会为它提供的
  能力**。这与 `src/backend-caps.js` 是同一条纪律: *按能力行门控, 绝不按 adapter id* ——
  并配一条 grep 普查, 断言没有任何调用点按名字分支。
- **引擎是 ORCH, 并且住在恰好一个 `create(deps)` 工厂里**, 在 `src/server/` 下, 与
  2.325 拆分以来的每一个子系统一样。`server.js` 只多一段接线, 别的什么都不多。
- **引擎同时是活索引的唯一所有者**(§5.1)。Store 模块提供持久原语, 并且**刻意不向任何
  人提供**"整份写回索引"的调用, 因为两个 adapter 轮询循环按设计就是重叠的, 而围绕一次
  原子写的 read-modify-write 并不是原子的。
- **"此刻在用哪条通道"只有一个回答处**(r4, §4)。声明(adapter 记录上的
  `push.claimedExclusive`)、测量(`push.state` / `push.missRate`)与观测(每会话的 `lane`)
  是三份不同的事实, 各自留在自己的位置; 但**把它们折成一个答案的只有 `laneState()`**, 优
  先级是**降级 > 活性 > 声明**。面板的芯片、围栏 12 的合并窗口、调度器的节奏, 三个消费者
  全部问它, 没有一个再去读 `caps.receive`。
- **能力有两个轴, 而且它不是一个全局布尔**(r3/Q3, §4)。一个 adapter *有可能*做到的事
  (`caps`, 静态、声明的)与它*在这一个会话上此刻*能做的事(`convCaps(convId)`, 解析出来
  的、三值的)是两个不同的事实: 授权用户在群里而 bot 不在、一个只读的共享邮箱、一个把
  你踢出去了的群 —— 三者都让一个声明了 `sendAs:['user']` 的 adapter 在**这一个**会话上
  发不出去。规则是: **只有两者都放行时那个控件才存在**, 而 `unknown` 渲染成"不提供 + 理
  由", 绝不渲染成"允许"。
- **一把集成密钥只有一个解析者, 而消费者永远不读 `process.env`**(§14.6)。
  `resolveIntegration(id)` 是唯一的那个回答处, 优先级是**用户自己的 > 集群默认 > 没有**; 集群
  默认**按 KEY 解析、绝不拷进落盘记录**, 于是集群轮换一次 env 就轮换了每一个实例的每一个消费
  者 —— 与 `src/mounts.js:2187-2188` 逐字同一条; 而 `source` 是**读的时候推导出来的、绝不落盘**,
  于是一条记录的两个面不可能互相矛盾。委托给那个既有读者的行必须点名它指的是哪一个 key
  (`prefer`), 因为那个读者自己的兜底在两个预设的列表上答 **null**(`src/mounts.js:2215`)。配一
  条常设 grep 普查, 它匹配的是 env **名字** —— `/VIBESPACE_INTEGRATIONS?\b\|VIBESPACE_INTEGRATION_/`
  出现在 store 之外 = 红 —— 文件集由 `git ls-files` 推导并由套件打印出来。

### 2.1 机械式注册清单(每漏一项就多一轮)

下面每一条都有一个会变红的套件在执法, 所以事先做比事后发现便宜:

- 新的顶层 `src/*.js` PURE 或 SHARED 模块必须加进 `scripts/test-architecture.mjs`
  里对应的层级集合(按路径的默认值只覆盖 `src/lib/`、`src/routes/`、`src/server/`);
- 每个新的 `scripts/test-*.mjs` 都需要在 `scripts/ci.mjs` 里有一行并带层级 ——
  断言这件事的那条普查跑在 `npm run build` 里面;
- 新的设置分类需要在 `SETTINGS_CATEGORIES` 里有它的条目(§10.1);
- 新的窗口种类是它所属模块里的一次 `registerWindowType` 调用 ——
  `scripts/test-window-types.mjs` 钉住确切的集合;
- 任何新的活会话 `_field` **先**是 `src/session-schema.js` 里的一行;
- 新的 agent CLI 要进 `HostManager.AGENT_TOOLS` 与 `AGENT_DOC_TOPICS`, 手册放在
  `docs/agent/` 下;
- 新的用户可见 chrome 字符串走 `t()` 并补 zh + ja 词条(i18n-check 在 build 里跑);
- 一个新的集成 = `src/integration-registry.js` 里**一行**, 外加它 `consumers` 里点名的那些
  文件**真的**调用 `resolveIntegration('<id>')` —— 两边都由 `test-integration-registry` 查
  (§14.2);
- 消费者要跑 OAuth 同意流程的行还要声明 `setup.callbackUrl`(它的**唯一**定义处 ——
  `src/oauth-loopback.js` import 它), 而只要声明了 `setup.prerequisites` 就必须有
  `test.caveat`; 缺任何一个普查都变红(§14.2);
- 任何新的 `VIBESPACE_*` env 名字都要有**恰好一个**解析者, 而集成那一批只许长在
  `src/server/integration-store.js` 里(§14.6);
- **那条尺寸棘轮今天已经顶格, 所以 P0 的接线段落哪怕只有一行也会把 `npm run build` 弄红
  (r6)。** 实测: `scripts/test-architecture.mjs:187-188` 判的是
  `read('server.js').split('\n').length <= 2100`, 而在本设计的基线提交上那个值**正好是
  2100**(`wc -l` 报 2099 —— 差一行是结尾换行, 而套件用的是 2100 那种算法) ⇒ 余量是**零**,
  不是一行。而这个 build 不是可选的: `npm run ci`(强制 pre-push 门)会 build,
  `scripts/update.sh:104` 的应用内"Update VibeSpace…"也会 build ⇒ P0 的**第一个** commit
  就会同时卡住发布门与每台实例的自更新。两条出路, 二选一并在**同一个 commit 里**做完:
  ① 按套件自己 183-185 行的注释**有意识地抬高预算**并在那个 commit 里解释为什么(它写的就
  是"If a legitimate wiring stanza pushes past the budget, raise it deliberately in the
  same commit that explains why"), 或 ② 先把一个既有的 stanza 抽进 `src/server/`。
  **先量再写**, 不要假设有余量 —— 现有的同类 stanza 分别是 1 行(`sysinfo-wiring`)、9 行
  (`incident-wiring`)与 14 行(`mounts-plugins-wiring`), 而 channels 还要挂它自己的 router。
  这件事按它实际的体量计价: 约 0.5 轮, 已计入 P0。

---

## 3. 硬围栏(每一条都是某个人的事故)

这些不是风格偏好。每一条都是本仓库已经在执法的一条法, 而每一条都有一个这个功能会把
它撞破的显然路径。

1. **§ban-safety 一动不动。** 这里没有任何东西会调用 Anthropic。
   `scripts/test-vendor-whitelist.mjs` 的作用域是 Anthropic, 所以 Lark 与 Gmail 的
   HTTP 不会绊到它 —— 而这恰恰是这个功能要自带**它自己的出网普查 (egress census)**
   `test-channels-egress` 的原因。它照那套套件自己的形状来写 —— 一张带理由的白名单
   (allowlist) —— 而**不是**写成一条绝对禁令:

   > 树里任何地方构造出来的每一个出向请求, 要么打向**由构造它的那个 adapter 声明的**
   > 主机模式(`src/channels/` 下的文件), 要么命中一条带**明确理由**的
   > `(file, host pattern)` **白名单**条目。死掉的白名单条目同样让套件变红。

   绝对形式 —— "并且树里没有任何别的文件构造出向请求" —— 会在**它第一次提交时就是红的**。
   `src/gmail-sync.js` 已经在构造 `oauth2.googleapis.com/token`、`gmail.readonly` 的
   scope URL 与 `gmail.googleapis.com/gmail/v1/users/me`, 而那正是
   `src/channels/gmail.js` 将要声明的东西; `src/mounts.js` 则持有 OneDrive 的
   Microsoft Graph base。**一道在合法的既有面上就会失败的强制 gate, 会被第一个撞上它
   的人放宽 —— 而一道被放宽的 gate 什么都保护不了。**因此这张白名单**出生即种下**那两
   个文件与它们的理由, 与 `test-vendor-whitelist` 里的 `ALLOW` 种下
   `src/usage-routes.js` 与 `src/server/cli-env.js` 完全一样, 包括那套套件的死条目检查
   ("仍然持有它被白名单放行的那次调用 —— 被移动/改名 ⇒ 更新白名单")。普查仍然会抓住
   它存在的理由: **第三个 vendor 主机在没有任何决定的情况下到来。**
2. **每一次唤醒都是钱。** 一个每天匹配 63 条消息的 filter 就是每天 63 个计费 turn。
   唯一可以开一个无人值守 turn 的东西是 `deliverToConversation`, 而它已经坐在
   `src/spend-authorizer.js` 后面。Channels 只加**一个**已声明的 `SPEND_REASON` 并把它
   传进去; 它**不**加第二份预算、第二个账本, 也不加第二条身份推导(§7.4)。它自己的
   per-assignment 上限是**节奏控制 (pacing)**; authorizer 才是**钱的界 (money bound)**
   —— 这正是那次七生产者审计要保住的区分。
3. **绝不阻塞事件循环 —— 并且要知道 "async" 的价钱。** 写下来的法是 CLAUDE.md 里那一
   条: *热路径上不许有同步 fs/exec; 只许子进程或 worker, 并且带超时*。有界的 **async**
   子进程在这里是被批准的, 而且到处都在用 —— `RemoteFs` 的 ssh-per-op、
   `src/cli-identity.js` 里的 `ps`/`lsof` 梯级、各种发现扫描。这个功能不许做的是
   **在一条被轮询的路径上按条目 spawn**, 因为 `child_process.spawn()` 会为 `fork()` 复
   制页表而阻塞调用线程, 时长与**父进程的 RSS** 成正比: 用一个在受控父 RSS 下 spawn 一
   个平凡子进程的小 harness 实测, 45 MB 时 1.8 ms/spawn, 543 MB 时 18.8 ms,
   **1.5 GB 时 72.5 ms**(事故 `inc-mtunmv3d-pmd6`, 2026-09-10; 证据文件是实例本地的,
   刻意不放进这个公开仓库)。这些服务器就坐在 1.5–2 GB, 所以哪怕一次 "async" 的
   `execFile` 也要花掉循环 ~70–130 ms, 而对 N 个做 `Promise.all` 就是一个 tick 里 N 次
   fork。一个每 tick 为每个聊天 shell 出去一次的轮询循环, 因此会让循环每分钟停顿好几秒。
   Adapter 用带超时的进程内 `fetch()`; 这在这里不是优化, 是要求。
4. **密钥走 env/文件, 绝不走 argv; 绝不记日志; 落盘加密。** Adapter 的 token 住在
   `data/channels/adapters.json`, 用一把实例本地的密钥加密, 而每一条会返回 adapter 记录
   的路由都要过一个 `publicView()` —— 就是 `src/server/opencode-access.js` 用来把 serve
   URL 与它的 auth 挡在浏览器之外的那个形状。
5. **外部正文是敌意输入。** 一条 Lark 消息正文与一份 Gmail 的 HTML part 都是对端可控的,
   而它们会同步到每一个客户端。v1 **只渲染纯文本**(§10.3): 任何路径上都不许把 vendor
   正文塞进 `innerHTML` —— 包括面向 agent 的注入, 它绝不能把一个形如
   `<system-reminder>` 的字符串带进 prompt(§7.5)。
6. **原子持久化 + 退出时 flush。** 索引与 outbox 走 `writeJsonAtomic`; 消息日志是只追加
   的 NDJSON; 每一个 store 都在 SIGINT/SIGTERM 时 flush。热路径上一次裸的
   `writeFileSync` 就是这个产品存在的意义所要幸存的那种静默数据丢失。
7. **缓存失效必须 NOTIFY。** 摄入管线只有一个入口点, 而它每一趟广播一次重新算出来的
   结果, 绝不按消息广播(§10.4)。
8. **不许静默失败。** 连续失败 N 次的轮询必须到达用户: adapter 那一行变琥珀色, 同时归
   档一条 "For you" 条目 —— 并且在 adapter 恢复时由**同一个生产者撤回**, 因为一条已经
   发出去的条目是一个断言, 而发它的人必须撤回它(login-expiry 的教训)。
9. **固定窗口不是游标。** 运维笔记记录过一个真实的 ops 群一天产出 300+ 条消息, 而固定
   大小的抓取窗口恰恰在那一天静默丢了消息。摄入要一直翻页直到抵达已存的 anchor, 而
   anchor **只在一趟完整的 pass 之后**才前进(Gmail-sync 的法: 一个死 id 不许把游标冻住,
   而一趟不完整的 pass 不许让它前进)。
10. **不可见 = 不存在。** 没有存在性 oracle: 一个 agent 问一个它看不见的会话, 得到的答
    案与问一个根本不存在的会话完全一样。这是 `vibespace-msg` 的统一错误规则, 套用到
    channels 上。
11. **一次 ack 是一个承诺, 所以要在持久化之后 ack, 绝不在处理完之后 ack。**(r3/Q3)
    Lark 的事件投递要求订阅方在 **3 秒**内以 HTTP 200 应答, 而它是 **at-least-once**:
    没按时应答会按 15 秒 / 5 分钟 / 1 小时 / 6 小时重投, **最多 4 次**, 而且即使成功
    也可能收到重复。我们这一侧的处理(store 追加 → filter → spend 授权 → 投递)完全可
    以超过 3 秒。所以推送通道的顺序被钉死: 记录先落进那份只追加的持久日志(§5 不变量
    4 本来就是这个顺序), **然后** ack, **然后**异步跑 filter 与唤醒。在持久化**之前**
    ack 会把 vendor 的 at-least-once 悄悄降级成我们自己的 at-most-once —— 而那是一次
    看不见的丢消息。重复由 §5 不变量 2 按**消息 id** 吸收, 所以"同一条消息推送来一次、
    轮询又来一次"塌成一条; 事件层面的重放则按事件自己的 `event_id` 去重。
12. **每一种接收模式走的是同一条唤醒路径; 唯一的区别是到达时刻。**(r3/Q3) 一条推送
    来的消息与一条轮询来的消息, 命中的是同一个 filter、问的是同一个 spend authorizer、
    受同一个 per-assignment 节奏上限约束。但有一件事必须被显式补回来: **合并
    (coalescing) 曾经是轮询的一个副产品** —— 一趟 pass 把一分钟里的 30 条消息一次性交
    给 filter, 于是它们天然是一次唤醒。推送把这个副产品拿掉了, 30 条消息就是 30 次投
    递。所以当 `laneState(…).carryContent` 为真且 `notify: 'wake'` 时, 引擎在做唤醒判定
    **之前**加一个合并窗口(默认 60 秒), 让一次爆发仍然是一次唤醒。把这条忘掉, 就是"打
    开实时推送"这个动作本身把某个会话的账单乘以 30。门控**刻意不是** `caps.receive ===
    'push'`(r4): kick 模式下记录是轮询取回来的, 而轮询一趟本来就已经合并过了 —— 在那里
    也开这个窗口, 就是白买 60 秒延迟。
13. **绝不读另一个进程的内存, 绝不复原一把 vendor 扣住的密钥, 也绝不在没有一次点名的
    确认的前提下发布一个传输方式被平台条款禁止的 adapter。**(r3/Q3(b); r5 补第二条与那
    条边界)这条对本地客户端那一类 adapter 是承重的, 而它**必须能对某些东西说"可以"**,
    否则它就不是一道围栏而是一条禁令。它拒绝三样东西:
    (a) **另一个进程的内存。** WeChat 桌面端的本地库是 SQLCipher/WCDB 加密的, 而那把密
    钥只存在于**正在运行的客户端进程的内存里** —— 每一个公开工具都是从那里把它抠出来
    的。读别人的进程内存与读一个文件不是同一类行为, 本产品不做。
    (b) **复原一把 vendor 明确扣住的密钥。** Windows 上的 WhatsApp Desktop 把它的
    SQLite 库加密了: UWP 那一支用 SQLite Encryption Extension(SEE), dbKey 由一个在应用
    之外**取不到**的机器唯一标识派生, 公开做法是绕开那个 API 把它重新算出来; WebView2
    那一支的各类密钥用 DPAPI-NG 保护。把一把被有意扣住的密钥重新算出来, 与从内存里抠出
    它是**同一件事的两种手法**, 所以落在同一条拒绝里。
    (c) **一个被平台条款禁止的传输方式**, 除非有一次点名说出风险的确认。WhatsApp 那一
    侧的协议库(whatsmeow / Baileys)是逆向出来的非官方客户端, 而非官方客户端被 WhatsApp
    的条款明确禁止, 封号确实落在过低流量、只回复的正常使用上。所以这类 adapter 携带一个
    `tosRisk` 能力位, 默认不提供(决定 19)。
    **而它不拒绝这一样: 一个客户端自己留在磁盘上、没有加密的文件。** WhatsApp 在 macOS
    上把整份聊天历史留在一个未加密的 SQLite 库里(§12.5), 读它是一次普通的、只读的文件
    读取: 没有任何人的秘密被击穿, 因为**根本没有秘密**; 把关的仍然是操作系统自己的权限
    系统(macOS 的 TCC / 完全磁盘访问), 而被拒绝时它必须以一个**具名**的拒绝到达用户。
    这条边界的判据一句话: **我们在击穿谁的秘密?** 答案是"没有人"时它是一次文件读取, 答
    案是"那个客户端的"时 —— 无论那把密钥在内存里还是在一个被藏起来的 API 后面 —— 它是
    这条围栏拒绝的事。

---

## 4. Adapter 接口

一个 adapter 由一个接收 `(record, deps)` 的工厂造出来。它**对策略是无状态的**, 只拥有
恰好三样东西: vendor 认证、vendor 分页, 以及 vendor 的消息形状。

**它在两个轴上与别的 adapter 不同, 而这两个轴是被建模出来的、不是被抹平的**(r3/Q3):
一个是**只读 vs 可发送**(而且是按会话、按身份 —— 用户身份还是 bot 身份), 一个是
**接收是同步还是异步**(push / poll / scan)。两个轴都住在 `caps` 里, 而第一个轴还有一
个按会话的解析器 `convCaps`, 因为"这个 adapter 能发消息"与"这个 adapter 能往**这一个**
会话发消息"是两个不同的主张。

```js
// src/channels/<kind>.js  →  module.exports = { kind, caps, create }
{
  kind: 'lark',                       // registry key; never branched on downstream

  caps: {
    // ——— axis 1: HOW MESSAGES ARRIVE ———————————————————————————————
    receive:        'push',           // 'push' | 'poll' | 'scan'  — the BEST lane it has
    pushTransport:  'ws-long-conn',   // 'ws-long-conn' | 'pubsub-pull' | 'webhook' | null
                                      // exclusivity is NOT here: it is a per-DEPLOYMENT
                                      // configuration fact, so it lives on the adapter RECORD
                                      // (push.claimedExclusive) and only laneState() resolves it
    pushAckBudgetMs: 3000,            // vendor's own deadline; we ack after DURABILITY (fence 11)
    pollInterval:   { hot: 30, cold: 300, floor: 10 },   // seconds; `floor` is the VENDOR's
    scanSources:    null,             // { darwin|win32|linux : 'store'|'ui' }  — only when
                                      // receive === 'scan'. A per-PLATFORM UPPER BOUND, because
                                      // one client is a readable store on one OS and a scraped
                                      // screen on another; only scanState() resolves it (r5)
    scanLatency:    null,             // { store: 15, ui: 300 }  seconds, per SOURCE — an order
                                      // of magnitude apart. This is the DECLARED cadence and it
                                      // is also the CEILING the fs.watch kick is debounced to,
                                      // never a label (r6, §6.4); the row draws the OBSERVED age
    history:        'page',           // 'page'|'since'|'none' — the scalar, for push/poll
    historyBySource: null,            // { store:'since', ui:'page' } — ONLY when receive==='scan'.
                                      // r6: `history` is a per-SOURCE fact for exactly the reason
                                      // `scanSources` is one — ONE adapter reads a store on one OS
                                      // and scrapes a screen on another, and a DOM scrape cannot
                                      // honour since-anchor semantics while declaring 'page' would
                                      // delete the real anchor that is WHY 'store' is preferred.
                                      // Only scanState() resolves it, and it returns the answer
    listConversations: true,

    // ——— axis 2: WHAT MAY BE SENT, AND AS WHOM ——————————————————————
    sendAs:         [],               // subset of ['user','bot'];  []  =  READ-ONLY adapter
    identityMarking:'unknown',        // 'none' | 'marked' | 'unknown'  — what the RECIPIENT sees
    identityMarkingWhere: null,       // 'recipient-ui' | 'raw-headers' | null
    identityMarkingText: null,        // ONE sentence, shown VERBATIM in the approval card (§9.5)
    tosRisk:        'none',           // 'none' | 'stated' | 'prohibited'  (fence 13)
    idempotency:    'key',            // 'key' | 'two-phase' | 'none'   (§9.4)
    threading:      'reply-to',       // 'reply-to' | 'thread-id' | 'none'
    editSent:       false,
    readReceipts:   false,
    attachments:    'metadata',       // 'metadata' | 'fetch' | 'none'
  },

  // 它吃 resolveIntegration(id) 作为输入 —— 见 §13 与 §14.3。'needs-credentials' 说的是
  // "你的授权没问题, 但这个 adapter 底下的应用凭据现在不在了"
  async auth.state()   -> { state:'connected'|'needs-reauth'|'needs-credentials'|'unknown',
                            expiresAt, scopes, why }
  async auth.begin()   -> { consentUrl, flowId }             // via src/oauth-loopback.js
  async auth.finish(flowId, code) -> { ok, record }

  async listConversations({ cursor, limit })
        -> { conversations: [ChannelConversation], cursor, complete }

  // axis 1 resolved for ONE conversation — three-valued, cached in the index with its age.
  // The cache has a TTL (6 h) and three refresh triggers; past the TTL it resolves to
  // read:'unknown' / sendAs:[] / why:'stale'  —  see below, this is NOT a cache-forever
  async convCaps(convId)
        -> { read:'yes'|'no'|'unknown',
             sendAs: [...],                       // SUBSET of caps.sendAs that holds HERE
             why: 'not-a-member'|'bot-not-in-chat'|'read-only-mailbox'|'left-group'|'stale'|null,
             at }

  async history(convId, { anchor, limit })
        -> { records: [ChannelRecord], anchor, reachedAnchor, complete }

  async send(convId, { text, replyTo, idemKey, as })         // `as` ∈ convCaps.sendAs
        -> { ok, vendorMessageId, at, sentAs } | { ok:false, code, retryable, detail }

  async reconcile(convId, { idemKey, sentAt })               // §9.4, unknown outcomes only
        -> { landed:true, vendorMessageId } | { landed:false } | { unknown:true }

  async fetchAttachment(convId, recordId, attId, { maxBytes })   // caps.attachments==='fetch'
        -> { path, bytes, mime } | { ok:false, code }

  // present ONLY when caps.receive === 'push' — src/channels/live/<kind>.js (§6.4)
  live.start({ onEvent, onState })  ->  { stop() }

  // present ONLY when caps.receive === 'scan' — facts about THIS machine, so it is answered
  // by the agentd op, hostId a PARAMETER and the local box is device #0 (§12.5).
  // `at` is stamped HERE and READ by scanState() against a 6 h TTL (r6): these are stored
  // derived facts from a round trip, so they take §5 invariant 7's TTL treatment rather than
  // an exemption — a frozen answer keeps drawing "15 s" over a lane that fails every pass
  async scanHost(hostId)
        -> { platform:'darwin'|'win32'|'linux', clientInstalled, storePath,
             grant:'granted'|'needed'|'denied'|'unpromptable', why, at }
}
```

`src/channel-caps.js`(PURE)是**唯一**回答"这个控件到底存不存在"的地方:

```js
laneState(caps, adapterRecord, convEntry, now)          // r4 新增 —— 下面说为什么
      -> { via:         'push'|'poll'|'scan',   // 此刻真正在承载这个会话的通道
           carryContent: boolean,               // 推送通道现在可以携带内容, 还是只能 kick 一下游标
           live:         boolean,               // 只认正面证据: socket 连着 **且** 心跳窗口内收到过东西
           pollCadence:  'fast'|'reconcile',
           why:          'exclusive'|'kick-shared'|'kick-unknown'|'demoted'|'push-dead'|'poll'|'scan' }
offers(caps, convCaps, what)   // what ∈ 'send-as-user'|'send-as-bot'|'fetch-attachment'|…
      -> { offered: boolean, why: string|null }      // 'unknown' ⇒ offered:false, why 说明
identityWarning(caps)          -> { level:'none'|'warn', text }        // §9.5
scanState(caps, adapterRecord, hostFacts, now)          // r5 —— 与 laneState 同一个形状
      -> { via:          'scan',              // r6: 判别字段。laneState 就是用 `via` 回答的,
                                              //     于是下面这个 union 是显式的, 而不是靠
                                              //     "碰巧有哪些键"去嗅探出来的
           source:       'store'|'ui'|null,   // 这条会话此刻实际走的来源
           history:      'since'|'page'|null, // r6: caps.historyBySource[source], 解析后的值
           carryContent: false,               // r6: 一次 scan pass 就是一批, 与 poll 同理(§6.4)
           why, latencySeconds, storePath, grant, hostFactsAgeSeconds }
      // `now` 是承重的(r6): 距 hostFacts.at 超过 HOST_FACTS_TTL(6 小时)就答
      // source:null / why:'host-facts-stale' —— 见 §5 不变量 7
freshnessClaim(caps, laneOrScan, convEntry, now)        // r6: 加宽了, 见下面那条规则
      -> { kind:'live'|'within'|'scanned', seconds, text }
      // laneOrScan = laneState() 或 scanState() 的返回值, 按 `via` 判别
```

`laneState` 是 **r4 加的**, 而它修的是一个结构性缺陷: "此刻在用哪条通道、它活着吗、它
可以携带内容吗"这**同一个事实**原本散在三个地方 —— `caps.pushExclusivity`(静态、按 adapter
**种类**声明)、adapter 记录上的 `push {claimedExclusive, state, demotedAt}`, 以及每会话
索引里的 `lane {via, lastPushAt}` —— 而 §6.4 只写了前两个"一起决定这件事", 没写谁压过
谁; 更糟的是, 本节把 `src/channel-caps.js` 称作那个**唯一**的回答处, 而它导出的三个函数
没有一个接 adapter 记录 —— 也就是说它们**根本读不到** `push.state` /
`push.claimedExclusive` / `push.demotedAt`。后果有三条, 每一条都是这份文档自己点名过的事故形状:

1. **§6.4 的自动降级结构上赢不了。** 降级把 `demotedAt` / `demotedWhy` 写在**记录**上,
   而"携带内容还是只做 kick"却被归给 `caps.pushExclusivity` —— 一条已经被降级的通道会
   继续携带内容, 而 adapter 行同时在说它已经降级了。
2. **新鲜度芯片会谎报 `live`。** 芯片画在 `caps.receive === 'push'` 上, 而那是一条静态声
   明; §6.4 自己引用的 `opencode-events` 轮 4 教训恰恰就是"一条谎报 `active` 的通道比没有
   通道更糟, 因为它把回落关掉了"。
3. **围栏 12 的合并窗口在 kick 模式下照样跑。** 它也门控在 `caps.receive === 'push'` 上,
   而 kick 模式里记录本来就是轮询取回来的、本来就已经被合并过了 —— 白买 60 秒延迟。

所以 `caps.pushExclusivity` **删除**: 独占度是一个**按部署**的配置事实(§6.4 自己就是这么
写的), 而 `caps` 按定义是按 adapter **种类**的静态声明(§2), 一个部署事实不该住在那里。
`caps.pushTransport` 留着 —— 它是真正静态的。取而代之的是**一个解析器一个答案**, 优先级
写死并且写下来:

> **降级 > 活性 > 声明。** 已降级 ⇒ `carryContent:false`(只有做出声明的那一方主动撤回
> 降级才能恢复, §6.4); 没降级但通道不 `live` ⇒ `carryContent:false` 且 `pollCadence:'fast'`;
> 两关都过了才轮到 `push.claimedExclusive`。**`unknown` 一律 `carryContent:false`** —— r2 的行为
> 仍然是默认值。

"这个事实只允许一个生产者声明"是 CLAUDE.md 写下来的法则(*两个函数回答同一个问题就说
明其中一个是错的*), 而它在这里的形态就是: 三个存储位可以各自保留(声明、测量、观测都是
不同的事实), 但**回答只能有一个**。

**`scanState`(r5)是同一条法则用在另一条通道上。** 一个扫描来源同样是三个事实 —— 按平
台的静态声明 `caps.scanSources`、对那台机器的观测, 以及用户自己在连接向导里做的选择 ——
而 §12.5 展示了把它们随手折在一起会发生什么: r4 因为一个词("那份库读不出来")同时代表两
种完全不同的处境, 就得出了"整整一格被排除掉了"的结论。所以它拿到自己的解析器、自己写死
的优先级, 以及同一条"没有任何消费者去读那份原始声明"的规则。

四个消费者读同一条记录, 各读各的那一面 —— 而**每一个跟"通道"有关的判定都经过
`laneState`(在扫描通道上则是 `scanState`), 没有一个再去读 `caps.receive` 或
`caps.scanSources`**:

- **Panel** 用 `freshnessClaim(caps, laneState(…), convEntry, now)` 画每一行的新鲜度芯片
  —— 扫描通道上则是用 `scanState(…)`(这个 union 按 `via` 判别, §4), 那个芯片上"秒还是分钟"的数字就是从这里来的(**活着的、
  携带内容的**推送 = "live"、轮询 = "≤ 30 s"、扫描 = "上次扫描在 <t> 之前" —— **一个扫描
  源的延迟就画在会话行上**, 因为那是用户在决定要不要把一件事交给它时唯一需要知道的数
  字)。一条降级了或者不 `live` 的推送通道画的是它**实际**在走的那条道, 绝不是它声明过的
  那条。它还用 `offers()` 决定 composer 与审批卡上的发送控件存不存在, 用
  `identityWarning` 决定审批卡上那条警告(§9.5)。
- **摄入引擎**(§6.2 的调度器)用 `laneState(…).pollCadence` 决定这一 tick 的轮询节奏,
  用 `laneState(…).carryContent` 决定推送事件是走"归一化 → 追加"还是只 kick 一下游标 ——
  也就是围栏 12 那个合并窗口的门(§6.1、§6.4)。
- **Filter / assignment 引擎**用 `offers()` 把 `authority:'send'` 变成**不可选**(一个永
  远发不出去的 assignment 是一句谎话, §7.3), 并用 `freshnessClaim` 在 AssignFilter 面板
  上如实说出"这个 agent 大约多久之后会被叫醒"。
- **Spend authorizer** 什么都不读 —— 而这正是重点。接收模式**不改变**钱的判定: 同一个
  filter、同一个理由、同一个按凭据槽的上限。它改变的只有到达时刻, 而那件事由围栏 12 的
  合并窗口吸收。套件把这句话变成一条可以变红的断言(§17 的 `test-channels-lane-parity`)。

契约套件(`test-channel-adapter-contract`, 驱动一个**假 adapter** 外加每一个注册在案的
真 adapter 以 shape-only 模式跑)执法的规则:

- 声明了的能力必须有实现, 而未声明的能力必须**抛异常**而不是半吊子地只能用一半;
- `history()` 绝不返回调用方没要的记录, 诚实地报告 `reachedAnchor`, 并且自己绝不推进任何
  东西 —— 游标归 store 所有;
- 每一个失败都是来自一个封闭集合的**带类型的** `{ code, retryable }`
  (`auth-expired`、`rate-limited`、`not-found`、`forbidden`、`transport`、
  `vendor-error`、`too-large`)。从一个 adapter 里裸 `throw` 出来就是套件失败, 因为
  "优雅降级"的 catch 正是这个仓库一次又一次藏起自己 bug 的方式;
- **`src/channels/` 之外的任何调用点都不许按 `kind` 分支** —— 一条 grep 推导出来的普查,
  与 `backend-caps` 那条同一个形状;
- **`convCaps()` 绝不比 `caps` 更宽**: 它返回的 `sendAs` 必须是 `caps.sendAs` 的子集,
  而套件用一个故意越界的合成 adapter 把这一条钉住。方向是承重的 —— 静态声明是上界, 按
  会话的解析只能收窄, 于是"这个平台我们从来没验证过能发送"永远不可能被某一个会话的乐观
  回答绕过去;
- **`sendAs: []` 的 adapter 上, `send()` 与 `reply` 都不是"失败", 而是"不存在"**: 它们
  返回带类型的 `send-not-available` 加上 `caps` 自己说的理由, 而 outbox **根本不为它创
  建 proposal**。一条永远发不出去的 proposal, 会让用户去批准一件随后必然失败的事。
- **`convCaps` 是一份带 TTL 的缓存, 不是一份存下来的事实**(r4)。TTL 默认 **6 小时**,
  刷新触发点恰好三个: ①用户把一个会话标成 tracked 时; ②TTL 过期之后面板的第一次渲染;
  ③**审批的那一刻、发送之前, 无条件刷一次** —— 那是唯一一个"判断错了要付出一条真消息"
  的时刻。过了 TTL 的条目解析成 `read:'unknown'` / `sendAs: []` / `why:'stale'`, 而
  `offers()` 现有的规则(`unknown` ⇒ 不提供 + 说出理由)已经把这个降级渲染好了, 所以它
  不需要任何新词汇。**理由是 §5 不变量 7**: 一个派生值不许变成一份存下来的事实, 而
  `convCaps` 与 `unread` / `hits7d` 不同 —— 它是一次 vendor 往返的结果, 本地**重新推导
  不出来**, 所以它欠的不是"随时可重算", 而是一个 TTL 加一个诚实的降级。少了这一条, 一
  个星期前缓存下来的 `sendAs:['user']`(而用户此后已经退了那个群 —— `why:'left-group'`
  本来就在枚举里, 说明这个状态是被预期到的)会照样画出 composer 控件、照样让 assignment
  被建出来, 于是**恰好造出**上一条禁止的那种 proposal。
- **`receive: 'scan'` 的 adapter 不许声明 `history: 'none'`**(r4, §12.5)。§5 不变量 4
  要求"完整的一趟"才允许推进 anchor、`complete:false` 意味着"别推进", 而一个连翻页调用
  都没有的 adapter 报不出这两件事里的任何一件; 而按本节的第一条规则, 没声明的能力是要
  **抛异常**的, 于是 §6.3 那句"翻到已存的 anchor 为止"在它身上根本不可能发生。合成
  adapter 声明 `receive:'scan'` + `history:'none'` 必须让契约套件变红。
- **`scanState()` 的答案永远不宽于 `caps.scanSources` 声明的那一格**(r5, §12.5)。它与
  `convCaps ⊆ caps` 是同一个方向、同一条理由: 静态声明是**上界**, 而"这台机器上有什
  么"这次解析只许**收窄**(声明 `'store'` 的平台上可以答 `'ui'` 或 `null`, 声明
  `'ui'` 的平台上**绝不可以**答 `'store'`)—— 否则一句"这个平台我们从来没验证过读得
  出那份库"就能被一次乐观的运行时探测绕过去。同一条规则的两半各欠一条腿: 一个在
  `linux` 上答 `'store'` 的合成 adapter 必须变红, 而一个在 `darwin` 上**授权已拿到**时
  仍然答 `'ui'` 的解析器同样必须变红 —— 一个永远收窄到底的解析器与一个永远说 `unknown`
  的 `convCaps` 是同一种缺陷。
- **`scan` 通道上被拒绝的读取解析成 `source:null` 加一个理由, 绝不解析成 `'ui'`**
  (r5)。自动降级会在不说一声的情况下把会话行上那个延迟数字从秒改成分钟, 而那个数字是
  这一类全部的诚实性契约(§12.5); 落回 `'ui'` 只能是用户在连接向导里做的一次选择
  (`why:'user-chose-ui'`)。
- **`receive:'scan'` 上, `historyBySource` 里的每个值都不许是 `'none'`, 而且这张表的键
  必须盖住 `scanSources` 里点名的每一个来源**(r6)。上一条规则(`scan` 不许
  `history:'none'`)以前是写在一个按**种类**的标量上的, 而 r5 自己刚刚证明这一类**一个
  adapter 会同时跑两格**: 同一个 WhatsApp 模块在 macOS 上读库、在 Linux 上刮界面。于是
  那个标量无论填什么都是错的 —— 填 `'since'`, Linux 那格就被要求用一次 DOM 刮取去兑现
  since-anchor 语义; 填 `'page'`, 就把"真 anchor ⇒ `history:'since'`"这件事删掉了, 而
  那正是决定 19 与 §5 不变量 2 给出的、`'store'` 之所以被优先的**全部**理由。所以
  `history` 在 scan adapter 上换成按来源的上界表, 由 `scanState()` 连同 `source` 一起
  解析出来。这条规则的负控与上面那条并排放: 一个 `scanSources` 声明了某个来源、
  `historyBySource` 里却没有那一格的 scan adapter 必须变红。
- **`scan.hostFacts` 是第二个具名例外, 它按同样的价钱买单**(r6, §5 不变量 7)。平台、
  客户端在不在、库路径、读取授权 —— 这些全都是一次(可能还是跨机器的)`channels-scan-store`
  往返的结果, 本地重新推导不出来, 这正是 `convCaps` 当初拿到具名例外的那条性质。于是它
  拿到的同样不是豁免而是: **6 小时 TTL**、三个具名刷新触发点(① 用户在连接向导里选来源
  时 ② TTL 过期后的第一次面板渲染 ③ 每一趟会推进 anchor 的扫描**之前**无条件刷一次 ——
  这是"审批时重新解析"在库这一侧的对应物), 以及过了 TTL 的降级 `source:null` /
  `why:'host-facts-stale'`, 由与其它"不提供并说出理由"完全相同的那条路渲染。
  **`grant` 从来不跨一趟被信任**: macOS 的 TCC 授权在系统设置里随时可以被撤销, 而决定
  19(d) 记下的那次提示本身就是"按进程实例的、临时的", 所以一个存下来的 `granted` 是一
  个**按构造会过期**的主张 —— op 自己的 `EPERM` 才是权威, 一次答成 `EPERM` 的
  `granted` 立刻重新归档成 `tcc-denied` 并把存下来的授权清掉。`grantAskedAt` 有它自己
  的读者: "同一台机器上不要在 N 之内重复弹提示"这条规则 —— 没有读者的字段在本仓就是
  "这个修复从来没被接上线"。
- **`freshnessClaim` 拿得到它要说的那两个数**(r6)。它返回 `seconds` 并且要说出"上次扫描
  是 <t> 之前" —— 那是一个**年龄** —— 可它的签名里既没有时钟, 也没有 `caps`(而 poll 那
  一档要渲染的"≤ 30 s"就住在 `caps.pollInterval.hot` 里, 选 30 还是 300 的那个冷热事实
  同样没传进来)。本仓每一个同辈解析器都收 `now`(`laneState` / `scanState`, 以及
  `quota-model` 的 `nowSec`、`decideLagShadow` 的 `now`), 这一个没有理由例外。而 r5 之后
  它的第一个参数还成了两种**不相交**形状的 union(`laneState()` 的答案带 `via`,
  `scanState()` 的答案只带 `source`), 于是调用方只能靠"碰巧有哪些键"去嗅探 —— 所以
  `scanState()` 现在也答 `via:'scan'`, 判别写在明面上。签名收为
  `freshnessClaim(caps, laneOrScan, convEntry, now)`。

`ChannelRecord`(PURE, `src/channel-record.js`)是那唯一一份归一化形状:

```
{ id, convId, adapterId, vendorId, at,
  author:      { id, name, isSelf, isBot },
  text,                        // ALWAYS plain text — the only thing rendered in v1
  mentions:    [{ id, name }], // resolved names, never raw @_user_N placeholders
  attachments: [{ id, name, bytes, mime }],
  replyTo, threadKey,
  raw:         { …bounded, adapter-specific, never rendered } }
```

有一条归一化细节是强制的而不是锦上添花: Lark 的消息载荷携带 `@_user_N` 占位符, 而它们
是**每条消息内的序号, 不是身份** —— 把它们对着该消息自己的 `mentions` 数组解析出来是
adapter 的活, 而这件事做错一次就已经在运维工具里把一条消息归给了错的人。record 套件把它
钉住。

---

## 5. 会话存储

`data/channels/` —— 一个目录, 四种文件:

```
data/channels/
  adapters.json                 atomic JSON. id, kind, label, enabled, inclusion scope,
                                auth {tokenEnc, expiresAt, scopes}, lastPass {at, ok, code},
                                consecutiveFailures,
                                push {enabled, claimedExclusive, state, lastEventAt,
                                      missRate, demotedAt, demotedWhy}    // §6.4
                                scan {hostId, chosenSource, grantAskedAt,
                                      hostFacts {platform, clientInstalled, storePath,
                                                 grant, at}}
                                                                          // §12.5: the CHOICE and
                                                                          // the OBSERVATION; only
                                                                          // scanState() folds them.
                                                                          // r6: the OBSERVATION half
                                                                          // is a stored derived fact,
                                                                          // so invariant 7 gives it a
                                                                          // 6 h TTL, three refresh
                                                                          // triggers and a named
                                                                          // degrade. `grant` moved
                                                                          // INSIDE hostFacts: it
                                                                          // expires with them and is
                                                                          // never trusted across a
                                                                          // pass (the op's own EPERM
                                                                          // is the authority).
                                                                          // `grantAskedAt` is read by
                                                                          // the don't-re-prompt rule
  index.json                    atomic JSON, ONE in-process owner (§5.1). Per conversation:
                                id, adapterId, vendorId, title, kind (dm|group|thread),
                                participants summary, lastAt, unread, tracked, anchor,
                                assignment, filterId, policy, pendingTodoId, reachEntries[],
                                stats {hits7d, msgs7d},
                                convCaps {read, sendAs[], why, at}        // §4: cached WITH its age,
                                                                         //     TTL 6 h, then 'stale'
                                lane    {via:'push'|'poll'|'scan', lastPushAt, lastPollAt,
                                         lastScanAt, firstSeenByPoll, firstSeenTotal}  // §6.4
  msgs/<adapterId>/<convId>.ndjson   APPEND-ONLY message log, one ChannelRecord per line
  outbox.json                   atomic JSON. Proposals + their state machine (§9)
  audit.ndjson                  APPEND-ONLY. Every outbound attempt and every ACL change
  files/<adapterId>/<convId>/   downloaded attachments (explicit action only)
  .channels-key                 0600 instance-local key for token encryption
```

不变量, 每一条都带它的理由:

1. **追加是 O(1)。** 消息日志用 NDJSON, 是因为每来一条消息就重写一遍 JSON 数组会把一个
   活跃的群变成一个 I/O 问题。而索引 —— 小, 并且每次渲染都要读 —— 保持为原子 JSON。
2. **按 `(adapterId, convId, vendorId)` 去重**, 以每个打开的会话一份有界的内存集合持有,
   需要时从日志尾部重建。一次被重放的分页(Lark 的 anchor 语义在边界处保证会发生, 而
   Gmail 的 history 重放也会产生)必须是 no-op, 绝不能变成一条重复。**`vendorId` 是必需
   的**, 而当一个 adapter 抓的是一块屏幕、客户端又没有暴露一个稳定的消息 id 时, 它必须
   **声明一把合成键**并把"这是合成的"标出来(§12.5 的 `'ui'` 那一格) —— 这条不变量要的是
   一把键, 不是一把 vendor 给的键; 但一把**没说自己是合成的**键, 会让每一次重新扫描都变
   成一批重复。**改成读那个客户端自己的库, 拿到的就是一把真键**(r5): §12.5 的
   `'store'` 那一格用的是客户端自己的消息 id, `raw.synthetic` 保持 false —— 这正是"有它
   就优先"的理由, 重读时的塌陷从我们的一次赌博变成一条平台保证。
3. **一个写者, 一种顺序。** 每一个可变的、按会话记的事实 —— `unread`、`lastAt`、
   `anchor`、`assignment`、`stats`、`pendingTodoId`、agent 组的轮转计数器 —— 都住在一份
   索引里, 而**两趟 adapter pass 按设计就是重叠的**(§6.2 是*每个 adapter* 一个循环、
   *每个 adapter* 单飞, 即 single-flight)。`writeJsonAtomic` 只在文件系统那一层是原子的, 而**围绕**它的
   read-modify-write 不是, 所以两趟各自读了一份快照、之后又各自写回去的 pass, 会丢掉先
   落地的那次推进。这逐字就是第四轮 `codex-zst` 的 delta 缺陷 —— *先读后写且尺寸取自读
   之前 = 等第二个调用者来的丢失更新* —— 而在这里更糟, 因为一次被覆盖掉的 **anchor**
   推进会让下一趟 pass *跳过*消息而不是重读它们, 而一个被覆盖掉的未读数就是徽标上一个
   静默的错数字。§5.1 点名那个让这种形状根本不可用的所有者。
4. **游标只在一趟完整的 pass 之后前进**, 并且是在描述那一批的*同一次*序列化更新里面 ——
   pass 中途崩溃会重读, 它绝不跳过。Adapter 返回 `complete: false` 的意思就是"不要前进"。
   那次更新内部的顺序是定死的: 记录**先**落进(持久的、只追加的、按会话的)日志,
   anchor **其次**在索引里移动, 合并后的索引 flush 在**最后** —— 于是在任何一处崩溃, 最
   坏也只是一次重读, 而那被不变量 2 的去重吸收掉。
5. **保留策略按会话设, 并被两重界住**: 最后 N 条记录或 M 天, 取更小者, 并有一个 **7 天
   的地板**, 因为估计器是定义在最近 7 天之上的。裁剪要流式写到临时文件再 rename ——
   绝不就地改。
6. **`tracked` 是 opt-in 的。** 一个 adapter 能*看见*的东西远比 panel 该列出来的多: 一个
   被授权的 Lark 用户例行地就是几十个聊天的成员(在一个真实账号上实测: 大约五十个), 而
   一个邮箱是无界的。在用户把一个会话标记为 tracked 之前(或者对 Gmail 而言, 它匹配上了
   一条包含查询), 什么都不摄入。这是一个隐私决定, 一个成本决定, 也是让这个 panel 保持是
   一个 panel 而不是一个邮件客户端的那件事。
7. **派生值绝不变成存下来的事实。** `unread`、`hits7d` 与 `msgs7d` 都是从日志与已读标记
   重新算出来的; 它们为了渲染速度被缓存在索引里, 并且永远可以重新推导。quota-model 的
   那些事故(一个存下来的 `state` 活得比它所描述的那次读数还久)就是这句话写在这里的
   原因。**`convCaps` 是被点名的那一个例外, 而它为此付了代价**(r4): 它是一次 vendor 往
   返的结果, 本地重新推导不出来, 所以它拿到的不是豁免, 而是**一个 TTL(6 小时)、三个刷
   新触发点, 以及一个过期即 `unknown` 的降级**(§4)。存下来的那个 `at` 因此才有了读者 ——
   在 r4 之前它一个读者都没有, 而在这个仓库里, 没有读者的字段就是"这个修复从来没接上
   线"。**`scan.hostFacts` 是第二个例外, 而 r6 是在它身上重犯了同一条之后才补上的**:
   r5 给它写了一份 `{platform, clientInstalled, storePath, grant, grantAskedAt, at}`, 三
   个字段一个读者都没有、没有 TTL、没有刷新触发点、也没有过期降级 —— 一年前 r4 的原话就
   在同一节里。它欠的价钱与 `convCaps` 逐字相同(6 小时 TTL、三个具名触发点、过期降级成
   `source:null` / `why:'host-facts-stale'`, 见 §4), 而伤害方向恰好相反且更贵: `convCaps`
   陈旧会**多提供**一个控件, `hostFacts` 陈旧会让 `scanState()` 在客户端已被卸载、一次
   客户端更新把库挪走(决定 19(e) 自己承认 schema 会随版本变)、或者一次 Sonoma→Sequoia
   升级把 TCC **扩展**到 `~/Library/Group Containers/` 之后, 继续答 `source:'store'` 与
   `latencySeconds:15` —— 也就是 §12.5 明令禁止的那句"悄悄把一条 15 秒的通道换成 5 分钟
   的"谎话, 只不过这次连那条 5 分钟的通道都没有, 每一趟都在失败。

### 5.1 索引归谁所有

`src/server/channels-engine.js` 在内存里持有**权威索引**, 并且是它唯一的写者。
`src/channel-store.js`(SHARED)提供持久原语 —— load、往一个会话日志追加、读一段尾巴、
trim、原子地 flush 索引 —— 并且刻意**不**向任何其他人暴露"整份写回索引"的调用。

```js
// the ONE mutation door; nothing else may write index state
await index.update((ix) => { /* mutate live memory */ });   // serialized, never concurrent
```

- `update(fn)` 改的是活内存, 是**序列化的**(一条 promise 链, 同时只有一次在飞, 于是重叠
  的 Lark pass 与 Gmail pass 会*排队*而不是竞争), 并把索引标脏。
- Flush 是**合并的**, 绝不按每次改动 flush: 脏标志 + 短 debounce + 周期性扫 + SIGINT/
  SIGTERM 时 flush。这就是 `JobManager` 已经在给 `data/jobs.json` 用的形状(内存里的
  `Map` 是权威, 每次改动调 `_save()`, 一个 2 s 的 interval 在脏时 flush, `shutdown()`
  再 flush 一次), 也是 `SessionStatusManager` 给它的 store 用的形状(内存与广播立即,
  磁盘 debounce 500 ms 并做内容比对)。
- **一次快照读不是一把锁。** 读索引算点东西、然后在 `update()` *之外*把结果写回去, 恰恰
  就是这一小节存在要防的那个缺陷。而且没有任何东西需要这么做: ACL、filter 与 policy 都是
  PURE 的, 输入以参数的形式拿到, 所以一趟 pass 用它被递到手里的值去算, 然后在一次
  `update()` 里面把结果应用上去。
- **分片不是替代品。** `index/<adapterId>.json` 会把常见情形序列化掉, 但 agent 组的轮转计
  数器是按**组**键控的, 而一个组是跨 adapter 的; 并且 `unreadTotal`(rail 徽标)是跨
  adapter 的 —— 所以那扇序列化的门无论如何都是必需的。一扇门比一扇门加两个例外简单, 而这
  个仓库的历史说, 会烂掉的正是那些例外。
- 消息日志是按 `(adapterId, convId)` 分的, 而且只追加, 所以它们永不争用, 也待在序列化路径
  之外。这正是热路径(到达的消息)不必为那扇门付钱的全部原因。

`test-channel-store` 驱动**两趟并发的 pass** 跑在一份索引上, 并断言两个游标都前进了、也
没有丢掉任何未读数; 负控 (negative control) 是一份围绕 `writeJsonAtomic` 做
read-modify-write 的补丁副本, 它必须丢掉其中一趟。

---

## 6. 接收管线

### 6.1 形状

```
      ┌─ push  : live.start() ──► onEvent ──┐          ← latency lane   (§6.4)
LANE ─┼─ poll  : adapter.history() ─────────┼─► normalize (PURE) ─► store.append (dedup, atomic)
      └─ scan  : local-client store/UI ─────┘                            │   … then ack (fence 11)
                                                                         │
                        ├─► broadcast 'channels-updated'  (once per pass / per coalesced burst)
                        │
                        └─► COALESCE (60 s window when carryContent — fence 12; only a PUSH
                        │            lane can answer true: a poll pass and a scan pass are
                        │            already batches, so they need no window — r6)
                              └─► for each ASSIGNED conversation:
                                    channelFilter.matchRecord(filter, record)
                                      └─ hit ─► assignment.route (agent | rotating group)
                                                 └─► wake decision (§7)
                                                      ├─ wake   ─► spend authorize
                                                      │             └─► deliverToConversation(kind:'notification')
                                                      └─ digest ─► stash; one delivery per window
```

**三条通道汇进同一个漏斗, 而漏斗之后没有任何东西知道消息是从哪条通道来的。** 这不是
一句好听的话, 它是 `test-channels-lane-parity` 断言的东西: 同一天的流量分别经 push、
poll 与 scan 灌进去, 必须得到**同一批记录、同一个唤醒次数、同一笔扣款**。

`store.append` 之后的一切都是 PURE 的, 除了末尾那两次 ORCH 调用。这是刻意的: 与钱相关的
那条判定链, 不需要一台服务器就能做单元测试。

### 6.2 调度器

每个 adapter 一个循环, 绝不是每个会话一个循环。每一 tick:

- 花掉一份**请求预算**(默认 20/min/adapter, 是一个设置)在: 每一个*热*会话(被 assign 了
  的, 或者此刻正开在某个客户端窗口里的)按快节奏(30 s), 然后是*被 tracked 但冷*的那些按
  慢节奏(5 min)轮转 —— 但这两个数字**先经过 `laneState(…).pollCadence`**(§4):
  `'reconcile'` 时整个 adapter 掉到 15 分钟的对账节奏, `'fast'` 时就是上面这两个数。
  调度器**从不自己去读**声明、`push.state` 或 `caps.receive`(r4);
- 加抖动, 并在 `rate-limited` / `transport` 时按 adapter 指数退避, 干净的一趟后复位;
- 在 `auth-expired` 时**整个停下来**并把它说出去 —— 一个继续猛敲一份过期凭据的循环, 正是
  一个集成在 vendor 那边被限流的方式;
- 绝不与**它自己**重叠(每个 adapter 单飞), 也绝不占住循环: fs 写是异步的, 每个请求都有超
  时。每个 adapter 单飞**不是** adapter 之间的互斥 —— 各趟 pass 按设计就是并发的 —— 所以
  每一次索引改动都走 §5.1 那扇唯一的序列化门, 而且一趟 pass 绝不跨 `await` 携带一份陈旧
  快照。

成本是这份设计欠读者的一道算术: 五十个被 tracked 的 Lark 聊天, 一个热的都没有, 5 分钟节奏
⇒ ~10 请求/分钟。一个热的、被 assign 的聊天 ⇒ +2/分钟。一个 Gmail 账号在什么都没变时是每
tick **一个** `history.list` 请求。这个数字之所以重要, 是因为**推送打开之后轮询并不会消
失**: 它降到一个慢得多的**对账节奏**(默认 15 分钟, 一个设置), 从"延迟机制"变成"完备性机
制"。§6.4 说清楚为什么那不是保守, 而是这条推送通道自己的语义决定的 —— 而"此刻到底是哪一
种节奏"由 `laneState` 一处回答, 于是一条被降级或者死掉的推送通道会**立刻**把快节奏还回来,
不需要任何别的地方再判定一次。

### 6.3 各 adapter 的摄入

**Lark(user token)。** 用 `im/v1/chats` 做发现(分页), 然后对每个被 tracked 的聊天用
`im/v1/messages?container_id=<chat>`, 最新在前, 用 **`next_page_token`** 翻页 —— 这个字段
*不叫* `page_token`, 而只读第一页是一种有案可查的静默丢消息的方式。翻到已存的 anchor 为止;
在一个爆发日里那意味着好几页, 而这正是全部要点。从运维笔记里带过来的一批已知 vendor 限制,
adapter 一律**容忍**它们而不是假设它们不存在: 批量枚举 DM 不可靠(DM 靠搜索或靠用户自己挑
出来加进去); `im search` 把多词查询当短语处理; 它的时间窗参数并不能可靠地过滤; 图片是对一
个按消息的资源端点发起的第二次被授权的抓取, 所以 v1 只把它们记成附件元数据。

**Gmail(user token)。** 每 tick 一次
`history.list?startHistoryId=…&historyTypes=messageAdded` —— 什么都没变时就是一次便宜的请
求 —— 在精神上复用既有 `GmailSync` 的恢复语义: 过期的 `historyId` 返回 404 意味着重新播种;
单条消息返回 404 意味着跳过那个 id 而不是把这趟 pass 冻住(一次真实的"增量卡住3小时"事故);
游标只在这趟 pass 完成之后才前进。会话是**线程**而不是消息: `threadId` 就是 `convId`, 包含
范围是一条 Gmail 查询(默认 `label:INBOX`), 而它之外的任何东西都不会成为一个会话。

**Agents(内建)。** 会话就是 agent 会话; reach 就是 `msg-acl`; "发送"就是
`deliverToConversation`。它的消息日志**只**持有 channels 自己路由过的东西 —— 它是一本通讯
录加一条发送通道, 明确地**不是**任何转录的镜像。一个会话上有两个渲染器, 正是这个代码库长出
孪生 (twin) 的方式。

**本地客户端(WhatsApp / WeChat, `receive: 'scan'`)。** 这是第三类摄入, 而它与前两类的
区别不是节奏而是**证据来源**: 没有我们能调的 vendor API, 只有一个跑在某台机器上的官方客
户端, 以及它自己写下 / 画出来的东西(§12.5)。走哪条来源**不是一个按 adapter 种类的静态
事实**, 而是 `scanState()` 对着那台机器解析出来的一个答案:

- **`'store'` —— 读那个客户端自己写下的本地库。** 今天只有一个格子成立: **macOS 上的
  WhatsApp**, 它把整份历史留在一个**未加密**的 Core Data SQLite 库里。游标是
  `(rowid, 时间戳)` 一对, anchor 是客户端**自己的**消息 id(所以 `history: 'since'`, 而
  §5 不变量 2 拿到一把真键), 一趟以"读到开始时记下的那个最大 rowid"为完整, 而对库文件的
  那个 fs.watch 是一次**游标 kick**(去抖到 `caps.scanLatency.store`, §6.4), 绝不是"每次
  写盘扫一遍"。**绝不写**: 用 `SQLITE_OPEN_READONLY` 打开那个活库(它读得到 WAL 内容,
  而且什么都不改), 再**从那条只读连接**做一次 `VACUUM INTO` / backup 拿到 scratch 快照 ——
  会静默漏掉最近消息的是**只读那个 `.db` 文件本身**(它不含 WAL), 不是"只读地打开"
  (r6, 实测见 §12.5)。读取被 macOS 的 TCC 拒绝时, 这条通道以 `tcc-denied` 的名字失败,
  **绝不是一次读到零条的成功扫描**。
- **`'ui'` —— 读那个客户端渲染出来的界面**(由 agent-browser 的 profile 驱动, 见
  `docs/design-agent-browser-v2.md`)。这是 **Windows、Linux 与全部 WeChat** 的唯一来源
  (前两者的库是加密的 / 压根没有官方客户端, WeChat 的密钥在进程内存里 —— 围栏 13)。它
  同样是一次带游标的周期扫描, 但游标是一把**声明出来的**合成键, 而"完整的一趟"是受滚动
  限制的, 两件事都在 §12.5 里逐条写出来。

两条路的延迟差一个数量级(秒 vs 分钟), 而**两个数字都是会话行上画出来的那个数字**, 因为
它是用户在把一件事交给这条通道之前唯一需要知道的量 —— 这也是为什么一次被拒绝的库读取
**不会**静默降级成界面扫描。**发送不跟着来源走**(r6): 读一份库是只读的证据, 它不是一条
发送通道, 所以在一台解析成 `'store'` 而没有接上任何发送通道的机器上,
`convCaps.sendAs` 就是 `[]`, `why:'no-send-lane-on-this-host'` —— 而 §4 现成的规则会把它
渲染成"不提供并说出理由"并且**不许**建出任何 proposal。真正的发送动作只有 `'ui'` 那一条:
agent-browser 在那个已登录的官方客户端自己的输入框里打字; 走协议库那条路带着围栏 13 的
条款风险, 默认不提供。**库在哪台机器上, 读它的代码
就在哪台机器上**: 一个 `channels-scan-store` 的 agentd op, `hostId` 是参数, 本机是设备 #0。
这一类 adapter 的接口从 P0 起就存在(`scan` / `scanSources` / `historyBySource` /
`scanLatency` / `scanState` /
`convCaps` / `tosRisk` 都是为它留的位置), 具体的 WhatsApp 与 WeChat adapter 在 P6 且被决定
19 门控。

### 6.4 接收通道: push / poll / scan —— 以及它们当中谁可以携带内容

r2 在这里写的是一条绝对规则 —— *"一条活通道只可以让一个游标失效, 它绝不可以携带内容"* ——
并把两条 Lark 通道都排到 P5。owner 明确要的是**实时推送**, 所以这一节按证据重新论证: 那条
规则的**理由**留下, 它的**作用域**改掉。

**规则原来的理由, 逐条复核(全部经官方文档确认):**

| 事实 | 状态 | 它到底约束了什么 |
|---|---|---|
| 长连接**不需要公网 URL** | 确认 | 这是它相对 webhook 的全部优势, 也是它符合"绝不暴露入站端点"的原因 |
| 长连接**只支持企业自建应用** | 确认 | 一个前置条件, 不是一个风险 |
| 每个应用**最多 50 条连接** | 确认 | 每个实例一条, 一个 fleet 远远撞不到 |
| 推送是**集群模式、不广播**: 同一个应用的多个客户端, 每个事件**随机只去其中一个** | 确认 | **这才是那条规则真正的理由** —— 而它只在**多个实例共用一份应用凭据**时成立 |
| 订阅方须在 **3 秒**内 HTTP 200 应答 | 确认 | 决定了 ack 的位置(围栏 11), 不决定内容能不能走这条道 |
| 投递是 **at-least-once**: 未按时应答按 15 s / 5 min / 1 h / 6 h 重投, 最多 **4 次**, 即使成功也可能重复 | 确认 | **推翻了"推送不可靠所以只能当 kick"这个理由** —— vendor 自己会重投, 重复由 §5 不变量 2 吸收 |

于是那条规则被替换成一条更窄、也更诚实的规则:

> **一条推送通道可以携带内容, 当且仅当这份凭据的推送通道是这个实例独占的。**
> 独占度是一个**配置事实**, 由运维**声明**, 由产品**度量**, 并且在度量与声明矛盾时由产品
> **自己降级**。

**这个声明只有一个家: adapter 记录上的 `push.claimedExclusive`**(`'exclusive'` /
`'shared'` / `'unknown'`), 因为它是一个**按部署**的事实; 而**解析只有一处**: §4 的
`laneState(caps, adapterRecord, convEntry, now)`, 优先级是**降级 > 活性 > 声明**。r4 之
前它同时住在 `caps.pushExclusivity` 里, 于是下面这条自动降级结构上赢不了 —— 详见 §4。

- **`exclusive`** —— 用户在连接向导里明确声明"这个应用的推送通道归这个实例"。推送**携带
  内容**(`carryContent:true`): 事件里的消息走归一化 → 追加 → ack → 合并 → filter。轮询降
  到 15 分钟的**对账节奏**(`pollCadence:'reconcile'`), 不再是延迟机制而是完备性机制。
- **`shared` / `unknown`** —— 推送**只是一次游标 kick**(`carryContent:false`), 也就是 r2
  那条规则原样保留(唤醒退避的那次*睡眠*而不只是中止一次 fetch —— `opencode-events` 的教
  训: 一条只中止 fetch 的通道花了 25 s 才上线)。轮询保持快节奏。默认值是 `unknown`, 所以
  **不做任何声明就得到 r2 的行为**。
- **已降级或不 `live`** —— 无论声明是什么, `carryContent:false` 且 `pollCadence:'fast'`。
  这就是"降级 > 活性 > 声明"这条优先级的全部内容: 一个已经被产品自己撤回的主张, 不许
  再决定任何一个字节走哪条道。
- **`via:'scan'` —— `carryContent:false`, 恒为假**(r6)。上面那条优先级从头到尾只枚举了
  push 的几个状态, 而合流点上那道合并门读的是**解析出来的那条通道**, `laneState()` 又答
  得出 `via:'scan'` —— 于是 scan 通道此前落在一个没人回答过的格子里。答案本身没有悬念:
  **一次 scan pass 就是一批**, 与一次 poll pass 逐字同理, 所以它既不需要那扇窗、也不会
  从那扇窗里买到任何延迟(围栏 12 自己的话: 在 kick 模式下开那扇窗"白白买 60 秒延迟")。
  不写下来的代价不是理论: §12.5 把 `'store'` 连同一个**事件驱动**的触发器(对库文件的
  fs.watch)一起引进来, 而 WhatsApp 的 `ChatStorage.sqlite` 每收一条消息就被写一次 ——
  于是一个热闹的群里 watch 大约每条消息响一次 ⇒ 每条消息一趟 scan ⇒ 每条消息一次 filter
  命中 ⇒ 在 `notify:'wake'` 下, 合并门读到的 `carryContent` 是 undefined(假)⇒ 不合并 ⇒
  **每条消息一次唤醒**。那正是围栏 12 自己那句"30 条消息变成 30 次投递", 从 r5 刚加的这
  条通道、走那道唯一没盖住它的门进来。
- **那个 fs.watch 是一次游标 kick, 绝不是"每次写盘扫一遍"**(r6)。它唤醒的是 scan 的那次
  *睡眠*(与 `shared` 推送 kick 的措辞逐字相同, 同一个 `opencode-events` 教训), 并且被
  **去抖到最多每 `caps.scanLatency[source]` 一趟** —— 这样那个数字才是一条真的天花板,
  而不是一个标签; 会话行上画的秒数与库真正被读的频率因此是同一件事。它跑在 daemon 里,
  所以它同时欠 `opencode-events` 第四轮那条 inotify 生命周期规则: 单一 attach 点、
  停止即终结、绝不把一个 watch 挂在没人持有的通道上。诚实边界: §7.4 每会话 30 秒的阶梯
  地板与 spend authorizer 把**绝对花销**兜住了, 所以这不是一笔无界的钱 —— 但每条通道的
  唤醒次数与扣款笔数会不一样, 而那恰好让 §6.1 的那句总纲("同一批记录、同一个唤醒次数、
  同一笔扣款")与 §17 的 parity 那一行按字面**不可能成立**。

**声明必须可以被证伪, 否则它就是一句祈祷。** 平台不告诉我们还有几个客户端连着, 所以独占度
永远是**被断言**、绝不是被推断的 —— 但它是**可测**的: 引擎为每个 adapter 记录
`firstSeenByPoll / firstSeenTotal`, 也就是**先被对账轮询看到、而不是先被推送看到**的记录
比例(`push.missRate`; 计数器按会话记在索引的 `lane` 上, 按 adapter 聚合成这一个比率)。
一份真正独占的通道上这个数长期是 0。它连续超过阈值(默认 2 %, 且至少 20 条样本)就**自动降
级成 kick 模式**, 把 `demotedAt` / `demotedWhy` 写下来, 并在 adapter 行上说出来: *"推送在
这里不是独占的 —— 已回落到游标 kick, 轮询恢复快节奏"*。这条路径就是那条"承诺是可以被自己
收回的断言"的规则(login-expiry 的教训)在这里的形态: 产品发出一个主张, 然后自己去量它,
然后自己撤回它。

这个度量欠两句话, 而少了任何一句它就是一个**单向棘轮**(r4):

1. **只在通道真的在携带内容时计数, 并且只在一个滚动窗口内计数。** 窗口 = 最近 N 条记录或
   最近 24 小时, 取更大的那个。理由是算术: kick 模式下推送**根本不携带记录**, 于是每一条
   记录都"先被轮询看到", 比率按构造趋向 1.0 —— 一个终身累计的比率会让被降级的通道**永远**
   停在阈值之上。所以 `laneState(…).carryContent` 为假的那些 tick **一条样本都不贡献**,
   指标不可能自己毒死自己。
2. **降级可以被做出声明的那一方撤回。** 这正是 auto-resume 那条 `edgeHeld` 教训
   (*HELD, 绝不是 SPENT …… 把那堵墙烧掉就是把一次瞬时的分歧变成一次永久的拒绝*)在这里
   的形态。撤回的动作是**人的**: 在连接向导里重新声明一次独占, 计数器清零, 通道被重试一
   次; adapter 行上把 `demotedWhy` 与一个"重新声明以重试"的入口画在一起。**计数器本身绝
   不是触发器** —— 一条降级了的通道即便 fixture 不再扣事件也不许自己爬回去, 因为让它自己
   恢复的那个证据(推送先看到)恰恰是它在 kick 模式下产不出来的。

**活性判定只认正证据**(`opencode-events` 轮 4 的教训 —— 一条谎报 `active` 的通道比没有通道
更糟, 因为它把回落**关掉**了): `push.state === 'live'` 需要 socket 连着**并且**在心跳窗口
内收到过东西; 沉默超过窗口 = 死掉 ⇒ 轮询节奏立刻自动回到快节奏, 而通道自己重连。`stop()`
对**已经在飞**的那次 arm 是终局的(轮 6 的教训), 通道是**单次使用**的。

**ack 在持久化之后, 绝不在处理完之后**(围栏 11)。这是 3 秒预算的直接后果, 而不是一句
风格偏好: 我们这一侧的处理链(追加 → filter → spend 授权 → 投递)完全可以超过 3 秒, 而在
持久化**之前** ack 会把 vendor 的 at-least-once 悄悄降级成我们自己的 at-most-once。

**HTTP webhook 仍然是"永远不要"。** 它需要一个公网 URL、一个 verification token 与一把
encrypt key; VibeSpace 有 `instance-url`/frp 是可以暴露一个的, 但为了拿到长连接本来就给了
的东西而暴露一个入站端点是笔坏买卖。

**Gmail 那一侧的推送形状不同, 而且更好:** `users.watch` + Cloud Pub/Sub。它的痛点是
运维的而不是语义的 —— 要一个 topic、一份 IAM 授权, 而那个 watch **7 天静默过期**, 漏一次
续期就悄无声息地停掉(所以要一个每日续期任务)。但**Pub/Sub 的订阅是可以 pull 的**, 于是
它同样不需要公网入站端点; 而且每个实例可以有**自己的订阅**, 所以 Gmail 的独占度是一个可以
被**配置**出来的事实, 而不是一场随机赛跑 —— 这是它与 Lark 集群模式的实质区别。默认仍然是
轮询(什么都没变时每 tick 一个请求), 推送是一个**带成本说明的可选升级**(决定 20)。

**排期:** Lark 长连接的传输、活性与独占度测量在 **P1**(接收的事归接收); 推送爆发的合并窗
口与"每条通道同样多次唤醒"的那条腿在 **P2**(它要用到唤醒路径)。Gmail 的 Pub/Sub pull 在
P1 落一个开关后面, 默认关。

---

## 7. Assign、过滤, 以及叫醒一个人的成本

### 7.1 Filter(PURE)

```js
// src/channel-filter.js
matchRecord(filter, record, ctx) -> { hit: boolean, why: string[] }
estimate(filter, records, { days = 7, now }) -> {
  matched, total, matchedPerDay, totalPerDay, windowDays, sampled, truncated
}
```

规则种类是一个封闭集合, 加一行加一条套件用例就能扩: `mention`、`keyword`、
`sender-in-group`、`from-address`、`subject`、`has-attachment`、`not-contains`、
`time-window`; `match: 'any' | 'every'`。

套件钉住两条性质:

- **`why` 是契约, 不是散文。** 投给 agent 的那次唤醒会说是哪条规则触发的, 而 panel 显示同
  一个字符串。一次说不出理由的唤醒就是一次没人能调的唤醒 —— 与审批卡的"为什么"、与
  auto-resume 的具名拒绝 (named refusal) 是同一条法。
- **`estimate` 对自己的窗口是诚实的。** 在它没有读完全部时, 它报告 `sampled` /
  `truncated`, 而 UI 把这个注意事项打出来。一个悄悄只读了 2,000 条里的 200 条的估计, 比没
  有估计更糟, 因为用户正是凭着它被要求去授权一个*花钱的速率*。

### 7.2 估计必须事后可度量

估计是一个**预测**, 而 store 里已经有了检验它所需要的东西。`index.stats.hits7d` 记录 filter
在过去 7 天里*实际*匹配了多少, 而 AssignFilter 面板把两个都显示出来: *"你设置的时候估计
~4/day; 从那以后实际 6/day。"* 一个要求用户对一个速率做推理的产品欠他们这次度量 —— 而且它
几乎是免费的, 因为计数器就在那条已经跑过匹配器的路径上加一。

### 7.3 Assignment

```
assignment = { principal: { kind:'agent'|'group', id },
               mode: 'all'|'filtered', filterId,
               notify: 'wake'|'digest', digestMinutes,
               authority: 'draft'|'send',
               createdAt, createdBy: 'user' }
```

- `authority: 'send'` 被**两件事分别封顶**: (a) **channel policy** —— 当这个 channel 要求
  review 时, 这个选项不可选, 而且存下来的值在**读取时也被夹住**(一个当前策略禁止的存量值,
  绝不许在策略后来被放宽时静默地变成一份权限); (b) **能力**(r3/Q3) —— `offers(caps,
  convCaps, 'send-*')` 为假时那个选项**根本不画**, 并把 `caps` 自己给的理由画在旁边。在一
  个只读会话上把 assignment 设成 `authority:'send'`, 是在向用户承诺一件这个平台上不存在的
  事。两条封顶的先后不重要, 因为两条都只会收窄。
- Assign 给一个**组**会在那个组的活会话上轮转(round-robin), 轮转状态放在索引里。一次找不
  到活会话的轮转会回落到"攒着等下一个 turn" —— 绝不回落到"把他们全叫醒"。
- **Assignment 蕴含 reach —— 但它是一条写明了作者的授权。** 把会话 C assign 给 agent A 会
  为 (A, C) 写下一条显式的 ACL 授权 `visible`, 而不是造出一个隐式特例, 于是"不可见 = 不存
  在"仍然字面上成立, 而 AgentReach 面板显示的正是此刻生效的东西。那条授权携带
  `origin: 'assignment'`, 而**取消 assign 只删掉 `origin:'assignment'` 那一行。** 授权是按
  (principal, scope) 键控的, 所以没有 `origin` 的话, 一个本来在 AgentReach 面板里独立地给
  了 A 对 C 的 `visible` 的用户, 会因为一个不相干的动作而被静默地撤销那条授权 —— 这是一次
  被夹带进一个明文写着(§8)只许放宽的模型里的**收窄**操作。

### 7.4 那次唤醒, 以及谁为它付钱

一条匹配上的消息叫醒一个 agent, 就是一个没人打字的 turn。所以它走既有的那条路, 旁边什么都
不加:

- 在 `src/spend-authorizer.js` 里加一个新的已声明理由 ——
  `'channel-message': { turn: true, what: 'a message from a connected channel' }`
  —— 并且**与生产者在同一个 commit 里**加, 因为那个集合是封闭的, 而一个声明了却没人用的
  理由就是一个下一个生产者不经任何人决定就滑进去的槽位;
- 生产者向池引擎构造出来的那个 guard 提问(绝不是一个可以被塞进 null 的注入依赖 —— 那是 r2
  的教训: 一道依赖着没人传过的 dep 的门在生产上是死代码, 而一个确实传了它的 harness 让套件
  一直是绿的), 取那个判决**自己**的身份, 把*那个*身份传给扣款(charge what you authorized),
  并在一个 `finally` 里释放那个 hold;
- 一次拒绝**什么都不损失**: 消息已经在 store 里了, 而投递梯的 stash 会把这些话带进 agent 的
  下一个 turn。这正是这道门可以安全地 fail closed 的原因;
- 三层, 三个职责, 写在这里免得日后有人把它们塌成一个: per-assignment 的每日唤醒上限是**节
  奏控制**; 投递梯的每会话 30 s 地板是**洪泛控制 (flood control)**; authorizer 才是
  **钱的界**。只有最后那个是按凭据槽算的, 也只有最后那个能活过一次重启。

摘要模式是同一条梯子的另一种用法: 匹配上的记录被 stash 起来, 每个窗口授权一次批量
投递 —— 复用既有的 `renderMsgStash` / `renderNotifStash` 块, 于是一小时 30 条消息变成一个
turn 而不是三十个。

**推送把一个原本免费的性质拿掉了, 所以要把它显式买回来**(围栏 12, r3/Q3)。轮询天然会合
并: 一趟 pass 把一分钟里到达的所有消息一次性交给 filter, 于是它们本来就是一次唤醒。推送是
一条一条来的, 同一个爆发就成了 30 次投递、30 个计费 turn。所以当这个会话的通道是 push 且
`notify: 'wake'` 时, 引擎在**唤醒判定之前**加一个合并窗口(`channels.pushCoalesceSeconds`,
默认 60): 窗口内的命中攒成一次唤醒, 注入块里照常逐条列出(§7.5 的预算不变), 而 `why` 里说
清"这一分钟里的 N 条"。三层职责一个字都没变 —— 合并是**节奏**, 不是钱的界 —— 但少了它,
"打开实时推送"这个纯粹关于延迟的动作会把某些会话的账单乘以一个数量级。这正是
`test-channels-lane-parity` 那条腿存在的理由: **同一天的流量, 三条通道, 同样的唤醒次数与
同样的扣款**; 它的负控是一份绕过合并窗口的推送通道副本, 必须唤醒得更多。

### 7.5 Agent 实际收到什么

一个渲染好的块, 带预算(注入通道在 10 KiB 处 wrap, 而这个产品已经在这件事上输过一次):

```
### Channel message — Lark · <conversation title>
from <author> at <time> · matched: mention @on-call, keyword "GPU"
<text, ≤400 chars per record, ≤6 records, "(N older elided)">
Reply with: vibespace-channels reply <convId> "…"   (this PROPOSES; the user approves)
```

正文是作为**文本**插入的, 而那个 PURE 渲染器在把一个 vendor 提供的字符串嵌进去之前, 会把
任何形如我们自己注入标记的东西(`<system-reminder>`、`<persisted-output>`, 以及这个块自己的
那些标题)剥掉。一个外部的人是可以打出这些字符的; 他们绝不能因此在一个 agent 的上下文里伪
造出一个 frame。这是 XSS 规则的 prompt-injection 孪生, 而它属于那个 PURE 渲染器 —— 在那里
它能被单测证明。

---

## 8. 可见性(AgentReach)

`src/channel-acl.js`, PURE, 为了序关系与只许放宽律而 import `src/msg-acl.js`(架构套件允许
PURE→PURE, 禁止其余一切)。

```
level  : 'hidden' < 'requestable' < 'visible'
grant  : { principal:{kind:'agent'|'group', id},
           scope:{kind:'conversation'|'adapter', id},
           level,
           origin: 'user'|'assignment'|'request',   // WHO wrote it (§7.3)
           at, by }
effective(principalCtx, scope, grants) -> { level, via:'group'|'agent'|'default', grantId }
```

- **一切默认 `hidden`。** 不存在"从平台继承"这回事 —— 平台自己的 ACL 说的是*用户*可以看
  什么, 从来不是一个 *agent* 可以看什么。
- 一个单独的 agent **继承它所在的组, 并且可以被单独放宽**; 生效等级是所有适用授权上的
  MAX。把一个个体收窄到低于它所在的组是刻意做成不可能的 —— 与 `msg-acl` 的 override 是同
  一条规则, 理由也一样: 一个只许放宽的模型可以被推理, 一个混合的不行。
- **`requestable`** 是中间态: `effective` 返回它, agent 可以提交一条请求
  (`vibespace-channels request <convId> "why"`), 请求以一条携带所述理由的 "For you" 条目
  落地, 而批准恰好为(那个 principal, 那个 scope)写**一条** `visible` 的授权。它绝不碰组的
  默认值 —— 逐字就是 artboard 上的行为。
- **`hidden` 是彻底的。** 列不出、搜不到、也不能按 id 寻址; 一个从别处拿到的 id 得到的答案
  与一个根本不存在的 id 完全一样, 是同一条统一错误。
- **`origin` 是机器有史以来唯一会去删掉一条授权的理由。** `effective()` 本来就在每一条适用
  授权上取 MAX, 所以一个 (principal, scope) 上有好几条授权也能正确合成, 访问器一行都不用
  改; `origin` 买到的是: 取消 assign 只删掉 assignment 自己那一行、别的什么都不删, 一次请
  求批准能与一条手工授权区分开来, 以及面板能说出一个 principal *为什么*看得见某样东西。
- 每一次授权变更都往 `audit.ndjson` 追加一行, 带谁 / 何时 / 为什么。

---

## 9. Outbox: propose → policy → approve → send → receipt

### 9.1 状态

```
draft ─(agent proposes)──────────────► proposed
proposed ─(policy: direct)──────────► sending ─► sent | failed | unknown
proposed ─(policy: review)──────────► awaiting-approval
awaiting-approval ─(approve, maybe edited)─► sending ─► sent | failed | unknown
awaiting-approval ─(reject)─────────► rejected
awaiting-approval ─(TTL, default 24 h)─► expired
unknown ─(reconcile)────────────────► sent | failed      // never auto-retried; §9.4
```

`src/channel-policy.js`(PURE)拥有这张转移表, 外加:

```js
decideOutbound({ channelPolicy, guards, proposal, now, tz })
  -> { mode: 'direct'|'review',
       reasons: ['channel-policy'|'links'|'attachments'|'off-hours'|'authority'] }
```

- 护栏**叠在** channel policy **之上**, 并且只能让它更严: 审计永远开着; 链接/附件强制
  review; 非工作时间强制 review。一个能*放宽*策略的护栏会让策略变成一条建议。
- **Fail closed:** 一个未知的 policy 值或一份解析不了的护栏配置 ⇒ `review`。非工作时间需要
  一个时区; 没配时区时这条护栏是*关着的*而不是靠猜 —— 一个错的时区静默地把所有东西都送去
  review(或者静默地什么都不送), 比一句诚实的"未配置"更糟, 而后者是 panel 会显示的一个设
  置项。

### 9.2 审批面

同一条记录在**两个地方**渲染 —— 内联在会话窗口的时间线里(上下文在那儿)以及在 Outbox 窗口
里(队列在那儿) —— 都来自一份 store, 所以它们不可能互相矛盾。

外加既有 "For you" 收件箱里的一条**指针条目**, 这样任务栏徽标才会亮。它的形状由
`UserTodoManager` *是什么*决定, 而不是由什么方便决定:
`add(sessionKey, {text, detail, urgency, by, sessionName, jobId})` 是一个**封闭的参数集**,
没有任何地方能携带一个 proposal id; 它按 `(sessionKey, text)` **跨所有状态**去重, 所以重新
归档一条已解决的条目会把*同一个* id 重新打开(这是刻意的 —— 它挡住了一个 add→resolve 循环
刷屏"新条目"吐司); 而且它在超过 `MAX_OPEN_PER_SESSION`(20)时会**抛异常**。所以"每条待审
proposal 一条条目"根本表达不出来: 两条指针措辞相同的 proposal 会塌成一条条目, 批准任意一条
都会把两条的徽标一起撤掉, 第二条 proposal 干脆没有指针, 而一次爆发会抛异常。

所以指针是**每个会话一条**:

- `text` 是**不带计数的** —— *"‹会话› 里有待审批的 proposal"* —— 这让按文本去重恰好就是我
  们想要的那种幂等。**计数与最新的正文住在 `detail` 里**, 而 `add()` 在重新归档时就地更新
  它;
- `add()` 返回的那个 id 存在**会话**记录上(`pendingTodoId`), 因为撤回需要的是*会话 → 条
  目*, 而没有任何别的东西持久化了这条链接。这正是 login-expiry 那次修复通过在生产者自己的
  账本上持久化 `items:[{id,text}]` 所补上的缺口; 在撤回时靠匹配文本反推条目, 会是一份绝不
  能漂移的字符串的第二份拷贝;
- 它由**这个生产者撤回**(`setStatus(id, 'done', 'system')`), 时机是该会话的最后一条 proposal
  以任何方式离开 `awaiting-approval` 的那一刻, 并且只对这个生产者写下的 id 撤。一条活得比
  它的主题还久的条目就是 login-expiry 那次事故;
- `add()` 因开放数上限而抛异常时**被 catch、被记日志, 并降级**到 rail 徽标与 Outbox 窗口,
  它们才是记录在案的那两个面。一条归档不进去的指针, 绝不能把 proposal 一起拖下水。

(另一条路 —— 在 todo 条目上加一个 `proposalId` 字段、有它时按它去重、并把 `todoItemId` 存
在 proposal 上 —— 是对一个好几个生产者共用的 store 做 schema 变更, 而它买到的是没人要过的
按 proposal 的徽标。它记在决定 7 里, 万一 owner 想要的正是这个。)

卡片携带**为什么** —— 引发它的那条告警 / 会话 / 任务 —— 是一条 panel 可以做链接的结构化引
用, 而不是 agent 写的一句话。就地编辑会置 `edited: true` 并把两份正文都存下来; 回执会这么
说。卡片还带一条**身份行**("将以 ‹用户名› 发送"), 以及当 `identityMarking` 不是 `none` 时
的那条警告 —— 逐字来自 `caps.identityMarkingText`(§9.5)。

**批准会重新解析一次 `convCaps`, 就在发送之前, 无条件**(r4, §4 的第三个刷新触发点)。一条
proposal 可以在 `awaiting-approval` 里躺到 24 小时(它自己的 TTL), 而在这段时间里那个会话
完全可能已经把用户踢掉、把邮箱改成只读, 或者干脆被解散 —— `why:'left-group'` 本来就在枚举
里。重新解析回答"不能发"时, 这次批准**不发送**, 而是以带类型的 `send-not-available` 加上
`convCaps` 自己给的理由停下来, proposal 落到 `failed`, 回执把那个理由逐字带回给 agent。这
是唯一一个"判断错了要付出一条真消息"的时刻, 所以它是唯一一个不许省的刷新。

### 9.3 Agent 拿回来什么

```
{ proposalId, status: 'sent'|'rejected'|'edited'|'expired'|'failed',
  convId, adapterId, vendorMessageId, at,
  edited: bool, editedBy: 'user', reason,         // rejection/failure reason, verbatim
  sentAs: 'user'|'bot'|null,                      // §9.5 — the identity that actually sent it
  identityMarking: 'none'|'marked'|'unknown',     // what the RECIPIENT saw
  identityMarkingText: '<one sentence>'|null }    // verbatim; null when marking === 'none'
```

回执里那三个新字段是 r3/Q4 的一半: **agent 必须知道对面看见的是谁。** 一个 agent 起草了一
条以为是"我这个人说的"的消息, 而对面看见的是应用名, 这件事必须出现在它拿回来的那份结构化
回执里, 而不是只出现在一份没人读的审计日志里。`sendAs: []` 的会话上, `reply` 连
proposal 都不会创建, 返回的是带类型的 `send-not-available`(§4)。

经由同一条投递梯投递, 只多一个选项:

> **`deliverToConversation(cid, text, { noWake: true })`** —— 只在不花钱时投递, 否则 stash。
> 具体地: 当 `notificationDelivery(capsOf(backend)) === 'steer'` **并且**有一个 turn 正在跑
> 时(那是唯一一条不开 turn 的通道)走那条通道; 否则 stash 到下一个 turn。

这是对投递梯一个小而有原则的补充, 而不是调用方那侧的一个分支, 因为*传输选择住在梯子里面*
(CS 律), 也因为这条"免费通道"的判据恰好就是 spend 那批工作已经确立的那一条 —— claude 的
cli-inbox 在 turn 中途的投递是**延后, 不是免费**, 所以 `noWake` 落在那条通道上时是 stash 而
不是投递。

`noWake` 改的是**回落**, 不是记账: 它不再往下降到一条会开 turn 的 rung, 而是 stash。授权仍
然是带 hold 取的, 因为"这一帧会加入正在跑的那个 turn"是一个*预测* —— turn 可以在检查与
wrapper 的 RPC 之间结束 —— 而既有的扣款扣住机制(`peer_message_result{mode}` →
`settleRpcDelivery`)恰恰就是把一个错的预测转换成一次真实扣款的东西。复用它, 就是一条免费
通道与一条没计费的通道之间的区别。

回执默认 `noWake: true`: 一次批准通常在几分钟或几小时之后才发生, 而 agent 的下一个 turn 就
是它得知这件事的自然地点(决定 8)。

### 9.4 恰好发送一次

两套机制, 按 adapter 用 `caps.idempotency` 选:

- **`key`** —— Lark 的发送接受一个开发者生成的 `uuid`(≤ 50 字符), 它在一小时内把相同的请求
  去重到至多一次成功发送。Proposal id 就是这把 key, 所以那一小时内的重试按构造就是安全的。
- **`two-phase`** —— Gmail 的发送没有幂等 key, 所以 outbox 先创建一份**草稿**(一个持久句
  柄), 然后再发送这份草稿。如果发送的结果丢了, `reconcile()` 去问那份草稿是否还在 / 那个线
  程里现在是否已经有我们那条消息。
- **`none`** —— proposal 进入 `unknown` 并停下。**一次结果未知的发送绝不自动重试。** 卡片会
  这么说, 并请用户去看一眼; 审计行记录了这次尝试。往别人的运维群里发一条重复消息, 是比开口
  问一句更糟的失败。

每一次发送在请求出去**之前**往 `audit.ndjson` 追加一行(尝试), 结果回来时再追加一行 —— 于
是在两者之间崩溃, 留下的就是一条有尝试无结果的记录, 而那恰恰是 `reconcile()` 存在要解决的
那个状态, 也恰恰是那个绝不能被读成"没发出去"的状态。审计行同时记下
`{draftedBy, approvedBy, sentAs, identityMarking}`(§9.5) —— **这份记录只留在本实例里**,
它从不随消息出去。

### 9.5 以谁的身份发送, 以及这句话该对谁说

**默认: 以用户本人的身份发送, 不加任何标记。**(owner 定案, r3/Q4 —— 这**推翻**了 r2 的决
定 17"外部 channel 默认追加 drafted by <agent>"。)在每一个允许以用户身份发送的 channel
上, 消息发出去就是用户发的样子, 正文里没有我们加的任何东西。那条发送方诚实行仍然存在, 但
它降级成一个**默认关闭**的按 channel 开关(`channels.senderHonestyLine`, 默认 off)。

理由是**这句话到底欠谁的**。r2 把它理解成欠收件人一个披露, 于是把披露塞进别人读的那条消息
里 —— 而那既改写了用户自己的话, 又在用户已经决定要发这条消息之后才发生。真正需要知道"对
面会看见谁"的是**正在按下批准键的那个人**, 以及**起草它的那个 agent**。所以:

> **诚实是欠给做出这个动作的人的, 不是强加在收到这条消息的人身上的。**

于是披露从消息里搬到了两个地方: **授权的那一刻**(审批卡/发送控件上的一行), 以及**回执**
(§9.3)。而它由 `caps.identityMarking` 驱动 —— 一个能力位, 绝不是一个按 vendor 写死的
`if`:

| `identityMarking` | 含义 | 审批卡上 |
|---|---|---|
| `none` | 收件人看见的就是这个用户, 界面与原始数据里都没有可归因到应用的痕迹 | 只有一行平静的 "将以 ‹用户名› 发送" |
| `marked` | 这个 channel **会**把消息标成应用/机器人发的 —— `identityMarkingWhere` 说是在**收件人界面**里还是只在**原始头**里 | 一条**警告**, 逐字显示 `identityMarkingText`, 例如"这个 channel 会把这条消息显示为由 ‹应用名› 发送" |
| `unknown` | 我们**没有验证过**这个 channel 怎么归因 | 与 `marked` 同样处理并明说没验证过 —— 在诚实这件事上 fail closed |

四个已知形态, 以及各自的证据(细节与出处见 §12.1 / §12.2):

- **Lark bot 发送**(`im:message:send_as_bot`, tenant token): 平台自己的 `sender.sender_type`
  就是 `app`, 消息带着应用的名字与头像。⇒ `marked` / `recipient-ui`。
- **Lark 用户身份发送**(`im:message` + `im:message.send_as_user`, user token): 官方文档确
  实有"以用户身份发送消息"这条权限, 但**它没有说收件人看见的 `sender_type` 是什么**, 而社
  区有一份相反的报告说即使用 user token 也仍然是 `app`。⇒ `unknown`, 直到 P4 用一次真实发
  送把它证明为止(§21)。
- **Gmail API 发送**: 收件人的邮件界面里看见的就是这个用户 —— 没有应用徽标、没有 "via" —— 但
  经 API 发出的邮件会多一条点名 `gmailapi.google.com` 的 `Received:` 头, 而"显示原始邮件"
  是能看见它的。⇒ `marked` / **`raw-headers`**, 文案照实说: *"在收件人的邮件界面里看不出
  来; 在原始头里可以(一条点名 `gmailapi.google.com` 的 `Received:` 行)"*。这就是 owner 要
  的那次核实的答案: **不是完全不可分辨, 而是界面里不可分辨、原始数据里可分辨**, 而两者对
  一个正在决定要不要发这条消息的人是不同的事实。
- **WhatsApp 协议库**: 看上去就是用户本人(`none`), 但它带的是 `tosRisk: 'prohibited'`
  (围栏 13) —— 而**那**才是这条通道上要被大声说出来的东西。身份诚实与条款风险是两个正交的
  轴, 用一个字段扛两件事就是下一次事故。

**Lark 的用户身份发送仍然要 P4 那次 scope 往返**(决定 2 不变): 要同时申请
`im:message`(获取与发送单聊、群组消息)与 `im:message.send_as_user`(以用户身份发送消息)
—— 注意第二个 scope 的分隔符是**点不是冒号**, 运维笔记里的 `im:message:send_as_user` 是拼
错的, 而这个错误只会在控制台里表现成"找不到这个权限"。**在它落地之前**, Lark adapter 声明
`sendAs: []`, 而界面把这件事说清楚而不是把控件变灰: *"发送需要在 Lark 应用上再加两个权限、
发布一个版本, 并重新授权一次 —— 连接 ▸ 申请发送权限"*, 旁边一个直接跳到 §12.1 那份清单的
链接。Agent 那一侧对着同一个事实拿到的是 `send-not-available` 加上同一句理由, 于是它不会
去起草一条永远发不出去的 proposal。

**审计日志照旧记下起草的那个 agent**(`draftedBy`), 连同 `approvedBy` / `sentAs` /
`identityMarking`。删掉默认的诚实行**不会**让归属消失, 它只是把归属放回它属于的地方: 本实
例的记录, 而不是别人的收件箱。

---

## 10. 面板

### 10.1 注册项(不新增 chrome 原语)

- **Rail:** 在 `src/lib/sidebar-rail.js` 里加一个新项 `channels` —— 而徽标**不是**白给的,
  因为那个文件里没有任何东西会自动认出一个新 id。**六处注册**: `RAIL_ICONS` 里一条、
  `RAIL_TITLES` 里一条、`PANEL_TABS` 里那个 id、rail 自己那份项目列表里那一项、
  `_railRefreshBadges()` 里面一个 `_railSetBadge('channels', unreadTotal)` 分支(它的数据源
  是一串硬编码的 fetch 梯子), 以及在 `_railWireBadges()` 那份显式的消息类型列表里加上
  `'channels-updated'`。helper 叫 `_railSetBadge(id, val)`; **根本没有 `_railBadge` 这个东
  西**。与会重新 fetch 的 ports / hosts / jobs 不同, 这个徽标是从引擎本来就在发的那份广播
  摘要算出来的, 外加页面加载时探一次。
- **窗口:** `registerWindowType({ type:'channel', icon, label, action:'openChannel', replay })`
  —— 于是布局恢复、跨客户端同步、虚拟桌面、标签组与任务栏全都白给, 而且 `replayOpenSpec`
  不可能静默地把它丢掉(注册表有一个会出声的 default)。
- **Outbox 窗口:** `type:'channel-outbox'`, `singleton: true`。
- **菜单 / 命令:** 在 `src/lib/contributions.js` 里贡献 —— 一个 `channel-row` 菜单
  (assign…、filter…、reach…、标记已读、取消 track)加上齿轮菜单里的 "Connect an adapter…"
  行。
- **连接向导先问那张卡(§14.5):** adapter 面板上的 "Connect Lark" 在
  `resolveIntegration('lark')` 答 `none` 时**先**开 Integrations 窗口并聚焦那一行
  (`app.openIntegration('lark')`), 而不是把用户送进一个会在授权页上失败的 OAuth 流程 ——
  §12.1 已经点名这个失败形态(缺 scope / 缺已发布版本 / 缺回调 URL 时挂掉的是*授权页*而不是
  API 调用), 而它在一个用户根本还没配过应用凭据的实例上是**默认**形态 —— §14.9 更进一步:
  跨租户的用户**必须**自带 Lark 应用, 所以这条路是集群里每一个不在集群自身租户里的用户的默
  认路径。**而这只有在那张卡真的画出了那三件事的时候才成立**: 卡片把 `setup` 块画在字段
  **上面**(回调 URL 带复制按钮 + 三条前置), 并且永远不单独画 Test 的绿勾, 而是带上
  `test.caveat`(§14.2、§14.5)。少了这两样, "先开卡片"只是把同一个会在授权页上失败的流程推
  迟了两分钟: 用户填完 app id/secret、Test 变绿、`resolveIntegration('lark')` 从此答 `user`,
  向导再也不开那张卡, 而那个要抄进控制台的回调 URL 在产品里**从头到尾没有出现过**。答
  `cluster` 时按钮旁边写**"由集群提供"**, 用户一次点击就能连; 答 `user` 时什么都不多说。这不是一条 UI 偏好:
  连接按钮是这条链上唯一一个用户会点的东西, 而**没有凭据**与**凭据被拒**是两件事, 混成一句话就是又一次"报错文案不是诊断"。
- **设置:** 一个 `Channels` 分类, **与第一个设置项在同一个 commit 里加进
  `SETTINGS_CATEGORIES`**。那个数组*就是* SettingsUI 的渲染循环; 曾经有十个设置项发布出去
  却根本够不着, 只因为没人加那一行, 而 `test-architecture` §44 现在会为此让 build 变红。

### 10.2 到客户端的数据流

`GET /api/channels` 返回索引摘要(adapters + 会话 + 芯片 + 每个会话解析出来的 `convCaps`
与它的新鲜度声明)—— 绝不含消息正文。
`GET /api/channels/:id/messages?before=&limit=` 返回一页。
`POST /api/channels/:id/estimate` 在**服务端**对已存历史跑那个 PURE 估计器并返回计数(从
filter 编辑器 debounce 过来; 客户端永远拿不到语料)。变更类: assign、filter、reach、track、
approve、reject、edit、request-approve。

### 10.3 渲染敌意文本

v1 通过既有的 `escHtml` + linkify 路径渲染**纯文本** —— 任何地方都不许把 vendor 正文塞进
`innerHTML`, 也不许对一个陌生人的消息做 markdown 解析(那个 sanitizer 是好的; 攻击面才是重
点)。Gmail 的 HTML part 为时间线转成文本, 并给一个"打开原件"的入口, 指向既有的 `.eml` 查看
器(对一个已同步的邮箱)或者一个 vendor 深链。富渲染是一个 P5 项, 而它的落地处是**既有的
sandbox iframe 模式**(published pages 那种: 一条 `raw` 路由, sandbox CSP, 不带
`allow-same-origin`), 而不是 DOMPurify 过一遍再塞进我们自己的 DOM。

### 10.4 多客户端

每趟摄入广播一次, 不是每条消息一次: `channels-updated` 携带变化了的会话 id 与它们的新摘要
(未读、lastAt、芯片)。打开着的会话窗口在 id 匹配时重新取自己的尾巴。Proposal store 用
`channel-outbox-updated`。每一次持久化的变更都广播, 而写入 store 之后链起来的 UI 动作绝不
等那个回声 —— 这是常设的多客户端律。

---

## 11. Agent 那一面

**一个新的 CLI, `vibespace-channels`**(纳入 git 的静态文件, 加进
`HostManager.AGENT_TOOLS`, 手册在 `docs/agent/channels-manual.md`, 主题注册进
`AGENT_DOC_TOPICS` 好让 `vibespace-docs channels` 能用)。

```
vibespace-channels list                       # conversations visible to you (+ chips)
vibespace-channels read <conv> [--since|--limit]
vibespace-channels reply <conv> "text"        # PROPOSES; prints the policy verdict + proposal id
vibespace-channels status [<proposalId>]      # receipts / pending proposals
vibespace-channels request <conv> "why"       # only when the conversation is 'requestable'
```

为什么不去扩 `vibespace-msg`: 它的 `send` 是**投递**, 而这里的 `reply` 是**提议**。一个动词
名字扛着两种授权语义, 恰恰是这个代码库要惩罚的那种孪生; 两份手册互相交叉引用就够了。手册必
须用与 msg 手册相同的语气写明: (a) 一次 reply 是一条提议, 可能被编辑或被拒绝; (b) 回执会在
agent 的下一个 turn 到达, 除非用户另有配置; (c) 一个不可见的会话与一个不存在的会话是无法区
分的。

路由与既有 agent 路由一样是 `vsst_` 作用域的, 而且每条路由在咨询 `channel-acl` 之前先解析出
调用会话的 principal —— 一个 agent 永远无法放宽它自己的 reach。

---

## 12. Adapter 细节 —— 什么是验证过的, 什么不是

### 12.1 Lark

**在既有的自建应用上验证过**(来自运维笔记): 带自动刷新的 user-token OAuth; 读到授权用户能
看见的一切(所有 DM 加上他所在的每一个群), **不需要 bot 入群**; 聊天列表、按聊天的历史用
`next_page_token` 翻页, 以及为图片按消息抓取资源; 大约十五个已授予的 scope, 覆盖 IM 读、通
讯录、日历与文档。

**没验证过 —— 每一条都是一个决定或一轮工作:**

- **发送, 以及那个 scope 名字是拼错的。** 官方文档说以用户身份发送要**同时**申请两个权限:
  `im:message`(获取与发送单聊、群组消息)与 **`im:message.send_as_user`**(以用户身份发送
  消息)—— 第二个的分隔符是**点**, 而运维笔记与 r2 都写成了 `im:message:send_as_user`。
  这个错误在控制台里只会表现成"搜不到这个权限", 所以它值得单独写一行。两者都**不在**已授
  予的集合里, 而且从来没申请过; bot 身份发送也从来没跑过。加一个 scope 是: 在控制台里启用
  它 → 发布一个版本 → 重跑一次 OAuth。在这个应用上那次往返当天就完成了、没有审批等待, 不过
  这能不能推广是未知的(提申请的账号是这个应用的创建者)。
- **收件人到底看见谁, 没有文档。** 发送接口的响应里有 `sender.sender_type`, 取值含 `app`
  与 `user`, 但那份文档**没有**说清用 user token + `im:message.send_as_user` 发出去时它是
  哪一个, 而社区里有一份相反的报告称即使用 user token 也仍然是 `app`。所以这个 adapter 的
  `identityMarking` 声明成 **`unknown`**, 界面按 `marked` 对待(§9.5), 而 P4 的第一件事就是
  用一次真实发送把它变成 `none` 或 `marked`。
- **事件。** 这个应用上从来没启用过事件订阅; webhook 与 WebSocket 长连接两条通道都从来没有
  对它跑过。官方文档给出的边界是: 长连接**不需要公网 URL**、**只支持企业自建应用**、每个应
  用**最多 50 条连接**、推送是**集群模式不广播**(多客户端时每个事件随机只到其中一个), 订阅
  方须在 **3 秒**内 HTTP 200 应答, 而投递是 **at-least-once**(15 s / 5 min / 1 h / 6 h 重
  投, 最多 4 次, 成功也可能重复)。§6.4 按这些事实重新论证了推送作为一等接收模式。另有一份
  社区报告称 **Lark 国际版控制台根本不提供长连接**(只能 webhook)—— 未经 vendor 确认, 但它
  是 P1 的一个前置条件, 所以列在 §21 里。
- **授权的前置条件。** 控制台需要三样全齐: 注册好的回调 URL、授予好的 scope, 以及一个**已发
  布的版本**。缺任何一样, 失败的是*授权页*而不是 API 调用 —— 这是一个值得在连接向导的错误
  文案里写清楚的、令人困惑的失败形态。**r8 给了这三样一个落点**: 它们是 `lark` 那一行的
  `setup.prerequisites`, 与那条回调 URL 一起画在 Integrations 卡片的字段**上面**(§14.2、
  §14.5); 而因为 `credential-exchange` 这次 Test 在三样一个都没做的应用上照样成功, 那一行
  必须声明 `test.caveat`, 判决旁边永远跟着它自己的边界。
- **Redirect URI。** Lark 的控制台要求回调 URL 必须被*注册*, 所以 loopback 端口必然是**固定
  的** —— 与 Google 不同, Google 接受任何 loopback 端口, `src/gmail-sync.js` 因此可以绑一
  个临时端口。一个固定端口就是一个 machine-global 名字; §12.4 说这个流程为此做了什么。**而
  那条 URL 的字面量只在一个地方定义**: `lark` 那一行的 `setup.callbackUrl`(§14.2)。
  Integrations 卡片画的是它, `src/oauth-loopback.js` 的固定模式 import 的也是它 —— 一个必须
  与对方控制台**逐字节**一致的字符串不能有两份拼写。注册一个专用 URL(决定 4)解决的是
  VibeSpace 与运维工具之间的冲突, **仅此而已**。
  **两条补充(r7)**: ①官方文档明说"重定向 URL **支持配置多个**", 于是决定 4 那个"并排注册
  而不是顶掉他们的"不再是一个假设 —— §21 第 11 条因此从"未验证的假设"降级成"文档支持, 但
  这个应用的控制台上没试过"; ②**一个集群注册一次、服务 N 个实例**这件事不需要任何新东西, 因为
  redirect_uri 里根本没有实例的地址(它是 loopback = 用户浏览器那台机器), 而**真正**限制集群默认
  的是**租户**不是 URL —— 完整论证与那张 vendor 事实表在 §14.9, 决定 21 与决定 22 是它的两个卡点。

### 12.2 Gmail

**在树内验证过:** 走我们自己的 loopback 流程的只读 OAuth(授权 URL、同机浏览器的免手动完
成、远端浏览器的粘回), 从实例配置的 OAuth client 列表里解析出的预设 client, 带 404 重新播
种与按消息容忍 404 的增量 `history.list`, 以及落盘加密的 token。

**channels 新增的部分:**

- **线程即会话**(`threadId`), 加一条包含查询, 免得一个邮箱变成四万个会话。
- **发送**需要 `gmail.send`; 操作 label 则需要 `gmail.modify`。两者都是敏感 scope, 而 refresh
  token 的寿命取决于这个 OAuth client 的认证状态 —— 一个未认证/测试中的 client 的 refresh
  token **7 天**就过期(公开文档: 同意屏幕处于 Testing 且用户类型为 External 时即如此), 而这
  正是既有的 Gmail 挂载已经在忍受的痛。**把"加 scope"这件事说准(r7)**: 给一个 client 加一个
  scope**本身不会**作废已经发出去的授权 —— 一个已有的 refresh token 仍然为它当初被授予的那些
  scope 工作。真正会发生的是两件别的事: ①任何**现在开始请求**这个更宽 scope 的流程会对用户再
  弹一次同意屏幕(增量授权), ②这个 client 的**认证状态**从此是一个**决定管两个功能**的东西, 而
  未认证/测试中带来的 7 天 refresh token 会一起过继给只读的挂载。所以决定 5 有了一个更具体的
  答案: **让集群在 `VIBESPACE_GDRIVE_CLIENTS` 里多加一个 preset key**(比如 `channels`)而不是
  去拓宽现有那一个 —— 那张清单本来就是"这个实例提供哪些 client", 多一个 key 不需要第二份解析
  者、也不动任何现有挂载。`gmail` 那一行因此**委托**给 `MountManager.drivePresets()`, 见 §14.2。
- **发送时的线程串接:** `threadId` 加上取自记录 `Message-ID` 的 `In-Reply-To` / `References`。
- **发送时收件人看见的是用户本人 —— 但原始头里不是。** 经 Gmail API 发出的邮件会多一条点名
  `gmailapi.google.com` 的 `Received:` 头, 而经网页版发的没有。收件人的邮件界面里看不出任
  何差别(没有徽标、没有 "via"), 但"显示原始邮件"里可以。所以
  `identityMarking: 'marked'`, `identityMarkingWhere: 'raw-headers'`(§9.5) —— 这是 owner 那
  句"核实一下哪些是可见的"的答案: **界面里不可分辨, 原始数据里可分辨。** `X-Mailer` /
  `User-Agent` 都是可选头, 两条路都不会强制加, 所以它们不是判据。
- **Push 是一个带成本说明的可选升级, 不再是"不在路线图上"**(r3/Q3(c) 改了 r2 的措辞)。
  `users.watch` + Cloud Pub/Sub 要一个 topic 与一份 IAM 授权, 而那个 watch **7 天静默过
  期**、漏一次续期就无声停掉(所以要一个每日续期任务)。但两件事让它比 Lark 的长连接**更**
  适合我们: Pub/Sub 的订阅可以 **pull**, 所以同样不需要公网入站端点; 而每个实例可以有**自
  己的订阅**, 所以"这条推送通道是不是我独占的"在这里是一个可以**配置**出来的事实, 而不是
  一场随机赛跑。默认仍然是轮询(什么都没变时每 tick 一个请求), 推送在一个默认关闭的开关后
  面(决定 20)。

### 12.3 Agents(内建)

Channels v1 之上的一层门面: 会话 = agent 会话; reach = `msg-acl`(**不是** `channel-acl` ——
内部这个问题已经有答案了, 再来一个就是那个孪生); 发送 = `deliverToConversation`; 策略默认 =
**direct**, 照交互记录。在 adapter 列表里不可移除, 而它的"轮询"是个 no-op, 因为它的活消息本
来就走既有的那些通道到达。

### 12.4 `src/oauth-loopback.js` 是双模的, 而固定那一模是一个 machine-global 名字

抽出来的这个模块有**两**个模式, 因为这两个 vendor 不是同一个形状。§2 把这件事压成了一行;
那一行藏着一个决定:

| | loopback 端口 | 为什么 |
|---|---|---|
| Gmail | **临时端口** —— `listen(0, '127.0.0.1')`, 端口从 `server.address()` 读回来 | Google 接受任何 loopback 端口; 这恰恰就是 `src/gmail-sync.js` 今天在做的事 |
| Lark | **固定**, 并且在应用控制台里注册过 —— 端口与整条 URL 的字面量来自 `lark` 那一行的 `setup.callbackUrl`(§14.2), 本模块 import 它、不自己声明一份, 普查断言这里不出现那个字面量 | 这个平台只会重定向到一个事先注册过的 URL, 而那条 URL 要逐字节一致 ⇒ 它只能有一个定义处, 并且必须被画在用户抄得到的地方(§14.5) |

一个固定端口, 恰恰就是 `scripts/ci.mjs` 的 `machineGlobalFixtures` 与 heavy 档的 `/tmp` 锁存
在要治的那一类名字 —— 这台机器上跑着一个 systemd 生产服务, 旁边还有许多开发检出。两个实例同
时跑一次 Lark 授权流程, 意味着**输的那个**从 `listen()` 拿到一个不透明的 `EADDRINUSE`, 而且
是在用户已经被送去授权页*之后*, 同时持有端口的那个实例收到的是另一个实例的授权码。决定 4 修
不了这件事; 注册说的是另一种冲突。所以这个模块:

- 只在**一次流程持续期间**绑那个固定端口, 两次流程之间绝不占着它, 并且在完成、取消与超时时
  一律释放;
- 把 `EADDRINUSE` 变成一次**具名拒绝** —— *"另一个 VibeSpace 或工具正在端口 N 上跑一次 Lark
  授权流程; 把它做完或取消掉, 或者改用粘回"* —— 并直接落到**粘回 (paste-back) 那条路**上,
  它根本不需要任何本地端口(用户把浏览器够不到的那个回调 URL 粘回来)。用远端浏览器的用户本
  来就走这条路, 所以它不是一个新面, 它是既有的那个面被提早变得可达;
- 把 `state` 的 CSRF 检查从 `src/gmail-sync.js` **执行它的两个地方逐字**带过来 —— loopback
  的请求处理器与 `forwardCallback` —— 而套件把两个都钉住。一次把它掉了的抽取, 会把一个固
  定的、公开已知的 loopback 端口变成任何本地进程都能用的代码注入靶子; 而临时端口的那个原
  版对这件事宽容得多, 这正是这个风险*随着*抽取而到来、而不是被抽取继承下来的原因。

所以 `test-oauth-loopback` 有一条**预先占住端口**的腿, 断言那次具名拒绝加上粘回回落, 还有一
条对两种模式各重放一次 `state` 错误的回调的腿。

### 12.5 本地客户端 adapter(WhatsApp / WeChat)—— 一个 adapter 类, 而不是两个 adapter

r3/Q3(b) 要求把这一类**建模**出来。它与 Lark / Gmail 的区别不是节奏, 是**证据来源**: 没有
一个我们能调的 vendor API, 只有一个跑在某台机器上的官方客户端, 以及它自己写下来 / 画出来的
东西。所以 `receive: 'scan'`, 并且它必须再回答一个问题 —— 扫的是**什么**:

| `scanSource` | 读什么 | anchor | 延迟 | 发送 |
|---|---|---|---|---|
| `'store'` | 客户端自己写下的本地库, 按 rowid / 时间戳带游标增量读; 对库文件的 fs.watch 是一次**游标 kick**, 去抖到 `caps.scanLatency.store`(§6.4), 绝不是"每次写盘扫一遍" | 客户端**自己的**消息 id(库里就有那一列)⇒ `historyBySource.store = 'since'` | 秒级 | **它自己没有发送通道**(r6): 读库是只读证据。发送只能来自 `'ui'`; 那条通道没接上时 `convCaps.sendAs: []` + `why:'no-send-lane-on-this-host'` —— 协议库被围栏 13 拒绝 |
| `'ui'` | 客户端**渲染出来的界面**, 由 agent-browser 的一个 profile 驱动(`docs/design-agent-browser-v2.md`: profile = user-data-dir + provider + 指纹种子 + 代理, 外加一个 VibeSpace 自己拥有的实时视图) | 通常没有稳定 id ⇒ 一把**声明出来的**合成键 ⇒ `historyBySource.ui = 'page'`, **绝不是 `'none'`** | 分钟级 | agent-browser 在那个客户端自己的输入框里打字 |

**r5(owner 的更正): `'store'` 不是一个假想的格子, 它在 macOS 上是真的。** r4 写下的那句
"决定 19 把 `'store'` 对**两个**平台都排除掉了"对 WeChat 成立、对 WhatsApp **不成立**, 而
它之所以读起来像一句话, 是因为它把两件完全不同的事塞进了同一个词: WeChat 的库是**加密的**
且密钥在**进程内存**里, 而 WhatsApp 在 macOS 上**根本没有加密它**。围栏 13 拒绝的是前者;
后者是一次普通的、被用户授权的、只读的文件读取。这个区别不是措辞, 它决定这一类到底是"只能
看屏幕"还是"在跑着官方客户端的那台机器上有一条带真 anchor 的秒级通道"。

#### 平台矩阵(这一类真正的形状)

| 平台 | 官方客户端 | 本地库 | 我们的来源 |
|---|---|---|---|
| **macOS** | WhatsApp for Mac —— **Catalyst** 那个(Mac App Store); 老的 Electron 版 2024 年已宣布弃用 | `~/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite`(同名变体还有 `.private` 与 `group.net.whatsapp.family`)—— Core Data 存储, **未加密**, 裸 `sqlite3` 就读得出 `ZWAMESSAGE` / `ZWAMEDIAITEM` | **`'store'`**(过 TCC 那道门之后) |
| **Windows** | WhatsApp Desktop(UWP 与较新的 WebView2 两种架构) | `%LOCALAPPDATA%\Packages\5319275A.WhatsAppDesktop_cv1g1gvanyjgm\LocalState` —— SQLite **加密**: UWP 用 SQLite Encryption Extension(SEE), dbKey 由一个在应用之外取不到的机器唯一标识派生; WebView2 那一支的各类密钥用 DPAPI-NG 保护 | `'ui'` —— 复原一把 vendor 扣住的密钥, 与读进程内存是同一类行为(围栏 13) |
| **Linux** | **没有官方桌面客户端**; 官方途径只有 WhatsApp Web | 不存在 | `'ui'`(web-in-profile) |
| **任意** | WeChat 桌面端 | SQLCipher / WCDB **加密**, 密钥只存在于运行中客户端的**进程内存**里 | `'ui'`(围栏 13, 未变) |

#### 于是 `scanSource` 不是一个按 adapter 种类的静态事实

同一个 WhatsApp adapter 在 macOS 上读库、在 Linux 上刮界面。而 `caps` 按定义是按**种类**的
静态声明(§2), "这台机器上有什么"是按**部署**的事实 —— 这与 r4 删掉 `caps.pushExclusivity`
的理由**逐字相同**, 所以处理方式也相同: 标量 `caps.scanSource` **删除**, 换成

- `caps.scanSources` —— 一张按平台的表(`{ darwin:'store', win32:'ui', linux:'ui' }`), 静态
  的**上界**声明, 与 `convCaps ⊆ caps` 是同一个方向: 解析只许收窄, 绝不许放宽;
- `caps.scanLatency` —— 按**来源**给数(`{ store: 15, ui: 300 }` 秒), 因为两条路差一个数量
  级; 它既是**声明的**节奏, 也是那个 fs.watch kick 被去抖到的**上限**(§6.4), 而画在会话行
  上的是**实测**年龄(见下面性质 1);
- `caps.historyBySource` —— **同一条理由的第二个字段**(r6): `{ store:'since', ui:'page' }`。
  `history` 原本是一个按**种类**的标量, 可上面这段刚刚论证完这一类**一个 adapter 会同时跑
  两格** —— 于是那个标量无论填什么都是错的: 填 `'since'` 就要求 Linux 那格用一次 DOM 刮取
  去兑现 since-anchor 语义, 填 `'page'` 就把"真 anchor ⇒ `history:'since'`"删掉, 而那正是
  决定 19 与 §5 不变量 2 给出的、`'store'` 之所以被优先的**全部**理由。同一个上界表, 同一
  个解析器, §4 的契约规则同时管住"每个值都不许是 `'none'`"与"键必须盖住 `scanSources` 点
  名的每一个来源";
- `src/channel-caps.js` 里**唯一**的解析器
  `scanState(caps, adapterRecord, hostFacts, now)`, 把平台、客户端在不在、读取授权、以及那
  份机器事实的**年龄**折成一个答案, 与 `laneState` 同一个形状、同一条法则(*折成答案的地方
  只能有一个*), 并且和它一样答 `via`。

```js
scanState(caps, adapterRecord, hostFacts, now)
      -> { via:     'scan',                  // r6: 判别字段, 让 freshnessClaim 与 laneState()
                                             //     的答案组成的 union 是显式的
           source:  'store'|'ui'|null,       // 这条会话此刻实际走的来源
           history: 'since'|'page'|null,     // r6: caps.historyBySource[source], 解析后的值
           carryContent: false,              // r6: 一次 scan pass 就是一批(§6.4), 恒为假
           why:     'store'|'no-store-on-platform'|'store-encrypted'
                    |'client-not-installed'|'tcc-denied'|'user-chose-ui'
                    |'host-facts-stale'|'no-source',
           latencySeconds,                   // caps.scanLatency[source] —— **声明的**节奏,
                                             // 也是 fs.watch 的去抖上限(§6.4)
           storePath,                        // 只在 source==='store' 时有; 绝不进日志
           grant:   'granted'|'needed'|'denied'|'unpromptable'|null,
           hostFactsAgeSeconds }             // r6: now - hostFacts.at; 面板要把它说出来
```

优先级同样写死: **事实新鲜 > 平台声明 > 客户端在场 > 读取授权 > `'ui'`**(r6 把新鲜度放在
第一级: 它下面每一级读的都是 `hostFacts`, 一份陈旧记录会让那四级全都在回答"这台机器**当时**
是什么样", 而不是此刻)。而它带一条**刻意的例外**,
没有这一条这个解析器就会变成它要防的那个东西:

> **被拒绝的读取不会自动降级成 `'ui'`。** `tcc-denied` 是一个**具名**答案(`source: null`),
> 由连接向导渲染并给出授权步骤; 落回 `'ui'` 是用户在向导里做的一次**选择**(`user-chose-ui`),
> 不是产品替他做的一次静默降级。理由就是下面第 1 条性质: 会话行上那个延迟数字是这一类**全
> 部**的诚实性契约, 而把一条 15 秒的通道悄悄换成一条 5 分钟的通道, 恰好就是把那个数字变成
> 谎话。同一条规则的镜像也成立: 客户端根本没装(`client-not-installed`)时答的是 `null` 加
> 一个理由, 不是一次空扫描 —— 空结果与"我们没在看"逐字节相同, 而那正是围栏 8 的形状。

#### 两个平台各自的风险陈述

- **WhatsApp。** 在 **macOS** 上, 官方 Catalyst 客户端把它的整份聊天历史留在一个**未加密**
  的 Core Data SQLite 库里, 于是 `scanSource: 'store'` 是一次普通的只读文件读取: 有真
  anchor、秒级延迟、不需要 agent-browser、也不需要一个第二份登录 —— 这条路在有它的时候
  **优先于** `'ui'`。在 **Windows** 与 **Linux** 上没有这条路(前者库是加密的, 后者压根没有
  官方客户端), 剩下的是官方 Web 客户端跑在一个 agent-browser profile 里, 即
  `scanSource: 'ui'`。**发送按来源分开说, 这不是同一件事(r6 更正)**: r5 那句"两条路的发送
  是同一件事 —— 在那个已登录的官方客户端自己的输入框里打字"对 `'ui'` 成立(agent-browser
  在一个网页里打字), 对 macOS **无定义** —— 那里的官方客户端是一个**原生 Catalyst 应用**,
  没有任何浏览器 profile 够得着它。所以: `'ui'` = agent-browser 在那个 Web 客户端的输入框
  里打字, 身份就是用户本人(`identityMarking: 'none'`); 而 macOS 的 `'store'` **自己没有发
  送通道**(库是只读证据), 它只有两个候选, 而**本设计不替 owner 选**(见 §21 与决定 19):
  (a) 把同一个 Web 客户端开在一个 profile 里 —— 那是**第二份 linked-device 凭据**, 一条对
  话两个登录, 必须与 `auth.state()`/`scanState().grant` 并排建模成它自己的一行, 或者 (b)
  原生 macOS UI 自动化(Accessibility / CGEvent), 一条本文档此前从没点过名、且需要它**自己
  那份** TCC 授权的机制。在这两者之一被接上之前, 这一类在 macOS 上是**只读**的, 而且是
  结构性的只读: `convCaps.sendAs` 解析成 `[]` 且 `why:'no-send-lane-on-this-host'`, §4 现成
  的规则把它渲染成"不提供并说出理由"并且**不许**建出任何 proposal。另一条路是协议库(whatsmeow /
  Baileys): 它们是逆向出来的**非官方客户端**, 而非官方客户端被 WhatsApp 的条款明确禁止;
  公开报道里封号确实落在过低流量、只回复的正常使用上, 而合规的替代品是走认证服务商的官方
  Business Cloud API(它是 bot 身份, 所以 `identityMarking: 'marked'`)。⇒ 协议库那条路
  `tosRisk: 'prohibited'`, 默认不提供(围栏 13、决定 19)。
- **WeChat —— 一个字都没变。** 桌面端的本地库是 SQLCipher / WCDB 加密的, 而那把密钥只存在
  于**正在运行的客户端进程的内存里** —— 所有公开工具都是从那里把它抠出来的。**读另一个进
  程的内存不是这个产品会做的事**(围栏 13), 所以 WeChat 的 `'store'` 这条路**不存在**, 在
  每一个平台上剩下的都只有 `'ui'`。WhatsApp 在 macOS 上多出一条路, **没有**给 WeChat 多出
  任何东西: 分开这两者的不是平台, 是**那份库有没有被加密**。

#### `'store'` 那一格的摄入契约(r5)

- **anchor 是真的。** 那张消息表同时带 rowid 与客户端自己的消息 id, 所以
  `ChannelRecord.vendorId` 拿到一个**真的** vendor id, `raw.synthetic` 保持 false —— §5 不
  变量 2 在这里根本用不上那把合成键。这才是"有 `'store'` 就优先"的真正理由: 不是它更快,
  是**它有一把不是我们编出来的键**, 于是重扫塌成一条这件事是平台保证的而不是我们赌的。游
  标是 `(rowid, 时间戳)` 一对: rowid 单调, 时间戳用于库被换掉之后重新对齐。
- **什么叫"完整的一趟"。** 一趟开始时先记下当时的最大 rowid, 读到它为止 ⇒ `complete: true`
  且 anchor 前进; 中途任何失败(库被换、读被拒、进程退出)⇒ `complete: false`, anchor 不
  动, 下一趟重读。与 §5 不变量 4 同一条规则, 只是换了一种证据。
- **绝不写 —— 而"绝不写"的那条机制在 r6 之前是反的。** r5 写的是"优先用 backup API 或
  `VACUUM INTO`, 而『以只读方式打开活库』不够, 因为这是一个 WAL 库", 两半都错, 且刚好错成
  互相支撑的样子: 会**静默漏掉**最近消息的是**只读那个 `.db` 文件本身**(它不含 WAL), 而
  "以只读方式**打开**"读得到 WAL 内容 —— 与此同时, 被推荐的那条路的源连接只能是**默认**
  (读写)打开, 而那正是唯一会改动那个库的开法。规则改成:
  **以 `SQLITE_OPEN_READONLY`(`file:…?mode=ro`)打开那个活库, 然后从这条只读连接做
  `VACUUM INTO` / backup 拿到一份 scratch 快照, 读那份快照。**
  一次性 fixture 上的实测(node v24.12.0 的 `node:sqlite`; 生产者被 SIGKILL, 留下一个没
  checkpoint 的 WAL: `db` 8192 B sha `b383fc2c3cf06e24`, `-wal` 4152 B, `-shm` 32768 B;
  每一臂都从逐字节相同的拷贝开始):

  | 这一臂 | 读到的行 | `db` | `-wal` | `-shm` |
  |---|---|---|---|---|
  | 默认打开, **我们是唯一连接** | `OLD1,OLD2,`**`NEWEST`** | **被改写** `ee24f1b1…` | **被删除** | **被删除** |
  | 默认打开, 客户端还连着 | 同上三行 | 逐字节相同 | 逐字节相同 | 逐字节相同 |
  | `readOnly:true`, 唯一连接 | `OLD1,OLD2,`**`NEWEST`** | 逐字节相同 | 逐字节相同 | 被重写 |
  | `readOnly:true`, 客户端还连着 | 同上三行 | 逐字节相同 | 逐字节相同 | 逐字节相同 |
  | `readOnly:true`, `-shm` 不可写 | `OLD1,OLD2,`**`NEWEST`** | 逐字节相同 | 逐字节相同 | 逐字节相同 |
  | 从只读连接 `VACUUM INTO` | 快照含全部三行 | 逐字节相同 | 逐字节相同 | 被重写 |
  | 从只读连接 `backup()`(异步) | 快照含全部三行 | 逐字节相同 | 逐字节相同 | 被重写 |
  | 只读**那个 `.db` 文件本身** | `OLD1,OLD2` —— **NEWEST 不见了** | 逐字节相同 | 逐字节相同 | 逐字节相同 |

  第一行就是 SQLite 有文档的**最后一个连接 checkpoint 并删除 WAL** 的行为, 而"我们是最后
  一个连接"对一次**排期的后台扫描**是**常态**(owner 退出了客户端 / 重启过 / 人不在), 也正
  是 §17 那个合成 fixture 的形状。`-shm` 是 WAL 的索引、不含任何消息内容, 且在它不可写时
  只读连接**完全不动它** —— 所以"绝不写"的可断言形式是 **`db` 与 `-wal` 逐字节相同**,
  绝不是三个文件一起(见 §17)。绝不 checkpoint, 绝不删 WAL, 绝不用**默认**(读写)方式打
  开 —— 这条通道对那个客户端的唯一可观测影响必须是一次短暂的共享锁。
  把 `db` / `-wal` / `-shm` 三件一起复制**保留为兜底**(只在 `-shm` 挂不上时用), 并写明它
  的代价: 那是一次**撕裂读**的风险(复制到一半客户端可能 checkpoint), 而只读打开恰恰避开
  了它。
- **用哪个 SQLite 读者, 是一个要在这里回答的决定(r6)。** 这条通道跑在 **daemon** 里, 而
  daemon 是一个 esbuild 单文件包, `--external` 恰好只有一个 `node-pty`(package.json 的
  `build:agentd`), 安装脚本把它称作 "zero-dep" 且 `NODE_MIN=18`, node-pty 是**尽力而为、
  失败不致命**地单独装的。于是三个候选各自撞上本仓已经写下来的约束, 定案与理由:
  ① **推荐: 有界子进程 `sqlite3(1)`, 每趟一次 spawn**(围栏 3 认可的形状 —— "每趟一次,
  不是每条一次"; macOS 自带 `/usr/bin/sqlite3`, 而 `VACUUM INTO` 在 CLI 上就能做) ②
  `node:sqlite` 放在**运行时能力探测**后面, 并**明说它要求把 `NODE_MIN` 抬上去**: 它在
  Node 18/20 上根本不存在(22.5.0 才加入), 在 Node 24 上仍然打 `ExperimentalWarning`(实
  测), 而且**取行的 API 是同步的**(`DatabaseSync`/`StatementSync` —— 它的 `backup()` 确
  实是异步的, 所以危险的是**扫行**那一段, 不是拷快照那一段), 而 CLAUDE.md 写着这个 daemon
  "carries live session pipes — revisit only with daemon-side worker isolation", 那正是围栏
  3 自己的法条 ③ **原生绑定(`better-sqlite3`)明确拒绝**, 理由就是那个包: 它要第二个
  `--external` 外加一份按平台预编译的产物送到那台 Mac —— 也就是 node-pty 那个故事, 而
  node-pty 降级了只是终端不能用, 这里降级了就是**这个功能本身**不能用。
  哪一级都拿不到时, `channels-scan-store` 的失败词表里有一个**具名**答案
  `no-sqlite-reader` —— 绝不是零条消息(围栏 8 的形状)。`test-architecture` 的 SHARED 规则
  看不见这件事(node 内建是允许的), 只有 daemon 的打包会在 build 时看见, 所以这个决定写在
  这里而不是留给实现。
- **TCC 是一道具名的门。** macOS Sonoma 14 开始保护 `~/Library/Application Support/` 下的
  应用容器, Sequoia 15 把这个保护**扩展到** `~/Library/Group Containers/`; 一个既不是以那
  个客户端的 Team ID 签名、也不是从 Mac App Store 装出来的进程, 要么收到一次(按进程实例、
  临时的)授权提示, 要么直接被拒。所以这条通道的失败形状是一个 `EPERM`, 而它必须以
  `tcc-denied` 的名字到达用户并在连接向导里给出授权步骤(§13), **绝不是一次读到零条消息的
  成功扫描**。

**它跑在哪台机器上: 一个 agentd op, 而 `hostId` 是参数。** 库在哪个客户端跑的那台机器上,
读它的代码就得在那台机器上跑 —— 这正是 CS 分离律的形状, 而**本机是设备 #0**
(`hosts.device(falsy)`), 所以这里没有"本地一套、远程一套"这回事: 一个 `channels-scan-store`
op(daemon 侧的 handler + hello-ack 里的一个能力位 + 三触规则), 一份实现, `hostId` 从 v1 的
`local` 换到一台配对的 Mac 就只是换一个参数。这也让 §15 里"跑在配对设备上的 adapter"那一行
第一次拿到一个**真实的消费者**, 而不是一句预留 —— 因为这一类天然就是它: 官方客户端跑在
owner 的 Mac 上, VibeSpace 跑在别处。

#### `'ui'` 那一格自己的摄入契约(r4, 保留)

`'ui'` 不再是这一类"发布出去的全部"(macOS 上的 WhatsApp 走 `'store'`), 但它仍然是
**Windows、Linux 与全部 WeChat** 的唯一来源, 所以这三行一个字都不减 —— 而 §6.3 那句"两者都
是带游标的周期扫描"里的游标, 在这一格里是这样的:

- **anchor。** 优先用客户端自己暴露的消息 id; 客户端不暴露稳定 id 时, adapter 必须**声明**
  一把合成键 `(convId, renderedAt, sha256(author|text))` 写进 `ChannelRecord.vendorId`, 并
  且置 `raw.synthetic: true` —— 于是 §5 不变量 2 仍然有一把键, 而"这把键是我们编的"这件事
  是**看得见的**(它决定了同一块屏幕重扫时会不会塌成一条)。这把键的代价要说清楚: 同一个人
  在同一次渲染刻度里发两条一模一样的消息会塌成一条, 而这比每次滚动都造一批重复要好 —— 两
  个方向都由下面那条 parity 腿钉住。
- **什么叫"完整的一趟"。** 对一次受滚动限制的读取: 向上滚到了那个存下来的 anchor ⇒
  `complete: true`; 先撞到滚动上限(客户端不肯再往回给了)⇒ `complete: false`, 也就是
  **anchor 不动**, 下一趟重读。这与 §5 不变量 4 是同一条规则, 只是换了一种证据。
- **`history: 'none'` 在 `receive: 'scan'` 上是禁止的**(§4 的契约规则)。§5 不变量 4 要的
  是"完整的一趟"与 `complete:false`, 而一个连翻页调用都没有的 adapter 两件事都报不出来;
  §4 又规定没声明的能力**抛异常**, 于是 §6.3 那句"翻到已存的 anchor 为止"在它身上根本不
  可能发生。**这条对两格都成立**: `'store'` 那一格用 `'since'` 满足它, `'ui'` 那一格用
  `'page'` 满足它, 而 `'none'` 在这条通道上没有合法的填法。

**这一类共有的三条性质**, 全都直接掉进已有的机器里:

1. **会话行上有两个不同的数字, 而这一行必须说清自己在显示哪一个(r6 改正)。**
   r5 写的是"延迟来自 `scanState` 不是来自一条静态声明", 而这句话按字面**不成立**:
   `scanState().latencySeconds` 就在它上面两行被定义成"来自 `caps.scanLatency[source]`" ——
   一张按**种类**的静态表, 只不过被那次解析**索引**了一下。两个数字都是真的、也都要说:
   **声明的节奏** = `caps.scanLatency[source]`(按 `scanState` 的解析取值; 它也是 fs.watch
   的去抖上限, §6.4), **实测的年龄** = `convEntry.lane.lastScanAt` 对 `now`。会话行画的是
   后者, 而 `freshnessClaim(caps, scanState(…), convEntry, now)` 对 `scan` 返回 "上次扫描
   在 <t> 之前" —— **它必须拿到那个时钟**才可能算得出来(§4 的契约规则)。AssignFilter 面板
   在用户把一件事交给这条通道之前就把它说出来。一个 5 分钟扫描一次的通道在做值班告警这件事
   上是诚实的, 在做实时客服这件事上是不诚实的 —— 产品负责让人在**指派之前**看见这个差别。
   这也正是上面那条"被拒绝的读取不自动降级"存在的理由: 同一个 adapter 在两台机器上会画出两
   个不同的数字, 而那两个数字都必须是真的。
2. **凭据不是 token, 是一个登录着的客户端 —— 而 `'store'` 那一路是两个事实。**
   `auth.state()` 回答"那个客户端还登录着吗", `needs-reauth` 的动作是"打开实时视图重新扫一
   次码", 不是一次 OAuth 往返。`'store'` 那一路在它之上还多一个**正交**的事实: 我们有没有
   被授权去读那个文件(`scanState().grant`)。两个事实分开存、分开渲染: 客户端登出了库还在
   (读得到, 但它不再更新), 授权被撤了客户端还登录着(它在更新, 但我们看不见)—— 把这两件
   事合成一个布尔, 就是让其中一种情况顶着另一种的文案。**而这两个事实都会过期, 授权还从来
   不跨一趟被信任(r6)**: `hostFacts` 有 6 小时 TTL 与三个具名刷新触发点(§4/§5 不变量 7),
   而一个存下来的 `grant:'granted'` 是一个**按构造会过期**的主张 —— macOS 的 TCC 授权在系
   统设置里随时可以被撤销, 而决定 19(d) 记下的那次提示本身就是"按进程实例的、临时的" ⇒ op
   自己的 `EPERM` 才是权威, 一次答成 `EPERM` 的 `granted` 立刻重新归档成 `tcc-denied` 并把
   存下来的授权清掉。
3. **它天然是配对设备那件事的第一个真实用例**(§15): 客户端跑在哪台机器上, 这个 adapter 就
   得在哪台机器上跑。接口本来就接收一个 machine handle, 所以这件事是接线不是重写 —— 而
   `'store'` 那条路把它从"将来会有用"变成了 P6 的**前提**: 一台配对的 Mac 上的
   `channels-scan-store` op 就是这一类最好的那条通道。

**排期与门控:** 接口从 P0 起就带着这一类需要的每一个位(`scan` / `scanSources` /
`historyBySource` /
`scanLatency` / `scanState` / `convCaps` / `tosRisk`), 而且假 adapter 会**两种来源都真的跑
一遍** scan 模式, 所以这条通道从第一天起就在 `test-channels-lane-parity` 的覆盖里。具体的
WhatsApp 与 WeChat adapter 是 **P6**: `'ui'` 那一半门控在决定 19 与 agent-browser 系统落地
上, 而 macOS 的 `'store'` 那一半**只**门控在决定 19 上 —— 它不需要 agent-browser, 所以它是
这一类里唯一一条今天就能独立落地的腿, **而这恰恰也意味着它是只读的(r6)**: 那条腿的交付物
里没有任何发送路径, 于是它**必须说出来** —— `convCaps.sendAs` 解析成 `[]` 加
`why:'no-send-lane-on-this-host'`, 由 §4 现成的规则渲染成"不提供并说出理由"。

---

## 13. 密钥、过期、失败

- **Token 怎么存、怎么加密、怎么脱敏, 只说一次, 说在 §14。** channels 自己的 token 落在
  `data/channels/` 下, 用 §14.7 的 `src/secret-box.js` 加密(它自己的密钥文件
  `data/.channels-key`, 0600), 经同一个 `publicView()` 形状脱敏, 绝不记日志、绝不进 argv。
  那次抽取因为 §14 的存在已经**从 P1 提前成 P0 的前置条件**(§19), 所以 r2 那句"如果抽取推迟
  了就点名那个孪生"在本轮变成了一条更强的约束: 它不许推迟。
- **这一层与 §14 那一层是两个东西, 而且必须一直是。** §14 存的是**管理员能给你的**应用/客户端
  凭据与 API key(集群默认、按 KEY 解析、可被集群轮换); 这里存的是**你自己授权出来的** token
  (一个用户、一次同意、一条会过期的 refresh token)。两者的生命周期、轮换方式与导出规则全都
  不一样 —— 把它们混进一个 store, 正是这份设计到处在防的那种孪生(§14.11 第 8 条)。
- **Auth 状态是四值的而且诚实:** `connected` / `needs-reauth`(带过期时刻与一个倒计时)/
  **`needs-credentials`** / 在读不出 token 记录时是 `unknown`。绝不乐观。Adapters 那一行渲
  染的就是这个。
- **第四个值是 r8 加的, 因为这个答案有两个输入而 r7 只接了一个。** `auth.state()` 原来只读
  token 记录, 而 §14.3 只在 Integrations 那张卡上处理"集群默认消失了"; 两块面因此可以对同一
  件事给出相反的答案 —— token 好好的、没过期, 而管理员轮换或撤掉了 `VIBESPACE_INTEGRATIONS`,
  于是 Adapters 那一行写着 `connected`、Integrations 那张卡写着 `未配置`, 而这个 adapter 在
  那一刻**已经死了**: Lark 的 `tenant_access_token` 是**每次调用**拿 app id + secret 现换的,
  Gmail 的 client id/secret 是**每一次 refresh** 都要的。真相要等到本节最后那条"连续 3 趟失
  败变琥珀"才到, 而它给出的解释只是一个 vendor 4xx。所以 `auth.state()` 现在吃
  `resolveIntegration(id)` 作为输入, 而 `why` 点名缺的是什么(`集群默认已被撤走` /
  `缺 appSecret`)。**它不是 `needs-reauth`**(再同意一次修不好它), **也不是 `unknown`**(我们
  恰恰非常清楚坏在哪), 而这正是这个代码库反复记下的那一类: 一条记录的两个面互相矛盾。而这
  也是 owner 那条集群指示最容易造出来的形态 —— 管理员轮换或撤走一个集群默认。
- **本地客户端那一类有两个正交的凭据事实, 而它们各渲染各的**(r5, §12.5)。`auth.state()`
  回答的是"那个官方客户端还登录着吗"; `scanState().grant` 回答的是"操作系统让不让我们读
  它写下的那份库"。**`tcc-denied` 是一个具名的拒绝, 不是一次空扫描**: 连接向导把它渲染
  成一条带步骤的行(在 macOS 上是"给这个 daemon 授予完全磁盘访问, 然后重试"), adapter
  那一行变琥珀色, 而这一类的扫描**不会**在这时候偷偷落回界面扫描 —— 落回去是用户在向导
  里按的一个按钮。理由与围栏 8 是同一条: 一次读到零条消息的成功扫描, 与一次被拒绝的读
  取, 在下游是逐字节相同的, 而其中一个是谎话。
- **失败必须到达用户。** 连续 N 趟失败(默认 3)把那一行变琥珀色, 并归档一条点名 adapter 与
  vendor 自己的错误文本的 "For you" 条目; 恢复时**撤回**它。一次 `rate-limited` 退避显示为
  一个倒计时, 不是一个错误。

---

## 14. 集成密钥与配置界面

> **Owner 指示(2026-09-11, 原话):** "对于指纹浏览器和 communication panel 这种可能需要配置
> 自己的 key 的情况, 要考虑怎么提供配置界面, 让我们集群里的用户可以自行配置(当然 lark 这种
> 集群里能提供默认 oauth client 的就提供默认)"。
>
> 这一节是一个**共享层**, 不是本设计的附属品: 同一批名字也服务
> `docs/design-agent-browser-v2.md` 的 `cloak` / `cloud:<name>` 后端(那份设计还住在另一个分
> 支上 —— §21 第 20 条)。**两份文档使用同一批名字, 而名字在这里定义。**

VibeSpace 以**两种形态**运行, 而这一节存在的全部理由就是这两种形态对同一把 key 有不同的答案:
集群里**每个用户一个 pod**(helm chart 把这个实例自己的公开地址作为 `VIBESPACE_PUBLIC_URL` 注
进去 —— `deploy/helm/vibespace-user/templates/main.yaml:172-176`), 以及单用户自托管。有的集成
需要一把**每个用户自己付费**的 key(CloakBrowser 的席位、云浏览器供应商), 有的可以由集群**注册
一次**的 OAuth 应用服务(Lark), 而其中一类**今天已经有**集群预设机制(Google Drive / Gmail)。

今天这三类各自为政。再加一个集成, 就是再发明一份 env 解析、一份加密、一份界面。本节把它们收成
**一张 PURE 的表 + 一个 store + 一个窗口**, 并且把优先级钉成一句话: **用户自己的 > 集群默认 >
没有**。

### 14.1 这棵树里已经有的三份先例, 以及一个必须避开的地方

这一层不发明机制。它把已经在生产里跑着的三份先例合成一份, 每一条都点名了它抄的是什么:

| 先例 | 在树里的位置 | 这一层照抄的那一条 |
|---|---|---|
| Drive / Gmail 的**集群预设** | `src/mounts.js:2189-2206` 的 `drivePresets()`: env `VIBESPACE_GDRIVE_CLIENTS` = JSON `[{key,label,clientId,clientSecret}]`, 旧的一对 `VIBESPACE_GDRIVE_CLIENT_ID`/`_SECRET` = key `'default'`; `_driveClient()` `:2211-2216` 的优先级是**记录上的自定义 client > 选中的预设 > 单个或 `'default'` 预设 > 工具自带**; 界面在 `src/lib/sidebar-mounts.js:1747-1751` 给出预设下拉与 `Custom (own client id/secret)`, 而那个 `type:'password'` 的自定义 secret 字段在 `:1771` | **记录只存预设的 KEY** ⇒ 轮换 env 就轮换了每一个消费者(`:2187-2188` 的注释逐字这么写), 以及那条优先级的形状 |
| frp 的**集群默认 + 用户覆盖** | `src/plugins.js:569-580` 的 `_frpCfg()`: `data/plugins.json` 里的用户值胜过集群 env, 而 `fromEnv` 把"这是集群给的"作为一个**事实**交给界面; `:694` 的 status 只出 `hasToken` 从不出 token; `:584-588` 集群注了 env 就**默认启用**; `:679-682` 点名**缺的是哪一个字段** | 用户覆盖 > 集群默认; `fromEnv` 是界面必须画出来的事实; **永远只报 `hasToken`**; 以及"点名那个缺口" —— 那三行注释记着 2.227.10 的事故: 用户填了地址与端口、token 空着, 而界面只说"relay not configured", 一个无从下手的死胡同 |
| 落盘加密 | `src/mounts.js:369-381` 的 `_enc`/`_dec`(aes-256-gcm, `iv.tag.data` 三段 base64), 密钥文件 `data/.mounts-key`(`:47`, 0600) | 同一个原语, 但**抽成 `src/secret-box.js`**(§14.7) —— 并且**刻意不继承** `_key()` `:360-367` 里那个裸 catch |

必须避开的地方只有两个, 而它们都是"看起来顺手"的那种:

| 不要放在这里 | 为什么 |
|---|---|
| **设置项** | **密钥绝不进设置, 一条都不行。** 设置走 SyncStore: 每一个值都广播给每一个连着的客户端; 而 `/api/config/export` 的 `take('settings', readSettings)`(`src/routes/persistence.js:698`)把整份设置**明文**写进导出文件 —— 它不在 `sensitive` 那一半里(`:679-686`), 只有那一半才要 passphrase。把一把 key 放进设置, 等于同时做了"广播给每个打开的标签页"和"明文进备份文件"两件事, 而且两件都不会有任何提示 |
| **插件卡片** | frp 的 relay token 留在插件卡片里**不迁**(§14.6 把它记成一个**被点名的**孪生)。它是一个插件**进程生命周期**的配置, 它的消费者是 keeper, 不是一个会去问 `resolveIntegration()` 的功能。迁它要整体迁(卡片 + `fromEnv` 默认启用那条规则 + keeper 的读取), 那是一次没有人要的改动 |

### 14.2 `src/integration-registry.js` —— 那张 PURE 的表

**PURE, 什么都不 import。** 一个集成 = 一行:

```js
{
  id: 'lark',
  label: 'Lark / 飞书',
  fields: [
    { key:'appId',     label:'App ID',     secret:false, required:true,
      placeholder:'cli_…', help:'开发者后台 → 凭证与基础信息', validate:(v)=>… },
    { key:'appSecret', label:'App Secret', secret:true,  required:true,
      help:'同一页; 它只会被写入, 永远不会被读回来' },
  ],
  clusterEnv: { json:'VIBESPACE_INTEGRATIONS', prefix:'VIBESPACE_INTEGRATION_LARK_' },
  // 在同意页能成功之前, 用户必须先在对方控制台里做完的事。卡片把它画在字段**上面**。
  setup: {
    callbackUrl: 'http://127.0.0.1:17865/lark/cb',   // 唯一定义处 —— 见下面那条规则
    callbackNote: '开发者后台 → 安全设置 → 重定向 URL, 必须逐字节一致',
    prerequisites: [
      '上面那条重定向 URL 已经登记进列表',
      '`im:message` 与 `im:message.send_as_user` 已授权',
      '应用有一个**已发布**的版本',
    ],
  },
  test: { kind:'credential-exchange',
          describe:'用这一对 app id / secret 换一次 token。不读任何会话, 不发任何消息。',
          caveat:'这只证明 app id / secret 这一对是对的。同意页还要求上面那三件事, 缺任何一件都在同意页上失败, 而不在这次调用上失败。' },
  consumers: ['src/channels/lark.js', 'src/channels/live/lark.js'],
  docs: 'https://open.feishu.cn/…',
}
```

规则, 每一条都有一个会变红的断言:

- `validate` 是纯函数, 返回 `{ok:true}` 或 `{ok:false, why}` —— 一次**具名的**抱怨, 绝不是一次
  静默拒收, 也绝不改写那个值(唯一允许的改写是去掉首尾空白, 而那发生在 store 里并且写在字段的
  help 上, §14.3)。
- `setup` 是**在同意页能成功之前, 用户必须先在对方控制台里做完的事**, 卡片把它画在字段
  **上面**(§14.5)。它存在的理由是一个真实的失败形态, 而这份文档自己已经把它写了两遍却没
  有给它一个落点: §12.1 点名 Lark 的控制台要齐三件事(重定向 URL 已登记、scope 已授权、有
  一个**已发布**的版本), 缺任何一件挂掉的是*同意页*而不是 API 调用; §10.1 正是拿这句话当
  作"向导先开这张卡"的理由。而一张只有 `appId` / `appSecret` 两个输入框的卡片, 恰好把用户
  唯一需要抄走的那个值(**回调 URL**)**一个字都不显示** —— 于是"先开卡片"把用户送进的仍然
  是那个会在同意页上失败的流程。
  **`callbackUrl` 在这里定义, 而且只在这里定义。** `src/oauth-loopback.js` 的固定模式
  **从这一行 import 它**, 不自己声明一份: registry 是 PURE(什么都不 import), 所以依赖只能
  是这个方向; 反过来会让一个必须与对方控制台**逐字节**一致的字符串有两份拼写, 而那正是这
  份设计到处在拒绝的孪生。普查因此断言 `src/oauth-loopback.js` 里**不出现**回调 URL 的字面
  量。端口号(`17865`)在这里被选定一次, 决定 4 那次控制台注册登记的就是这一条字符串。
- `clusterEnv` 是一个**联合**: `{json, prefix}`(这一层自己解析)**或**
  `{via:'drive-presets', prefer, multi}`(这一层去问**已经存在的**那个读者)。**一个 env 名
  字只允许有一个解析者**, 由普查执法 —— `gmail` 那一行因此是**委托**给
  `MountManager.drivePresets()`, 不是复制它。
  **而一行委托必须能说出它指的是哪一个 key。** `drivePresets()` 返回的是一个**列表**
  (`src/mounts.js:2189-2206`), 并且 §12.2 自己给决定 5 的答案(让集群**再加一个** `channels`
  预设 key, 而不是把现有那个改宽)产生的恰好就是一个多于一项的列表。这时**不能**回落到
  `_driveClient()` 的兜底: `src/mounts.js:2215` 的
  `return presets.length === 1 ? presets[0] : presets.find((c) => c.key === 'default') || null;`
  在一个 `org1` + `channels` 且没有 `'default'` 的列表上返回 **null** ⇒ §19 里 P1 那条"只有
  集群默认、用户什么都没填的实例必须能一路连到底"的出口, 在 §12.2 向集群要的那份配置上
  **结构上就过不了**。解析顺序是 **用户存下来的那个选择 > `prefer` > 唯一的那个预设**, 没有
  第四级。**刻意不是 `prefer` 压过用户的选择**: 那会让 §14.5 那个下拉变成装饰, 也会违反这
  一节自己的"用户自己的 > 集群默认"。用户存下来的 key 在集群那边已经不再提供时, **不**悄悄
  换成 `prefer`(换一个 Google OAuth client 就换了 refresh token 是在哪一次同意下签发的),
  而是走 §14.3 那条已经存在的规则: 答 `source:'none'` 并点名消失的是哪一个 key。
- `test.kind` 是一个**封闭集**, 而它决定按钮自己的措辞, 因为"报错文案不是诊断"反过来同样成立
  —— 一个声称测过连接却从没联网的按钮, 就是在撒谎:

  | `test.kind` | 它真的做了什么 | 按钮上的字 |
  |---|---|---|
  | `credential-exchange` | 一次**有界的** vendor 往返, 用这对凭据换一个 token, 只读不写 | 测试连接 |
  | `shape-only` | **零网络**: 只检查字段形状并把授权 URL 构造出来 | 检查格式(不联网) |
  | `reachability` | 只探这个 vendor 主机可不可达, 不携带任何凭据 | 测试可达性 |

  **而一次 `test` 还要说出它自己的边界。** `caveat` 是一句与判决**一起**渲染的话(§14.5),
  因为这块面上的"撒谎"有两个镜像: 一个声称测过连接却从没联网的按钮在撒谎, 而一个**如实**
  测了凭据对、却被用户读成"我已经配好了"的绿勾同样在撒谎 —— 而 `lark` 恰好是后者,
  `credential-exchange` 在一个 scope 没授权、版本没发布、回调 URL 没登记的应用上**会成功**。
  规则因此是可执行的: **一行只要声明了 `setup.prerequisites`, 就必须声明 `test.caveat`**,
  由普查执法; 而卡片永远不会只画那个勾(§14.5)。
- `consumers` 必须**是活的**: 普查要求每个名字既是一个存在的文件, 又真的调用
  `resolveIntegration('<id>')`。一行没有活消费者的 row 就是一张什么都不做的卡片, 而这与
  `SPEND_REASONS`、与 `contributes.channelAdapters`(§15)是同一条法。
- **这一层不加任何设置项。** 上界(Test 的超时、每个 id 同时只允许一次在飞)是本模块的常量 ⇒
  `SETTINGS_CATEGORIES` 的 §44 普查与这一层无关, 而那正是我们要的: 密钥的旁边不该有一个会被
  广播的旋钮。

本设计自己的三行(浏览器那两行的 id 住在它自己那份文档里):

| id | 字段 | 集群默认 | 卡片必须先画出来的 setup | Test 一下做什么 | 消费者 | 什么时候进表 |
|---|---|---|---|---|---|---|
| `lark` | `appId`(非密) · `appSecret`(密) | **预期有** —— 集群注册一个 Lark 应用并注入。但它只在**同一个租户**里成立, 而这不是一句免责声明, 是一条硬约束(§14.9); 跨租户的用户**必须**自带应用, 于是这张卡的 setup 块是他们的**默认**路径而不是边角情形 | **有**: 回调 URL `http://127.0.0.1:17865/lark/cb`(带复制按钮, 唯一定义处见上)+ 三条前置(登记这条 URL、授权两个 scope、发布一个版本) | `credential-exchange`: 换一次 `tenant_access_token`(自建应用那个端点, 只要 app id + secret)。不列会话、不发消息。**必须带 `caveat`**: 这一次往返在三条前置一条都没做的应用上照样成功, 所以判决旁边永远跟着那句边界 | `src/channels/lark.js`, `src/channels/live/lark.js` | P1 |
| `gmail` | `clientPreset` —— 一个**选择器**(非密, 选项来自 delegate; 它选的是集群的哪一个预设, 不是用户自己的凭据, §14.3)· `clientId` / `clientSecret`(密, 只在"用我自己的"时出现) | `{via:'drive-presets', prefer:'channels', multi:true}` —— **复用** `VIBESPACE_GDRIVE_CLIENTS`, 不新增第二份解析者; `prefer` 点名 §12.2 让集群加的那个 key, `multi` 告诉界面画下拉而不是那对单选 | **无** —— 既有的 mounts 同意流程已经在生产里跑, 而 Google 接受任何 loopback 端口(RFC 8252 §7.3), 所以没有任何一个值需要用户抄进控制台 | `shape-only`, 并且**说出来**: 一个 Google OAuth client 的 id/secret 单独换不出任何东西(它没有 client-credentials 那条路), 所以这里能做的只有形状检查加把授权 URL 构造出来 —— 真正的判决在那次 OAuth 往返上 | `src/channels/gmail.js` | P1 |
| `whatsapp-business` | `phoneNumberId`(非密) · `accessToken`(密) | **没有, 而且不该有**: 这是一条按号码计费的商业 API 凭据, 集群注一把就是集群替所有人付账 | **无**(这条路没有 OAuth 同意页) | `credential-exchange`(读一次号码的元数据) | —— 今天没有 | **不进 v1。** §14.2 的普查要求 `consumers` 是活的, 而这条路今天只是 §15 里那条"合规替代"的名字; 它**与它的 adapter 在同一个 commit 里进表**。这一行写在这里是为了把字段与"没有集群默认"这两件事先定下来, 不是为了先摆一张空卡片 |

### 14.3 `src/server/integration-store.js` —— 解析、遮蔽、广播

落盘形状(经 `writeJsonAtomic`, 与每一个 `data/*.json` 一样):

```json
{ "version": 1,
  "integrations": {
    "lark":  { "values": { "appId": "cli_…", "appSecret": "<secret-box 密文>" },
               "updatedAt": 1789…, "testedAt": 1789…, "lastOk": true, "lastError": null },
    "gmail": { "clusterKey": "channels",
               "updatedAt": 1789…, "testedAt": null, "lastOk": null, "lastError": null } } }
```

**`source` 是推导出来的, 绝不落盘。** 记录里只有两样东西: 用户**自己打进去的**值
(`values`), 与用户**挑中的那个集群预设的 key**(`clusterKey`)。`source` 由这两样加上此刻
env 里有没有那个默认在读的时候算出来, 理由有二, 而且两条都是本节自己已经写下的: 其一, §14.3
下面那条"集群默认消失了就答 `none`"本来就要求它在**读的时候**算 —— 一个落盘的 `source` 会
和它打架, 而这正是这个代码库里"一条记录两个面互相矛盾"的那一类; 其二, 一个只挑了预设、没填
任何密字段的记录**不是**"用户自己的凭据", 它只是在集群给的几个里指了一个 —— 把它盖成
`"source": "user"` 会让来源芯片(§14.5)说出与事实**相反**的那一件事(而那枚芯片存在的全部理
由就是说出这一件事), 会让 §14.10 的"只导出 `source:'user'`"导出一个指向集群凭据的指针, 也会
让决定 22 里"OAuth 行 = 已填好 + 一键连接, 界面写'由集群提供'"这句话在 `gmail` 上不成立。

- `resolveIntegration(id)` → `{source:'user'|'cluster'|'none', clusterKey, values, label,
  fromEnv, testedAt, lastOk, lastError, missing:[]}`。五条不变量:
  - `source:'cluster'` 时 `values` **在读的那一刻**从 env 解析, **绝不**拷进
    `data/integrations.json`。这就是 mounts 那条"记录只存 KEY"(`src/mounts.js:2187-2188`)的镜
    像: 集群轮换一次 env, 每个实例的每个消费者同时跟着轮换。把值拷下来, 就是把一把已经被吊销
    的凭据留在 N 个实例上。
  - 集群默认**消失**了(管理员撤掉了 env)而用户停在 `'cluster'` 上 ⇒ 答 `source:'none'` 并
    **点名**是集群默认不在了, 绝不把一个坏掉的 adapter 静静交出去。
  - 必填字段缺了 ⇒ `missing:['appSecret']`, 照 `src/plugins.js:679-682` 那条注释点名的事故来:
    **说出是哪一个字段**, 永远不要让用户去猜。
  - **只带一个选择器的记录答 `source:'cluster'`, 不是 `'user'`。** `clusterKey` 一起答出来
    (`'channels'`), 于是芯片画的是 `集群默认 · <label>`, 而 §14.10 导出的是那个 **key** 而
    不是任何值。委托那一行的解析顺序写在 §14.2: 用户存下来的选择 > `prefer` > 唯一的预设。
  - **这个回答是 `auth.state()` 的一个输入**(§13)。一个 adapter 的 token 记录还好好的、
    没过期, 而它底下的应用凭据被撤走了(管理员删了 env, 或用户清掉了自己的 key), 这时
    `auth.state()` 必须答 `'needs-credentials'` —— 不是 `'connected'`。Lark 的
    `tenant_access_token` 是**每次调用**拿 app id + secret 现换的, Gmail 的 client id/secret
    是**每一次 refresh** 都要的, 所以那一刻这个 adapter 已经死了, 而 §13 那条"连续 3 趟失败
    才变琥珀"要三趟之后才说话, 说的还只是一个 vendor 4xx。
- `publicView(id)`: 每个 `secret:true` 字段变成 `'••••'`, 并且**只有**在值长度 ≥ 12 时才带上后
  4 位(短的秘密, 后 4 位就是它的一大半)。非密字段原样出。**这份遮蔽视图就是广播的内容**, 也是
  `GET` 能拿到的全部。
- `setIntegration(id, patch)`: **省略一个密字段 = 不动它; `''` = 清掉它。** 这条区分不是风格,
  它是本仓已经被咬过的那一条 —— 恒发字段的 `null` 是陈述, 只有 `undefined` 才是缺席
  (2.369.62 的 `effortNext`) —— 所以它写成不变量并配负控。唯一允许的改写是**去掉首尾空白**:
  粘贴一把 secret 常常带一个尾随换行, 而"因为一个看不见的字符而失败"正是这个界面存在的理由;
  这条改写写在字段的 help 里, 因为一次不说出口的改写与一次 bug 无法区分。
- **两个意图, 两个函数, 因为它们对同一个转移给的是相反的答案。**
  - `clearUserValues(id)` = "把我的 key 清掉"。**永远允许**, 丢掉用户覆盖连同它的密文, 然后
    **落在优先级落到的地方**: 有集群默认就是 `'cluster'`, 没有就是 `'none'`。这就是
    `DELETE /api/integrations/:id` 调的那一个(§14.4)。
  - `useClusterDefault(id)` = §14.5 里"用集群默认"那颗单选。**没有集群默认时它是一次具名拒
    绝**, 不是一个静默的空操作 —— 这也正是那颗单选在没有默认时置灰**并说明原因**的同一件事。
    它走 `PUT /api/integrations/:id` 的 `{use:'cluster'}`。
  两个结果都由 `test-integration-registry` 钉住。把它们混成一个的代价不是风格问题: 那样
  "没有集群默认时回到 `none`"与"没有集群默认时具名拒绝"里必有一个**在产品里根本到不了**,
  而到底是哪一个, 取决于实现者当时读的是这两句话里的哪一句。
- `test(id)`: 跑那一行**声明的**测试并记下 `{testedAt, ok, error}`, 而卡片渲染这个判决时
  **总是**带上那一行的 `test.caveat`(§14.2) —— 一个不说自己边界的绿勾, 会被读成"我已经配好
  了", 而那正是 §10.1 里向导先开这张卡所要避免的那个结局。四条约束:
  1. **store 自己不构造任何 vendor 请求。** 它调用的是消费者在接线时注册进来的 runner
     (`registerIntegrationTest(id, fn)`), 而那个消费者**已经**在 §3.1 的出网白名单里声明过自己
     的主机 ⇒ `test-channels-egress` 一个字都不用改, 这一层也不会变成第二个"持有 N 个 vendor
     主机"的文件。
  2. 每个 id 同时只允许一次在飞, 有界超时, **只由人点**(§14.11)。
  3. 一行声明了 `test` 却没有注册 runner = 一个死控件 ⇒ 普查变红。
  4. 一行声明了 `setup.prerequisites` 却没有 `test.caveat` ⇒ 普查变红(§14.2)。
- 每一次写都广播 `integrations-updated`, 载荷是 `publicView` —— 一个服务端缓存只要客户端也缓
  存, 那个入口就必须**通知**(2.309.0 的法), 而这条广播能携带的**只可能是**遮蔽视图。
- **一个 `testedAt` 不会永远绿着。** 卡片显示的是判决**加上它的年龄**; 一个判决绝不比它描述的
  那次读数活得更久(quota-model r3 那条法的同一形状)。

### 14.4 路由

- `GET /api/integrations` —— 每一行的 `{id, label, fields(只有声明, 没有值), setup(只有声明 ——
  一张卡画不出一个没被发给它的回调 URL), source, clusterKey, clusterOptions(委托行的那些预设,
  只有 key 与 label), fromEnv, set:{<字段>:bool}, masked, missing, testedAt, lastOk, lastError,
  testCaveat, consumers, docs}`。
- `PUT /api/integrations/:id` —— `setIntegration`(省略 = 不动, `''` = 清掉); 载荷带
  `{use:'cluster'}` 时走的是 `useClusterDefault`(§14.5 那颗单选), 没有集群默认就**具名拒绝**;
  载荷带 `{clusterKey:'<key>'}` 时存的是那个**选择器**(委托行的下拉), 记录里一个值都不落。
- `POST /api/integrations/:id/test` —— 人点的那一次, 有界。
- `DELETE /api/integrations/:id` —— **"把我的 key 清掉"**, 调的是 `clearUserValues`(§14.3),
  **永远允许**, 然后落在优先级落到的地方: 有集群默认就是集群默认, 没有就是 `none`。它
  **不是** `useClusterDefault` —— 后者是那颗单选, 并且在没有集群默认时拒绝。
- 全部坐在既有的 cookie 鉴权之后; 而**没有任何一条路由会回读一个密字段的明文** —— `GET` 不行,
  "给我看一眼"也不行。界面给的是 **Replace 而不是 Reveal**: 一个能被读回来的秘密, 就是一个能被
  一次 XSS 或一次误开的窗口读回来的秘密。

### 14.5 界面: ⚙ → Integrations(集成与密钥)

- **窗口类型 `'integrations'`, `singleton: true`**, 经 `registerWindowType({type:'integrations',
  label, icon, action:'openIntegrations', replay:(app,spec,{syncId})=>app.openIntegration(spec.focus,{syncId})})`
  注册 —— 与 `src/lib/jobs-panel.js:387-394` 逐字同形, 于是布局恢复、跨客户端同步、虚拟桌面、标
  签组与任务栏全部白给, 而 `replayOpenSpec` 不可能静默丢掉它。`openSpec` 是
  `{openIntegrations, focus:'<id>'}`; **`focus` 指向一个已经不存在的 id ⇒ 照常打开窗口、不高亮、
  不抛** —— 一个被删掉的 row 不该让一次布局恢复失败。
- **⚙ 菜单一行**, 紧挨着 `Plugins…`(`src/lib/gear-menu.js:77` 那一组 `1_admin`), 走
  `registerMenuItem` 而不是一个新的 chrome 原语。
- **卡片**按 `src/lib/plugins-ui.js:41-70` 的 `plugin-card` 语言渲染, 每行一张:
  - 一枚**来源芯片**: `集群默认` / `你自己的` / `未配置`(它读的是 `source` 与 `fromEnv`);
    委托行(`multi:true`)上它带着那个 key 的标签: `集群默认 · <label>`, 因为"哪一个集群凭据"
    与"谁的凭据"是两个问题(§14.3);
  - **在字段上面**: 那一行的 `setup` 块(如果它有)。`callbackUrl` 画成一行**带复制按钮**的
    等宽文本加上 `callbackNote`(要抄到对方控制台的哪一页去), 下面是 `prerequisites` 的勾选
    清单。它排在字段**之前**不是排版偏好: 用户填完两个输入框、按下 Test、看见一个绿勾之后,
    就不会再往上看了;
  - 选谁的凭据。普通行是**一对单选**: **"用集群默认"** vs **"用我自己的 key"** —— 没有集群
    默认时前者置灰并说明原因。委托行(`multi:true`)画的是一个**下拉**: N 个集群预设 + "用我
    自己的 key" —— 一对单选表达不了 N 个预设, 而这一行指向的那份界面
    (`src/lib/sidebar-mounts.js:1747-1751`)为同一个理由早就是 N+2 项的下拉了;
  - 声明出来的字段。密字段显示 `••••1234` 加一个 **Replace** 按钮(点它才出现一个空的
    `type:'password'` 输入框); 非密字段原样可编辑;
  - 一个 **Test** 按钮, 按钮上的字来自 `test.kind`(§14.2), 旁边是**上一次判决 + 它的年龄 +
    vendor 自己的错误原文**(经 `escHtml`)—— 而只要那一行有 `test.caveat`, 判决**永远**与它
    一起画, 从不单独画那个勾;
  - 一行 **"这把 key 用在哪"**, 由 `consumers` 生成 —— 用户在决定要不要换一把 key 之前, 有权
    知道会动到什么。
- **每一个消费者都深链到自己那张卡**: `app.openIntegration(id)`。本设计的连接向导(§10.1)在那
  一行还没配好时**先**开它; 浏览器后端选择器在用户挑 `cloak` / `cloud:*` 而没有 key 时也开它。
- **≤768px 同样的卡片, 单列** —— 与 Plugins 面同一条路径, 不是第二套渲染器。
- **命名冲突要点名**: `SETTINGS_CATEGORIES` 里**已经有**一个 `Integration` 分类
  (`src/lib/settings-schema.js:941`), 装的是 `agents.*` 那一组"agent 能看见什么"的开关
  (`:334-362`)—— 与这扇窗口不是同一个问题。所以窗口的中文名是**集成与密钥**, 而那个设置分类
  **一个字都不改**。

### 14.6 优先级, 以及那条常设 grep 普查

- 优先级: **用户自己的 > 集群默认 > 没有**。用户显式设过的值**不会**被后来注入的集群默认顶掉
  —— 与 `_frpEffectiveEnabled`(`src/plugins.js:584-588`)同一条: 显式的值胜出, 只有
  `undefined` 才跟随 env。
- **消费者永远不自己读 `process.env`。** 它问 `resolveIntegration(id)`。常设 sweep 查的是
  **env 名字**, 不是取值的写法: 正则 `/VIBESPACE_INTEGRATIONS?\b|VIBESPACE_INTEGRATION_/`
  出现在 `src/server/integration-store.js` **之外** = 红。**刻意不查
  `process.env.VIBESPACE_INTEGRATION`** —— 那是一种拼写, 而 `process.env['VIBESPACE_INTEGRATIONS']`、
  `const { VIBESPACE_INTEGRATIONS } = process.env`、`const env = process.env; env.VIBESPACE_INTEGRATION_LARK_APPSECRET`
  三种写法全都普通、全都绕过它。这个代码库为这一条挨过三次: test-architecture §45 r3 的普查
  匹配被调用者的名字, 于是 `execFileAsync('pgrep'…)` 把一个已退役的形状**从 kill 路径上**走
  了回来, 修法是改成匹配 argv 里的**工具字面量**; test-writer-sweep §17 r7 的文件集是手写的,
  实测漏掉 **47** 个真会发信号的文件, 修法是改成 grep 推导**并打印**; test-fixture-isolation
  r2 的解析器只认作者看过的那一种拼法, 一次别名就藏住了一个 `rm -rf`, 修法是取**不动点**。
  所以: **普查要推导它声称要普查的那个东西** —— 这里那个东西是 env 的名字。
- 文件集由 `git ls-files` 推导(经 `scripts/git-env.mjs` 的净化 git 环境 —— 它导出
  `GIT_REDIRECTORS`(`:22`)与 `gitEnvFrom`(`:36`), 因为这条普查跑在 `npm run build` 里, 而
  那个 build 跑在一个会导出 `GIT_DIR` / `GIT_INDEX_FILE` 的 pre-push hook 进程里), 并且由套
  件**打印出来** —— 一个不说自己走过哪些文件的普查, 它的价值等于它恰好走过的那个集合。两种
  绕法各当一条负控: 一个用方括号形式的临时文件、一个用解构形式的临时文件, 都必须变红。
- 已经点名的例外恰好一个: `src/mounts.js:2189` 的 `drivePresets()` 读 `VIBESPACE_GDRIVE_CLIENTS`
  —— 它比这一层早、有自己的消费者, 而 `gmail` 那一行是**委托**给它(`{via:'drive-presets'}`)
  而不是复制它。普查因此还要断言**一个 env 名字只有一个解析者**: 两行 row 声明同一个 env 名,
  或者一个名字既被一行 row 声明又被一个 delegate 声明, 都变红。
- **被点名的孪生**: frp 插件的 relay 配置(§14.1)。在它迁过来之前, `kb-file-structure.md` 里给
  它一行, 说清"这里有两个地方在做同一件事, 以及为什么现在不合" —— 一个没被点名的孪生正是这个
  代码库被咬的方式。

### 14.7 `src/secret-box.js` 从 P1 提前到 P0, 以及它必须**不**继承的那个缺陷

这一层从第一个 commit 起就要存密文, 所以 §14 的存在把 `src/secret-box.js` 的抽取从 P1 **提前成
P0 的前置条件**(§19 重新计价了轮次)。

- **一个原语, N 个密钥文件。** `secretBox(keyFile)` 是一个工厂: mounts 继续用它自己的
  `data/.mounts-key`(`src/mounts.js:47`), 这一层用 `data/.integrations-key`, channels 的 token
  用 `data/.channels-key`(§13)。理由很钝: 搬一个密钥文件是一条**不可逆的数据丢失路径**, 换来
  的只是少一个文件; 而一把密钥被轮换或损坏时, 爆炸半径应当止于一个 store。
- **密文格式逐字节不变**(`iv.tag.data` 三段 base64, aes-256-gcm), 由 parity 测试执法: 用修前
  那份 `_enc` 的**补丁副本**加密、用 `secret-box` 解密, 再反过来一次。这就是本仓的负控惯用法。
- **它必须不继承的那个缺陷(读代码读出来的, 不是假设)。** `src/mounts.js:360-367` 的 `_key()`:

  ```js
  _key() {
    try { return Buffer.from(fs.readFileSync(this._keyFile, 'utf-8').trim(), 'hex'); }
    catch {
      const k = crypto.randomBytes(32);
      fs.writeFileSync(this._keyFile, k.toString('hex'), { mode: 0o600 });
      return k;
    }
  }
  ```

  那个 catch 只对 **ENOENT** 是对的。对其它任何一种读失败(EACCES、EMFILE、EIO、一份被截断或
  被清空的文件)它会**铸一把新密钥并覆盖掉旧的** —— 此后每一条已存的密文都永远解不开, 而且
  **一个字都不会说**。今天它被掩盖着, 只因为那个文件是 0600、属于服务进程自己、而且读得很少;
  fd 耗尽、一次只读挂载、或者一次写到一半的崩溃都够得到它。所以 `secret-box`:
  **只在 `ENOENT` 上创建**, 其它 errno 一律**带类型抛出**(调用方把它渲染成"读不出密钥", 而
  不是"没有配置过" —— 这两句话对用户的意思完全相反); **写走 tmp+rename**(原子写那条法的
  *理由*在这个文件上比在任何一个 `.json` 上都更重: 它是 `data/` 下最不可恢复的那一个);
  **绝不覆盖一个已经存在的密钥文件**。mounts 在 parity 测试后面迁过来, 于是这个修复对它同样
  生效 —— 这也是"抽取"之所以值得做的那一半。

### 14.8 集群管理员那一面: helm values → Secret → env

`deploy/helm/vibespace-user/values.yaml` 新增一段(与既有的 `gdrive:` `:158-163` 并列):

```yaml
# Cluster-provided integration credentials (src/integration-registry.js rows).
# Each entry is ONE row id; `values` keys are that row's declared field keys.
# A user's own key always wins — the UI shows which one is in use.
integrations: []
#  - id: lark
#    label: "Lark (cluster app)"
#    values:
#      appId: "cli_xxxxxxxx"
#      appSecret: "xxxxxxxx"
```

`templates/main.yaml` 的 Secret 里(与 `gdriveClients` `:32-33` 并列):

```yaml
  {{- if .Values.integrations }}
  integrations: {{ .Values.integrations | toJson | quote }}
  {{- end }}
```

以及容器 env 里(与 `VIBESPACE_GDRIVE_CLIENTS` `:159-164` 并列):

```yaml
            {{- if .Values.integrations }}
            # Cluster-provided integration credentials: JSON
            # [{id,label,values:{…}},…] read by src/server/integration-store.js.
            # A user's own key in data/integrations.json always wins.
            - name: VIBESPACE_INTEGRATIONS
              valueFrom: { secretKeyRef: { name: {{ $name }}, key: integrations } }
            {{- end }}
```

四条规则跟着这段 YAML 一起写进 `deploy/README.md`:

- **绝不用 `value:`, 一律 `secretKeyRef`** —— 这就是这张 chart 已经在做的事(`gdriveClients`
  `main.yaml:163-164`、cephfs secret `:152-153`)。一个 `value:` 会把密钥印在
  `kubectl get deploy -o yaml` 上。
- **单字段形式** `VIBESPACE_INTEGRATION_<ID>_<FIELD>`(id 与字段名大写, `-` 变 `_`)留给自托管
  与 docker-compose —— 它不需要 JSON 引号地狱。两种形式同时存在时 **JSON 那份赢**, 并在启动时
  记一行说明是哪一份生效了。
- **解析失败绝不抛**: 照 `src/mounts.js:2200` 那一行 ——
  `console.error('[integrations] VIBESPACE_INTEGRATIONS unparseable:', e.message)` 然后当作没有
  集群默认。一个打错的 values 块不该让 pod 起不来。
- **哪些 row 适合做集群默认, 要在 README 里说清**: 一次注册、全体可用的(Lark 的应用凭据、
  Google 的 OAuth client)适合; **按席位付费的 key 不适合** —— 集群给一把就是集群替所有人付钱,
  而供应商的并发席位会让用户互相踩(CloakBrowser 的分档就是按并发会话数卖的)。

### 14.9 一个 OAuth client, N 个实例, N 个公开地址

集群把每个实例自己的公开地址注进去(`main.yaml:172-176`), 所以"一个注册过的 OAuth 应用怎么服务
N 个不同的公开地址"是一个真问题。**但 VibeSpace 的 OAuth 流程从来没有把实例地址放进
`redirect_uri` 里**: 它用的是 loopback(`src/gmail-sync.js:78` 的 `srv.listen(0, '127.0.0.1')`,
`:82`/`:99` 的 `redirect_uri: http://127.0.0.1:${st.port}`), 而 loopback 指的是**用户浏览器所在
的那台机器**, 不是实例。这把问题整个换了个形状:

**(a) 既有的 loopback + 粘回。** 集群注册**一个** redirect URL, 与实例数量**无关** —— 因为那个
URL 里根本没有实例的地址。在集群部署里用户的浏览器与实例不在同一台机器上, 所以到 127.0.0.1 的
重定向在用户浏览器里**失败**, 而 code 就在地址栏里 —— 这正是 `src/mounts.js:2175-2182` 那段注释
写下来的形状, 而产品**已经有**那个面(粘回)。代价是每次连接多一次粘贴。

**(b) 集群鉴权中继。** `https://auth.<cluster>/cb` 注册一次, 用**签名过的 state** 携带目标实例,
再转发到那个实例的公开地址。UX 更好(零粘贴), 代价是: 一套新基础设施、一把签名密钥、每个实例
都要信任那个中继的签名, 以及 —— 这一条才是重的 —— **一个能看见授权码的组件**。它必须只转发不
落盘, 而它一旦被攻破就是全集群的问题, 不是一个用户的问题。

**建议: v1 取 (a), (b) 作为后续阶段, 由决定 21 门控。** 理由不是省事: (a) 走的是**今天已经在生
产里跑着**的那条路(Gmail 挂载), 而 (b) 要新增一个**持有授权码**的组件, 那是一次需要自己的威胁
模型的改动。

各 vendor 允许什么(公开文档, 2026-09-11 取):

| vendor | 回调 URL 要注册吗 | 端口 | 一个应用能注册几个 | 对"集群默认"的后果 |
|---|---|---|---|---|
| Google(Gmail / Drive) | 要, 而且**逐字节精确匹配**(协议 / 主机 / 端口 / 路径 / 尾斜杠), **没有通配** | loopback 是例外: RFC 8252 §7.3 要求授权服务器"**MUST allow any port to be specified at the time of the request** for loopback IP redirect URIs" —— 而本树正是这么用的(`src/gmail-sync.js:78` 绑 `listen(0)`, 每次一个新端口) | 多个精确 URI | (a) 可行且**已经在生产里跑**; (b) 也可行(把中继那一个 URI 注册进去) |
| Lark / 飞书 | 要 —— 开发者后台"安全设置"里的重定向 URL 列表, 官方文档: **只有列表里的 URL 能通过开放平台的安全校验** | **端口是 URL 的一部分** ⇒ loopback 必须**固定**, §12.4 因此存在 | **支持配置多个**(官方文档原话: "重定向 URL 支持配置多个") | (a) 可行; (b) 可行。**真正的限制不在 URL 上, 在租户上 —— 见下** |
| CloakBrowser / 云浏览器供应商 | **不适用**: 那是一把 API key / license key, 根本没有重定向 | —— | —— | 集群可以注入, 但那等于集群**替所有人买席位**(§14.8 最后一条) |

**Lark 的集群默认有一条比 redirect 更硬的边界, 而它直接决定决定 22 的形状。** 长连接
**只支持企业自建应用**(§12.1, 官方文档), 而**自建应用只能在它自己的租户里用**(官方开发指南:
自建应用 = 企业内部使用, 与可跨租户分发的应用商店应用相对)。于是:

- 一个集群注册的 Lark **自建**应用只服务**与它同租户**的用户。跨租户的用户**必须**带自己的应用
  —— 这正是 `lark` 那一行**即使有集群默认也仍然允许用户覆盖**的理由, 而不是一句礼貌。
- 想用一个应用服务多个租户就得做**应用商店(ISV)应用**, 而那会**丢掉决定 3 赖以成立的那条长连
  接通道**, 同时把 token 模型从 `tenant_access_token` 换成 `app_access_token` + `tenant_key`。
  换句话说: **"跨租户的集群默认"与"实时推送"在今天是二选一。**
- 这台机器上的用户是不是同一个 Lark 租户, 是一件运维事实, 不写在这个公开仓库里 —— 而这一层的
  设计**不需要**那个答案是"是"。

### 14.10 导出、导入, 与这一层加密到底买到了什么

- 集成密钥加进 `/api/config/export-info` 的 `sensitive` 那一半(`src/routes/persistence.js:679-686`,
  与 `mounts` / `accounts` 并列)与 `/api/config/export` 的 passphrase 加密块(`:712-741`, 与
  `getMounts?.()?.exportBundle?.()` `:729-732` 同形)。
- **只导出 `source:'user'` 的行的值。** 集群默认不是我们的东西, 而且它会轮换: 把它烤进一个
  备份文件, 就是把一把会过期的集群凭据散布到我们再也管不到的地方。
- **但 `clusterKey` 这个选择器跟着走, 而它是一个 key 不是一个凭据**(§14.3): 它说的是"我在集
  群给的几个里挑了 `channels`", 没有任何秘密在里面 —— 与 mounts 的导出携带 `clientPreset` 是
  同一个理由。导进一个不提供那个 key 的实例时, 它走下面这条既有规则。
- 导入到一个**没有**那个集群预设的实例上时, 一行 `source:'cluster'`(包括一行只带
  `clusterKey` 的)解析成 `none` **并说出缺的是什么**(是整个集群默认不在, 还是那个 key 不在), 绝不静静落到导出方的值上(那会让一个用户以为自己连上了集群的应用, 而其实是把别人
  的凭据带过来了)。
- **这一层的加密到底买到了什么, 要说清楚。** `data/integrations.json` 与 `data/.integrations-key`
  同属一个 uid、并排放着 —— 加密防的是**一份被拷走的文件**(备份、快照、一个错配的挂载), 防不
  了在这台机器上以同一个用户身份运行的代码, 而 **agent 会话恰恰就是以同一个用户身份运行的, 而
  且它手里有文件工具**。mounts 今天就是这个性质, 我们不是在引入它。一条真正的边界要么是 OS
  keychain 要么是另一个 uid, 两者都不在 v1 —— 所以这句话写在这里, 而不是让"已加密"这三个字去
  暗示一个它买不到的保证。

### 14.11 这一层的硬围栏

1. **密钥绝不进 argv**(spawn 卫生)。顺带一条结构性保证: `agentEnv()`
   (`src/ws-handler.js:112-121`)丢掉每一个不在 `AGENT_ENV_KEEP`(`:101-105`)里的 `VIBESPACE_*`,
   所以 `VIBESPACE_INTEGRATIONS` 与 `VIBESPACE_INTEGRATION_*` **按构造**到不了任何 agent 子进程。
2. **Test 只由人点。** §ban-safety 管的是"拿订阅 token 定时打 Anthropic"; 一次人点的 Lark /
   CloakBrowser 往返不在那条禁令里, 但**一个定时器在**。sweep: 任何调度器、定时器或摄入循环里
   出现 `integrations.test(` = 红。这条纪律的先例是 `src/local-oracles.js` —— 人触发、声明清楚、
   而且被度量过。
3. **store 不构造 vendor 请求**(§14.3), 于是 §3.1 的出网白名单**一行都不用为这一层加**。
4. vendor 的错误原文经 `escHtml` 渲染, 绝不进 `innerHTML`(与 §10.3 同一条)。
5. **广播只带遮蔽视图**, 而且是**那一份**(`publicView`), 不是一份手抄的字段清单 —— 手抄的清单
   正是这个代码库反复丢字段的那个形状。
6. **失败必须到达用户**: 一次 Test 失败 = 卡片上的一行 + vendor 自己的话; 一次 `PUT` 失败 = 一个
   toast。telemetry 里有记录不算汇报。
7. **`hostId` 是参数。** 这一层解析出来的值属于**实例**; 要跑在配对设备上的 adapter(§15)由
   **引擎**把解析结果当参数交下去 —— 绝不在设备上再存一份, 也绝不经 argv。
8. **这一层存的是"管理员能给你的东西"**(应用 / 客户端凭据、API key), **不是"你授权过的东西"**
   (OAuth refresh token)。用户的 Lark token 仍然住在 channels 自己的 token store(§13)。把两
   者混进一个 store, 正是这份设计从头到尾在防的那种孪生 —— 它们的生命周期、轮换方式与导出规则
   全都不一样。

---

## 15. v1 刻意不做什么, 以及它们落在哪

| 推迟的 | 为什么 | 落地处 |
|---|---|---|
| 插件贡献的 adapter | manifest 没有 adapter 贡献点; 沙箱会需要网络+文件系统授权; 而且接收路径必须跑在 store 与 spend guard 旁边。第三方 adapter 是*最终*的正确归宿 | `contributes.channelAdapters`, 走同一套 `src/channels` 接口, 于是注册表永远不分叉。**这个 key 今天并没有被保留**: `src/plugin-manifest.js` 里的 `RESERVED_CONTRIBUTIONS` 是 `['keybindings','panels','viewers','commands','menus','statusChips','backends']`, 而只有*在那张表里*的 key 才会产生"保留给后续阶段 —— 已忽略"的警告 —— 其余任何东西在 `m.contributes` 被重建成固定形状时就被静默丢弃, 所以一个照着这一行去写的插件作者会**完全收不到任何信号**。**P0 加上那一个词**, 外加 `scripts/test-plugin-loader.mjs` 里期望集合的更新。一个声明了却是惰性的槽位, 与本文针对 `SPEND_REASONS` 所反对的是同一种失败; 区别在于这里那个槽位只值一个数组条目, 却买到一句诚实的警告 |
| 跑在配对设备上的 adapter | 凭据与 store 都住在这里 | 接口本来就接收一个 machine handle; v1 传 `local`。`hostId` 是一个参数, 绝不是一个分支。**r5: 这一行第一次有了一个真实的消费者** —— macOS 上 WhatsApp 的那份库在 owner 的 Mac 上, 而 VibeSpace 跑在别处, 所以 `channels-scan-store` 这个 op 从第一天起就是按 `hostId` 写的(本机是设备 #0), P6 的那条腿只是换一个参数 |
| ~~活事件通道~~ **已上移到 P1**(r3/Q3(a)) | 不再推迟: owner 要实时推送, 而 §6.4 按证据重新论证过了。留下的门控只有一个 —— 在 Lark 控制台上启用事件订阅 | `src/channels/live/<kind>.js`, 内容还是游标 kick 由 `laneState()` 判定(§4) |
| 本地客户端 adapter(WhatsApp / WeChat) | 接口从 P0 起就建模了它(`scan` / `scanSources` / `historyBySource` / `scanLatency` / `scanState` / `tosRisk` / `convCaps`), 但 adapter 本身要一个登录着的官方客户端, 而 `'ui'` 那一半还要一个 agent-browser profile 与一次关于条款风险的点名决定 | **P6**, §12.5。`'ui'` 那一半门控在决定 19 **与** agent-browser 系统上; macOS 的 `'store'` 那一半**只**门控在决定 19 上 —— 它不需要 agent-browser |
| 走协议库的 WhatsApp 发送 | 非官方客户端被平台条款禁止, 封号落在过正常使用上(围栏 13) | 永远在 `tosRisk: 'prohibited'` 后面; 合规路线是官方 Business Cloud API(bot 身份) |
| HTML 邮件渲染 | XSS 面; 纯文本是诚实的, 而且对分诊来说够用 | published-pages 那套 sandbox iframe 模式 |
| 附件自动抓取 | 带宽、存储, 以及每条附件多一次被授权的请求 | `caps.attachments: 'fetch'` + 一个显式的用户/agent 动作, 带大小上限 |
| 已读回执 / 正在输入 / 表情回应 | 不在交互设计里 | `caps` 行已经预留 |

---

## 16. 这件事制造的债, 以及怎么把关

- **第二套 OAuth loopback 流程**, 除非 `src/oauth-loopback.js` 真的把 Gmail 挂载那一套吸收
  掉。如果没吸收, 那个孪生就在 `kb-file-structure.md` 里被点名, 并配一条常设 sweep 条目。
- **第二个落盘加密助手**, 除非 `src/secret-box.js` 落地。同样处理。
- **第二套 reachability 词汇**(`channel-acl` 与 `msg-acl` 并列)—— 这一个是*故意*的(两个不
  同的问题), 而防护是: 它们通过 import 共享序关系与只许放宽律, 并有一个套件驱动两者跑同一张
  放宽矩阵。
- **一族新的 store**, 在 `data/channels/` 下。它的保留策略、它的归档路径与它的退出时 flush
  都是 P0 的一部分, 不是后续项: 原子写与 archive-never-destroy 两条律从第一个 commit 起就
  适用。
- **一个新的出网面。** `test-channels-egress` 存在, 恰恰就是为了让第三个 vendor 主机不可能
  在没有决定的情况下到来。

---

## 17. 测试 gate

每个阶段的 gate 与该阶段在同一个 commit 里发布。套件名、层级, 以及那条证明这道 gate 会失败
的**负控**:

| 套件 | 层级 | 它钉住什么 | 负控 |
|---|---|---|---|
| `test-channel-filter` | fast | 每种规则的匹配真值表; `any`/`every`; 估计器的窗口以及它对 `sampled`/`truncated` 的诚实; 那些 `why` 字符串 | 一条匹配一切的规则必须报告 `totalPerDay === matchedPerDay`; 一份比窗口还短的语料必须置 `truncated` |
| `test-channel-acl` | fast | 默认 hidden; 在各条授权上取 MAX; 只许放宽; request → 恰好一条授权; 统一的 not-found; 每条授权都带 `origin` | 一条组授权绝不能被一条个体条目收窄; 批准一次请求之后组的默认值必须逐字节不变; **同一个 (principal, scope) 上一条 user 授权加一条 assignment 授权, 移除 assignment ⇒ 那条 user 授权逐字节不变** |
| `test-channel-outbox` | fast | 状态机(每一次允许的转移与每一次被禁止的转移); 护栏叠加且只能收紧; 未知策略时 fail-closed; `unknown` 绝不自动重试 | 一份去掉护栏检查的补丁副本必须变红; 一条 direct-send 策略碰上带链接的消息仍然必须走 review |
| `test-channel-record` | fast | 归一化, 含 mention 占位符解析; 注入标记的剥除 | 一段包含我们自己 frame 标记的正文, 出来必须是惰性的 |
| `test-channel-store` | fast | 原子索引; 只追加的日志; 重放分页时的去重; 游标只在完整 pass 之后前进; 保留地板 ≥ 7 天; **两趟并发 pass 经 `index.update()` 都落地**(§5.1) | 一趟报告 `complete:false` 的 pass 必须让游标保持不变; 一份围绕 `writeJsonAtomic` 做 read-modify-write 的补丁副本必须**丢掉**其中一趟的 anchor 推进 |
| `test-channel-adapter-contract` | fast | 假 adapter 驱动每一个已声明的能力; 未声明的能力抛异常; 带类型的错误; **那条"没有任何调用点按 `kind` 分支"的 grep 普查**; **`receive:'scan'` 的 adapter 不许声明 `history:'none'`**(r4, §12.5); **`scan` 的 adapter 必须声明 `scanSources` 与按来源的 `scanLatency`**(r5); **r6: `receive:'scan'` 上由按来源的 `historyBySource` 取代那个标量 —— 每个值都不许是 `'none'`, 而且它的键必须**盖住** `scanSources` 点名的每一个来源** | 一个在调用点上按自己 kind 分支的合成 adapter 必须让普查失败; 一个声明 `receive:'scan'` + `history:'none'` 的合成 adapter 必须变红; 一个声明 `receive:'scan'` 却不给 `scanSources` 的合成 adapter 必须变红; **一个 `historyBySource` 漏掉它自己 `scanSources` 声明过的某个来源的 scan adapter 必须变红**(r6 的镜像负控), 而**一个 `historyBySource.ui === 'none'` 的同样必须变红** |
| `test-channel-caps` | fast | 两个轴的记录; `convCaps` 三值; **只有 `caps` 与 `convCaps` 同时放行那个控件才存在**, 而 `unknown` 永远渲染成"不提供 + 理由"; `convCaps.sendAs` ⊆ `caps.sendAs`; `freshnessClaim` 三种通道各自的措辞; `identityWarning` 对 `unknown` 与对 `marked` 一样出声。**r4 两组**: `laneState` 的优先级 —— 一条 `claimedExclusive:true` 且带 `demotedAt` 的记录必须答 `carryContent:false`, 一条超过心跳窗口没出过声的通道**永远**不许答 `live:true`, `unknown` 一律 `carryContent:false`; 以及 `convCaps` 的 TTL —— 过了 TTL 的条目必须渲染成 `unknown`。**r5 一组**: `scanState` 的优先级(平台声明 > 客户端在场 > 读取授权 > `'ui'`), 它的答案 ⊆ `caps.scanSources[platform]`, 而 `tcc-denied` 解析成 `source:null` **不是** `'ui'`。**r6 一组**: `scanState` 从 `historyBySource[source]` 解析出 `history` 并恒答 `via:'scan'` + `carryContent:false`; `hostFacts` 超过 6 小时 TTL 即解析成 `source:null` / `why:'host-facts-stale'`; 而 `freshnessClaim(caps, laneOrScan, convEntry, now)` 的 `seconds` 是从它被交到手上的那个时钟算出来的 | 一个声明 `sendAs:['user']` 却在一个 `convCaps.sendAs === []` 的会话上仍然提供发送控件的合成 adapter 必须变红; 一个返回比 `caps` 更宽的 `convCaps` 的 adapter 必须变红; `identityMarking:'unknown'` 却没有警告必须变红; **一份读 `caps.pushExclusivity` 的修前副本必须在"已降级"那条 fixture 上答 `carryContent:true`**; **一条新鲜的 `convCaps` 仍然必须提供那个控件**(TTL 的正控 —— 一条永远答 `unknown` 的规则同样是缺陷); **一个在 `scanSources.linux==='ui'` 的机器上答 `'store'` 的解析器必须变红**, 而**一台 `darwin` + 客户端在场 + 授权已拿到的机器上仍然答 `'ui'` 的解析器同样必须变红**(`scanState` 的正控 —— 一个永远收窄到底的解析器与一条永远答 `unknown` 的规则是同一种缺陷); **r6: 同一个 `convEntry` 在两个不同的 `now` 上必须给出两个不同的 `seconds`**(一个不看自己时钟的 `freshnessClaim` 不可能在回答"多久以前"), 而**一份新鲜的 `hostFacts` 仍然必须答 `'store'`** —— TTL 的正控, 与 `convCaps` 那条同形 |
| `test-channels-lane-parity` | fast | **同一天的流量分别经 push / poll / scan 灌进去 ⇒ 同一批记录、同一个唤醒次数、同一笔扣款**(围栏 12); 同一条消息推送来一次、轮询又来一次要塌成一条(按消息 id 去重); 事件重放按 `event_id` 去重; **r4 的 scan 腿: 同一块屏幕扫两遍必须是 no-op**(合成 anchor, §12.5), 而滚动上限先撞到 ⇒ `complete:false` ⇒ anchor 不动; **r5 的 store 腿: 同一份库扫两遍必须是 no-op**(客户端自己的消息 id, `raw.synthetic:false`), 一趟读到一半被打断 ⇒ `complete:false` ⇒ anchor 不动, 而**同一天的流量经 `'store'` 与经 `'ui'` 灌进去必须得到同一批 `ChannelRecord`**(两条来源之间的 parity, 因为决定 19 让同一个 adapter 在两台机器上走不同的来源)。**r6 的爆发腿**: N 条消息经一条 **`fs.watch` 驱动的库扫描**投进来, 必须与同一批经 poll 投进来产生**同样的唤醒次数与同样的扣款** —— scan 通道是一批(`carryContent:false`, §6.4), 而那个 watch 是一次去抖过的游标 kick, 绝不是每次写盘一趟 | 一份**绕过合并窗口**的推送通道副本必须在同一个爆发上唤醒得更多; **一份把库通道那个 watch 的去抖拿掉的副本必须在同一个爆发上唤醒得更多**(r6 的负控 —— 这正是围栏 12 那句"30 条消息变成 30 次投递", 从 r5 刚加的那条通道进来); 一份在持久化**之前** ack 的副本必须在注入的崩溃点上丢掉记录; **一份丢掉合成键的副本必须在第二次扫描时把每一条记录都变成重复** |
| `test-channels-identity` | fast | 默认**不追加**发送方诚实行; `identityMarking` 驱动审批卡上的警告与回执里的字段; 审计行带 `draftedBy`/`approvedBy`/`sentAs`/`identityMarking` 且**不出实例**; `sendAs: []` 的会话上 `reply` 返回 `send-not-available` 而**不创建 proposal**; **r4: 一条在 `convCaps` 已经过期之后才被批准的 proposal, 必须在发送之前重新解析并以 `send-not-available` 拒绝** | 一份把诚实行默认打开的副本必须变红(r2 的决定 17 是这条腿的负控); 一个 `marked` 的 channel 上审批卡没有警告必须变红; 一个 `sendAs: []` 的会话上创建出了 proposal 必须变红; **一份不在批准时重新解析的副本必须把那条消息真的发出去** |
| `test-channels-egress` | fast | 每一个被构造出来的出向请求, 要么来自声明了自己主机的那个 adapter, 要么来自一条**带理由的**白名单 `(file, host)` 对 —— 出生即种下 `src/gmail-sync.js` 与 `src/mounts.js`(§3.1) | 一个带未声明主机的临时文件必须变红; 一条**死掉的白名单条目**(文件被移动或改名)同样必须变红 |
| `test-oauth-loopback` | fast | 两种模式(§12.4): Gmail 的临时绑定、Lark 的固定绑定; 请求处理器**与**粘回两处的 `state` 拒绝; 完成/取消/超时时端口被释放 | 一个**被预先占住**的固定端口必须产生那次具名拒绝与粘回回落, 绝不是一个不透明的 `EADDRINUSE`; 一次 `state` 错误的回调在两种模式下都必须被拒绝 |
| `test-integration-registry` | fast | 每一行的 `fields` / `test` / `consumers`; `publicView` 从不出明文, 而 last 4 只在值长度 ≥ 12 时出现; **省略一个密字段 = 不动, `''` = 清掉**; 优先级 user > cluster > none; 集群默认消失 ⇒ `none` **加一个点名的理由**; 必填字段缺失 ⇒ `missing` 点名字段。**grep 普查(文件集由 `git ls-files` 经 `scripts/git-env.mjs` 的净化环境推导, 并由套件**打印**出来)**: 正则 `/VIBESPACE_INTEGRATIONS?\b\|VIBESPACE_INTEGRATION_/` —— 查的是 **env 名字**不是取值的写法 —— 只许出现在 store 里; **一个 env 名字只有一个解析者**(两行 row 同名、或一行 row 与一个 delegate 同名, 都变红); 每个 `consumers` 名字既是存在的文件又**真的**调用 `resolveIntegration`; 每个声明了 `test` 的行都有注册的 runner; **一行声明了 `setup.prerequisites` 就必须声明 `test.caveat`**; **一个消费者跑 OAuth 同意流程的行必须声明 `setup.callbackUrl`**, 而 `src/oauth-loopback.js` 里**不出现**那条 URL 的字面量(唯一定义处是那一行); **没有任何调度器 / 定时器 / 摄入循环调 `test(`**。**r8 的委托与来源那一组**: 一个 `{via:'drive-presets', prefer, multi:true}` 的行, 在一个有两个预设(`org1` + `channels`)且**没有** `'default'` 的 env 上必须解析到 `prefer` 指的那个 key; 用户存过选择时那个选择胜过 `prefer`; 一条**只带选择器**的记录必须答 `source:'cluster'` 并带上 `clusterKey`; `DELETE` 在有/没有集群默认时分别落到 `cluster` / `none`, 而 `useClusterDefault` 在没有集群默认时**具名拒绝** | 一行 `consumers` 指向一个存在但**从不调用** `resolveIntegration` 的文件必须变红(仅仅"文件存在"是这条普查最容易退化成的那个形状); 一份把 `''` 当成"不动"的副本必须变红; 一份把集群默认**拷进** `data/integrations.json` 的副本, 必须在"轮换 env"那条腿上变红(它会拿旧值继续服务), **而同一条腿还要求把 env 撤掉时翻的是 Adapters 那一行**(`auth.state()` 答 `needs-credentials`), 不只是 Integrations 那张卡 —— 只翻卡片的副本必须变红; 一个在定时器里调 `test(` 的合成生产者必须变红; 一份在 `publicView` **之外**做遮蔽的副本必须让广播那条腿变红; **两种绕过 env 普查的写法各一个临时文件当负控**(`process.env['VIBESPACE_INTEGRATIONS']` 与 `const { VIBESPACE_INTEGRATIONS } = process.env`), 两个都必须变红; **一份把委托行解析成 `_driveClient()` 那条 `'default'` 兜底的副本**, 必须在两预设 env 上答 null 从而变红; **一条只带选择器却答 `source:'user'` 的记录必须变红**(它会让来源芯片说反话并把指针导出去) |
| `test-secret-box` | fast | 与 mounts 的 **parity**(用修前 `_enc` 的补丁副本加密 ⇒ `secret-box` 解得开, 反向亦然, `iv.tag.data` 三段逐字节同形); **只在 `ENOENT` 上创建密钥**, 其它 errno **带类型抛出**; 写走 tmp+rename; **绝不覆盖一个已经存在的密钥文件** | 一份照抄 `src/mounts.js:360-367` 那个裸 catch 的副本, 在一次注入的 `EACCES` 上必须铸出新密钥, 于是"旧密文还解得开"那条断言变红 —— 那就是 §14.7 讲的那个缺陷本身, 当作常驻负控 |
| `test-channels-lark-shape` | fast | 录制 fixture 的归一化: `next_page_token` *翻页到 anchor*、`@_user_N` 占位符对着记录自己的 `mentions` 解析、带类型的错误 | 一份 anchor 落在**第二页**上的 fixture 必须被翻进去, 而不是停在第一页 |
| `test-plugin-loader`(已有) | fast | `channelAdapters` 进了 `RESERVED_CONTRIBUTIONS` ⇒ 那句"保留给后续阶段 —— 已忽略"的警告真的会发(§15) | 如果那个词被加进去而没更新套件, 它的期望集合断言就会变红 —— 而这正是重点 |
| `test-channels-agent-cli` | fast | 对着一个 stub 服务器跑 CLI 各个动词; `reply` 只提议、绝不发送; 不可见 = 统一错误 | 一个返回了被 ACL 藏起来的会话的 stub, 仍然必须产生那个统一错误 |
| `test-spend-paths`(已有) | fast | 它那条按站点的普查必须看见这个新生产者、已接线、带着已声明的理由 | 它本来就带着自己的负控 |
| `test-channels-engine` | heavy | 真 worktree 服务器 + 假 adapter: 爆发日翻页、退避、单飞、故障出声**与撤回**、摘要批量、唤醒授权与 hold 释放 | 一份用固定窗口抓取的修前副本, 必须在爆发日 fixture 上丢消息 |
| `test-channels-push` | heavy | 真 worktree 服务器 + 一个**假推送服务器**: ack 在持久化之后(注入一次 ack 与处理之间的崩溃, 记录必须还在); 心跳沉默 ⇒ `state` 掉出 `live` **且**轮询节奏立刻回到快节奏; `stop()` 对已经在飞的 arm 是终局的; 声明 `exclusive` 但故意扣掉一部分事件 ⇒ `missRate` 越过阈值 ⇒ **自动降级成 kick 并把理由说出来**。**r4 三条**: 降级之后这条通道**真的改了它携带的东西**(下一个事件只 kick 游标, 记录由对账轮询进来 —— 光断言 `missRate` 越线是不够的); kick 模式下 `missRate` **一条样本都不涨**(否则它是单向棘轮); 一条降级了的通道即便 fixture 不再扣事件也**绝不自己回到**内容模式, 而在连接向导里重新声明一次独占则清零计数器并重新进入内容模式 | 一条**谎报 `active`** 的通道(修前副本)必须把轮询回落关掉并丢消息; 一份从不降级的副本必须在扣事件的 fixture 上永远丢消息; **一份把内容/kick 判定读在 `caps` 上的修前副本, 必须在降级之后仍然携带内容**; **一份终身累计 `missRate` 的副本, 必须在重新声明之后仍然停在阈值之上** |
| `test-channels-store-scan` | heavy | 真 daemon(`test-sysinfo-op` 那个模板)+ 一份**合成的** WhatsApp 形状 sqlite: 按 rowid 的游标只读一次读到底; 库带一个未 checkpoint 的 WAL 时**最近的消息仍然读得到**; 一趟读了一半被打断 ⇒ anchor 不动; **扫完之后源库的 `db` 与 `-wal` 逐字节未变且 mtime 未变**(r6 —— 刻意**不是**三个文件: 只读打开会重写 `-shm` 这个不含内容的 WAL 索引, 而在它不可写时连它都不动, 所以断言三件套会在**正确**的机制上变红); 读被拒 ⇒ 具名的 `tcc-denied` 而不是零条; **没有任何 SQLite 读者可用时是具名的 `no-sqlite-reader`**(r6); 能力门 —— 不宣告这个 op 的旧 daemon **绝不会被问**(未知 op 会挂)。**fixture 必须包含"我们是唯一连接"那一臂**(r6 —— 一次排期扫描的常态形状) | 一份只读**那个 `.db` 文件本身**的副本必须漏掉最近那批消息; **一份走**默认**(读写)打开的副本必须在"唯一连接"那一臂上让逐字节未变那条断言变红**(r6 —— 会出事的是**默认**形状, 不是 r5 点名的那个可选 `mode=rw`; 而且它**只在那一臂**变红: 客户端还连着时它是通过的, 所以 fixture 两臂都要有); 一份把 `EPERM` 当成"零条"的副本必须让具名拒绝那条腿变红; **一份在没有任何 SQLite 读者时答零条的副本必须让 `no-sqlite-reader` 那条腿变红** |
| `test-channels-e2e` | heavy | headless chrome: rail 徽标、panel 芯片、会话窗口、内联审批卡 → 发送 → 回执、filter 编辑器的实时估计。**外加 Integrations 那一腿(§14.5)**: 卡片在 `未配置` / `集群默认` / `你自己的` 三种来源下各渲染一次; 密字段只出 `••••1234` 而**没有任何路径把它读回来**(Replace 之后再 `GET` 仍然只有遮蔽视图); Test 按钮的字跟着 `test.kind` 走; 一次失败的 Test 把 vendor 原文画在卡上且经 `escHtml`; **`lark` 那张卡在字段**上面**画出 `setup.callbackUrl` 这条字面量、它可以被复制、而且三条 `prerequisites` 都在**; **一次成功的 Test 旁边带着 `test.caveat`, 从不单独画那个勾**; **委托行(`gmail`)画的是一个预设下拉而不是那对单选, 而芯片读作 `集群默认 · <label>`**; 以及**同一组卡片在 375×667 下单列渲染, 每个控件都够得着** | 加一条规则时那个估计必须变化; 而一个要求 review 的 channel 绝不能提供"可以发送"; **一份把明文回给 `GET` 的副本必须变红**; **一份给 `shape-only` 也写"测试连接"的副本必须变红**(那个按钮从没联网); **一份只画绿勾、不画 `caveat` 的副本必须变红**(这是本轮那条高危发现的镜像面: 一个如实测过凭据对的按钮被读成"我配好了"); **一份不画 `setup` 块的副本必须变红** —— 那条回调 URL 在产品里再没有第二个出处; **375×667 下任何一个控件落在视口之外必须变红** —— 这条腿点名 `showDropdown` 那一类事故: 未缩放的 `offsetWidth` 与缩放过的 rect 不是一回事 |

Fixture 卫生从第一个 commit 起就适用, 因为这些都是活生生的事故: 不许固定 `/tmp` 路径, 不许
固定端口(用 `scripts/scratch.mjs`); 任何 spawn 服务器的套件都要**点名它给的那个 HOME**; 每
一个子进程在退出时*以及*超时时都要被杀掉(runner 的 SIGKILL 会把幸存者过继给 systemd, 而它们
在整台机器范围内占着 inotify 实例); 一个必须碰真实 home 的套件是一个已声明、已付费的例外。
**没有任何套件会做 vendor 调用** —— adapter 是对着录制的 fixture 与那个假 adapter 跑的。

---

## 18. 批评记录 —— r2 对抗式 review

针对初稿提出了八条发现。每一条在改动任何东西之前都对着 `7f13e7c7` 那棵树核过。七条是对的、
已经在上文修掉; 一条对了一半, 而错的那一半记在这里而不是照做, 因为一份悄悄接受了错误更正的
设计, 与一份无视正确更正的设计一样不可靠。

| # | 发现 | 判决 | 改了什么 |
|---|---|---|---|
| 1 | 两个 adapter 轮询循环对同一份 `index.json` 做 read-modify-write; 重叠的 pass 会互相覆盖对方的游标推进与未读数 | **确认。** §6.2 规定每个 adapter 一个循环、而单飞只按*每个* adapter 声明, 与此同时 §5 把每一个可变的按会话事实都放进一份"在 pass 结束时"整份写的原子 JSON 里。`writeJsonAtomic` 只在 fs 那一层是原子的; 围绕它的 read-modify-write 不是。一次被覆盖掉的 *anchor* 推进会跳过消息 | 新增 **§5.1**, 在 `src/server/channels-engine.js` 里点名一个内存所有者, 配一个序列化的 `index.update(fn)` 与一次合并的 flush(`JobManager` / `SessionStatusManager` 那个形状); §5 的不变量 3–4 重写; §6.2 写明每 adapter 单飞不是互斥; §2 多出第三条承重规则; `test-channel-store` 多一条两趟并发 pass 的腿, 配一份 read-modify-write 的负控。分片在 §5.1 里被考虑过并被否掉 —— 轮转计数器是按*组*键控的, 而组是跨 adapter 的 |
| 2 | `test-channels-egress` 按原文写出来, 在它第一个 commit 上就是红的: `src/gmail-sync.js` 与 `src/mounts.js` 已经在向那些主机构造请求 | **确认。** `src/gmail-sync.js` 构造 `oauth2.googleapis.com/token`、`gmail.readonly` 的 scope URL 与 `gmail.googleapis.com/gmail/v1/users/me`; `src/mounts.js` 持有 `GRAPH_BASE`。一道在合法的既有面上就会失败的强制 gate, 会被第一个撞上它的人放宽 | §3.1 把这条普查重述成一张按 `(file, host pattern)` 键控、**带理由**的白名单, 出生即种下那两个文件, 外加 `test-vendor-whitelist` 的 `ALLOW` 本来就在用的死条目检查; §17 那一行连同两条负控一起更新 |
| 3 | Lark 的固定 loopback 端口是一个 machine-global 名字; 决定 4 只诊断了*注册*那种冲突, 没管一台机器上两个实例的情况 | **确认。** Gmail 的流程绑 `listen(0, '127.0.0.1')`; Lark 的必须注册, 因此固定。输的那个在授权页*之后*拿到一个不透明的 `EADDRINUSE`, 而持有端口的那个收到另一个实例的 code | 新增 **§12.4**: 模块显式双模; 固定端口只在一次流程期间绑; `EADDRINUSE` 变成一次落到粘回(它不需要端口)的具名拒绝; `state` CSRF 检查从 `gmail-sync` 执行它的**两个**地方逐字带过来并被钉住。§12.1 与决定 4 已更正; `test-oauth-loopback` 多了一条预占端口的腿与一条 `state` 错误的腿, 并且现在在 §17 里有自己的一行 |
| 4 | 由 assignment 派生的授权与同一个 `(principal, scope)` 上一条用户手写的授权冲突; 取消 assign 会静默撤销用户的授权 —— 在一个只许放宽的模型里做了收窄 | **确认。** §8 的授权形状是按 `(principal, scope)` 键控的, 而 §7.3 说的是"授权随 assignment 一起被移除" | 授权新增 `origin: 'user'\|'assignment'\|'request'`; `effective()` 仍然取 MAX 所以访问器不变; 取消 assign 只删 `origin:'assignment'` 那一行。§7.3 与 §8 重写; `test-channel-acl` 多一条镜像负控(assignment 被移除后 user 授权逐字节不变) |
| 5 | "每条待审 proposal 一条指针条目"在 `UserTodoManager` 里根本表达不出来 | **确认, 而且方向也错了。** `add()` 有一个封闭参数集; 它按 `(sessionKey, text)` 跨所有状态去重(重新归档一条已解决的条目会重开同一个 id); 它在超过 `MAX_OPEN_PER_SESSION = 20` 时抛异常。而且撤回需要的是*proposal → 条目*, 而这一层根本没有任何东西持久化过 | §9.2 重写成**每个会话一条指针**, `text` **不带计数**(于是按文本去重恰好就是想要的那种幂等), 计数放在 `detail` 里(`add()` 会就地更新它), 返回的 id 作为 `pendingTodoId` 持久化在**会话**上, 撤回只针对这个生产者写下的 id, 并写明上限抛异常时的降级。按 proposal 的那条替代方案及其代价记在决定 7 里 |
| 6 | 文中声称 `contributes.channelAdapters` "今天是一个被保留的贡献 key", 而它不是 —— 并且一个未知的 key 是被静默丢弃、没有任何警告的 | **确认。** `RESERVED_CONTRIBUTIONS` 是 `['keybindings','panels','viewers','commands','menus','statusChips','backends']`; 只有在那张表里的 key 才会告警, 而 `m.contributes` 被重建成固定形状, 所以其余任何东西都无声消失 | §15 那一行已更正, 而 P0 现在会加上那个词, 外加 `scripts/test-plugin-loader.mjs` 里期望集合的更新; §17 带上那一行 |
| 7 | 围栏 3 引用了一个这棵树里不存在的事故与一次不存在的度量, 而且陈述了与本仓库真实的法相反的东西 | **确认了一半。** 关于*法*的批评是对的, 并且已经修掉: CLAUDE.md 的规则是"不许**同步** fs/exec; 只许带超时的子进程/worker", 所以有界的异步子进程是被批准的(ssh-per-op、`ps`/`lsof` 梯级、发现扫描)—— 初稿暗示的正相反。而关于*编造事故*的说法是*错的*: `inc-mtunmv3d-pmd6`(2026-09-10)是真的, 在 45 MB / 543 MB / 1.5 GB 的父进程 RSS 下实测每次 spawn 1.8 / 18.8 / **72.5 ms**。它不在树里, 是因为实例本地的证据被要求留在这个公开仓库之外 —— grep 公开树是正确的检查方式, 也得出了正确的*观察*, 但"不在树里"与"是编的"是两个不同的主张, 而这个仓库自己的惯例(CLAUDE.md 通篇引用 `inc-…` id 却没有在树里的证据文件)让前者是意料之中的 | §3.3 重写成先陈述那条写下来的法, 然后把 fork 税当作*叠在它之上的一条实测约束*, 附上事故 id、方法、对 RSS 的依赖, 以及一句明确的说明: 证据文件是实例本地的。§21 增加第 12 条, 说明这些常数不可移植 |
| 8 | `_railBadge('channels', unreadTotal)` 那个"已经存在"的东西并不存在; 那个徽标需要的接线比列出来的多 | **确认。** helper 是 `_railSetBadge(id, val)`; 徽标由 `_railRefreshBadges()` 里一串硬编码的梯子和 `_railWireBadges()` 里一份显式的消息类型列表驱动, 两者都不会自动认出一个新 id | §10.1 已更正: 正确的 helper 名字与**六**处注册, 并注明这个徽标可以搭那份广播摘要的便车, 而不必往那串梯子里再加一次 fetch |

八条里有两条(1 与 3)是潜伏的*钱与正确性*缺陷而不是文档笔误, 而且它们共享一个值得点名的形
状: **一个被陈述在错误层次上的保证。**"原子写"是一个文件系统性质, 却被拿去顶替互斥;"注册
过的回调 URL"是一个 vendor 性质, 却被拿去顶替一个唯一的本地名字。两种情况下的修法, 都是去
点名那个真正持有这份保证的东西 —— 一个所有者、一次按流程作用域的绑定 —— 而不是去加强那个
从来就做不到的性质。

**r3 不是一次 review, 是一次改方向**, 所以它不进上面那张表。owner 的两条指示各推翻了这份
文档自己的一个结论, 而两次的形状是一样的, 值得写下来: **一条为了"安全"而写下的绝对规则,
如果它的理由只在某一种配置下成立, 那它就是一条被当成法来执行的默认值。** §6.4 的"活通道绝
不携带内容"真正的理由是集群模式, 而集群模式只在**多个实例共用一份应用凭据**时咬人 —— 所以
正确的东西不是那条禁令, 是那个条件, 加上一次可以被产品自己度量并撤回的声明。决定 17 的
"外部默认追加 drafted by <agent>"把一次披露塞进了**别人**读的那条消息里, 而真正需要知道
"对面会看见谁"的是**正在按批准键的那个人** —— 所以正确的东西不是那条附加文本, 是授权那一
刻的一条警告。两次都不是"更保守"或"更激进", 都是**把话说给该听的那一方**。

### 18.1 对 r3 的对抗式 review(r4)

针对 r3 修订提出了五条。每一条都先对着 `a41bf513` 那棵树复核过, 五条**全部成立**, 也全部
在上面改掉了; 没有一条需要被记成"批评错了"。

| # | 发现 | 判定 | 改了什么 |
|---|---|---|---|
| 1 | "此刻在用哪条通道、它活着吗、它可以携带内容吗"同时住在 `caps.pushExclusivity`、adapter 记录的 `push {…}` 与每会话的 `lane {…}` 三处, 没有优先级, 也**没有任何访问器读得到 adapter 记录** —— 于是 r3 新加的自动降级结构上赢不了 | **成立, 而且是三个后果不是一个。** §4 声称 `src/channel-caps.js` 是**唯一**回答处, 但它导出的三个函数没有一个接 adapter 记录; §6.4 只说前两者"一起决定", 没说谁压过谁 ⇒ (a) 被降级的通道继续携带内容, (b) 新鲜度芯片按一条静态声明画 "live"(正是它自己引用的 `opencode-events` 轮 4 教训), (c) 围栏 12 的合并窗口在 kick 模式下照跑, 白买 60 秒延迟 | `caps.pushExclusivity` **删除**(独占度是按部署的配置事实, 不该住在按 adapter 种类的静态声明里; `pushTransport` 留下, 它真的是静态的); `src/channel-caps.js` 新增**唯一**解析器 `laneState(caps, adapterRecord, convEntry, now)`, 优先级**降级 > 活性 > 声明**、`unknown` 一律 `carryContent:false`; 四个消费者(芯片、围栏 12 的门、§6.4 的节奏、§6.2 的调度器)全部改问它, §2 多一条落位规则; `test-channel-caps` 与 `test-channels-push` 各加腿, 后者断言**降级真的改变了这条通道携带的东西**(r3 只断言 `missRate` 越线) |
| 2 | 决定 19 把唯一有摄入契约的那一格(`scanSource:'store'`)删掉了, 而契约没有搬进活下来的那一格: `'ui'` 没有 anchor、没有去重键、没有"完整的一趟", §12.5 还明确允许它声明 `history:'none'` | **成立。** §4 的契约规定没声明的能力**抛异常**, §5 不变量 4 要"完整的一趟"与 `complete:false`, 不变量 2 又要求 `vendorId` —— 而一次 DOM 抓取不保证有稳定的消息 id; §17 的 parity 行只钉了 push/poll 的去重, 从没钉过"重扫一块屏幕" | §12.5 为 `'ui'` 写出三行契约: 合成 anchor 键 `(convId, renderedAt, sha256(author\|text))` 写进 `vendorId` 且 `raw.synthetic:true`、受滚动限制的"完整的一趟"(到了 anchor ⇒ `complete:true`, 先撞滚动上限 ⇒ `complete:false` 即 anchor 不动)、`receive:'scan'` 上**禁止** `history:'none'`(契约套件执法); 表里那一格的 `history` 改成只剩 `'page'`; §5 不变量 2 与 §6.3 各加一句指过来; `test-channels-lane-parity` 加 scan 腿与"丢掉合成键"的负控 |
| 3 | `push.missRate` 是一个没有计数窗口的终身比率, 降级又没有出口 ⇒ 单向棘轮: kick 模式下推送根本不携带记录, 比率按构造趋向 1.0, 于是一条降级过的通道**永远**回不到阈值之下 | **成立**, 而且正是 auto-resume `edgeHeld` 那条教训要防的形状(*把那堵墙烧掉就是把一次瞬时的分歧变成一次永久的拒绝*) | §6.4 补两句: 比率只在 `carryContent` 为真时计数、且只在一个滚动窗口(最近 N 条或 24 小时取大)里计数; 降级由**做出声明的那一方**撤回(连接向导里重新声明 ⇒ 清零 + 重试一次), **计数器绝不是触发器**; 决定 18 与 §21 第 17 条同步; `test-channels-push` 加两条腿 |
| 4 | `convCaps` 是一份带 `at` 却**没有任何读者**的存下来的派生事实(没有 TTL、没有刷新触发点、没有过期降级), 与十二行之下的 §5 不变量 7 直接冲突; 一份一周前的乐观答案会画出发送控件, 并造出 §4 承诺永不创建的那种 proposal | **成立。** `why` 的枚举里本来就有 `'left-group'`, 说明这个状态是被预期到的; 而没有读者的字段在这个仓库里就是"这个修复从来没接上线" | §4 与 §5 给 `convCaps` 一个 **TTL(6 小时)**与三个刷新触发点(track 时、TTL 过后面板第一次渲染、**批准那一刻发送之前无条件**), 过期即 `read:'unknown'`/`sendAs:[]`/`why:'stale'` —— 走 `offers()` 已有的规则渲染, 不需要新词汇; §9.2 写明批准时的重新解析与它的拒绝路径; 不变量 7 把它点名成"付了代价的例外"; `test-channel-caps` 加 TTL 腿(带正控), `test-channels-identity` 加"过期后批准必须拒绝"的腿 |
| 5 | 中文版 §21 的出处块与第 19 条之间缺一个空行, CommonMark 的 lazy continuation 会把整块出处折进那条 caveat 里 | **成立**(`cat -A` 复核; 英文版 en:1806-1808 有那个空行) | 补上那一个空行。同一次复核里, 这一对文档的其余结构性检查全部通过: 标题数、表格行数、代码块逐字节一致, 以及 P0–P4 / P0–P2 的轮次与天数算术两边一致 |

这五条里有四条(1–4)共享一个形状, 值得与上面 r2 那两条并排写下来: **一个事实被存在三个地
方, 而没有一个函数被允许把它们读全。** `laneState` 之前的那三个位置、`convCaps` 那个没有读
者的 `at`、被删掉的那一格里的摄入契约、以及那个只会往一个方向走的比率 —— 每一个都是"声明"
与"回答"之间少了一层。r2 的教训是*一个保证被写在了错误的层*; r4 的教训是它的孪生: **一个
答案分散在多个存储位上, 就等于没有答案** —— 存储位可以有好几个(声明、测量、观测本来就是
不同的事实), 但**折成答案的地方只能有一个, 而且它得读得到全部三个**。

### 18.2 owner 的更正(r5)—— 一句合并了两个平台的话

r4 写下"决定 19 把 `'store'` 对**两个**平台都排除掉了", 并据此把整个 §12.5 重写成只剩
`'ui'` 那一格。**owner 指出这是错的**: 他见过一个直接读 macOS 上 WhatsApp 那份库的实现,
而那份库根本没有加密。复核之后这条成立, 而它值得与上面 r2、r4 那两条并排记下来, 因为它的
形状是另一种:

| # | 发现 | 判定 | 改了什么 |
|---|---|---|---|
| 1 | "读本地库"这条路被整体排除掉了, 而排除它的理由(密钥在进程内存里 / 协议库违反条款)其实**一条都不适用于 macOS 上的 WhatsApp** —— 那个官方 Catalyst 客户端把整份聊天历史留在一个未加密的 Core Data SQLite 库里 | **成立。** 那句话把两件不同的事塞进了同一个词: WeChat 的库是**加密的**(密钥在内存里 ⇒ 围栏 13), WhatsApp 在 macOS 上**没有加密**(⇒ 一次普通的、被授权的、只读的文件读取)。围栏 13 的措辞让这两者读起来是同一件事, 因为它只说了自己拒绝什么, 从没说过自己**允许**什么 | 围栏 13 重写成三条拒绝(进程内存 / 复原一把 vendor 扣住的密钥 / 被条款禁止的传输)加上一条**明确的允许**, 判据是一句话"**我们在击穿谁的秘密?**"; §12.5 拿回 `'store'` 那一格并给它自己的摄入契约(真 anchor、完整的一趟、绝不写、TCC 是具名的门); 决定 19 从 (b) 改成 (b)+(d); P6 拆成两条门控不同的腿 |
| 2 | 顺带发现的: `caps.scanSource` 是一个标量, 而同一个 adapter 在 macOS 上读库、在 Linux 上刮界面 | **成立, 而且与 r4 第 1 条是同一个缺陷。** 一个按**部署**的事实住在了按**种类**的静态声明里 —— 这正是 r4 删掉 `caps.pushExclusivity` 的那句话 | 标量删除, 换成按平台的上界表 `caps.scanSources` + 按来源的 `caps.scanLatency` + **唯一**的解析器 `scanState()`, 优先级写死, 并带一条刻意的例外: **被拒绝的读取解析成 `null` 加理由, 绝不静默降级成 `'ui'`** |

这一条与 r2、r4 的形状都不同, 所以它自己是一条教训: **一道只说自己拒绝什么的围栏, 会在下
一次被人当成"拒绝所有长得像它的东西"。** 围栏 13 的每一个字都是对的, 而它照样把一条合法的
路一起带走了 —— 因为读者(包括写它的人)手里没有一条能说"这一个可以"的判据。所以现在它带
着自己的判据, 而且**能对某些东西说"可以"**: 一道说不出 YES 的围栏不是围栏, 是一条禁令, 而
禁令不需要论证, 也因此永远不会被复核。

---

### 18.3 对 r5 的对抗式 review(r6)—— 一轮修复自己带进来的东西

r5 把 `'store'` 那一格拿了回来, 而这一轮的八条里有**五条就长在那次新增上**: 一条把机制说反
了、一条把 r5 自己刚指认的缺陷留在了隔壁那个字段、一条给新记录配了三个没有读者的字段、一条
让新通道落在唯一没盖住它的那道门后面、还有一条给了它一条从没有过的发送路。**一轮修复是新代
码, 它欠的审视与它修好的那份一样多。**

| # | 发现 | 判定 | 改了什么 |
|---|---|---|---|
| 1 | `'store'` 那一格**推荐的**读法(backup API / `VACUUM INTO`)正是唯一会破坏它自己那条"绝不写"的机制, 而它拒绝安全那条的理由是**倒过来的**: "以只读方式打开活库不够, 因为这是 WAL 库"把**只读打开**(读得到 WAL)与**只读那个 `.db` 文件**(读不到)混成了一件事 | **成立, 已在一次性 fixture 上实测**(node v24.12.0 `node:sqlite`, SIGKILL 生产者留下未 checkpoint 的 WAL): 默认打开在**我们是唯一连接**时读对了 `NEWEST`, 然后在 `close()` 上把 `db` 改写、把 `-wal` 与 `-shm` **删掉**(SQLite 有文档的最后一个连接 checkpoint-and-delete); `readOnly:true` 同样读到 `NEWEST`(所以 r5 给出的理由是假的)且 `db`/`-wal` 逐字节不变; 而**只读 `.db` 文件本身**才漏掉 `NEWEST`。"我们是最后一个连接"对一次排期扫描是**常态** | §12.5 的机制**反过来**: 以 `SQLITE_OPEN_READONLY` 打开, 从**那条只读连接**做 `VACUUM INTO`/backup; 被拒绝的那句改写成"只读 `.db` 文件**本身**会漏掉 WAL"; 三件套复制降为**兜底**并写明它的撕裂读风险; §6.3 的孪生同改; §17 的断言从"三件套逐字节未变"收窄成 **`db` 与 `-wal`**(只读打开会重写 `-shm`), 负控从 `mode=rw` 改成**默认**打开, 并加一臂"我们是唯一连接" |
| 2 | `caps.history` 仍然是按**种类**的标量, 而 §12.5 自己那张新表给同一个 adapter 按解析出的来源指派了**两个不同的值**(`'store'`⇒`'since'`, `'ui'`⇒`'page'`) —— 这与 r5 在下一个字段上刚说过的话逐字相同 | **成立。** 一个 `kind:'whatsapp'` 的 adapter 只能声明一个 `history`, 而 `scanSources` 意味着同一个模块两格都跑: 声明 `'since'` 让 Linux 部署被要求用 DOM 刮取兑现 since-anchor 语义, 声明 `'page'` 删掉"真 anchor ⇒ `'since'`"这条 `'store'` 之所以被优先的理由; 而 §17 那条由**一个**假 adapter 驱动的两来源 parity 腿, 按 r5 的写法**不可实现** | `caps.historyBySource` 取代 `receive:'scan'` 上的那个标量(`push`/`poll` 保留标量), `scanState()` 连同 `source` 一起解析出 `history`, §4 的契约规则同时管住"每个值非 `'none'`"与"键要盖住 `scanSources` 的每一个来源", §17 加镜像负控 |
| 3 | 设计把 server.js 的尺寸棘轮点名为自己接线段落的门, 却没量过那个预算还剩多少 | **成立, 已实测**: 在基线提交上 `read('server.js').split('\n').length` **正好是 2100** ⇒ 余量为零, P0 的第一个 commit 就会让 `npm run build`(强制 pre-push 门 + 应用内自更新)变红 | §2.1 与 P0 的退出条件各加一条: **先量**, 然后要么在同一个 commit 里有意识地抬预算(套件自己的注释就是这么写的), 要么先抽走一个既有 stanza; 按 ~0.5 轮计价 |
| 4 | r5 新增的 `scan` 记录逐字重犯了 r4 自己的第 4 条: `hostFacts.at` / `grant` / `grantAskedAt` 是存下来的派生事实, 没有读者、没有 TTL、没有刷新触发点、没有陈旧降级 —— 而 §5 不变量 7 只点名过**一个**例外 | **成立。** `grantAskedAt` 在整份英文文档里只出现一次(就在那个 schema 块里), 而 `scanState(…, now)` 里的 `now` 从没被说过是干什么的(它每一个同辈解析器的 `now` 都有明确用途); 这些事实来自一次可能跨机器的往返, 本地推导不出来 —— 正是 `convCaps` 拿到具名例外的那条性质。伤害方向还更贵: 客户端被卸载、更新挪走了库、Sonoma→Sequoia 把 TCC 扩到 Group Containers 之后, `scanState` 会继续答 `'store'` 与 15 秒 | `scan.hostFacts` 拿到 6 小时 TTL + 三个具名刷新触发点 + `source:null`/`why:'host-facts-stale'` 降级; `grant` 移进 `hostFacts` 并且**从不跨一趟被信任**(op 自己的 `EPERM` 是权威, 一次 `EPERM` 就重新归档成 `tcc-denied` 并清掉存下来的授权); `grantAskedAt` 拿到读者("同一台机器上 N 之内不重复弹提示"); §5 不变量 7 收下第二个具名例外; §17 加 TTL 腿与它的正控 |
| 5 | `carryContent` 只为 push 定义过, 而那道合并门坐在三条通道汇合的**同一个漏斗**上, `laneState()` 又答得出 `via:'scan'`; 与此同时 `'store'` 是**连同一个事件驱动的触发器**(对库文件的 `fs.watch`)一起被引进来的, 既没有去抖也没说它与 `caps.scanLatency` 是什么关系 | **成立。** WhatsApp 的 `ChatStorage.sqlite` 每收一条消息就被写一次 ⇒ 热闹群里 watch 大约每条消息响一次 ⇒ 每条消息一趟扫描 ⇒ 每条消息一次 filter 命中 ⇒ 合并门读到的 `carryContent` 是 undefined(假)⇒ 每条消息一次唤醒, 也就是围栏 12 自己的"30 条消息变成 30 次投递"。**诚实边界**: §7.4 的 30 秒地板与 spend authorizer 把绝对花销兜住了, 所以这不是无界的钱 —— 但每条通道的唤醒次数与扣款笔数不一样, 这让 §6.1 的总纲与 §17 的 parity 行按字面不可能成立 | §6.4 的优先级里显式补上 `via:'scan'` ⇒ `carryContent:false`(scan pass 是一批, 与 poll 同理); 那个 `fs.watch` 被定性成**游标 kick**, 去抖到 `caps.scanLatency[source]`(于是那个数字是真的天花板), 并欠 `opencode-events` 第四轮那条 inotify 生命周期规则; §6.1 的图与 §17 的 parity 行各自跟进, 后者加一条爆发腿与一份没去抖的负控 |
| 6 | `'store'` 通道需要 daemon 里有一个 SQLite 读者, 而设计一个机制都没点名 —— 可每个候选都撞上本仓已经写下来的约束, 所以这不是细节, P6a 的 4–5 轮也没为它计价 | **成立。** daemon 是单文件 esbuild 包且 `--external` 恰好只有 `node-pty`, 安装脚本称它 "zero-dep" 且 `NODE_MIN=18`: `node:sqlite` 在 18/20 上不存在、在 24 上仍打 ExperimentalWarning(实测)、**取行的 API 是同步的**(它的 `backup()` 是异步的, 所以危险的是扫行那一段)而 CLAUDE.md 说这个 daemon 载着活会话管道; 原生绑定要第二个 `--external` 加按平台预编译; 而 `sqlite3(1)` 子进程是围栏 3 认可的形状 | §2 与 §12.5 点名机制并写明约束: **推荐有界子进程**, `node:sqlite` 放在运行时探测 + 明说的 `NODE_MIN` 抬升之后, 原生绑定按打包理由**明确拒绝**; `no-sqlite-reader` 进 op 的失败词表; §21 加一条"那台 Mac 的 daemon 上有哪个读者是未实测的"; P6a 重新计价 |
| 7 | 唯一会拿到 `'store'` 的那个平台, **发送没有机制**。"两条来源上是同一件事"对 `'ui'` 成立(浏览器在网页里打字), 对 macOS 无定义 —— 那是一个原生 Catalyst 应用; 而 P6a 的交付物里没有发送路径、并且自称"不需要 agent-browser" | **成立。** 那句话在 §6.3 / §12.5 / 决定 19 出现三次而两份文档都镜像着它; `'store'` 行的"发送"格写的是"落到 `'ui'`", 而 `'ui'` 的发送机制是 agent-browser —— 于是 P6a 按当前范围就是只读的, 却从来没说 | 三处按来源拆开; **P6a 明确只读且是结构性的**(`convCaps.sendAs` 解析成 `[]` + `why:'no-send-lane-on-this-host'`, 由 §4 现成的规则渲染并阻止建出 proposal); macOS 的两个候选(第二份 linked-device 凭据 / 原生 UI 自动化及它自己的 TCC 授权)写进 §21 当作**未决**问题; `'store'` 行的发送格改写 |
| 8 | `freshnessClaim(lane, convEntry)` 算不出它自己声明的任何一个数: 它返回 `seconds`(一个**年龄**)却不收时钟, 也不收 `caps`(而 poll 那一档要画的 "≤ 30 s" 住在 `caps.pollInterval.hot` 里); 而 r5 又把它的第一个参数拓宽成两种**不相交**形状的 union 且没有判别字段 | **成立。** 每一个同辈解析器都收 `now`(`laneState`/`scanState`, 以及本仓的 `quota-model` 与 `decideLagShadow`); `laneState()` 的答案带 `via`, `scanState()` 的只带 `source` ⇒ 调用方只能靠"碰巧有哪些键"嗅探。**另外**: §12.5 性质 1 那句"延迟来自 `scanState` 不是静态声明"按字面为假 —— `latencySeconds` 就定义在它上面两行、来自 `caps.scanLatency[source]` | 签名收为 `freshnessClaim(caps, laneOrScan, convEntry, now)`; `scanState()` 补 `via:'scan'` 让 union 显式; 性质 1 改写成**两个数字**(声明的节奏 = 被解析索引的静态表; 实测的年龄 = `lastScanAt` 对 `now`)并要求那一行说清自己在显示哪一个; §17 加"同一个 `convEntry` 两个 `now` 必须两个 `seconds`" |

这一轮自己的教训是一句方法学: **一次修复引入的每一个新字段, 都要按它自己刚刚写下的规则再
审一遍。** r5 在同一节里正确地论证了"按部署的事实不能住在按种类的声明里"(第 2 条却把隔壁字
段留在那儿)、正确地引用了 r4 的"没有读者的字段就是没接上线"(第 4 条却给新记录配了三个)、
并且正确地把 `'store'` 说成一条更好的通道(第 5、7 条却没问它落在哪道门后面、也没问它能不能
发送)。一轮修复不会因为它是修复就免检。

### 18.4 对 r7 的对抗式 review(r8)—— 加了一整层, 而那一层欠同样的审查

r7 为了回答 owner 那条集群指示而加了 §14 一整层。六条发现全部对着本 worktree 的树核过,
**六条全部成立**, 都已在上文修掉。它们分成两堆, 而两堆各自是这份文档已经为别人写下的法:
**两条高危**是"这张卡片能不能真的让一个用户配好"——它画出来的东西不够用, 而它的绿勾比它证
明的东西说得多; **两条中危**是这个代码库的两条常客——一件事两个面各说各的, 以及一条普查查
的是拼写而不是它声称要查的那个东西。

| # | 发现 | 判定 | 改了什么 |
|---|---|---|---|
| 1 | 那张配置卡**没法让一个用户自己的 Lark 应用真的跑起来**, 而它的 Test 会在一个注定过不了同意页的应用上变绿 —— 恰恰是 §10.1 说这张卡存在就是为了避免的那个结局 | **成立。** §14.9 自己的结论是跨租户用户**必须**自带应用(自建应用是企业内部的), 所以这是集群里每个不在集群自身租户的用户的**默认**路径; §12.1 已经点名控制台要齐三件事而缺一件挂的是*同意页*; 可那张卡只声明了 `appId` / `appSecret` 两个字段, `credential-exchange` 在三件事一件没做的应用上**会成功** ⇒ 用户填完、Test 绿、`resolveIntegration` 从此答 `user`、向导再不开卡, 而那条要抄进控制台的回调 URL(§12.4 把端口固定在 `src/oauth-loopback.js` 里)在产品里**从头到尾没出现过** | 行上新增 `setup:{callbackUrl, callbackNote, prerequisites}`, 卡片画在字段**上面**、URL 带复制按钮(§14.2、§14.5); `test` 新增 `caveat`, 判决**永不单独画**; 普查两条新断言(声明了 `prerequisites` 就必须有 `caveat`; 消费者跑 OAuth 的行必须有 `callbackUrl`)+ 375×667 那条腿要求它画出来且可复制。**而回调 URL 只在这一行定义**, `src/oauth-loopback.js` import 它 —— 一个要与控制台逐字节一致的字符串不能有两份拼写 |
| 2 | `gmail` 那一行委托给一个凭据**列表**却说不出它指的是哪一个; 而存下用户的选择会把 `source` 翻成 `'user'` | **成立, 两半都成立。** (a) `drivePresets()` 返回列表(`src/mounts.js:2189-2206`), 而 §12.2 自己推荐让集群**再加一个** `channels` key ⇒ `_driveClient()` 的 `src/mounts.js:2215` 在 `org1`+`channels` 且无 `'default'` 时返回 **null** ⇒ §19 里 P1 那条"只有集群默认也要能连到底"的出口**结构上过不了**; (b) 落盘形状把每条记录盖成 `"source":"user"` ⇒ 来源芯片对一把集群凭据说"你自己的"(而它存在的全部理由就是说出这一件事)、§14.10 会把一个指向集群凭据的指针导出去、决定 22 的"界面写'由集群提供'"在 `gmail` 上不成立; 而那对单选也画不出 N 个预设, 它引的那份先例(`src/lib/sidebar-mounts.js:1747-1751`)正为这个理由早就是 N+2 的下拉 | `clusterEnv` 增 `{prefer, multi}`, 解析顺序**用户的选择 > `prefer` > 唯一预设**, 永不回落 `'default'`; **`source` 改成推导、绝不落盘**, 记录只存 `values` 与 `clusterKey`, 只带选择器 ⇒ `source:'cluster'`; §14.5 委托行画下拉、芯片读 `集群默认 · <label>`; §14.10 导出的是那个 **key**; P1 出口改在**两个预设**的 env 上跑; 决定 22 记下这条更正。**一处刻意与建议不同**: 验证者写的是"先 `prefer` 再用户的选择", 本文取**反**—— `prefer` 压过用户明确挑的那一个会让下拉变成装饰, 也会违反本节自己的"用户自己的 > 集群默认" |
| 3 | 两块面从不同的事实回答"这个 adapter 连着吗", 而它们会互相矛盾: 撤走或轮换一个集群默认, Adapters 那一行还写着 `connected` | **成立。** §14.3 诚实地处理了配置那一半(集群默认消失 ⇒ 答 `none` 并点名), 但没有任何东西把它接到 §13; `resolveIntegration` 在英文档里出现 11 次, **没有一次**是 `auth.state()`。而 Lark 的 `tenant_access_token` 每次调用现换、Gmail 的 client id/secret 每次 refresh 都要 ⇒ 那一刻 adapter 已经死了, 真相要等"连续 3 趟失败变琥珀"才到, 解释还只是一个 vendor 4xx | `auth.state()` 吃 `resolveIntegration(id)` 作为输入并新增第四个值 **`needs-credentials`**, `why` 点名缺什么(§4、§13); 它**不是** `needs-reauth`(再同意修不好)也**不是** `unknown`(我们很清楚坏在哪); §17 那条轮换 env 的腿现在要求翻的是 **Adapters 那一行**, 只翻卡片的副本变红 |
| 4 | 那条"消费者绝不自己读 `process.env`"的普查查的是一种**拼写**而不是 env 的**名字** | **成立。** `process.env.VIBESPACE_INTEGRATION` 这个字面量漏掉 `process.env['VIBESPACE_INTEGRATIONS']`、`const { VIBESPACE_INTEGRATIONS } = process.env`、`const env = process.env; env.VIBESPACE_INTEGRATION_LARK_APPSECRET` —— 三种都普通。这个代码库为同一条挨过三次: test-architecture §45 r3(匹配被调用者名字 ⇒ 一个别名把退役形状走回 kill 路径, 改成匹配 argv 里的工具字面量)、test-writer-sweep §17 r7(手写文件集漏掉 **47** 个真会发信号的文件, 改成 grep 推导**并打印**)、test-fixture-isolation r2(一次别名藏住一个 `rm -rf`, 改成取不动点) | 普查改成匹配 **env 名字**(`/VIBESPACE_INTEGRATIONS?\b\|VIBESPACE_INTEGRATION_/`), 文件集由 `git ls-files` 经 `scripts/git-env.mjs` 的净化环境推导并由套件**打印**; 两种绕法各当一条负控(§14.6、§17) |
| 5 | `useClusterDefault` 与 `DELETE` 这两句相邻的话, 对同一个转移给的是相反的答案 | **成立。** §14.3 写"没有集群默认时是一次具名拒绝", §14.4 写"没有集群默认就回到 `none`", 而 `DELETE` 是界面到达这个行为的唯一路由 ⇒ 两者必有一个**在产品里到不了**, 是哪一个取决于实现者读的是哪一句 | 拆成两个意图两个函数: `clearUserValues`("把我的 key 清掉", 永远允许, 落在优先级落到的地方)由 `DELETE` 调; `useClusterDefault`(那颗单选, 走 `PUT {use:'cluster'}`)在没有集群默认时具名拒绝 —— 这也正是那颗单选置灰**并说明原因**的同一件事。两个结果都进 `test-integration-registry` |
| 6 | 22 条代码引用里有一条差一行 | **成立, 已复核。** `src/routes/persistence.js:697` 是 helper 的定义 `const take = (name, fn) => …`, 而 `take('settings', readSettings);` 在 **698**(同一段里的 `:679-686` 与 §14.10 的 `:712-741` / `:729-732` 都是准的) | 两份文档的 §14.1 都改成 `:698` |

这一轮自己的教训, 与 r6 那句是同一句话往前走了一步: **r6 说"一次修复引入的每一个新字段都要
按它自己刚写下的规则再审一遍", 而 r8 说的是"一个新加的面, 要按它自己声称要防的那个结局去
审"。** §10.1 写下了这张卡存在的理由(别把用户送进一个会在同意页上失败的流程), 而 §14.2 与
§14.5 画出来的那张卡**做不到**这件事 —— 不是因为哪一句写错了, 而是因为没有人拿着那句理由再
走一遍这张卡: 它画了什么、它的绿勾说了什么、用户抄不抄得到那条 URL。一个面的规格要拿它自己
的验收标准去读, 而不是拿它自己的字段清单去读。

---

## 19. 阶段、轮次、日历

一**轮**≈ 1 小时实现者 + ~20 分钟对抗式验证(2026-09-10 跨 32 个 workflow / 130 个 agent 实
测)。日历按**每天 2 轮**算。区间是诚实的: 下限假设一轮就收敛, 上限假设这个模块需要那些额外
的轮次 —— 而实测分布说大约三分之一的模块确实需要。

### P0 — store、索引所有者、adapter 接口、假 adapter、panel 骨架、**集成层** — **16.5–18.5 轮 (8.25–9.25 天)**

`src/channel-store.js`(持久原语)、`src/channel-record.js`、**`src/channel-caps.js`(两个
轴的能力判定 + `convCaps` 与它的 TTL + `freshnessClaim` + `identityWarning` + **唯一的通道
解析器 `laneState`** + **唯一的扫描来源解析器 `scanState`**)**、`src/channels/index.js`
+ 假 adapter(**它三种接收模式都能真的跑, 而 scan 模式两种来源都跑**)、一个 `src/server/channels-engine.js` 骨架(调
度器、单飞、广播)且**从第一个 commit 起就带着 §5.1 那个序列化的索引所有者**、
`src/routes/channels.js`、六处 rail 注册(§10.1)、panel 列表(**含新鲜度芯片**)与一个空的
会话窗口。还有 `RESERVED_CONTRIBUTIONS` 里那一个词 `channelAdapters` 加上它的套件更新
(§15)。Gate: `test-channel-store`(含两趟并发 pass 的腿与它的 read-modify-write 负控)、
`test-channel-adapter-contract`、`test-channel-caps`、`test-channel-record`、
`test-plugin-loader`。
**出口:** 假 adapter 的会话出现在 panel 里、能开成窗口、能活过一次重启、能在两个客户端之间
同步, 两趟同时的 pass 都推进了各自的游标, 而且**一个只读会话上根本画不出发送控件**。
(r3: +2 轮 —— 两个轴的能力记录、`convCaps`, 以及假 adapter 的 scan / push 模式。r4: +1 轮
—— `laneState` 与它的优先级、`convCaps` 的 TTL, 以及假 adapter 的 scan 模式里那把合成
anchor 键。r5: +1 轮 —— 按平台的 `scanSources`、解析器 `scanState` 与它的优先级, 以及假
adapter 的 `'store'` 来源, 于是"同一天的流量经两种来源得到同一批记录"这条 parity 从第一天
起就有腿。**r6: +0.5 轮** —— `historyBySource` 与 `scanState` 补上的 `via`/`history`/
`hostFacts` TTL, 外加**接线段落的尺寸棘轮**: 那个预算今天正好顶格(实测 2100/2100), 所以
P0 的**出口条件**多一条 —— **先量 `server.js`**, 然后要么在同一个 commit 里有意识地抬高预
算并解释为什么, 要么先把一个既有 stanza 抽进 `src/server/`; 无论哪条, `npm run build` 必须
在那个 commit 上是绿的, 因为它同时是发布门与应用内自更新的一步(§2.1)。 **r7: +5.5 轮 —— §14 那一层整个落在 P0**, 因为它是本设计自己第一个 adapter 的
前置条件(没有它, Lark 的 app id/secret 只能进设置, 而 §14.1 说明了为什么那是不行的):
`src/secret-box.js` **从 P1 提前过来**(+1, 含与 mounts 的 parity 与那个 `ENOENT` 专属的 catch,
§14.7)、`src/integration-registry.js` + `src/server/integration-store.js` + `src/routes/integrations.js`
(+1.5)、Integrations 窗口与它的卡片、Replace、深链与 ≤768px 单列(+1.5)、`test-integration-registry`
与那条常设 grep 普查(+1), 以及 helm 的 `integrations:` 段 + `deploy/README.md`(+0.5)。**出口再加两条**:
假 adapter 拿到一行自己的 registry row, 于是"用户自己的 > 集群默认 > 没有"这三种来源在 P0 就都
被走过一遍; 而**注入一个集群默认再把它撤掉**, 那一行必须变成 `none` 并说出理由, 绝不是静静地
继续用旧值。 **r8: +0.5 轮** —— `setup` 块与它的复制按钮、`test.caveat` 与"永不单独画那个勾"、
委托行的 `prefer`/`multi` 解析与那个预设下拉、`source` 改成推导而不落盘, 以及 env 普查从"一种
拼写"改成"从 `git ls-files` 推导出的文件集 + 匹配 env **名字**"并打印它走过的集合。**出口再加
两条**: 假 adapter 那一行拿一个 `setup` 块, 而 375×667 那条腿要求那条 URL 画出来且可复制; 注
入两个预设(`org1` + `channels`, 没有 `'default'`)时, 一条委托行必须解析到 `prefer` 指的那个,
而用户存过的选择压过它。)

### P1 — Lark 读 + Gmail 读 + **推送通道** — **14–16 轮 (7–8 天)**

`src/oauth-loopback.js` **双模**(§12.4: 临时 + 固定、端口只在流程期间持有、具名的
`EADDRINUSE` 拒绝、粘回回落、两处 `state` 检查逐字带过来)、`src/channels/lark.js`、
`src/channels/gmail.js`、adapter 面板(连接 / 重新授权倒计时 / tracked 选择器 / 包含查询)、
故障出声 + 撤回, 以及那张**出生即种下**那两个既有文件的出网白名单
(§3.1)。**外加推送这一半(r3/Q3(a))**: `src/channels/live/lark.js`(官方 SDK 的长连接、
持久化之后才 ack、心跳活性、`stop()` 对在飞的 arm 终局)、独占度的**声明 + 度量 + 自动降
级**(`push.missRate`)、adapter 行上把通道状态与降级理由说出来, 以及一个默认关闭的开关后面
的 `src/channels/live/gmail.js`(Pub/Sub pull 订阅)。
Gate: `test-oauth-loopback`、`test-channels-lark-shape`(录制 fixture)、
`test-channels-egress`、`test-channels-engine`(爆发日翻页)、**`test-channels-push`**。
**出口:** 两个平台上的真实会话、tracked 是 opt-in 的、在爆发日上正确、诚实的 auth 状态、任
何响应里零密钥, 第二个实例的授权流程是被点名拒绝的、不是被一段堆栈拒绝的, **而且一条声明
了独占却并不独占的推送通道会自己降级并说出理由**。
*Owner 卡点:* Lark 的 redirect-URI 注册(决定 4)与在控制台里启用事件订阅(决定 3)。
(r3: +4 轮 —— 推送传输、活性、ack 语义、独占度度量与降级, 加 Gmail 的 Pub/Sub pull。r4: +1
轮 —— `missRate` 的滚动窗口与"只在携带内容时计数"、adapter 行上那个"重新声明以重试"的入口,
以及 `test-channels-push` 里"降级真的改变了这条通道携带的东西"那条腿。) **r7: 净 ±0** —— `src/secret-box.js`
的抽取**移出**去了 P0(−1), 换进来的是这一层的两个消费者腿(+1): Lark 与 Gmail 两个 adapter 改从
`resolveIntegration()` 取凭据(而不是各自读 env)、它们各自的 `registerIntegrationTest` runner, 以及
连接向导在 `none` / `cluster` / `user` 三种回答下的三条文案路径(§10.1、§14.5)。**出口再加一条**:
一个只有集群默认、用户什么都没填的实例, 必须能一路连到底 —— **而这一条要在一份两个预设的 env
上跑**(`org1` + `channels`, **没有** `'default'`), 因为那正是 §12.2 给决定 5 的答案让集群配出
来的形状, 也正是 `_driveClient()` 的兜底会答 null 的那一个(§14.2、r8)。

### P2 — assign、filter、唤醒 — **9–11 轮 (4.5–5.5 天)**

`src/channel-filter.js`、assignment 模型、estimate 路由、带实时估计与事后度量的 filter 编辑
器、带新 `SPEND_REASON` 的唤醒路径、摘要批量, 以及 per-assignment 的节奏上限。**外加推送
的那一半(r3/Q3)**: `channels.pushCoalesceSeconds` 合并窗口(围栏 12)、AssignFilter 面板上
按通道如实说出的延迟声明, 以及 `authority:'send'` 的能力封顶(§7.3)。
Gate: `test-channel-filter`、`test-spend-paths`(它的普查看得见这个生产者)、
`test-channels-engine`(唤醒、摘要、hold 释放)、**`test-channels-lane-parity`**。
**出口:** 一个被 assign 且被过滤的会话唤醒了一个 agent, 那次唤醒说出了它的理由, 钱被界住并
被归到了正确的槽上, **而且同一天的流量走三条通道产生同样多的唤醒与同样多的钱**。
(r3: +2 轮 —— 合并窗口、通道对等腿、延迟声明。)

### P3 — outbox、审批、回执 — **10–13 轮 (5–6.5 天)**

`src/channel-policy.js`、outbox store、内联审批卡 + Outbox 窗口(**含身份行与
`identityMarking` 警告**, §9.5)、带持久化 `pendingTodoId` 与撤回的按会话 "For you" 指针
(§9.2)、走 `noWake` 的回执(**带 `sentAs` / `identityMarking` / `identityMarkingText`**)、
审计日志(**带 `draftedBy` / `approvedBy` / `sentAs`, 且不出实例**)、`vibespace-channels`
与它的手册(**`reply` 在 `sendAs: []` 的会话上返回 `send-not-available` 而不创建
proposal**), 以及带请求与授权 `origin` 的 AgentReach 面板(§8)。
Gate: `test-channel-outbox`、`test-channel-acl`(含"取消 assign 后 user 授权仍在"那条负
控)、`test-channels-agent-cli`、**`test-channels-identity`**、`test-channels-e2e`。
**出口:** 一个 agent 提议, 用户在任一个面上批准 / 编辑 / 拒绝, 一份回执在不叫醒任何人的情
况下落地, 回执说出了对面看见的是谁, 而且审计日志是完整的。发送只对着假 adapter 与内建的
Agents adapter 跑。(r3: +1 轮 —— 身份行、回执字段、审计字段。r4: +1 轮 —— 批准那一刻对
`convCaps` 的无条件重新解析与它的拒绝路径。)

### P4 — 真正的外部发送 — **7–9 轮 (3.5–4.5 天) + owner 卡点时间**

Lark 发送(身份按决定 2, `uuid` 幂等)、Gmail 发送(两阶段草稿、线程串接 header)、给未知结
果用的 `reconcile()`、端到端的护栏, 以及那个**默认关闭**的发送方诚实行开关(§9.5)。
**这一阶段的第一件事**是那次身份证明: 用一次真实发送把 Lark 的 `identityMarking` 从
`unknown` 定成 `none` 或 `marked`(§21 第 3 条), 因为在那之前审批卡说的是"没验证过"。
Gate: outbox 套件扩上幂等与 reconcile 两张矩阵; `test-channels-identity` 扩上真实的
`sentAs` 回执; `test-channels-e2e` 对着假 adapter 端到端; 外加在把这个开关提供给任何人之前,
对着一个真实的临时聊天有据可查地手打一发。
**出口:** 一条被批准的 proposal 恰好一次地到达平台, 或者诚实地说它不知道; 而且审批卡上写
的"对面会看见谁"是**量出来的**, 不是猜的。(r3: +1 轮 —— 身份证明腿与那个开关。)

### P5 — 可选后续(未排期)

沙箱化的 HTML 渲染(**2–3 轮**)、附件抓取(**2**)、插件贡献的 adapter(**4–6**)、跑在配
对设备上的 adapter(**4–6**)。(r3: 活通道那一项已经上移到 P1, 所以它不再在这里。)

### P6 — 本地客户端 adapter(WhatsApp / WeChat)— **14–20 轮 (7–10 天), 未排期, 两条腿各自门控**

§12.5。r5 之后这个阶段**分成两条独立的腿**, 而它们的门控不一样 —— 这正是把 `'store'` 找回
来买到的东西: 这一类不再整体卡在 agent-browser 上。

**P6a — macOS 的 `'store'` 腿(4–5 轮), 只门控在决定 19 上。** `channels-scan-store` 这个
agentd op(daemon handler + hello-ack 里的能力位 + 三触规则)、SHARED 的
`src/channels-store-scan.js`(平台事实、**只读打开 + 从那条只读连接取的 scratch 快照**
(§12.5, r6 —— 不是默认打开)、按 `(rowid, 时间戳)` 的游标、把 `ZWAMESSAGE` /
`ZWAMEDIAITEM` 映射成 `ChannelRecord` 并解析联系人与媒体引用)、`scanState()` 与连接向导里
那条 TCC 授权行, 加上 `test-channels-store-scan`。**它不需要 agent-browser**, 所以它是这一
类里唯一一条今天就能独立落地的腿; 而因为它带一把真 anchor, 它也是这一类里唯一一条不欠合成
键那笔代价的腿。**它也是**只读**的(r6)**: 这条腿里没有任何发送路径, 所以它必须结构性地说出
来 —— `convCaps.sendAs` 解析成 `[]` 加 `why:'no-send-lane-on-this-host'`; macOS 上的发送是
§21 里一个**未决**的问题, 不在这条腿的范围内。**r6 重新计价: 5–7 轮**(原 4–5), 多出来的是
选定并接上那个 SQLite 读者(有界 `sqlite3(1)` 子进程 / 探测后的 `node:sqlite` + `NODE_MIN`
抬升; 原生绑定已被拒), 以及 `no-sqlite-reader` 这条具名拒绝 —— §12.5 把这个决定写下来了,
但它仍然要在真 daemon 包上实现并被测量。

**P6b — `'ui'` 腿(9–13 轮), 双重门控。** agent-browser profile、登录活性、带游标的界面扫
描、在客户端自己的输入框里发送, 加上 WhatsApp 与 WeChat 各自的 adapter 与它们的 `tosRisk`
确认对话框。**门控在两件事上**: 决定 19(owner 是否接受条款风险), 以及
`docs/design-agent-browser-v2.md` 那套 profile 系统落地。

接口这一侧从 P0 起就已经就位, 所以这两条腿里没有一行改动会碰到 store、filter、spend 或
outbox。(r4: +1 轮 —— 把 §12.5 那三行 `'ui'` 摄入契约真的实现出来: 合成 anchor 键、受滚动
限制的"完整的一趟", 以及在两个真实客户端上判断它们到底暴不暴露稳定的消息 id。**r5: +4 轮**
—— 整条 P6a, 其中一轮是先去**实测**这份设计从公开材料里读来的那些东西: 库的路径与它在一台
真 Mac 上的现行 schema、TCC 到底是弹提示还是直接拒、以及那份未加密的库在被 owner 的客户端
更新时的行为。**r5 那一行原来写的是"+4 轮", 而 P6a 是 4–5 轮、P6 自己从 9–13 变成
13–18 —— 也就是 +4–5; r6 把这个算术错字改掉, 并把 P6a 重新计价成 5–7 轮 ⇒ P6 = 14–20。**)

**总计:** P0–P4 = **56.5–67.5 轮 ≈ 28.25–33.75 个工作日**(按每天 2 轮), 外加那两次 scope 往返的
owner 卡点时间。(r2 review 加了 2–3 轮; **r3 又加了 10 轮**: P0 的两个轴能力记录 +2、P1 的
推送通道 +4、P2 的合并与通道对等 +2、P3 的身份面 +1、P4 的身份证明 +1; **r4 又加了 3 轮**:
P0 的 `laneState` 与 `convCaps` TTL +1、P1 的 `missRate` 窗口与降级撤回 +1、P3 的批准时重新
解析 +1; **r5 又加了 1 轮**: P0 的 `scanState` 与按平台的 `scanSources` +1; **r6 又加了
0.5 轮**: P0 的 `historyBySource`/`hostFacts` TTL 与那个已经顶格的尺寸棘轮 +0.5 —— r4、r5
与 r6 另有 P6 的 +1、+4–5 与 +1–2 不计入这个总数, 因为 P6 本来就未排期; **r7 又加了 5.5 轮**:
P0 的整个集成层 +5.5, 而 P1 是净 ±0(secret-box 抽取 −1 挪去 P0, 两条消费者腿 +1)。)光是 P0–P2 ——
只读的 channels 加上 assignment、过滤与**实时推送**、外加一个**用户自己就能配 key 的界面**、完全
没有任何出向路径 —— 是 **39.5–45.5 轮 ≈ 19.75–22.75 天**, 而且它仍然是一个自洽的发布点: panel 是有用的、消息是实时到
的, 没有任何外部消息能离开这栋楼, 而钱已经被界住了。

---

## 20. 需要 owner 拍板的决定

每一条都带一个建议。没有一条日后可以免费反悔, 这正是它们出现在这里而不是出现在代码里的原因。

| # | 决定 | 选项 | 建议 |
|---|---|---|---|
| 1 | **Adapter 放在树里还是做成插件?** | 树内模块 / 插件包 | **v1 放树里。** OAuth 流程、密钥存储与 spend guard 全都在树里; 在这个规模上, 为每条消息付一次 IPC 边界什么都买不到。把接口保持一模一样, 于是第三方 adapter 在 P5 变成插件时不用分叉注册表 |
| 2 | **Lark 的发送身份**(r3/Q4 已更新) | 以**用户**身份(需要 `im:message` + **`im:message.send_as_user`** —— 点不是冒号 —— 一次版本发布与重新授权)/ 以**bot** 身份(需要把 bot 加进每一个聊天)/ 两者都要 | **以用户身份, 那次 scope 往返照旧留在 P4。** 在一个已经存在的人类群里, 那是对面期待的样子, 而且它不需要改动别人的任何聊天。bot 身份只作为 user-send 被拒时的回落 —— 而且 bot 发送是 `identityMarking:'marked'`, 所以那个回落**要在审批卡上出声**。**新增的一半:** 用户身份发送**是否真的**改变收件人看见的 `sender_type`, 官方文档没写、社区有相反报告, 所以在 P4 用一次真实发送证明它之前, 这个 adapter 声明 `identityMarking:'unknown'` 并按 `marked` 对待(§9.5、§21 第 3 条)。**在 scope 落地之前, 界面说的是**"发送需要在 Lark 应用上再加两个权限、发布一个版本, 并重新授权一次", 而不是把一个灰控件摆在那里 |
| 3 | **Lark 的接收通道**(r3/Q3(a) 已重写) | 只轮询 / 轮询 + WebSocket **kick** / WebSocket **携带内容** + 轮询做对账 / webhook | **推送是一等模式, 从 P1 起就上; 内容还是 kick 由 `laneState()` 一处判定(声明住在 adapter 记录的 `push.claimedExclusive` 上); 永远不要 webhook。** 长连接不需要公网 URL、只支持企业自建应用、每应用 50 条连接、3 秒 ack、**at-least-once 带 4 次重投** —— 所以"推送不可靠"这个理由不成立。真正的约束是**集群模式**: 多个客户端共用一份应用凭据时每个事件随机只到一个。那是一个**配置**条件, 不是一条自然律 ⇒ 独占时携带内容(轮询降到 15 分钟对账), 共用或未知时只做游标 kick(r2 的行为, 也是默认值)。一个公网入站端点相比长连接什么都买不到 |
| 4 | **Lark 的 redirect URI** | 复用运维工具已注册的那个 loopback 端口 / 为 VibeSpace 注册一个专用的 | **注册一个专用的 —— 而且无论如何都把那个端口当 machine-global 看待。** 注册解决的是 VibeSpace 与运维工具之间的冲突; 它**解决不了**一台机器上两个 VibeSpace 实例(一个生产服务旁边一个检出), 那时输的那个在用户已经站在授权页上之后拿到一个不透明的 `EADDRINUSE`, 而持有端口的那个收到它的 code。§12.4 只在流程期间绑、按名字拒绝, 并落到粘回。如果控制台一个应用能接受多个回调 URL, 就把我们的*并排*注册进去而不是把他们的顶掉(未验证 —— §21) |
| 5 | **Gmail 的 OAuth client** | 往现有的共享预设里加 `gmail.send` / 为 channels 注册一个专用 client | **给 channels 一个专用 client。** 往一个共享预设里加一个敏感 scope, 会让用这个预设的一切重新授权一遍, 而认证状态(以及由此而来的 7 天 refresh token 行为)会变成一个决定管两个功能。只读的 P1 可以先在现有预设上起步 |
| 6 | **默认 track 什么** | 在用户挑之前什么都不 track / 用户所在的全部群 | **什么都不。** 这是隐私的答案, 是轮询成本的答案, 也是让 panel 不变成一个邮件客户端的那件事。发现列表让 opt-in 只需一次点击 |
| 7 | **审批的记录之面** | 新的 outbox store + "For you" 里一条指针条目 / 只用 "For you" 条目 | **新 store + 每个会话一条指针条目**(§9.2)。一条 proposal 有 todo store 装不下的结构(目标、正文、为什么、编辑、回执); 而且 `UserTodoManager` 有一个封闭参数集、按 `(sessionKey, text)` 跨所有状态去重、每个 session 封顶 20 条开放条目, 所以*按 proposal* 的指针在不对一个好几个生产者共用的 store 做 schema 变更的前提下根本表达不出来。按 proposal 的徽标可以用那次变更的代价换来(`proposalId` 字段 + 按它去重 + proposal 上的 `todoItemId`)—— 想要就说一声 |
| 8 | **回执会叫醒 agent 吗?** | 从不(攒到下一个 turn)/ 总是 / 按 assignment 设 | **默认从不, 按 assignment opt-in。** 一次批准在几分钟到几小时之后才落地; 为一份回执唤醒, 就是每次批准一个计费 turn |
| 9 | **默认策略 + 护栏** | 确认交互记录里的默认值 | **照记录确认:** 外部 = review, 内部 = direct; 审计开, 链接/附件强制 review 开, 非工作时间在配好时区之前是关的(配好之后那个时间窗是一个设置项) |
| 10 | **花钱上限的形状** | 共用既有的按身份上限 / 一份独立的 channel 预算 | **共用。** 每个凭据槽一个上限正是 authorizer 的全部意义; 再加一个 per-assignment 的每日唤醒上限, 但只作为*节奏控制* |
| 11 | **Agent CLI** | 新的 `vibespace-channels` / 扩 `vibespace-msg` | **新 CLI。** `send` 是投递, `reply` 是提议 —— 一个动词扛两种授权语义正是这个代码库要惩罚的那种孪生 |
| 12 | **消息渲染** | v1 纯文本 / 现在就上 sanitized HTML | **纯文本。** 它把一整类 XSS 整个去掉; 富渲染以后走 sandbox iframe 那套模式落地 |
| 13 | **附件** | 元数据 + 显式抓取 / 自动下载 | **元数据 + 显式抓取**, 带大小上限 |
| 14 | **保留期的数字** | 挑一组 | **每个会话 90 天或 5,000 条记录, 取更小者, 地板 7 天**; 审计日志按日期滚动时归档(绝不删除) |
| 15 | **Fleet 范围** | v1 只本地 / adapter 跑在配对设备上 | **v1 只本地**, 而 `hostId` 一开始就是一个参数, 所以以后要挪不是一次重写 |
| 16 | **Assignment 蕴含可见性吗?** | 是, 写成一条显式授权 / 否, 用户还必须另外授予 reach | **是, 写成一条显式授权。** 一件显然是想要的事却要两步, 正是一个权限模型被绕过的方式; 把它写成一条真的授权, 才能让 reach 面板说真话 |
| 17 | **发送方诚实行 — 已被 owner 推翻(r3/Q4)** | 总是追加 "drafted by \<agent\>" / 按 channel 开关**默认开** / 按 channel 开关**默认关** / 从不 | ~~按 channel 开关, 外部默认开~~ ⇒ **默认关, 保留为一个按 channel 的选项。** 默认是**以用户本人的身份发送、正文里不加任何东西**, 在每一个允许这么做的 channel 上都是。取代它的不是沉默: `identityMarking` 能力位在**授权那一刻**(审批卡/发送控件)与**回执里**把"对面会看见谁"说出来(§9.5)。理由是这句话欠的是**按下批准键的那个人**与起草它的那个 agent, 不是收件人 —— 而 r2 把它塞进了收件人读的那条消息里, 既改写了用户自己的话, 又发生在用户已经决定之后。审计日志照旧记 `draftedBy` |
| 18 | **推送通道的独占度由谁说了算?**(r3/Q3(a) 新增) | (a) 运维**声明** + 产品**度量**并在矛盾时**自动降级** / (b) 永远只当游标 kick(r2) / (c) 相信声明, 不度量 | **(a)。** 平台不告诉我们还有几个客户端连着, 所以独占度只能被断言 —— 但它**可测**: `push.missRate` = 先被对账轮询看到而不是先被推送看到的记录比例, 真正独占时长期为 0。连续越过阈值(默认 2 %, ≥20 条样本)就自动降级成 kick 并把理由写在 adapter 行上。(c) 是一句祈祷; (b) 是把 owner 明确要的实时推送关掉。默认值是 `unknown` ⇒ **不做任何声明就得到 (b) 的行为**。**r4 给它补了两句, 少一句它就是个单向棘轮**: 比率**只在通道真的在携带内容时、且只在一个滚动窗口内**计数(最近 N 条或最近 24 小时, 取更大者)—— 否则 kick 模式下每条记录都"先被轮询看到", 比率按构造趋向 1.0, 被降级的通道永远回不来; 而降级**由做出声明的那一方撤回**(在连接向导里重新声明一次独占 ⇒ 计数器清零、重试一次), 绝不由计数器自己撤回 |
| 19 | **本地客户端 adapter(WhatsApp / WeChat)做到哪一步?**(r3/Q3(b) 新增; **r5 被 owner 更正**) | (a) 完全不做 / (b) **只走界面**: 官方客户端跑在一个 agent-browser profile 里, 扫描它渲染出来的东西, 从它自己的输入框发送 / (c) 再加上协议库(whatsmeow / Baileys)与"读本地库" / (d) **(b) 加上"在那个客户端把库留成未加密的平台上读那份库"** | **(b) + (d), 仍然明确排除 (c)。** r3 把"读本地库"整个和协议库捆在一起排除了, 而 **owner 指出这是错的**: 那句话对 WeChat 成立(库是 SQLCipher/WCDB 加密的, 密钥只在**运行中客户端的进程内存**里, 而读别人的进程内存本产品不做 —— 围栏 13), 对 **macOS 上的 WhatsApp 不成立** —— 那个官方 Catalyst 客户端把整份聊天历史留在一个**未加密**的 Core Data SQLite 库里(`~/Library/Group Containers/…/ChatStorage.sqlite`), 而读它是一次普通的、被用户授权的、只读的文件读取: **没有任何秘密被击穿, 因为根本没有秘密**。所以 **`'store'` 在有它的平台上是允许的, 而且优先于 `'ui'`** —— 不是因为它更快(虽然确实快一个数量级), 是因为**它有一把不是我们编出来的 anchor**, 于是 §5 不变量 2 拿到真 vendor id 而 `'ui'` 那把合成键的代价整个消失。三条边界写死: ①**只有未加密**才算 —— Windows 上 WhatsApp 的库是加密的(UWP 用 SEE, dbKey 从一个应用外取不到的机器标识派生; WebView2 那一支用 DPAPI-NG), 把一把 vendor 有意扣住的密钥重新算出来与从内存里抠出来是同一件事, 围栏 13 (b) 拒绝它 ⇒ Windows 走 `'ui'`; ②**Linux 压根没有官方桌面客户端** ⇒ 只有 web-in-profile 的 `'ui'`; ③**WeChat 一个字都没变** ⇒ 每个平台都只有 `'ui'`。读库这条路**只读**(**只读打开**加上从那条连接取的快照 —— r6 更正了 r5"backup API 优先"的措辞, 那恰好点名了唯一会改动库的那种开法; 绝不写、绝不 checkpoint), 走一个 `channels-scan-store` 的 agentd op(`hostId` 是参数, 本机是设备 #0), 而 macOS 的 TCC 是一道**具名**的门: 被拒时它以 `tcc-denied` 到达用户并在连接向导里给出授权步骤, **绝不**静默降级成 `'ui'`(那会把会话行上那个延迟数字变成谎话)。**发送要按来源分开说(r6 更正), 因为它不是同一件事**: `'ui'` = agent-browser 在那个已登录的官方客户端自己的输入框里打字, 身份仍然真的是用户本人(`identityMarking:'none'`); 而 macOS 的 `'store'` **自己没有发送通道** —— 那里的官方客户端是一个原生 Catalyst 应用, 没有任何浏览器 profile 够得着 —— 所以 P6a 是**只读**的, 并且结构性地说出来(`convCaps.sendAs: []` 加 `why:'no-send-lane-on-this-host'`, 由 §4 的规则渲染成"不提供并说出理由"且不建出任何 proposal)。**于是有第四件事是未决的, 而且归你拍板**: macOS 上的发送到底是 (i) 同一个 Web 客户端开在一个 agent-browser profile 里 —— 那明摆着是**第二份 linked-device 凭据**, 一条对话两个登录, 必须建模成它自己的一行, 与 `auth.state()`/`scanState().grant` 并排 —— 还是 (ii) 原生 macOS UI 自动化(Accessibility / CGEvent)加**它自己那份** TCC 授权, 还是 (iii) 两者都不做, 让这一类在 `'store'` 胜出的地方保持只读。**建议: P6a 取 (iii)**, 只有在 owner 真的要 macOS 上的出向时才在 (i) 与 (ii) 之间选 —— 读那一半才是价值所在, 而第二份凭据会悄悄推翻"身份真的就是用户本人"这句话。另外(r6): 读库这条路是一次**只读的 SQLite 打开**并从那条连接取快照(绝不是默认的读写打开 —— 它会在 close 时 checkpoint 并删掉 WAL), 而 daemon 那一侧用哪个 SQLite 读者由 §12.5 点名, 不留给实现者。接口从 P0 起就建模这一类; P6 因此**分成两条腿**, macOS 的 `'store'` 腿**只**门控在本决定上(它不需要 agent-browser), `'ui'` 腿仍然双重门控 |
| 20 | **Gmail 的推送要不要默认打开?**(r3/Q3(c) 新增) | 默认开 / **可用但默认关** / 不做 | **可用但默认关。** Pub/Sub 的 pull 订阅让它同样不需要公网入站端点, 而且每个实例可以有自己的订阅, 所以它比 Lark 的长连接更容易做到独占。但它要一个 GCP topic、一份 IAM 授权和一个**每日续期任务**(watch 7 天静默过期, 漏一次就无声停掉), 而它换来的东西是: 把一个"什么都没变时每 tick 一个请求"的轮询换成秒级延迟。对邮件这种节奏, 那是一个应该由用户按自己的场景打开的开关, 不是一个默认值 |
| 21 | **集群里的 OAuth 回调怎么走(r7, §14.9)** | (a) 既有的 **loopback + 粘回**(集群注册一个 URL, 与实例数量无关, 每次连接多一次粘贴)/ (b) **集群鉴权中继** `https://auth.<cluster>/cb`(签名 state 转发到实例的公开地址, 零粘贴) | **v1 取 (a), (b) 作为后续阶段。** 不是因为省事: (a) 就是今天在生产里跑着的那条路(Gmail 挂载), 而且 redirect_uri 里根本没有实例地址 ⇒ N 个实例 N 个公开地址这件事**结构上不存在**; (b) 要新增一个**能看见授权码**的组件, 它必须只转发不落盘, 被攻破就是全集群的问题 —— 那是一次需要自己的威胁模型与自己的运维承诺的改动, 值得单独排期而不是搭这趟车。选 (b) 就同时决定了: 谁运维它、它的签名密钥怎么轮换、以及实例怎么验证那个签名 |
| 22 | **集群提供了默认凭据之后, 用户那一侧是"已连接"还是"已填好"?**(r7) | 自动**已连接** / 只是**已填好**, 仍要用户点一次 Connect | **按行的种类分, 而这正是决定的内容**: **OAuth 行(lark / gmail)结构上做不到自动连接** —— 集群给的是**应用凭据**, 而连接还需要**这个用户自己的授权**(一次浏览器往返), 所以它只能是"已填好 + 一键连接", 界面写**"由集群提供"**; **纯 key 行**(CloakBrowser / 云浏览器)确实可以在注入即生效, 而这里有一条现成先例: frp 插件在集群注入 env 时**默认启用**(`src/plugins.js:584-588`)。**建议**: OAuth 行=已填好; 纯 key 行=跟随 frp 的规则默认可用, 但**只有当那把 key 不是按席位计费**时(§14.8 最后一条)—— 一把集群买单的席位被 N 个用户同时用, 是一次运维决定而不是一个默认值。**r8 的更正**: 这句话里的 `gmail` 在 r7 的落盘形状下**并不成立** —— 用户在那个下拉里挑一个集群预设会把记录盖成 `source:'user'`, 于是界面写的是"你自己的"而不是"由集群提供"。§14.3 现在把 `source` 改成**推导**而不落盘, 只带选择器的记录答 `source:'cluster'`(带上 `clusterKey`), 这句建议因此在两种行上都是真的 |
| 23 | **用户自己的 key 能不能带 passphrase 导出?**(r7, §14.10) | 能(进 `sensitive` 那一半)/ 完全不导出 | **能, 但只导出 `source:'user'` 的行。** 它与 `mounts` / `accounts` 是同一类东西(都已经在那一半里), 而搬家的用户会期待自己的 key 跟着走。**集群默认绝不导出**: 它不是我们的东西、会轮换, 而且导进一个没有那个预设的实例时必须解析成 `none` **并说出缺什么**, 绝不静静落到导出方的值上 |
| 24 | **`secret-box` 一把密钥还是每个 store 一把?**(r7, §14.7) | 一把共享 `data/.secret-box-key` / 每个 store 自己一把 | **每个 store 自己一把**, mounts 的 `data/.mounts-key` 逐字节不动。搬密钥文件是一条**不可逆的数据丢失路径**, 换来的只是少一个文件; 而一把密钥被轮换或损坏时, 爆炸半径应当止于一个 store。共享那条唯一的好处(备份少一个文件)可以用 §14.10 的导出块买到 |
| 25 | **一行 registry row 可以早于它的消费者上线吗?**(r7, §14.2 的 `whatsapp-business`) | 可以(先摆卡片占位)/ 不可以(与 adapter 同 commit) | **不可以。** 一行没有活消费者的 row 就是一张什么都不做的卡片, 而用户填进去的 key 会被存起来、加密、导出、并出现在"这把 key 用在哪"里 —— 却什么都不用。这与 `SPEND_REASONS` 与 `contributes.channelAdapters` 是同一条法, 由 `test-integration-registry` 的 `consumers` 普查执法。字段与"没有集群默认"这两件事仍然**现在**就定下来(§14.2 的表), 那不要钱 |

---

## 21. 我没能验证的东西

直白写出来, 因为一份藏起自己未知数的设计, 就是一份会在生产上发现它们的设计:

1. **Lark 的 send-as-user 从来没在现有应用上跑过**: 那两个 scope(`im:message` +
   `im:message.send_as_user`)没有被授予, 而授予它们是否需要等审批也是未知的(此前有一次
   scope 变更当天就完成了, 但提申请的账号是这个应用的创建者, 所以未必能推广)。
2. **那个应用上从来没启用过 Lark 事件订阅。** WS 长连接的每一条约束(50 条连接、集群模式、
   只支持自建应用、3 秒 ack、at-least-once 带 4 次重投)都取自官方文档并在 §6.4 里逐条列
   出, 但**在这个租户、这个网络上一次都没有跑过**。P1 的推送那一半以此开头。
3. **发送端点接受两种 token, 但"收件人看见谁"没有文档。** 官方文档明确写着这个端点接受
   `tenant_access_token` 或 `user_access_token`, 也明确有"以用户身份发送消息"这条权限; 但
   它**没有**说用后者发出去时响应里(以及界面上)的 `sender.sender_type` 是 `user` 还是
   `app`, 而社区有一份相反的报告称仍然是 `app`。这条不确定性直接决定 §9.5 对 Lark 的
   `identityMarking`, 所以它被声明成 `unknown` 并按 `marked` 对待, 而 P4 必须以证明这件事
   开头。
4. **Gmail 对 `messages.send` 上一个自己签发的 `Message-ID` 的处理**, 在我够得到的资料里没
   有文档, 所以本设计刻意**不**依赖 `rfc822msgid:` 查询来做对账, 而是用两阶段草稿 —— 而它
   自己的那条保证(一份被发送的草稿会被消耗掉)虽然大概率成立, 同样也未经验证。
5. **既有那个预设 OAuth client 的认证状态** —— 以及由此而来的、加了 `gmail.send` 之后
   refresh token 到底活 7 天还是无限期 —— 我没查; 那正是决定 5 的真正内容。
6. **在提议的这个节奏下, 这个租户的 vendor 限流**没有被实测。每 tick 的预算界住的是我们这
   一侧, 但真实运行的第一周应该盯着看。
7. **Lark 上批量枚举 DM** 在运维笔记里被记为不可靠; 我没有重新测过, 所以设计绕开它(搜索加
   显式 opt-in)而不是依赖它。
8. **估计器对着真实流量的准确度**没有被度量 —— 而这恰恰就是 §7.2 要让产品事后去度量、而不
   是去相信那个预测的原因。
9. **Panel 在大历史下的渲染成本**(一个会话里几千条记录)没有被度量; 窗口从一开始就分页正
   是为了这个, 但这个数字应该在 P0 里量出来而不是假设出来。
10. **"agent 组轮转"是否恰好映射到 Task Groups** —— 交互记录写的是 "Ops 组 · 3 agent · 轮
    转", 而 Task Groups 是显而易见的载体, 但组成员身份是随时间变化的会话集合, 所以在一个成
    员来来去去的组上, 轮转语义需要 P2 里花一轮想清楚。
11. **Lark 的控制台是否接受一个应用注册多于一个回调 URL。** 决定 4 假设它接受, 于是 VibeSpace
    的 URL 可以*并排*坐在运维工具那个旁边而不是把它顶掉。如果不接受, 决定 4 就变成"第二个应
    用", 那是一次更大的往返。
12. **fork 税那些数字是实例本地的。** 45 MB / 543 MB / 1.5 GB 父进程 RSS 下的 1.8 / 18.8 /
    72.5 ms, 是在跑这套东西的那些机器上量的(`inc-mtunmv3d-pmd6`, 2026-09-10), 用的 harness
    不在这个公开仓库里。那个*机制* —— fork 成本随父进程页表规模增长 —— 是普适的; 常数不
    是。任何在别的硬件上读 §3.3 的人, 在引用这个数字之前应该重新量一遍。
13. **`UserTodoManager` 的开放条目上限是按 session key 算的**(20)。每个会话一条指针让耗尽
    不太可能, 但一个 agent 同时在超过二十个会话里持有 proposal 是没测过的; §9.2 规定了降级
    (catch、记日志、依赖 rail 徽标), 而不是假设它不会发生。
14. **§5.1 那扇序列化的门是否够用**, 是一个论证, 不是一次度量: 它成立是因为只有一个进程、一
    个所有者。如果引擎哪天挪进 worker 或者挪到一台配对设备上(§15), 那扇门就变成一个跨进程
    问题, 论证必须重做一遍 —— 这正是那条不变量写成"一个所有者"而不是"我们用了一把 mutex"
    的原因。
15. **Lark 国际版是否根本不提供长连接。** 一份社区报告称国际版开发者控制台里**没有**这个
    选项, 只能走 webhook —— 未经 vendor 确认, 也没有在这里复现。它是 P1 推送那一半的一个
    前置条件: 如果为真, 那么在国际版租户上 §6.4 只剩"轮询 + 永远不要 webhook", 而决定 3 的
    推送那一半在那个租户上不可达。**P1 的第一件事应该是在控制台里确认这个选项存在。**
16. **Gmail 的 Pub/Sub pull 订阅没有跑过。** 决定 20 建立在"pull 订阅让推送不需要公网入站
    端点、且每个实例可以有自己的订阅"之上, 那是 Pub/Sub 有文档的形状, 但这套东西一次都没
    有对着一个真的 topic 跑过 —— 包括那个每日续期任务在漏掉一次时到底表现成什么样。
17. **`push.missRate` 的阈值与它的窗口都没有标定。** 2 % / ≥20 条样本是一个从"真正独占
    时它应该长期为 0"推出来的起点, 不是一个测出来的数; r4 加的那个滚动窗口("最近 N 条或
    最近 24 小时, 取更大者")同样是一个形状而不是一个测出来的 N —— 一个太窄的窗口会在一次
    安静的夜里让一条健康的通道被降级, 一个太宽的窗口会让一次真的配置错误拖上好几天。第一
    周应该同时盯这两个数, 并且把降级这件事做成**可以被看见**的(adapter 行 + 一行日志 +
    那个"重新声明以重试"的入口), 这样标定它靠的是数据而不是这一段文字。**已经不再是未知
    的那一半**: 降级是不是单向棘轮, 不取决于标定 —— 那是 §6.4 的两条规则(只在携带内容时
    计数、由声明方撤回)结构上回答掉的, 而 `test-channels-push` 对两者各有一条负控。
18. **WhatsApp 与 WeChat 的本地客户端形状, 这棵树上一次都没有跑过。** §12.5 是按公开材料
    写的一个 adapter **类**: 界面扫描的可行性、能滚多远的历史、登录活性的判定方式、以及一
    个真实客户端在一个 agent-browser profile 里的稳定性, 全都没有量过。这也是它是 P6 而不
    是 P5 的原因 —— 它欠的是一次调研, 不是一次实现。**r4 收窄了这里的未知**: `'ui'` 那一
    格的摄入契约现在是写下来的(合成 anchor 键、受滚动限制的"完整的一趟"、`receive:'scan'`
    上禁止 `history:'none'`), 所以剩下的未知不再是"这一类满不满足 store 的不变量", 而是
    **这两个具体客户端到底暴露不暴露一个稳定的消息 id**。
19. **r5 的 `'store'` 那条路: 什么是查证过的, 什么不是。** owner 报告的那个事实(macOS 上
    的 WhatsApp Desktop 把它的库留成未加密的, 直接用 sqlite 就读得出)与公开材料**一致**,
    而这份设计对它做了如下切分 —— **查证过的**: ①路径与文件名在多份独立的公开材料里一致
    (`~/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite`, 另
    有 `.private` 与 `group.net.whatsapp.family` 两个同名变体), 消息在 `ZWAMESSAGE` /
    `ZWAMEDIAITEM` 里, 而这是一个 Core Data 存储 = **Catalyst 那个构建**(即 Mac App Store
    那个; 老的 Electron 版把数据放在 `~/Library/Application Support/WhatsApp` 下的
    IndexedDB, 形状完全不同, 而它在 2024 年就被宣布弃用); ②"未加密、裸 sqlite 读得出"这一
    条有多个独立来源, 其中最新的是 2026-05 的一份公开研究, 它把 iOS 与 macOS 上的本地聊天
    库描述成明文; ③活库带 WAL, 只读主文件会静默漏消息, 因此要复制 `db`/`-wal`/`-shm` 或用
    backup API —— 这一条来自一份直接读它的公开实现。**r6 实测出了那份材料没有点名的第三
    个选项**, 而它正是本设计现在采用的那个: 一次只读的 SQLite **打开**读得到 WAL 内容且
    什么都不改, 而 backup API 自己那条源连接恰恰是会在 close 时 checkpoint 并删掉 WAL 的
    那种开法(§12.5 那张表)。那份公开实现说对的, 正是 r5 说反的那一半: 漏消息的是那个
    **文件**, 不是那次打开; ④**Windows 是加密的**(UWP 用 SEE +
    从机器标识派生的 dbKey, WebView2 那一支用 DPAPI-NG), 有一篇同行评审论文与一篇取证文章
    各自描述过; ⑤**Linux 没有官方桌面客户端**。**没有查证的**: (a) **一个版本号都没有** —
    没有任何一条是在一台真 Mac、一个具体的 WhatsApp 构建上跑过的, 而这正是 P6a 第一轮要做
    的事; (b) 这些材料对**文件名**并不完全一致 —— 2026-05 那份研究点名的是
    `Axolotl.sqlite`(协议会话状态)而那些直接读的工具点名的是 `ChatStorage.sqlite`(Core
    Data 消息库), 两个文件都存在于同一个容器里, 但"在同一台机器上这两者同时是这个样子"我
    没有核实过; (c) 关于**那条声明的影响范围**存在公开争议 —— 一家 WhatsApp 观察站反驳说
    系统沙箱本来就挡住了跨应用读取, 那条反驳针对的是"别的 Meta 应用能读它"这个说法, 与
    "一个被用户授权、带完全磁盘访问的本机进程能读它"并不矛盾, 但它是一场公开争议, 就应该
    写在这里; (d) **TCC 的确切行为没有实测** —— Apple 自己的说明是 Sonoma 14 保护
    `~/Library/Application Support/` 下的容器、Sequoia 15 把它扩展到
    `~/Library/Group Containers/`, 不满足条件的进程"可能收到授权提示", 而**完全磁盘访问是
    否足够、还是那个按进程实例的临时提示是唯一的路**, 那份说明**没有明说**; 这直接决定连
    接向导里那条授权行的措辞, 所以 P6a 必须以实测它开头; (e) 那份库的 **schema 稳定性** —
    `ZWAMESSAGE` 的列会随客户端版本变, 而这一类没有 vendor 契约可以依靠, 所以 adapter 要
    把"读不出来的形状"当成一次带类型的失败, 不是当成零条消息。
20. **交叉引用 `docs/design-agent-browser-v2.md` 目前解析不了。** §12.5 与决定 19 的
    `'ui'` 那一半依赖那份设计的 profile 系统(user-data-dir + provider + 指纹种子 + 代理 +
    实时视图), 而在写这份修订时它住在另一个分支上, 没有并进这棵树。等它并进来之后, 这两
    处引用应该被复核一遍 —— 尤其是"一个 profile 里跑一个长期登录的官方客户端"这件事是不
    是它自己的模型允许的。**macOS 的 `'store'` 那一半不依赖它**, 这也正是 P6 被拆成两条腿
    的原因。
21. **一台配对 Mac 的 daemon 上到底有哪个 SQLite 读者, 是没实测过的(r6)。** §12.5 点名了
    那几级与它们各自的约束 —— 有界的 `sqlite3(1)` 子进程(推荐; macOS 有文档说自带
    `/usr/bin/sqlite3`, 而本机这台 Linux 开发机**没有**它, 这本身就是"要做运行时探测"的
    理由)、探测之后的 `node:sqlite` 加上明说的 `NODE_MIN` 抬升、以及被明确拒绝的原生绑定
    —— 但没有任何一条在一台真配对 Mac 的已装 daemon 上跑过: 它跑的是哪个 node 版本、它的
    PATH 上有没有 `sqlite3(1)`、以及在一份几百 MB 的库上做一次 `VACUUM INTO` 要多久, 都不
    知道。**实测过的**是机制本身, 在本机: §12.5 那张表里的每一臂(node v24.12.0 的
    `node:sqlite`, 一份未 checkpoint 的 WAL fixture)—— 包括"取行的 API 是同步的而
    `backup()` 是异步的"这件事, 而它正是决定围栏 3 那条事件循环规则咬在哪里的东西。
22. **macOS 万一要发送, 怎么发(r6)。** P6a 是只读的, 而决定 19 的第四个问题 —— 在
    agent-browser profile 里放第二份 linked-device 凭据 / 带自己那份 Accessibility TCC 授权
    的原生 UI 自动化 / 两者都不做 —— 两个候选背后都没有任何实测: 第二台 linked device 对
    owner 是不是可以接受、WhatsApp 自己的上限允不允许它与 Mac 客户端并存、以及那个 Catalyst
    应用的输入框到底能不能经 Accessibility API 够得着, 全都不知道。在选定并实测之前, 那台
    机器上的 `convCaps.sendAs` 就是 `[]` 加一个具名理由 —— 这是诚实的状态, 而不是一个沉默
    的缺口。
23. **真实繁忙库上 `fs.watch` 的触发密度没实测过(r6)。** §6.4 从结构上把它界住了(一次
    去抖到 `caps.scanLatency[source]` 的游标 kick), 而"`ChatStorage.sqlite` 每来一条消息就
    被写一次"这个前提取自关于库形状的公开材料, 不是盯着一个真库看出来的。去抖让唤醒率与那
    个数字无关, 这也正是它是天花板而不是指望的原因 —— 但真实的触发密度, 以及从 daemon 去
    watch 那个容器的 inotify 成本, 应该在 P6a 里量一次。
24. **Lark 控制台的回调匹配规则, 没有在这个应用的控制台上读过(r7)。** 官方文档说重定向
    URL 必须**在列表里**、**支持配置多个**, 而 §14.9 与决定 21 就建立在这两句上; 但"匹配是
    逐字节精确还是允许前缀"、以及"一个 `http://127.0.0.1:<固定端口>` 的 loopback URL 会不
    会被接受"都没有实际读过 —— 运维笔记说这个流程跑通过, 所以后者大概率是 yes, 但那是推论
    不是读数。P1 的第一件事(与 §21 第 15 条的长连接确认同一次)应该把这两条一起看掉。
25. **一个集群注册的 Lark 应用到底能服务谁, 没有实测(r7)。** 官方开发指南把自建应用定义成
    企业内部使用, 于是 §14.9 推出"跨租户的用户必须带自己的应用", 而**这台实例的用户是不是
    同一个租户**是一件运维事实, 不写在这个公开仓库里, 也没有人去核对过。附带那条推论 ——
    做成应用商店(ISV)应用就会丢掉决定 3 赖以成立的长连接 —— 同样是从两份文档推出来的, 没有
    在一个真的 ISV 应用上试过。
26. **给 `VIBESPACE_GDRIVE_CLIENTS` 加一个 `channels` 预设 key 是否可行, 没问过(r7)。**
    §12.2 的更正把决定 5 落成"多加一个 key 而不是拓宽现有那一个", 它依赖两件事: 集群那边多
    一个 key 在运维上没问题(未问), 以及 Google 的增量授权行为与文档一致(已有既存 refresh
    token 仍为它原有的 scope 工作) —— 后者没有在这个 client 上试过, 而**既有那个预设的认证
    状态**仍然是第 5 条里那个未知。
27. **`src/secret-box.js` 的抽取从来没有对着一份真的 mounts 存储跑过(r7)。** §14.7 的 parity
    测试是设计出来的, 不是跑出来的: 密文格式逐字节不变这句话来自读 `src/mounts.js:369-381`,
    而不是来自拿本实例的 `data/.mounts-key` 与它的记录做一次 decrypt。P0 的第一件事应该是在
    一份**拷贝**上做这次往返, 因为它的失败形态是"每一个存好的 token 都解不开"。
28. **把整批集群凭据放进**一个** JSON secret 的轮换粒度, 没有和运维核对过(r7)。**
    `VIBESPACE_INTEGRATIONS` 是一个 Secret 键, 所以换掉 `lark` 那一行要重写整个键 —— 这与
    既有的 `gdriveClients`(`main.yaml:163-164`)完全同形, 所以它至少不是新债; 但"一次只轮换
    一行"在集群的 secret 工具里是什么代价, 没有人量过, 而**逐字段** env 形式
    (`VIBESPACE_INTEGRATION_<ID>_<FIELD>`)存在的部分理由正是它。
29. **Integrations 那些卡片在 375×667 下的成本没有度量(r7)。** §17 的 e2e 腿要求每个控件都够
    得着, 但"一屏能装下几张卡、Replace 展开之后要滚多远"没有量过 —— 而 `showDropdown` 那一
    类事故(未缩放的 `offsetWidth` 与缩放过的 rect)正是从这个尺寸上来的, 所以这条腿要在 P0
    真的跑起来, 而不是等到有三行 row 之后。
30. **`credential-exchange` 到底会在一个多不健全的 Lark 应用上成功, 没有实测(r8)。**
    `test.caveat` 这条规则建立在一个推理上: `tenant_access_token` 那个端点的输入只有 app id
    与 secret, 所以它在一个 scope 没授权、版本没发布、回调 URL 没登记的应用上照样会给出一个
    token。这是从那个端点**文档化的输入**推出来的, 不是量出来的 —— 而 §21 第 2 条已经说了,
    这个应用的事件订阅从来没开过, 它的控制台状态也没有人为这件事翻过。**它错了会怎样**: 如果
    那次交换其实**会**失败, 那么 `caveat` 只是多说了一句真话(没有害处), 而"先开卡片"那条路会
    更早一点给出正确答案; 所以这个未知的方向是安全的, 但它仍然是一个未知, 不该被读成一次测量。
    P1 的第一件事本来就要在控制台上把那三件事做一遍, 顺手就能把它量掉。
31. **回调 URL 里那个端口号(`17865`)是选的, 不是量的(r8)。** §14.2 把它定在一个地方, 而
    §12.4 的机器全局冲突处置(只在流程期间绑、`EADDRINUSE` 具名拒绝、回落粘回)与它具体取什么
    值无关。没有查过这台机器或集群镜像上有没有别的东西惯用这个端口 —— 决定 4 那次控制台注册
    一旦落下, 这个数字就**很难再改**(改它要再走一次控制台), 所以这是一个值得在注册之前花两
    分钟核一下的数字。

**r3、r5、r6 与 r7 里新引入的 vendor 事实的出处**(公开文档, r3/r5/r6 取于 2026-09-10,
r7 取于 2026-09-11; 这里没有任何一条在真实租户或真实客户端上跑过 —— 见上面第 2、3、15–19、
24–26 条; 下面 r6 那条 SQLite 行为是**唯一**在本机实测过的, 数字在 §12.5, 而 r7 的 loopback
端口那条另有**树内**证据: `src/gmail-sync.js:78`):

- Lark/飞书长连接 —— 每应用 50 条连接、集群模式不广播、只支持企业自建应用、不需要公网
  URL:
  <https://open.larkoffice.com/document/server-side-sdk/python--sdk/handle-events>
- Lark/飞书事件投递 —— 3 秒 HTTP 200 期限、at-least-once、15 s / 5 min / 1 h / 6 h 最多
  4 次重投、可能重复、按 `event_id` 去重:
  <https://open.feishu.cn/document/server-docs/event-subscription-guide/overview>
- Lark/飞书发送消息 —— 接受 `tenant_access_token` 或 `user_access_token`;
  `sender.sender_type` ∈ {`app`, `user`}; 以用户身份发送需要 `im:message` **与**
  `im:message.send_as_user`:
  <https://open.feishu.cn/document/server-docs/im-v1/message/create>
- Gmail push —— `users.watch` + Cloud Pub/Sub, watch 7 天过期必须续期:
  <https://developers.google.com/workspace/gmail/api/guides/push>
- 经 Gmail API 发出的邮件带一条点名 `gmailapi.google.com` 的 `Received:` 头, 网页版发的
  没有:
  <https://www.gmass.co/blog/gmail-vs-api-deliverability/>
- WhatsApp 协议库(whatsmeow / Baileys)是被平台条款禁止的非官方客户端, 有正常使用被封号
  的报告:
  <https://github.com/tulir/whatsmeow/issues/810>
- WeChat 桌面端的本地库是 SQLCipher/WCDB 加密的, 密钥存在于运行中客户端的进程内存里 ——
  正是围栏 13 拒绝成为的那一类工具:
  <https://github.com/BenDerPan/wechat-db-decrypt>
- 有报告称 Lark 国际版控制台不提供长连接(社区报告, 未经 vendor 确认 —— §21 第 15 条):
  <https://github.com/openclaw/openclaw/issues/51663>
- **(r5)** macOS / iOS 上 WhatsApp 的本地聊天库是明文的(2026-05 的公开研究报道; 关于影响
  范围的争议同见此文 —— §21 第 19(c) 条):
  <https://cybersecuritynews.com/whatsapp-chat-stored-unencrypted-macos-and-ios/>
- **(r5)** 一份直接读那份库的公开实现 —— 点名
  `~/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite` 与它的
  两个同名变体, 只读打开, 并说明活库带 WAL 时要连 `-wal`/`-shm` 一起复制:
  <https://github.com/mmahmad/whatsapp-cli-macos>
- **(r5)** macOS 的 Mac 版 WhatsApp 是 Catalyst 构建, 而 Electron 版已于 2024 年宣布弃用:
  <https://9to5mac.com/2024/09/04/whatsapp-discontinue-electron-app-macos/>
- **(r5)** Windows 上的 WhatsApp Desktop 是加密的 —— UWP 那一支用 SQLite Encryption
  Extension(SEE), dbKey 由一个在应用之外取不到的机器唯一标识派生:
  <https://www.sciencedirect.com/science/article/abs/pii/S2666281724001884>
- **(r5)** macOS 的容器保护 —— Sonoma 14 保护 `~/Library/Application Support/` 下的应用容
  器, Sequoia 15 把它扩展到 `~/Library/Group Containers/`, 不满足条件的进程会收到一次按进
  程实例的临时授权提示或被直接拒绝(§21 第 19(d) 条: 完全磁盘访问是否足够没有明说):
  <https://developer.apple.com/forums/thread/756701>
- **(r5)** Linux 上没有官方 WhatsApp 桌面客户端, 官方途径只有 WhatsApp Web:
  <https://wiki.archlinux.org/title/WhatsApp>
- **(r6)** SQLite 的 WAL 文档 —— WAL 文件里存着已提交但还没进主库的内容, 而**最后一个关
  闭这个库的连接会 checkpoint 它并删掉 WAL**, 这正是为什么默认(读写)打开是那种会改动库
  的开法而只读打开不是(本机实测; 数字见 §12.5 那张表):
  <https://sqlite.org/wal.html>
- **(r7)** RFC 8252 §7.3 —— 对 loopback IP 的 redirect URI, 授权服务器 "**MUST allow any
  port to be specified at the time of the request**"(§14.9 那张表里 Google 那一行的依据,
  而树内证据是 `src/gmail-sync.js:78` 的 `listen(0, '127.0.0.1')`):
  <https://datatracker.ietf.org/doc/html/rfc8252>
- **(r7)** Google 的 redirect URI 必须与已注册的那一个**精确匹配**(协议/主机/端口/路径/尾
  斜杠), 没有通配:
  <https://developers.google.com/identity/protocols/oauth2/web-server>
- **(r7)** 同意屏幕处于 **Testing** 且用户类型为 External 的 Google OAuth client, 发出的
  refresh token **7 天**过期(§12.2 那条既有说法的出处):
  <https://developers.google.com/identity/protocols/oauth2>
- **(r7)** Lark/飞书的重定向 URL 必须配置在开发者后台"安全设置"里, **只有列表里的 URL 能
  通过开放平台的安全校验**, 而**重定向 URL 支持配置多个**(§14.9 与 §21 第 11 条):
  <https://open.feishu.cn/document/common-capabilities/sso/api/obtain-oauth-code>
- **(r7)** Lark/飞书**自建应用**是企业内部使用的应用, 与可跨租户分发的应用商店应用相对
  (§14.9 那条"集群默认只服务同租户"的依据):
  <https://open.feishu.cn/document/develop-process/self-built-application-development-process>
