# 限额 Reset 的消费时机与界面 (design-reset-credits, 2026-09-22)

> Owner 定案 (2026-09-22): **reset 自动消费永远默认不进行**; 有合适接口后界面里给按钮; 另给高级选项允许开启自动消费; 两家机制不同, 开启自动时"什么时机用"要仔细考量, 目标是最大程度利用 reset 额度。本文=那份考量 + 界面/模式/门的设计。实现分期见 §7, 待 owner 的两点见 §8。

## §1 两家的机制 (事实, 只读测得)

| | Codex / OpenAI | Claude / Anthropic |
|---|---|---|
| 接口 | app-server `account/rateLimitResetCredit/consume`; wrapper stdin 动词 `codex-reset-credit`; 结果 `reset_credit_result {outcome:'reset'|…}` 带新的 rateLimits | **无可调接口**。网页 "Reset for free" = CLI 隐藏斜杠命令 `/limit-reset` (程序 `cedar_ember` 按 grant / `juniper_tide` 每周 A/B, 共用 `POST /api/organizations/{org}/reset_rate_limits`), 交互式, 远程旗标门控 (本账号关), 无 control request / 流记录 / stdin 动词 |
| 库存 | 存储型 credit: `resetCredits.availableCount` (只读 ⟳ 带回) | grant: `resets_left` / `use by {date}` / `cooldown_until` (用量 body 的 `cedar_ember` 字段; 本实例所有样本为 null) |
| 语义 | **重开周期**: 用后窗口从消费时刻重新开始 (owner 陈述; 实测以结果里的 `resets_at` 为准) | **原地补满**: "Refills your {limits} now", 周截止不变; "still counts toward your weekly limit" (补满后的用量照旧计入周额) |
| 今天的产品位置 | `codex.limitResetCredit` = `off`(默认) / `auto` (逃生梯 ① credit → ② 切池 → ③ 等重置; 一次 limit 事件一试, 10 min floor; 走 spend authorizer reason `codex-reset-credit`); ⟳ 只读不消费; **没有手动按钮** (B-51fd) | `backend-caps.resetCredit:false`; §ban-safety: VibeSpace 绝不自己调 reset 端点; 唯一允许的是**被动检测** (用量 body 里 `cedar_ember`/`juniper_tide` 非 null) |


**实测 (2026-09-22 22:39→22:46 UTC, owner 在网页 reset 了一个 Max 账号, ⟳ 面板探针记录):** 本周 49% / Fable 上限 97% → 0% / 0%, 周重置时刻不变 (同一个 Sep 27 10:00 PT); 会话 5h 桶前后都是 0%. 原地补满、周期不动 —— 上表 Anthropic 一列的语义**已被真实数据证实**. 池的 member wake 在同一秒按 EDF 把 3 个对话切到这个最早重置且已清空的成员 (用掉最快过期的额度). 面板 rung 没有 grant 字段, reset **前**的可用性仍不可观测.

## §2 价值模型 — owner 定案 (2026-09-22): OpenAI 是平滑递减曲线, Anthropic 是 ReLU

记 t = 消费时刻, R = 自然重置时刻, P = 窗口周期, q = 当前剩余额度比例, b = 燃烧率 (估计器学到的、按当前节奏的消耗速度)。

**OpenAI (重开周期):** 用后窗口 = [t, t+P] 满额, 剩余 q 丢弃, 下次自然重置推迟到 t+P。收益 ≈ 剩余窗口占比 (R−t)/P + 已烧掉占比 (1−q) —— 随时间**平滑递减**。⇒ **越早用越好**: 一出额度就用, 永远不等"更好的时机"; 唯一会让 auto 犹豫的是 credit 稀缺 (一周只剩一小时时用掉一个 credit 换不到多少)。

**Anthropic (原地补满, 截止不动):** 补满量 = 一周额度, 截止仍是 R。收益 = min(1, b·(R−t) / 周额度) —— **ReLU**: 只要剩余时间够按当前速度再烧完一周的量 (拐点: R − t ≥ 周额度 / b) 就是满值, 拐点以下线性递减到 0。⇒ 撞墙即用, 不必抢早; 拐点以下只有 grant 会作废 (use-by) 或按周补发 (不用即废) 时才值得用。

