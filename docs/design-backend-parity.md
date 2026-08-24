# Design: Codex 功能对齐 + 多后端抽象化 (2026-08-24 调研)

> 调研产物（5 个并行读者，代码行号为 2.368.16 master）。**每节末尾标注跟踪归属**（feedback_design_doc_debt 法则：无归属的节 = 红旗）。
> 结论速览：usage 界面 codex 已"半一等公民"；池化的**决策核心可原样复用**、信号源**比 claude 更好**，缺的是持久化与接线；热切换未验证先做冷切；适配器接口只覆盖"一个后端"含义的 ~20%，第三 agent 前应先做注册表化改造。

## 0. 现行 BUG（调研中发现，与方案无关也该修）

`normalizeCodexRateLimit` (usage-routes.js:814-842) 按 **primary→fiveHour / secondary→sevenDay 位置硬映射**，但 codex 0.149.1 改成了单窗口形状（primary 即 weekly 10080min，secondary=null，新增 credits 块）；且只读 `window_minutes ?? windowMinutes`，不读 live 推送的 `windowDurationMins` → **今天 codex 配额饼图把周用量标成 5h**。同函数丢弃 `rate_limit_reached_type / spend_control_reached / credits / individual_limit` = 每个耗尽标记都被扔掉。修复：按 `window_minutes` **数值**(300/10080)归桶、三个字段名都读、保留耗尽标记、兼容新旧两代形状。
**跟踪: B-codex-norm（P0）**

## 1. Usage 界面 codex 多账号展示

### 现状（比预期好）
- Usage 窗口（账本侧）近一等公民：backend 过滤 chip、`cxs-*` 账号 chip、`__global_codex__`、By billing 的 ChatGPT 行、远程 codex 事件、codex-only 时 Cache-writes 诚实 "—"、定价编辑器含 gpt-* 档。
- 弹窗/Manage Agents 已有 per-account 饼图与切换器（usage-meter.js:398-443, manage-agents.js:683）。

### 缺口 → 改法（最小集）
| 缺口 | 改法 | 位置 |
|---|---|---|
| 配额快照不落盘（14 天/24 文件外即失忆） | summarize 时写穿 `USAGE_CACHE_DIR/<cxs-id>.json`（fetchedAt 防毒合并同 :665-680），读时先播种 | usage-routes.js:956-994 |
| 无 dead-reckoning 估计 | 落盘后解除 engine:94 的 codex 排除；/api/usage estimates 块加 codex 键；usage-meter codex 段传 est pairs | usage-pool-engine.js:73-105, usage-routes.js:1013-1026, usage-meter.js:398-443 |
| cache 效率条对 codex 造假 0 | 复用 renderTiles 的 codexOnly 谓词 | usage-window.js:545 |
| 无按 backend 切图 | dashboard DIMENSIONS + aggregate 加 `be` 维度（可选） | usage-dashboard.js:50, usage-history.js:565 |
| ⟳ 主动刷新缺失 | 见 §2 的 `account/rateLimits/read`（比 claude 的 auto-cli 更干净） | — |

**跟踪: B-codex-usage（P1）**

## 2. Codex 池化 / 撞限自动换号

### 信号源（调研核心结论：codex 信号**优于** claude）
1. **每次响应都推**完整 `rate_limits` 快照（app-server `account/rateLimits/updated`，wrapper 已捕获进 sidecar；rollout `token_count` 同款 at-rest）——连续阈值门控现成。
2. **类型化耗尽**：快照的 `rate_limit_reached_type`（primary/secondary）+ `error` 事件的 `codex_error_info ∈ {usage_limit_reached, quota_exceeded, usage_not_included, workspace_*}`（带 resets_at）。⚠ wrapper 今天只留 message 把 `codex_error_info` 丢了（codex-chat-wrapper.js:685-686）——需转发。
3. **主动读**：JSON-RPC `account/rateLimits/read`（活 wrapper 上免费一调；闲账号用短命 `codex app-server` 子进程）——官方客户端发起 fetch，§ban-safety 同 auto-cli 类但无需 spawn 完整会话。⚠ 本地无真实耗尽样本，首次观测到时要把实际值钉进测试。

