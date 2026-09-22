# 限额 Reset 的消费时机与界面 (design-reset-credits, 2026-09-22)

> Owner 定案 (2026-09-22): **reset 自动消费永远默认不进行**; 有合适接口后界面里给按钮; 另给高级选项允许开启自动消费; 两家机制不同, 开启自动时"什么时机用"要仔细考量, 目标是最大程度利用 reset 额度。本文=那份考量 + 界面/模式/门的设计。实现分期见 §7, 待 owner 的两点见 §8。

## §1 两家的机制 (事实, 只读测得)

| | Codex / OpenAI | Claude / Anthropic |
|---|---|---|
| 接口 | app-server `account/rateLimitResetCredit/consume`; wrapper stdin 动词 `codex-reset-credit`; 结果 `reset_credit_result {outcome:'reset'|…}` 带新的 rateLimits | **无可调接口**。网页 "Reset for free" = CLI 隐藏斜杠命令 `/limit-reset` (程序 `cedar_ember` 按 grant / `juniper_tide` 每周 A/B, 共用 `POST /api/organizations/{org}/reset_rate_limits`), 交互式, 远程旗标门控 (本账号关), 无 control request / 流记录 / stdin 动词 |
| 库存 | 存储型 credit: `resetCredits.availableCount` (只读 ⟳ 带回) | grant: `resets_left` / `use by {date}` / `cooldown_until` (用量 body 的 `cedar_ember` 字段; 本实例所有样本为 null) |
| 语义 | **重开周期**: 用后窗口从消费时刻重新开始 (owner 陈述; 实测以结果里的 `resets_at` 为准) | **原地补满**: "Refills your {limits} now", 周截止不变; "still counts toward your weekly limit" (补满后的用量照旧计入周额) |
| 今天的产品位置 | `codex.limitResetCredit` = `off`(默认) / `auto` (逃生梯 ① credit → ② 切池 → ③ 等重置; 一次 limit 事件一试, 10 min floor; 走 spend authorizer reason `codex-reset-credit`); ⟳ 只读不消费; **没有手动按钮** (B-51fd) | `backend-caps.resetCredit:false`; §ban-safety: VibeSpace 绝不自己调 reset 端点; 唯一允许的是**被动检测** (用量 body 里 `cedar_ember`/`juniper_tide` 非 null) |

## §2 价值模型 — 什么时候用才不浪费

记 t = 消费时刻, R = 自然重置时刻, P = 窗口周期, q = 当前剩余额度比例, W = R − t (省下的等待)。

**Anthropic (原地补满):** 收益 = min(补满量, [t, R] 内实际能消耗的量); 没有"丢弃剩余"的成本 (截止不变, 补到满); 成本 = 一次有限次数的 reset + cooldown。
⇒ 最佳时机 = **撞墙 (q≈0) 且 W 足够长**; W 很短时补满的额度随 R 作废, 不如等; 例外: grant 临近 use-by (不用即废) 且撞墙 ⇒ 用。

**OpenAI (重开周期):** 用后窗口 = [t, t+P] 满额, 剩余 q 被丢弃, 下次自然重置推迟到 t+P。收益 = 省下的等待 W ("一次 credit 值它省下的等待"); 成本 = 丢弃的 q + 一次 credit + 相位后移。以 7d 为例, 到 R+P 为止: 用 = 100% + (W/P)·100%, 不用 = q + 100% ⇒ **用赢 ⇔ W/P > q** (消耗速度快于窗口节奏, 即"会在 R 之前撞墙")。
⇒ 最佳时机 = **q≈0 (撞墙或投影撞墙) 且 W ≥ 门槛**; 绝不在 q 大时用 (丢掉的就是钱); R 临近时等自然重置。

**两家共同 — 与热缓存的关系:** credit 让**同一账号**继续 ⇒ prompt cache 仍热, 不冷启动; 切池 = 冷启动 (重新计费整个上下文)。但 credit 稀缺、切池免费。⇒ 梯子应按对话冷热分叉 (§8 ①): 热对话 (在 turn 中 / 缓存未冷): credit → 切池 → 等; 冷对话: 切池 → credit → 等。

## §3 模式与默认

`limitResetCredit` (codex 表已有; claude 表将来同名, 有接口前该行只读): 
- `off` (**默认, 永远**): 不自动消费; 界面只给按钮 (§5); 撞墙卡上提一句"有 N 次 reset 可用"。
- `ask`: 撞墙且 §4 判定"值得"时发**一条** For-you 决策项 (带后果说明与同一按钮), 不消费。
- `auto` (高级选项): 按 §4 自动消费; 每次一条 journal + 用户通知 (点名账号、省下的等待、剩余次数)。设置描述必须写明两家差异 (§2)。

## §4 auto / ask 的时机判定 — 一个纯函数

`resetCreditVerdict({ vendor:'openai'|'anthropic', wallHit, remainingPct, resetsAtSec, nowSec, periodSec, creditsLeft, useBySec, cooldownUntilSec, inTurn, warm, poolAlternative })` → `{ use, reason, waitSavedSec }` (PURE, 零依赖, 两家各一张表格 fixture + 负控):
- 共同前提: `wallHit` (rate-limit 事件, 不是估计) ∧ `creditsLeft > 0` ∧ 未在 cooldown ∧ 同一 limit 事件未试过 (现有 10 min floor) ∧ (`poolAlternative === false` ∨ (`warm && inTurn`))。**绝不主动 (未撞墙) 消费**。
- openai: `use ⇔ 前提 ∧ waitSaved ≥ MIN_WAIT[kind]` (5h 窗: 30 min; 7d 窗: 12 h — 常量, 带理由, 不做成设置); `remainingPct > 0` 时 `use=false, reason:'quota-left'`。
- anthropic (有接口后): `use ⇔ 前提 ∧ waitSaved ≥ MIN_WAIT[kind]`; 或 `useBySec − nowSec < 24 h ∧ wallHit` ⇒ `use, reason:'use-by-imminent'`。
- 每个 `use=false` 都带 reason 且能在 journal/tooltip 里读到 (speaking contract)。
- 消费一律经 spend authorizer (`codex-reset-credit` 已有; 将来 `claude-reset-credit`), 是"无人打字的动作"里的一类, 计入日/时上限。

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

## §8 待 owner

① 梯子顺序按冷热分叉 (热: credit 先; 冷: 切池先) — 现有顺序 (credit → 切池 → 等) 是 owner 定的, 要改需点头。② `MIN_WAIT` 默认 (5h 窗 30 min / 7d 窗 12 h) 是否合适。