**两家共同 — 与热缓存的关系:** credit 让**同一账号**继续 ⇒ prompt cache 仍热, 不冷启动; 切池 = 冷启动 (重新计费整个上下文)。credit 稀缺、切池免费 ⇒ 逃生梯按对话冷热分叉 (owner 2026-09-22 B1 定案): 热对话 (在 turn 中 / 缓存未冷): credit → 切池 → 等; 冷对话: 切池 → credit → 等。

## §3 模式与默认

`limitResetCredit` (codex 表已有; claude 表将来同名, 有接口前该行只读): 
- `off` (**默认, 永远**): 不自动消费; 界面只给按钮 (§5); 撞墙卡上提一句"有 N 次 reset 可用"。
- `ask`: 撞墙且 §4 判定"值得"时发**一条** For-you 决策项 (带后果说明与同一按钮), 不消费。
- `auto` (高级选项): 按 §4 自动消费; 每次一条 journal + 用户通知 (点名账号、省下的等待、剩余次数)。设置描述必须写明两家差异 (§2)。

## §4 auto / ask 的时机判定 — 一个纯函数

`resetCreditVerdict({ vendor:'openai'|'anthropic', wallHit, remainingPct, resetsAtSec, nowSec, periodSec, weekQuota, burnRate, creditsLeft, useBySec, cooldownUntilSec, replenishes, inTurn, warm, poolAlternative })` → `{ use, reason, valueFraction }` (PURE, 零依赖, 两家各一张表格 fixture + 负控):
- 共同前提: `wallHit` (rate-limit 事件, 不是估计) ∧ `creditsLeft > 0` ∧ 未在 cooldown ∧ 同一 limit 事件未试过 (现有 10 min floor) ∧ 梯子位置允许 (热对话: credit 先于切池; 冷对话: 只有 `poolAlternative === false` 时才轮到 credit)。**绝不主动 (未撞墙) 消费**。
- openai: `use ⇔ 前提` —— 撞墙即用 (收益单调递减, 等待只会更差); `valueFraction = (R−t)/P + (1−q)`; 唯一护栏是 credit 稀缺: 当 `valueFraction < CREDIT_FLOOR` (常量, 带理由, 例如 0.1 = 只剩十分之一个窗口) 且 `creditsLeft` 为最后一个时 `use=false, reason:'last-credit-low-value'`。
- anthropic (有接口后): `valueFraction = min(1, burnRate·(R−t) / weekQuota)`; `use ⇔ 前提 ∧ (valueFraction ≥ 1 ∨ useBySec 临近 ∨ replenishes)`; 拐点以下且 grant 既不会作废也不按周补发 ⇒ `use=false, reason:'below-knee-keep'`。
- 每个 `use=false` 都带 reason 且能在 journal / tooltip 里读到 (speaking contract)。
- 消费一律经 spend authorizer (`codex-reset-credit` 已有; 将来 `claude-reset-credit`), 计入日/时上限。

## §5 界面

- **Manage Agents 账号行**: reset chip — codex `N 次 reset`; claude 有样本时 `N 次 reset · 到 {date}` (被动检测); 点 chip 或 "使用…" ⇒ 确认对话 (createModalShell): 当前窗口重置时刻 / 用后效果 (openai: "新窗口到 t+P"; anthropic: "补满到 R, 周期不变") / 省下的等待 / 剩余次数; Confirm ⇒ codex 走 `codex-reset-credit`; claude **按钮禁用并写原因** ("CLI 只提供交互式 /limit-reset; 在终端会话里输入它") — 不是灰掉不说。
- **撞墙卡 / auto-resume 的 arm 卡**: 有 credit 时带同一按钮 (一次点击 = 一次消费, 同一确认对话)。
- **ask 模式的 For-you 项**: 同一对话框, 决策后即 resolve; 一次 limit 事件一条。

## §6 门

`test-reset-credit-verdict` (纯; 两家表格: 撞墙×W×q×cooldown×use-by×热/冷×有无池备选; 负控 = 去掉任一前提); `test-codex-pool` + `test-spend-paths` (消费经 authorizer, 上限 fail closed); `test-vendor-whitelist` 不变 (claude 零新 vendor 调用); UI leg (chip / 禁用理由 / 对话框); `test-harness-contract` (claude 表的行在无接口时只读)。

## §7 分期

