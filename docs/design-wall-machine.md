# 撞墙检测 + 自动恢复：turn 粒度状态机（2.369.0）

Owner 与 agent 共同设计（2026-08-28 讨论定稿），替换 2.368.27-34 的补丁堆。
四条支柱、每条对应一次真实事故：

## 设计原则

1. **文本只作布尔触发，绝不是数据源**。banner（"You've hit your … limit"）
   出现 = 本 turn 有撞墙信号，仅此而已；桶种类、重置时间一律不从文本解析
   （.34 的 parseBannerResetMs 已删除）。
2. **quotaVerdict = 账户系统唯一的可用性答案**（account-pool-auto.js 纯函数
   + engine 的 quotaVerdictFor 包装）：
   - 纯基于剩余用量预测（estimator overlay 后的缓存，模型投影后）；
   - 可用线 = THRESH hot 档（**5h < 10%，weekly < 5%**，owner 定），与池引
     擎同一张 THRESH 表——无孪生实现；
   - `blockedUntil` = 死桶未来重置的 **max**（会话解封需所有死桶都过重置）；
   - 池 = 任一成员 usable 即 usable；否则 blockedUntil = 成员的 **min**；
   - 任一死桶重置未知 ⇒ blockedUntil=0 ⇒ 调用方 **probe**，绝不猜。
3. **turn 粒度分类**：撞墙信号（rejected 事件 / banner 布尔 / codex typed
   exhaustion）累积在当前 turn 上；`result` 记录（codex：task_complete /
   task_failed）盖章定性——
   - **walled** = 有信号且最后一个信号之后无实际工作（≤1 条 assistant 记
     录；banner 自己的记录不算工作）→ 进入 BLOCKED；
   - **normal** = 正常完成 → 无条件 disarm（"一个正常完成的 turn 是没被卡
     的充分证据"）。04:55 误报案（rejected 后池切救回、turn 继续完成）自然
     分类为 normal，无需预检/延迟/年龄门。
4. **信息缺口用 probe 填**：blockedUntil 未知时对阻塞账号跑 auto-cli
   `/usage`（官方 binary 发请求，§ban-safety 不变），退避 0→30min→1h→2h，
   4 次后响亮放弃。fire 前同样 probe 一次 + 重新 verdict——false 否决本次
   花费并 re-arm 到新的 blockedUntil（auto-resume 的 beforeFire 支持
   veto，sync boolean 或 Promise<boolean>）。

## 状态流

```
RUNNING ──(walled turn)──► BLOCKED
BLOCKED: maybePoolAutoSwitch（免费，永远先试）
         verdict.usable      → arm(now+45s)（近程 fire 重入工作；公告延迟 90s > 45s，快速成功保持静默）
         verdict.blockedUntil → arm(blockedUntil)
         两者皆无             → probe 阶梯
WAITING ──(到点)──► beforeFire: probe + verdict → veto/fire continue
fired turn 正常完成 → RUNNING；再撞墙 → 回 BLOCKED（阶梯重跑，自限）
任意 normal turn → RUNNING（清除一切等待）
```

## 身份

阻塞身份 = `orgVerifiedKey`（OTel 观测 org 优先于 link——活 CLI 持旧 token
≥25min，.33/.34 事故的根源）；池会话的 verdict 范围 = 整个池。

## 保留的既有语义

死桶 max/跨成员 min（.32）、公告延迟 90s（.34）、fireNow-on-hot-switch
（.28）、user-prompt / 非拒绝读数 disarm（belt）、markLimitBanner 的被动缓
存标记（池引擎消费，与状态机无关）。

## 已退役

armBestReset / pickArmReset / isDeadBucket / noteWorked(30s 年龄门) /
parseBannerResetMs / "已恢复"预检（.33）。

## Gate

test-auto-resume §8-10（quotaVerdict 纯函数 + 全部 wiring 钉 + beforeFire
veto functional）；test-pool-auto / test-codex-pool / test-codex-quota 邻接。