### 复用度（池三层解剖）
| 层 | 复用判定 |
|---|---|
| 决策 `decidePoolSwitch`/EDF/`rankPoolMembers` (account-pool-auto.js) | **原样复用**——bucket 形状经 normalizeCodexRateLimit 已对齐 `{fiveHour, sevenDay, scopedWeekly[]}`；scopedWeekly 空数组是已处理路径；THRESH 建议改 per-backend 常数表 |
| 材料 `repointPoolSymlink` (account-material.js) | **原样复用**——每 codex 账号已是独立 CODEX_HOME 实目录，`data/codex-subs/<poolId>` 符号链接机械等同；darwin 排除对 codex 不适用（auth.json 纯文件无 keychain） |
| 冷重启客户端机器 (pool-auto-switched → kill → exited → resume) | **原样复用**——`affected` 带 backend，billing switcher 的 codex kill+resume 路径已在生产 |
| `classifyAuthFailure` / `decideCliRefresh` | 不可复用（Anthropic 措辞/claude 专属通道），codex 各写一个 |

### 需新建（工作量主体）
1. per-account codex 配额落盘（=§1 第一项，池的 `readCache` 数据源）。
2. accounts.js codex 池：`createPool` 去掉 `backend:'claude'` 硬编码（:993）、`poolMembers`/`setPoolTarget` codex 臂（:884/:963）、`_resolveCodexSpawn` 池分支（plan-C 链接同型）。
3. codex 解析路径的 turn-end 评估钩子（codex 版 session-stdout.js:664 的 `maybePoolAutoSwitch`-on-result；接 `kickPoolEval`）。
4. wrapper 转发 `codex_error_info` + rateLimits 进引擎（今天只进 sidecar 展示）。
5. OpenAI 措辞的 auth-failure 分类器。
6. **热切换：v1 强制冷切**。claude 热切依赖三个法证事实（symlink 穿透原子写、env 每 syscall 重解析、CLI 每请求重读凭据）；codex 是长命 app-server 进程，无任何证据表明中途重读 auth.json。开热切前必须做 codex 版 `test-creds-symlink-swap`（symlink CODEX_HOME 起进程 → 中途重指 → 证明下一 turn 计费到新账号 + refresh 写回落在正确成员目录）。

**跟踪: B-codex-pool（P2 冷切 v1）, B-codex-hot（P3 热切验证实验）**

## 3. 对齐矩阵（claude vs codex，本方案完成后）

| 能力 | claude | codex 现状 | P1-P2 后 |
|---|---|---|---|
| 多账号添加/登录/切换 | ✅ | ✅ (2.59.0) | ✅ |
| per-account 用量账本 | ✅ | ✅ | ✅ |
| per-account 配额显示 | ✅ 持久 | ⚠ 14 天失忆+新形状标错 | ✅ |
| 配额估计 (dead-reckoning) | ✅ | ❌ | ✅（无 scoped/类别回归，priors 待测） |
| ⟳ 主动刷新 | ✅ auto-cli | ❌ | ✅ rateLimits/read（更干净） |
| 池化伪账号 | ✅ | ❌ | ✅ 冷切 |
| 撞限自动换号 | ✅ 热+冷 | ❌ | ✅ 冷（热待验证） |
| auto-resume 等重置续跑 | ✅ 2.368.0 | ❌ | 顺带可得（arm 条件接 codex 耗尽信号） |
| OTel 计费真值 | ✅ | ❌（CLI 无此通道，结构性缺） | ❌（接受） |
| 主机侧配额 | ✅ | ❌（host-* 文件名模式排除 codex） | P2 顺带 |

## 4. 抽象度评估（第三 agent 能不能加）

**判定：能加但贵——adapter 接口只覆盖 ~20%，212 处 backend 分支，其中 ~40-60 处把"非 codex"默认当 claude**（gemini 会被静默按 claude 解析/计费/发现，不会崩，更危险）。已知炸点：normalizers.js 二元三目、session-stdout.js:83 双管道、**ws-create.js:1047 对任何非 codex 远程 spawn 附加 claude stream-json flags**、session-lifecycle.js:825 的布尔二分账号过滤。

**建议的解耦改造（第三 agent 的前置，也独立改善 claude/codex）：**
1. **后端注册表化**：normalizer/wrapper/session-store/stdout-parse 从 codex 三目改为 adapters 注册表查找（缺失=响亮失败，绝不回落 claude）。
2. **客户端能力描述符**：BACKEND_META 加 `hasFork/hasEffort/hasReview/hasOutputStyle/modelList/accountKind`，chat-status-bar/session-lifecycle 按能力而非 backend id 分支。
3. **QuotaSignalSource per backend**（engine 报告 §3 的接口全文）：parseQuotaSignal/parseLimitBanner/probeUsage/identityKeyFor(带 backend 前缀)/priorsFor(注入且 extractPairs:152 改读注入值)/windowSemantics(按窗口长度非名字归桶)/classifyAuthFailure + 可选 attributionTruth/cliRefresh。engine/estimator/anchors 核心零改动。
4. accounts.js 改 per-backend 凭据策略对象（~15 处 codex 三目收口）。