- **P1 codex — SHIPPED (2.369.157, chunks p1–p3; 进度 §9–§11)** (接 B-51fd): 纯 verdict + 三模式 (`ask` 新增, `auto` 改用 §4 时机) + 账号行 chip/按钮/对话 + 撞墙卡按钮 + For-you 项 + 池默认站点去掉软耗尽 hold。**测得的行为** (真引擎 + stub codex wrapper, 零 vendor 调用): 热对话 (在 turn 中 / 缓存未冷) 在 `auto` 下撞墙即消费一个 credit, 且在切池之前 (verb 经 spend authorizer `codex-reset-credit`, 10 分钟 floor 内第二次撞墙不再消费); 冷对话先切池, 只有池里无成员可接时才消费; `ask` 每次 limit 事件只发一条 For-you 决策项然后照常切池/等; `off` 从不消费, 撞墙卡只提一句"有 N 次 reset 可用"; 上限为 0/小时时一个 credit 都不花且撞墙卡说明原因; 末个 credit 在窗口只剩 <1/10 时拒绝 (`last-credit-low-value`); 手动按钮 (账号行 / 撞墙卡 / arm 卡 / For-you 项) 走同一对话框与同一写入者, 拒绝按名字 (`not_supported` / `no_live_session` / `no_credits` / `cooldown` / `spend_refused` / `agent_forbidden`), claude 行按钮禁用并写原因; 池默认站点: 软耗尽时即使有热的在 turn 中的跟随者也立刻切走 (所有跟随者一起), 主动 `edf` 跳转仍在任一跟随者缓存热时等待 (2.369.149 的 warm-cache hold 保留), 每会话的 first-stop 规则不变。门 (逐个跑, 全绿): test-reset-credit-verdict 80 · test-reset-credit-ui 64 · test-codex-pool 91 · test-fable-cap-pool-storm 358 · test-pool-auto 170 · test-spend-paths 289 · test-harness-settings 201 · test-harness-contract 368 · test-account-pool 33 · test-auto-resume 231 · test-auto-resume-loop 218 · test-new-member-wake 119 · test-readings-attribution 512 · test-vendor-whitelist 63 · test-architecture 191 · test-user-todos-layout 22 · test-server-globals 2。
- **P2 claude 被动**: `cedar_ember`/`juniper_tide` 非 null ⇒ chip + 禁用按钮带原因 + 一条通知; 零 vendor 调用 (样本出现前不做, B-97a6)。
- **P3 claude 消费**: 等 CLI 给出非交互接口 (control request / stdin 动词); 到时复用 §4 的 anthropic 表与 §5 的对话。

## §8 owner 决定 (2026-09-22 晚定案)

① 逃生梯按冷热分叉 —— **同意** (热: credit → 切池 → 等; 冷: 切池 → credit → 等)。② `MIN_WAIT` 门槛 —— **作废**, 由 §2 的收益模型取代 (openai 撞墙即用 + 末个 credit 的低价值护栏; anthropic 拐点)。③ 无自有软链的"跟随者"是 legacy, 不做兼容 —— 池默认站点不保留软耗尽 hold (P1 同 lane 去掉, storm §18 (d) 反转)。④ owner 已用过 reset 的账号只记在 owner 的私有上下文里 (不进本仓库)。

## §9 进度 (2.369.157, P1 chunk p1 — 纯 verdict + 冷热分叉 + 三模式)

- **已做:** `src/reset-credit.js` (纯 verdict + `describeUse` + `offerOf` + `windowPaceRate`); `codex.limitResetCredit` = `off | ask | auto` (默认 off); 引擎 `resetCreditRung` 替换 `tryResetCredit` —— 两个 codex 撞墙站点都在切池之前调用它, 冷热分叉由 verdict 的 `cold-switch-first` 决定 (一处调用); `ask` = 每次 limit 事件一条 For-you 决策项 (i18n 结构 + `action:{type:'reset-credit',…}`); 撞墙卡 + auto-resume arm 卡带 `resetCredit:{available, mode}`; 池默认站点的软耗尽 hold 已去掉 (§8 ③), 主动 warm-cache hold 保留。门: test-reset-credit-verdict (快, 新) + test-codex-pool §R (真引擎) + test-spend-paths §9 + test-fable-cap-pool-storm §18 (d)/(e) 反转 + test-harness-settings。
- **§4 的一处落地解释 (待 owner 确认):** 撞墙时 q≈0, 所以 (1−q)≈1, 两项之和对**每一次**撞墙都 ≥ 1, `CREDIT_FLOOR = 0.1` 若比较总和则永远不触发。实现比较的是**窗口项** (R−t)/P —— 正是 §4 例子"只剩十分之一个窗口"说的量; `valueFraction` 仍按 §2 的公式报出。
- **claude 表没有加行:** harness-settings 表无法表达"声明了但禁用"的行 (每一行都是能工作的控件 —— 设置法则); 带原因的灰色按钮属于 p2 的 Manage Agents 按钮。
- **anthropic 的燃烧率:** 用窗口平均速度 (已用 ÷ 自窗口开启以来的时间, `windowPaceRate`), 不是估计器 —— 估计器学的是每美元的利用率, 不是每秒。P3 前无消费者。
- **下一步 (p2):** 账号行 chip / 按钮 / 确认对话, 撞墙卡与 arm 卡上的按钮, For-you 项的按钮 (走已有的能力门控 ws `codex-reset-credit`)。

