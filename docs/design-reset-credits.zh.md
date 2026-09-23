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

- **P1 codex** (接 B-51fd, 新 backlog 项): 纯 verdict + 三模式 (`ask` 新增, `auto` 改用 §4 时机) + 账号行 chip/按钮/对话 + 撞墙卡按钮 + For-you 项。
- **P2 claude 被动**: `cedar_ember`/`juniper_tide` 非 null ⇒ chip + 禁用按钮带原因 + 一条通知; 零 vendor 调用 (样本出现前不做, B-97a6)。
- **P3 claude 消费**: 等 CLI 给出非交互接口 (control request / stdin 动词); 到时复用 §4 的 anthropic 表与 §5 的对话。

## §8 owner 决定 (2026-09-22 晚定案)

① 逃生梯按冷热分叉 —— **同意** (热: credit → 切池 → 等; 冷: 切池 → credit → 等)。② `MIN_WAIT` 门槛 —— **作废**, 由 §2 的收益模型取代 (openai 撞墙即用 + 末个 credit 的低价值护栏; anthropic 拐点)。③ 无自有软链的"跟随者"是 legacy, 不做兼容 —— 池默认站点不保留软耗尽 hold (P1 同 lane 去掉, storm §18 (d) 反转)。④ owner 已用过 reset 的账号只记在 owner 的私有上下文里 (不进本仓库)。