**成本参考**：今天硬加 gemini ≈ 全 chat 对齐 4-6 周（terminal-only ~1 周）；做完 1-3 后落到"新增五件套"（adapter/wrapper/normalizer/store/META）且消灭 fallthrough-bug 类。

**跟踪: B-backend-registry（P4，第三 agent 前置）**

## 5. UI/渲染层 gap（2026-08-24 owner 三连报 + 扫描）

### 已修（2.368.17）
- 设置 enum options 必须是 `{value,label}` 对象——`claude.outputStyle` 的裸字符串列表渲染成全空白下拉（settings-ui 合同）。
- `claude.outputStyle`/`claude.autoResumeOnLimit` 归位 `Claude` 分组（原误放 `Session`；schema 本有 Claude(6)/Codex(4) 分组）。

### 折叠卡片的 codex gap（owner 报）与设计决定
现状：`memberKind` (chat-view.js:2883) 按 **claude 精确工具名**分类（Bash/Read/Write/Edit/Patch/Skill/MCP）。codex 真实卡名（实测 owner 会话）：`exec`(209!)、`Patch`(49, 已吃 write 类+diff 渲染)、`Agent`/`Agent Wait`/`send_message`/`list_agents`/`interrupt_agent`/`followup_task`——除 Patch 全部落空 → 不折叠。⚠ 还发现 codex 0.149.x 工具名是 `exec` 而非 `exec_command`，`formatToolName` 的映射也未命中（exec 卡同时错过 Bash 级渲染）。

**设计决定（owner 问：全局还是分 provider？）——全局语义配置，不分 provider。** 理由：用户关切是语义的（"想看 diff、不想看命令噪音"），不是分厂商的；per-provider 复制 checkbox 组=配置蔓延+漂移（whitelist-drift 类）；"claude 折 Bash 但 codex 不折 exec"没有真实用户故事。实现：**normalizer 给每张工具卡盖语义 `collapseKind` 章**（thinking/command/read/write/memory/mcp/agent-collab/skill），折叠分类器只认章（claude 名字映射降级保留）；codex 映射 exec/Terminal→command、Patch→write、collab 家族(Agent/Wait/send_message/list_agents/interrupt/followup)→**新语义类 agent-collab**（claude 的 Task/Agent 卡同归此类=顺手统一）；设置 checkbox 文案改语义措辞（"命令执行"替"Bash 命令"）。这也是 P4 注册表化的首付款——语义归 normalizer 所有。

### 其余扫描所得
- `exec` 卡缺命令级渲染（同上语义章顺带修）。
- 状态栏模型下拉的 fallback 列表硬编码 claude 四族（chat-status-bar:1055）——codex 会话降级时会列 claude 模型。→ BACKEND_META 挂 per-backend modelList（P4 能力描述符的一项，可提前）。
- codex fork 未接（session-card:798 claude-only）——codex 有 thread fork RPC，可接（低优先）。
- Patch diff 渲染 ✓、todo(plan_updated) ✓、goal ✓、权限卡 ✓——这些已对齐。

**跟踪: B-collapse-semantic（Track B，与 P0 同批可做）**

## 分期（总方案，2026-08-24 修订）

| 期 | 内容 | 依赖 |
|---|---|---|
| **A（碎 bug，已修 2.368.17）** | enum dropdown 空白 + 设置分组归位 | — |
| **P0** | codex 配额 normalizer 修复（周用量标成 5h + 耗尽标记全丢） | 无 |
| **B** | 折叠语义章（全局语义 kinds + codex/claude 映射 + agent-collab 新类）+ exec 命令渲染 + per-backend modelList | 无（可与 P0 并行） |
| **P1** | codex 配额落盘 + 估计 + 展示补齐 | P0 |
| **P2** | codex 池冷切 + 自动换号 + auto-resume 接入 | P1 |
| **P3** | 热切换验证实验（通过则开热切） | P2 |
| **P4** | 后端注册表化 + 能力描述符 + QuotaSignalSource（B 是首付款） | 第三 agent 前置 |