## §10 进度 (2.369.157, P1 chunk p2 — 界面)

- **已做:** 一个确认对话框 `src/lib/reset-credit-dialog.js` (`openResetCreditDialog`), 三个入口都调它: Manage Agents 账号行 (codex 行与本机 codex 登录: `· N 次 reset` + "使用…" 按钮, 随用量轮询重绘; claude 行的按钮**禁用并写原因** "Claude Code 只提供交互式的 /limit-reset——请在终端会话中运行它", 只在有被动 grant 样本时出现——目前没有样本, 所以今天什么都不显示)、撞墙卡与 arm 卡 ("使用一个 reset credit"; offer 带上 `accountKey`)、ask 模式的 For-you 项 (确认 ⇒ done, "暂不" ⇒ dismissed)。对话框的句子由纯函数 `dialogModel` 给出 (账号 / 用后效果 / 被替换的重置时刻 / 省下的等待——只在撞墙时 / 剩余次数); 拒绝按名字显示, 确认按钮禁用。
- **路由:** `GET|POST /api/accounts/:id/reset-credit` (`src/routes/reset-credit.js`) —— POST 经与 auto 同一个写入者 `writeResetCredit` (spend authorizer `codex-reset-credit` + 10 分钟 floor); 拒绝码 `not_supported` / `no_live_session` / `no_credits` / `cooldown` / `spend_refused` / `agent_forbidden` (只允许人触发)。人发起的失败只发一条通知, 不走切池/等待梯子。
- **一处落地解释 (待 owner 确认):** §4 "消费一律经 spend authorizer" 被理解为**包括手动按钮** —— 所以手动消费也计入无人值守上限、也可能被它拒绝 (`spend_refused`)。这与 D6 "owner 亲手的 turn 不计数" 的精神有张力 (手动点击是 owner 的动作); 若 owner 认为手动不该计数, 改 `consumeResetCreditFor` 一处即可。
- **门:** test-reset-credit-ui (快, 新) + test-codex-pool。

## §11 进度 (2.369.157, P1 chunk p3 — 池默认去掉软 hold + 发布文档)

- **池默认站点 (§8 ③):** 软耗尽 hold 在 p1 已从引擎去掉 (默认站点不再计算 `inTurn`, 没有 `warm-soft-defer` 分支); p3 核对了站点并修正了 `_warmHoldLogAt` 注释 (默认只剩主动 warm-cache hold 的 `poolId:default` 键, 不再有 `:soft` 孪生)。storm §18 (d) 已反转 (默认立刻切走, 在 turn 中的热跟随者随之一起), 负控 = 带 `inTurn` 与其挑选规则的 2.369.153 引擎副本 (它 hold 住默认); (e) 硬耗尽照旧立刻切走, 负控 = 过宽的 pre-ruling 副本。
- **发布文档:** CHANGELOG 合并为一条 `## 2.369.157` (带 owner 的定案原话); 本节 + §7 P1 标 SHIPPED; CLAUDE.md 索引行 (verdict / 路由 / 对话框 / 两个套件) 与 Pool/billing 三层表行 (reset credit: warm ⇒ credit first, cold ⇒ switch first)。
- **仍待 owner 的两处落地解释:** §9 (CREDIT_FLOOR 比较窗口项而非总和) 与 §10 (手动点击也计入无人值守上限)。

## §12 进度 (2.369.157, verifier r2 — 五个已证实问题, 每个先在真引擎上复现再修, 套件腿旁都有修前对照)

- **一次账号撞墙只花一张 credit。** one-try floor 从 per-session 改为 per-IDENTITY (`_resetCreditTries`, rung 的 `cooldownUntilSec` 与手动 preview 共读); 同账号上另一个撞墙的对话 **跟随** 在途的那张 (rung 答 `consumed`), 领头者的结果统一结算所有跟随者 (reset ⇒ 各自 recovered; 失败 ⇒ 各自走切池/等待; 10 分钟无应答 = 失败); credit 落地后同一 stated reset 的迟到撞墙记录不再切池。`alreadyRedeemed`, 或尝试之后有更新的读数显示账号可用 ⇒ **不是墙**: 不降级不 arm, 经既有 caps 路由 rung 重读。
- **credit 的身份 = 进程实际持有的登录。** codex 不能热切 (CODEX_HOME 启动时 canonicalize), 所以池切换后 wrapper 仍是 A 的登录直到冷重启; ws-create 在 spawn 时盖 `_heldPoolMember` (session-meta, 两条 restore 路径都恢复; 按 caps 行门控, 不认 id), `sessionBillingMember` / `codexQuotaKeyFor` 解析到它 —— credit、读数、墙、fire 都指名同一个登录, spend ceiling 收的身份也是它; auto rung 对 `moved` 的进程按名拒绝 (`pool-moved`), 人工按钮仍可经该对话花 A 的 credit (记在 A 名下)。
- **按钮不再秒死。** carrier = 持有该登录的会话, 所以切池后 ask 项/撞墙卡的按钮照样可用; carrier 真没了时文案如实说明。
- **roster 的 reset chip 不再被被动推送抹掉。** `toLegacyView` 投影 `extra.resetCredits`, cache writer 在不声明计数的写入里保留上一份文件的计数。
- **ws `codex-reset-credit` 分支删除** (第二个写入者: 无 ceiling / 无 floor / 无 origin, 失败被当 auto 走梯子); 手动只经 `POST /api/accounts/:id/reset-credit`; test-reset-credit-ui §4 在全部服务端文件上普查写入者/case 标签/读者。
- 低危两条: 冷对话切池 rung 什么都没动 (10 s 评估闸) 时, 以 `ladderPosition:'after-switch'` 再问一次 verdict (此前无调用点); anthropic 膝点按未取整的比值判定 (此前最多早 0.05 % 触发)。

## §13 进度 (2.369.157, verifier r3 — 三个 major + 一个 medium + 三个 low, 每个先按 verifier 的配方在真引擎上复现再修, 套件腿旁都有修前对照: test-codex-pool §R14–§R20)

- **持有旧登录的进程不再被 continue。** 池已移走 (A→B) 而进程仍持有 A 的登录时, 该会话在 A 上撞墙: 旧 verdict 看整个池 ⇒ "usable via B" ⇒ 45 s near-arm, 真 auto-resume + 真 pre-fire gate 把一次计费的 continue 送进仍持有已撞墙 A 的进程, 每个隔离窗口再来一次。现在 `quotaVerdictFor` 对 held 会话只判 **held 成员** (它的三个调用点都是 fire 决定: 墙的 arm / probe 梯 / pre-fire gate) ⇒ arm 在 A 自己的 reset; 其他成员只经 **冷重启** 帮忙: `requestHeldRestart` 在 held 进程撞墙且池已不在它的成员上时再请一个客户端重启它 (每会话 10 分钟至多一次; 任何点名它的重启请求 **真正发出** 之后 10 分钟内不重复 —— 重复请求会把对话 resume 两次); 没有客户端连接 ⇒ 日志如实说"等 A 的 reset"。
- **reset 的回答按 wrapper 的真实顺序处理。** 旧 wrapper 先发 `reset_credit_result` 再做第二次 rpc 重读 (≤ 20 s); 其间 kickPoolEval 读到墙写下的 spent 标记, 把池从刚被 credit 重开的账号切走并冷重启所有跟随者。现在: ① wrapper **先**发重读后的 `rate_limits_updated` 再发结果; ② 引擎在 `reset` 且尚无比尝试更新的读数时 **hold** 住关于该身份的一切池决策 (`holdForResetReading`, `maybePoolAutoSwitchForPool` 在 current 处于 hold 时返回), 直到该身份的下一条读数到达 (释放并立刻 force 重判) 或 30 s。R8 的同步喂法之外, R15 按真实顺序 (结果先、重读晚一个宏任务) 重放。
- **永久账本把 held 进程记在它持有的成员名下。** 一条规则 `accounts.poolMemberOfSession(poolId, session)` → `{id, held, origin: stamp|ledger|unknown|link}`: 引擎的 credit/读数/墙/fire、server.js 的 `recordUsageAttribution` 与 `sessionAuth` 的计费徽章都读它; 池切换的重归属循环跳过 held 跟随者 (冷重启的新 spawn 自己记)。R16 直接运行从 server.js 抽出的生产函数文本, 负控 = 修前一行。
- **遗留 (无 stamp) 进程。** 由 slot-transition 账本回答: 进程 `createdAt` 时池默认所指的成员 (origin `ledger`, 记忆化为 stamp); 若账本在其启动时已在记录且之后池默认未动 ⇒ 当前成员即是。两者都不成立 ⇒ `unknown`: auto rung 按名拒绝 (`held-unknown`), 也不作为人工按钮的 carrier; 其读数/墙仍按链接归属 (无法命名时的旧行为, 已知残留, 直到它下次重启)。账本答案每次重启从同一账本重新推导, 无需写回 meta。
- 低危三条: 撞墙卡上的上限拒绝写出账号名与上限原句 (`refused it (hour-cap) for Cx Alpha — …`), 手动路径的 `spend_refused` 也带原句; roster 的 reset chip 在"启动读失败的 wrapper 推来更新但不带计数的读数"时仍保留 (usage-routes `keep()` 携带上一份投影的计数, 与 cache writer 同规则); ask 模式的 For-you 项带 `expiresAt` = 墙的 reset, 且在没有任何进程持有该登录时被 dismiss (每次池评估 kick 与每次 preview 答 `no_live_session` 时扫描)。

## §14 进度 (2.369.157, verifier r3 复核 — 一个 major + 两个 medium + 四个 low, 每个先按 verifier 的配方在真引擎上复现再修, 套件腿旁都有修前对照: test-codex-pool §R14c/§R14d/§R15 r4/§R17b/§R19b/§R19c)

- **held 成员直接判定。** 进程持有的成员 A 若已不在池的 (已登录) 成员表里 —— 用户收窄了成员, 或 A 的 auth.json 被清掉 (进程仍握着内存里的 token) —— r3 的 held-only verdict 从 `poolMembers` 里过滤出空集 ⇒ `usable:null` "pool has no members", 而 pre-fire gate 只拦 `false`: 一次计费 continue 被送进仍持有撞墙 A 的进程 (gate 自己探到的 A=spent 被忽略)。现在 held 会话的成员表直接取 `accounts.get(heldId)`; held 的空集 = `usable:false` (fail closed); gate 对 held verdict 只认明确的 `true`; `sessionBillingMember` 用 `validateHeldSlot` 校验 held 成员 (是该池 harness 的已知订阅即可, 不问成员资格和登录态), 所以进程自己的墙照常 demote A, 不再 "slot-not-a-member — holding the demotion"。
- **vendor 说 reset 就是事实, 直到读数另说。** `reset` 且没有比尝试更新的读数时, hold 立即通过 leader 自己的 app-server 探一次 (`probeQuotaForKey`, 即 superseded 分支用的那条), 30 s 时再探一次并继续持有; 结束 hold 的只有: 比尝试更新、且来自 leader 本身或 verdict 判为 usable 的读数 (兄弟会话推来的旧 spent 读数记一行日志后忽略), 或该账号上的新墙 (不强制重判), 或 10 分钟上限 (解除但**不**强制重判)。r3 在 30 s 时强制按墙的旧标记重判, 把池从刚被 credit 重开的账号挪走并冷重启所有 follower。wrapper 的重读失败/为空时现在发 `rate_limits_updated {error, onDemand, afterReset}`, 引擎记为"失败"而非"迟到"。
- **账本回答稳定。** 早于账本的池 (2026-09-07 之前建的 codex 池) 在会话启动前没有默认行: r3 只看启动前那一行, 于是池的第一次被记录的移动 (其 `from` 正是 A) 一发生, 同一进程就从 `{A, ledger}` 变成 `unknown`, 重启后的服务器把它的墙写到池的新成员上。现在取启动两侧的本池默认行: 之前那行的 `to`, 否则 (账本当时已在记录) 之后第一行的 `from`, 否则当前默认; 两行不一致 (账本没看到的 re-point) ⇒ `unknown`; meta 缺 `createdAt` 的恢复会话 (`no-start`) ⇒ `unknown`。ledger 的答案写回 session-meta (`heldPoolMember` + `heldPoolOrigin:'ledger'`), 重启时恢复而不是重算; `unknown` 不再记忆化 (一次读不到账本不会把进程终生钉成 unknown)。slot-transition 的去重只丢真正的重复 (同目标且 `from` 未知或等于上一行的 `to`)。
- 低危: 冷重启请求只有一个发送者 `sendColdRestart` (默认切换/逐会话切换/鉴权驱逐/requestHeldRestart), 10 分钟内已请求过的会话不再被点名; 手动路由 (池目标/收窄成员) 用 `claimColdRestarts` 同样过滤并打戳。预览优先选不在离开的承载会话, 只剩离开中的时给出 `restartPending`, 对话框第一句说明 "承载此额度的对话正在重启到 {member}" (人仍可选择使用)。ask 条目的清扫表每个进程从收件箱里 `action.type === 'reset-credit'` 的未决条目补种一次, 重启前提交的条目也会被新引擎清掉。
- **遗留:** 一个 `unknown` 持有者的读数和墙仍落在池当前成员上直到它重启 (r3 已知残留, 未变); `_poolColdRestart` 的客户端路径未在浏览器中演练; heavy tier 未运行。

## §15 进度 (2.369.157, verifier r4 — 一个 medium + 四个 low, 每个先按 verifier 的配方在真引擎上复现再修, 套件腿旁都有修前对照: test-codex-pool §R15 r5/§R14c r5/§R17b r5/§R19c r5)

- **重述同一事件的墙不是新墙。** credit 落地时仍在 vendor 那里飞行的第三个对话, 带着**同一个** stated reset 被拒回来: r4 的 `task_failed` 分支先 `writeSnap` (合成的 spent 标记比开启的 post-reset 读数更新 ⇒ A 被重新标满), 再以"新墙"解除 hold, rung 自己的同事件检查排在两者之后只拦住了它自己的切换 ⇒ 下一次评估把池从刚被 credit 重开的账号移走并冷重启所有跟随者 (有无 hold 两种顺序都复现)。现在新鲜度在**写之前**判定: 该身份的 try 在 10 分钟 floor 内答 `reset` 且 stated reset 与本记录**相等** (两边都未说明也算相等) ⇒ 记一行 `restated wall of the re-opened event`, 不写、不解除 hold、不走梯子; 只有不同的 stated reset 或读数能结束 hold。rung 的同事件检查改读同一个严格谓词。
- **池已不列出的 held 成员不再被自动继续。** codex 没有登录状态读者 (描述符没有 `creds.loginState`, `memberLoginState` 只读 claude), 所以被收窄出池或 auth.json 被清掉的 held 成员在它自己的 reset 时读数健康, 会得到一次自动 continue。现在 `quotaVerdictFor` 对它答 `usable:false`、无 blockedUntil (没有计时器能解: 冷重启到在列成员, 或用户把它加回来)。这是"默认不花钱"一侧的选择 (owner 若要改回"允许一次", 只需删掉这一行判定)。
- **手动 Use… 经正在冷重启的承载会话: 按名拒绝。** r4 的说法 ("拒绝") 与实际 (警告后允许, 动词走在正在被替换的进程上) 不符。现在 `restartPending` 区分两种状态: `inFlight` (请求已发出) ⇒ preview/POST `restart_pending` (409), 对话框禁用并点名成员; `pending` (池已移动但还没有客户端被请求) ⇒ 允许, 对话框第一句说明"在客户端把它重启到 {member} 之前仍持有这个登录"。优先选择不在飞行中的承载会话。
- **`no-start` 标记持久化。** rename / codex thread-meta 写入者用 `{...prev, createdAt: session.createdAt}` 把恢复时填入的启动时刻写回 meta, 第二次重启便能"确定地"说出上一次启动时的池默认成员。现在第一次恢复就把 `heldPoolOrigin:'no-start'` 写进 meta (仅限有 `accountId`、无 stamp、无 `createdAt` 的 meta), `heldOriginOf` 先认它。
- **遗留:** 一个 `unknown` 持有者的读数和墙仍落在池当前成员上直到它重启 (未变); hold 在 10 分钟上限且无读数时, 下一次评估按缓存现状决定 (未变, verifier §2c 已记录); `_poolColdRestart` 的客户端路径与新的对话框文字未在浏览器中演练; heavy tier 未运行。
