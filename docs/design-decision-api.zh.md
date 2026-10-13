# 设计：决策 API 插件（OpenAI Decisions + 兼容提供方模拟）— q-028

owner 2026-10-12 提出；设计台（Fable）2026-10-12，**修订 r1**（同日 owner 补充：OpenRouter 原生 decisions、每种用途的 context management、预算按输入 token 计）。只设计，不建、不跑门。

**一句话**：一个人自己打开的插件「决策 API」，一张登记行放提供方 + 钥匙（集群预设 = OpenRouter 钥匙，走 Slack 行的路），**一个** decisions 客户端（两种方言：OpenAI `/v1/decisions`、OpenRouter `/api/alpha/decisions`；chat 模拟是以后的档），一个 PURE 模型 + 一个 ORCH 调用者，**每种用途一份 PURE 的输入计划**（进什么、上限多少、怎么截、怎么去重、怎么批）；第一个用途是 Channels 第一屏「需关注」的**其余行**——规则标签已经定了的行不碰，剩下的由一个**我们写的、带版本的固定评分表 + 用户自己的「我在乎什么」一段 + 从他的判定学来的例子**交给判官，答案是概率和**条款号**，不是厂商的散文；第二个用途是通知文法里的新规则种类 `decision`。每一次判定都是没人敲键盘的付费调用 ⇒ 先过 PURE 预算判定，没钥匙或超预算就安静关闭，撞墙不重试。

---

## 1 事实

### 1.1 API（developers.openai.com/api/docs/guides/decisions，2026-10-12 抓取存于本目录 decisions-guide.md）
- `POST /v1/decisions`，**public beta**（「GA in the coming weeks」）；模型只有 `gpt-6-luna`；输入 = 字符串或 user 消息（`input_text` + `input_image`，图片只收内联 base64，不收 URL / file_id）；`questions[]` 每项 `{type, name, instructions, choices?|levels?}`；答案 `answers[]` 按 `name` 回声，类型 `predicate`（`probability` 0–1）/ `choice`（`choice` + `probabilities[]` + `confidence`）/ `score`（级别索引的概率加权均值 + `probabilities[]` + `confidence`）/ **`refusal`**（单题拒答，要处理）。一次请求可问多题（§Ask multiple questions），输入只付一次。
- **答案里没有理由文本**。文档的建议：用你自己的带标签样本定阈值，按误报/漏报代价选。
- 价格：**输入 0.10 USD / 1M tokens，无输出、无缓存费**；区域处理与长上下文有加价；ZDR 与 HIPAA 对合资格客户可用；数据驻留美/欧。约 10× 快于 Responses。
- **OpenRouter 有自己的 decisions 路由（Alpha）**（r1 核实，2026-10-12；原件存本目录 or-sdk-*.js / or-decisions-readme.md）：`POST https://openrouter.ai/api/alpha/decisions`（无钥匙 401「No cookie auth credentials found」；`/api/v1/decisions` 与 `/api/v1/alpha/decisions` 都 404——owner 给的 v1 路径不对）；SDK `@openrouter/sdk` 1.4.25 `alpha.decisions.create`。**方言不同**：请求 `{model, questions: {name → {type:'noul'|'choice'|'score', instructions, criteria}}, state: string|object|array, sessionId?, user?}`——`noul` 即 predicate，`criteria` 在 noul 是 `{true: 说明, false: 说明}`、choice 是 `{value → 说明}`、score 是 `[级别…]`；`state` 代替 `input`（文本或 JSON，没见图片件）。应答 `{id?, model, provider?, answers: {name → {type:'noul', noul: 数} | {type:'choice', choice, confidence?, probabilities?} | {type:'score', score, confidence?, probabilities?, legend?}}, usage: {input_tokens, output_tokens, cost?}}`——**没有 refusal 型**，usage 带 `cost`。
- OpenRouter 的模型：README 例子是 `typesafe/jev-1.13`；公开 `GET /api/v1/models`（458 个）里有 `typesafe/jev-router` 与 `openai/gpt-6-luna`（chat 价：输入 0.10 / 输出 0.50 USD/1M，带缓存价），**没有** `openai/gpt-6-luna-decisions`。alpha 路由接受哪些模型、OpenAI 的 luna 是否经它可达 = **UNCONFIRMED**，无钥匙测不了 ⇒ D1 的第一步探针（owner 的钥匙）。
- 没有 decisions 端点的 OpenAI 兼容提供方只能用 chat completions + 严格 JSON schema 模拟：模型自报概率（没校准）、有输出费、慢 5–10× ⇒ **以后的档**（§2.6），不在第一刀。

### 1.2 树里已有的门（生产 d8a709566）
- **通知文法**：src/channel-filter.js:81 `RULE_KINDS` 封闭集（13 种，含 webhook 车道加的 `fact`）；`validateRule` :356（每种一个 case）；`matchRecord` :644 **同步、PURE**，place 规则读 `ctx.mine/kindOf/threadOf`（:98–112，引擎按 watcher 预建）；`why` 是契约不是散文（:12–17）；`estimate` :680 诚实标 `sampled/truncated`；`renderWakeBlock` :1424 预算 10 KiB、厂商字符串经 `inertFrames` 去框架。对话框门 src/lib/channel-filter-editor.js:82 `freshRule(kind)`；CLI 门 data/bin/vibespace-channels:194–200（`watch … --keyword … --regex … | --spec '<json row>'`）；引擎 src/server/channels-engine.js 消费。
- **需关注**：PURE src/channel-focus.js（CJS，引擎与面板同一谓词）：`statusTag` :143 的 8 个标签 `TAG_ORDER` :59（awaiting / unknown / assigned / read / new-since-read / held / direct / replied），24 h 窗 :56；`focusRows` = 戴标签的行；引擎 :2805–2839 第一屏至多 `ATTENTION_MAX` 行。面板表头 src/lib/channels-panel.js:1164、:1410–1433。设计 §23.2「要紧的规则」docs/design-communication-panel.zh.md:3539。
- **登记行**：src/integration-registry.js:13 一行 = `{id, label, fields[], clusterEnv | delegate, setup?, test{kind ∈ credential-exchange|shape-only|reachability, caveat}, consumers}`；集群预设 `clusterEnv: {json:'VIBESPACE_INTEGRATIONS', prefix:'VIBESPACE_INTEGRATION_<ID>_'}`（:148, :207 …），「用户自己的 > 集群默认 > 无」；本地预设层 src/preset-layers.js + src/server/cluster-presets.js。
- **插件**：src/plugins/index.js 一行一个；契约 src/plugins.js:10–28 `{id, label, description, provides[], create(h) → {install, start, stop, status, setup?, config?, mode?, enable?, bootReplay?}}`，状态 data/plugins.json；面板 src/lib/plugins-ui.js（`provides` 决定客户端门，不看 id）。
- **花钱法**：src/spend-authorizer.js（PURE）`SPEND_REASONS` 封闭集 :45–75 = **会开付费轮次**的生产者；`BUDGET_DEFAULTS` :97（每身份 30/h、200/天，每实例 800/天）；`authorizeUnattendedSpend` :483 两段式（authorize 持有 → note 记账）；ORCH src/server/spend-guard.js 落盘 data/spend-budget.json、日志去重 :45/:98。scripts/test-spend-paths.mjs 从源码普查生产者。
- **厂商白名单**：scripts/test-vendor-whitelist.mjs:80 `ALLOW = { file: {max, gates[]} }`，构造 = 厂商主机 ±4 行内有请求原语；`CONSTRUCT_HOSTS` 已含 `openai.com`（:38–40）；设备守护进程源码与包必须为零；:100 有「种一个未门控的拷贝 ⇒ 红」的控制。
- **记录**：src/channel-record.js:114 `MAX_TEXT` 64 KiB；For-you 紧急度 src/user-todos.js:118 `low|normal|high|urgent`；webhook 的 wake 事实键 src/channels/webhook.js:378；浏览器页面判定是量过的正则钉（src/browser-stuck.js:416–440）；「drift」在树里是 channel-store 索引写入漂移（:240, :627），不是语义分类。
- 树里没有 OpenRouter；`api.openai.com` 只出现在 codex 的 JWT claim 名里（src/harnesses/codex.js:89 等）。

---

## 2 设计

### 2.1 架构（三层表）
| 层 | 文件 | 内容 |
|---|---|---|
| PURE | `src/decision-model.js`（新，CJS，不 import） | `QUESTION_TYPES`；`DIALECTS`（`openai` / `openrouter`，每种 `{path, buildRequest, parseAnswers, usageOf}`）；`normalizeAnswers(raw, dialect)` → 同一形状 `{name, type, probability | choice+probabilities+confidence | score+probabilities+confidence, refusal?, source:'native'|'emulated'}`；`RUBRIC`（v1，§2.4）；`inputPlan(use)` + `buildInput(use, parts)`（§2.11：每种用途的字段、上限、截法、去重键、批法；去框架）；`attentionVerdict(answers, threshold)`；`budgetVerdict(...)`（§2.7）；`estTokens(text)`（CJK 按 1 字≈1 token、拉丁按 4 字符≈1，取保守值）+ `estimateCost(tokens, priceRow)`；`criteriaProposal(labeled, answers)`（§2.4 草拟按钮的纯排序）；`journalRow(...)` |
| ORCH | `src/server/decision-engine.js`（新） | **唯一调用者** `judge({feature, input, questions, cacheKey})`：解析登记行与钥匙 → `budgetVerdict` → fetch（原生或模拟）→ `normalizeAnswers` → 记账 data/decision-budget.json → 日志 data/decision-journal.jsonl（有界 5 000 行 / 30 天）→ 广播计数；结果缓存 `(feature, cacheKey)`；退避 §2.7 |
| 表/行 | `src/integration-registry.js` 加行 `decision-api`；`src/plugins/decision-api.js` + index 一行；`src/channel-filter.js` 加 `decision` 种 | §2.2、§2.5 |
| UI | ⚙ → Plugins → 决策 API 卡（开关、登记行字段、功能开关、日预算、今日计数、隐私句）；Channels 面板标签 `judged` + 行内「需要 / 不需要」；设置里「我在乎什么」块；通知对话框的 `decision` 行 | §2.4–2.6 |
| CLI | 现有 `vibespace-channels watch … --decision "<条件>" [--threshold 0.7] [--choice a|b|c] [--per-hour 20]` 与 `--spec`；`vibespace-channels decision status`（今日花费 / 预算 / 暂停原因） | §2.5 |

### 2.2 提供方行与一个 decisions 客户端（r1）
- 登记行 `decision-api`：`fields = provider(choice: openai | openrouter | other-decisions) · baseUrl(仅 other：一个也暴露 decisions 的提供方) · dialect(仅 other：openai | openrouter) · apiKey(secret) · model(可空 ⇒ 提供方默认)`；`clusterEnv: {json:'VIBESPACE_INTEGRATIONS', prefix:'VIBESPACE_INTEGRATION_DECISION_API_'}`（Secret 行 + 本地预设目录，Slack 行的路；集群预设 = provider openrouter + 集群钥匙 + 集群选定的 model）；`test.kind:'credential-exchange'` = 一次最小判定（一句话、一个 predicate）并在卡上写「p=…，输入 n tokens ≈ $x」；`caveat`：OpenRouter 路由为 Alpha，模型名以它接受的为准；`consumers: ['src/server/decision-engine.js']`。钥匙永不进聊天 / argv / 日志（journal 只记钥匙指纹前 6 位）。
- **一个客户端、两种方言**（PURE `DIALECTS`，引擎只会 `fetch(dialect.path, dialect.buildRequest(...))` 再 `normalizeAnswers`）：
  | 方言 | 路径 | 问题 | 输入 | 应答 | 用量 |
  |---|---|---|---|---|---|
  | `openai` | `{baseUrl}/v1/decisions`，model `gpt-6-luna` | 数组 `[{type: predicate|choice|score, name, instructions, choices[{value,description}] | levels[{label,description}]}]` | `input`：字符串或 user 消息 | `answers[]` 含 `refusal` 型 | 输入 tokens（唯一计价项）|
  | `openrouter` | `{baseUrl}/api/alpha/decisions`，model = 行里的（默认由 D1 探针钉入）| 映射 `predicate → noul{criteria:{true,false}}`、`choice → choice{criteria:{value: description}}`、`score → score{criteria:[labels]}`；名字作 key | `state`：字符串（我们始终送一段文本，不送 JSON，方便两方言同一输入）| `answers{}`：`noul → probability`、`choice`、`score`；缺题 = refusal | `usage.input_tokens/output_tokens/cost`——有 `cost` 用 `cost`，否则输入 × 价 |
  统一后的答案形状：`{name, type, probability | choice+probabilities+confidence | score+probabilities+confidence, refusal?, dialect}`；两方言的真值表各一份（同一输入、同一答案）。
- chat completions **模拟**（没有 decisions 的提供方）：以后的档——同一 `normalizeAnswers`，加 `emulationSchema/Prompt`，概率标「估计」。

### 2.3 对 owner 问题「提示词固定、自动生成还是固定 + 可编辑」的回答与论证
**推荐：固定基底（我们写、带版本）+ 用户可编辑的一段 + 从他自己的判定学来的例子；没有任何东西改写用户的文字。**
- 固定基底可测：每个条款一张真值表（scripts/test-decision-model 的样本集），版本号进 journal 行——改了基底是一次发布，不是悄悄漂移；跨用户可比，支持团队都看得懂「v1 条款 3」。
- 用户一段是他的话：不翻译、不润色、不截（上限 1 500 字符，超了说明），原样进输入；判官读两段。
- 学来的例子是他的裁决：行上的「需要 / 不需要」= 一条带标签样本 `{title, snippet≤200, verdict, at}`，每用户留最新 50 条，每次输入带最新 12 条——这是文档建议的「用你自己的带标签样本定阈值」的落地。
- **否决「自动生成」（由 agent 或模型写评分表）**：这是钱路上一段没人审的散文，会随模型版本漂移；而且 Decisions 不产文本，生成得另开 Responses/chat 调用（有输出费）。**否决「全由用户写」**：大多数人什么都不写，判官就空了。
- **「从我最近的判定草拟」按钮**：Decisions 不写字，所以草拟 = 我们写的一张**候选条款目录**（约 20 条：催我回复、有截止日、提到钱、有人在等、升级/投诉、我的名字、我负责的项目……）对他的带标签样本逐条问 predicate，PURE `criteriaProposal` 选出最能区分「需要/不需要」的条款，**提议**成几行文字塞进他的编辑框等他改——从不自动应用；一次按钮 ≈ 样本数 × 1 次多题调用，走同一预算。

### 2.4 用途 ①：第一屏「需关注」的其余行
- **判谁**：`statusTag` 为 null、24 h 内有新消息且最新不是本人（`touch.selfAt`）的行；每行按 `(convKey, lastAt)` 判一次（缓存）；每小时至多 `PER_HOUR`（默认 60）、受日预算；账号标了「从不判」的跳过；DM 与群一样判（owner 问题 3）。
- **问什么**（一次调用多题，输入付一次）：`needs_now`（总判）+ 7 条款 predicate：`to_me`（直接对我说）/ `asks_me`（问我或要我做）/ `decision`（要我拍板或批准）/ `deadline_money`（截止或钱）/ `waiting`（有人在等我）/ `escalation`（升级、投诉、出事）/ `matters`（命中「我在乎什么」）。输入 = 标题、来源、发信人显示名、最新消息正文 ≤ 2 KB（新在前）、用户段、例子；每段经 `inertFrames` 并加引号（channel-filter 的框架法）。
- **答案 → 标签**：`needs_now ≥ 阈值`（默认 0.7，设置里 0.5–0.9）⇒ 行戴 `judged` 标签（`TAG_ORDER` 插在 `held` 后、`direct` 前——事实标签永远在前），芯片「需要你 · 0.82 · 问你、有截止」，**理由 = 条款名**（我们的词表，三语），厂商没有一字进 UI 或 agent 上下文；模拟来源加「估计」。行上两个小按钮「需要 / 不需要」= 样本 + 立刻改标签。
- **不动的**：规则标签的行；agent 的 wake 不因 `judged` 而发（它只是第一屏的排序；要叫醒走 §2.5 的规则）。

### 2.5 用途 ②：规则种类 `decision`
- 行形：`{kind:'decision', condition(≤500 字符), question:'predicate'|'choice', choices?[≤8 个 {value, description}], threshold(0.5–0.95，默认 0.7), perHour(默认 20)}`；`validateRule` 一个 case；`ruleWhy` = `decision: <condition> (p=0.82)` / `(choice=billing 0.71)`；范围 = watcher 自己的 grain。
- **同步的 `matchRecord` 不能等网络** ⇒ 引擎在调 `matchRecord` 前为带 `decision` 规则的 watcher 做一次异步预判，把答案放进 `ctx.decisions[ruleKey]`（place 规则读 `ctx.mine` 的同一路）；没答案（没钥匙、超预算、退避）= 不命中（fail closed，与 place 规则同法）。预判有界：同一记录对同一规则只判一次（缓存），每规则每小时 `perHour`。
- **choice 形 = 路由**：选项 = 这个人点名的 Task Group / agent（value 带描述）+ `none`；命中 ⇒ 该 watcher 的 wake，`why` 带选项——这就是接入点表里的「路由」，不另起功能。
- 对话框：`freshRule('decision')` 一行（条件文本框、类型、阈值、每小时上限）+ **创建时的费用估计**（最近 7 天该 grain 的记录数 × 平均 2 KB × 价格 ⇒「约 ¢x/天」；命中率诚实写「跑起来才知道，预算封顶」——`estimate` 不能调厂商）。CLI 同一行形（§2.1）。agent 经现有 watch 门建一条；它建的 wake/digest 模式本来就要用户一键批准。
- 判官的概率与条款进 **item**（wake 块的 why 行）与 **journal**（行：时间、功能、规则键、输入 tokens、¢、p/choice、来源）。
- 一次 `decision` 命中引起的 wake 是现有 `channel-message` 花钱原因，走现有梯子与 `authorizeUnattendedSpend`——**两道天花板、两种单位**（判定按美分，wake 按轮次）；判定本身不开轮次，**不加** `SPEND_REASONS`（test-spend-paths 的普查不扩）。

### 2.6 用途 ③：其它接入点（按价值/成本排）
| 接入点 | 价值 | 成本 | 做否 |
|---|---|---|---|
| 入站记录路由到 Task Group / agent | 高（≥2 个组时）| = `decision` 的 choice 形，0 新面 | **做（随 D3）** |
| webhook 原始载荷的「事实 / 要叫醒 / 忽略」 | 中 | `decision` 规则 + `scope:'raw'`（载荷 ≤ 4 KB 进输入）| 做，v2（rel249 L2 之后；owner 问题 3 决定原始载荷可否离开实例）|
| For-you 托盘分组（对 `normal` 且无选项的条目打 score 紧急度）| 低–中 | 一卡一调 | 后做（托盘本来就短，agent 已自己标紧急度）|
| 浏览器页面判定第二意见（登录墙 / 验证码 / 错误页）| 低 | 每次翻页一调、页面文本离开实例 | **不做**（正则钉是量过的事实；概率意见不能改 agent 的动作）|
| 未知记录分类（「drift 普查」）| — | — | **不做**（树里的 drift 是索引写入漂移，不是语义问题）|
| backlog 合并提议 | 低 | — | **不做**（8 条，人读）|
| agent 的直接提问 CLI（`vibespace-decide`）| ? | 每条命令一调，没人审 | **不做（现在）**；要就以后作为有预算的动词单独提 |
| chat completions 模拟档（没有 decisions 端点的提供方）| 中 | ~300 行；输出费、未校准 | 后做（r1：OpenRouter 有原生路由，第一刀不需要）|

### 2.7 开关与预算（花钱法）
- 插件总开关（默认关）；功能开关 `attention` / `rules` / `routing`（= rules 的 choice 形）**默认关，直到有钥匙**（有钥匙后 attention 是否自动开 = owner 问题 2）；提供方 / 模型 / 钥匙按实例（登记行）；**日预算**（默认 = owner 问题 1，推荐 5 美分）硬停，卡上与 Channels 表头芯片的 title 里都有「今日 ¢x / ¢y · n 次」；journal 可在卡里展开。
- **单位是输入 token**（这就是价）：PURE `budgetVerdict({pluginOn, featureOn, hasKey, estTokens, spentTodayTokens, dailyTokens, hourCount, perHour, backoffUntil, now})` → `{ok}` | `{ok:false, why ∈ no-key | plugin-off | feature-off | daily-budget | per-hour | backoff | account-never, retryAt}`；日预算在卡上以 USD 设（owner 问题 1），按行的价格换成 token 上限；调用前用 `estTokens` 问，调用后用厂商 `usage` 记账（OpenRouter 另记 `output_tokens` 与 `cost`）；**计数器按天、按用途**：`{use → {calls, inputTokens, outputTokens, usd}}`，卡与芯片都显示「今日 n tokens ≈ $x / $y」；**没钥匙或超预算 = 安静关闭**（芯片写原因，journal 一行/5 min 去重），**撞墙不重试**：429/5xx ⇒ `backoffUntil` 60 s，再撞 ⇒ 1 h，说一次；模拟提供方的超时 15 s 后算一次失败。
- 计数落盘 data/decision-budget.json `{day, byUse: {use → {calls, inputTokens, outputTokens, usd}}}`，重启不清零（spend-guard 的理由）。

### 2.8 隐私
- 离开实例的：对话标题、来源名、发信人显示名（邮件记录里含地址）、最新消息正文 ≤ 2 KB、用户的「我在乎什么」段、≤ 12 条样本片段、规则的条件文本、路由选项的描述；**从不**：凭据 / token / 附件字节 / 图片 / 页面截图 / 对话的 agent 内部文本。输入上限 8 KB/次，超了截新在前并在 journal 标 `truncated`。
- 插件开关旁的句子（三语，提供方名随行变）：「你连接的频道里的消息文本（标题、发信人、最新几条）会发给 <提供方> 做判断；凭据与附件从不发送。OpenAI 对合资格客户提供零数据保留；OpenRouter 会转给第三方模型（按其政策）。」
- 每账号退出：账号 ⋯ 菜单「从不判断这个账号」（账号记录字段 `judge:'never'`，与 retention 同处）；默认全部账号参与（owner 问题 3）。
- 集群预设钥匙 = 集群替用户付钱、文本到 OpenRouter ⇒ 插件仍由**本人**打开（预设只是把钥匙填好）。

### 2.9 厂商白名单（新厂商类）
- 新文件 `src/server/decision-engine.js` 是**唯一**构造处：`ALLOW['src/server/decision-engine.js'] = { max: 2, gates: ['budgetVerdict', 'decisionPluginOn', 'resolveIntegration'] }`；`CONSTRUCT_HOSTS` 加 `openrouter\.ai`；compatible 的任意 baseUrl 用源码标记 `DECISION_ENDPOINT` 计数（census 认标记不认主机）；控制：种一份去掉 `budgetVerdict` 的拷贝 ⇒ 红；设备守护进程源码与包仍为零；客户端包不含钥匙字段（登记行 secret 的既有法）。

### 2.10 每种用途的 context management（r1；PURE `inputPlan(use)` + `buildInput`）
共同法：① **顺序**固定在前、可变在后（`[评分表 v<n>] [用户段] [例子] [——记录——] [记录]`），对有前缀缓存的提供方白得便宜，对 OpenAI decisions（只有一个输入价、无缓存档）不亏；② **截法** head + tail：超上限时保留前 60% 与后 40% 的预算，切点退到最近的句末（。！？.!?\n），中间写 `…[省略 n 字]…`，**从不**切在句中；③ **去重备忘** data/decision-memo.json（LRU 5 000）+ 内存：键 = `sha256(use | 记录 id | 记录 lastAt | 评分表版本 | 用户段 hash | 例子集 hash | 规则 hash)`——重画、重开、重启都不再付费，只有键变了才再判；④ **从不进入**：凭据 / token / cookie / API 钥匙、附件字节、图片、**其它账号的记录**、agent 的框架文本（`<system-reminder>` 等经 `inertFrames` 去框架并加引号）、邮件地址（只留显示名与域）、owner 自己的 agent 内部上下文；⑤ **批**：Decisions 一次输入可问多题，所以「多条记录一次调用」= 输入里放 N 条记录、问 N×k 题（题名带记录号）——省的是固定部分的 N−1 份；D1 探针用同一批记录**两种方式各跑一次**量 `usage.input_tokens` 与两种答案的一致率，再定每用途的 N（下表是设计值）；走 wake 路的用途不批（延迟）。

| 用途 | 进什么（固定 → 可变） | 上限（tokens，`estTokens` 保守值） | 去重键 | 批 | 不进 |
|---|---|---|---|---|---|
| ① 需关注 | 评分表 v1（≈350）→ 用户段 ≤ 1 500 字符 → 例子 ≤ 12 条 × ≤ 200 字符 → 记录：标题、来源、发信人显示名（≤ 200 字符）、最新消息正文 ≤ 2 KB（新在前，agent 的回复带「agent:」标） | 固定 ≤ 1 700 + 可变 ≤ 800 = **2 500/记录** | use+conv+lastAt+rubric v+段 hash+例子 hash | ~~设计值 5 条/次~~ → **1 条/次**（as built r2，探针 2026-10-12：批 5 = 1 608 vs 单条 1 761 输入 tokens/条，只省 9 %，但 needs_now 在 0.7 的一致率只有 12/20、平均 \|Δp\| 0.383 ⇒ 批改变判定，按本节⑤的规则退回单条；一条记录多题照旧）；每小时一扫 | 附件、图片、地址、已戴事实标签的行、owner 自己的最新一条 |
| ② 规则 `decision`（predicate / choice） | 条件 ≤ 500 字符（+ choice 的选项 ≤ 8 × 120 字符）→ 记录正文 ≤ 2 KB → 线程摘要：最近 3 轮 × ≤ 300 字符（发信人显示名 + 文本） | **1 500/记录** | use+记录 id+规则 hash | **不批**（wake 路）；同一记录多条规则 ⇒ 一次调用多题 | 同上；其它账号的记录 |
| ③ 路由（② 的 choice 形） | 条件 → 组/agent 名与描述 ≤ 8 × 200 字符 + `none` → 记录正文 ≤ 2 KB → 线程摘要 3 轮 | **1 800/记录** | use+记录 id+规则 hash+组表 hash | 不批 | 同上 |
| ④ For-you 分组（后做，score） | 紧急度级别表 → 条目 text ≤ 400 + detail ≤ 800 字符 + 会话名 | **600/条** | use+条目 id+级别表 v | **≤ 10 条/次**（不在 wake 路） | 条目的 artifacts、回复文本 |
| ⑤ webhook 事实（后做） | 规则条件 → 原始载荷 ≤ 4 KB（JSON 只留键与 ≤ 200 字符的字符串值）+ 路径声明的字段 | **1 600/记录** | use+记录 id+规则 hash | 不批 | 签名头、token 字段（按键名 `*token*|*secret*|*key*|authorization` 抹掉）|
| ⑥ 页面判定（**不做**，计划留档） | 规则 → URL 主机 + 标题 + 可见文本 ≤ 2 KB head+tail | 900/页 | use+URL+文本 hash | 不批 | 表单值、cookie、截图、URL 查询串 |

每用途的上限、顺序与排除表都是 `inputPlan(use)` 返回的数据，test-decision-model 对每种用途种一条超限、一条带框架、一条带 token 字段的输入，断言截法、去框架与抹除；`buildInput` 的输出再过一次 `estTokens ≤ ceiling` 的断言（红 = 计划与构造不一致）。

### 2.11 被拒的方案
- 复用 `SPEND_REASONS`/`authorizeUnattendedSpend` 记判定：单位是轮次不是钱，且会把一个不开轮次的调用塞进开轮次的普查。
- 判官写理由文本：Decisions 没有；模拟有但是厂商散文进 UI/agent 上下文——违反框架法；条款号够用且可测。
- 在 `matchRecord` 里 await 网络：它是 PURE 同步契约，改了 estimate 与 why 全变；预判进 ctx 是 place 规则走过的路。
- 全部行都判（不只「其余」）：事实标签比概率强且免费；重复付费。
- 第一刀就做 chat 模拟适配器：OpenRouter 已有原生路由（r1 核实），模拟是输出费 + 未校准的下一档。
- 每条记录一次调用、固定部分每次重付：Decisions 一次可问多题，批判定省固定份；但 wake 路不批。
- 把钥匙放 data/plugins.json 的插件配置：登记行已经是「用户的 > 集群的 > 无」的一个门，secret 字段、Test 卡、预设层都现成。

---

## 3 削减 / 成本 / 风险 / 做否
| 项 | 成本 | 风险 | 做否 |
|---|---|---|---|
| D1 核心：PURE 模型（两方言 + 输入计划 + 预算）+ 引擎 + 登记行 + 插件行 + 预算/journal/备忘 + 白名单行 + 卡 + 探针（模型名、批 vs 单） | ~1 000 行 | 两家都是 beta/alpha，形状会变（方言表一处）| **做（MINIMAL）** |
| D2 需关注：评分表 v1 + 用户段 + 样本 + 芯片/按钮 + 缓存 + 草拟按钮 | ~700 行 | 阈值初值靠样本集 | **做** |
| D3 规则种类 + 路由 choice + 对话框/CLI + 费用估计 + 预判 | ~600 行 | 预判延迟（原生 ~0.3 s；模拟 1–3 s）在 wake 路上 | **做** |
| webhook raw scope / For-you 分组 / 图片输入 / chat 模拟档 | 各 ~200–300 | — | 后做 |
| V 验证（钱 + 隐私类）| 1 轮 ~1 天 | — | **做** |

**MINIMAL** = D1 → D2 ∥ D3 → V。

---

## 4 车道简报骨架
- **D1 decision-core**（第一步 = 探针：用 owner 的 OpenRouter 钥匙向 `/api/alpha/decisions` 各发一次 `typesafe/jev-router`、`openai/gpt-6-luna` 与 owner 给的 `openai/gpt-6-luna-decisions`，记下谁 200、usage 与 cost，钉入提供方默认模型；再用 20 条真实记录量「批 5 条」vs「单条」的 `input_tokens` 与一致率，写进设计的 §2.10 表）：src/decision-model.js（新）、src/server/decision-engine.js（新）、src/integration-registry.js（行）、src/plugins/decision-api.js + index.js、src/lib/plugins-ui.js（卡：开关、字段经登记卡、功能开关、预算、计数、隐私句）、scripts/test-vendor-whitelist.mjs（ALLOW 行 + 主机 + 标记 + 控制）、i18n。门：test-decision-model（新 PURE：两方言各型的 buildRequest/normalize 真值表含 refusal 与缺题、每用途 inputPlan 的截法/去框架/抹除/上限断言、备忘键、budgetVerdict 全表（token 单位）、estTokens、journalRow 无钥匙）、test-vendor-whitelist（新行 + 种拷贝红）、test-cluster-presets（新前缀）、test-integration-registry 普查、test-architecture（新文件的 import 法）。重：一个假提供方 http 服务（两种方言各一路、429 一次、usage 带 cost）跑引擎：按用途记账（tokens + usd）、退避、journal、备忘命中不再调用、无钥匙安静。
- **D2 decision-attention**：src/channel-focus.js（`judged` 标签与次序）、src/server/channels-engine.js（候选行 → 引擎 → 缓存 → rowView 带 `judged{p, clauses, source}`）、src/lib/channel-words.js（条款词表）、src/lib/channels-panel.js（芯片、两按钮）、设置块（src/lib/settings-schema.js `decision.attentionBlock` / `decision.threshold`）、样本存储 data/decision-examples.json、草拟按钮。门：test-channel-focus（标签次序表）、test-decision-model（评分表 v1 样本集真值表 + 输入构造去框架 + 8 KB 上限）、scale 套件（第一屏不因判定变慢：判定异步、行先画后补）。控制：候选集普查——规则标签已定的行一次也不送。
- **D3 decision-rule**：src/channel-filter.js（种类、validate、why、ctx.decisions）、src/lib/channel-filter-editor.js（行 + 费用估计）、data/bin/vibespace-channels（flags + spec）、引擎预判 + 缓存 + perHour、wake 块的 why 行、journal。门：test-channel-filter（真值表一行）、test-channel-watch-spec、CLI 测试、重：假提供方下一条 choice 规则路由到两个组。
- **V decision-verify**（钱 + 隐私，≤ 3 轮）镜头：① 普查：引擎外没有任何 fetch 到 openai/openrouter/标记；② 没钥匙时 0 次调用（计数器 0、假服务收 0）；③ 日预算硬停：预算 ¢5 时第 N 次被拒、次日恢复、重启不清；④ 撞墙：429 后 60 s 内 0 次、再撞 1 h；⑤ 输入普查：journal 与假服务收到的 body 里不含 token/cookie/附件（种一个把账号 secret 拼进输入的突变体 ⇒ 红）；⑥ 框架：样本里塞 `<system-reminder>` 进输入后仍被去框架；⑦ 「从不判断」账号 0 次；⑧ UI 无厂商散文（judged 芯片只含词表词）；⑨ 一次 wake = 两道天花板都记了账；⑩ 备忘：同一记录重画 10 次 = 1 次调用；⑪ 批：批内每条记录的答案与单条一致率 ≥ 探针钉的值，否则该用途退回单条。

---

## 5 需 owner 定（推荐在前）
1. **【推荐：5 美分/天】默认日预算。** 按 0.10 USD/1M 即 50 万输入 tokens ≈ 200 次单条「需关注」判定（2 500 tokens）或 ≈ 90 批（5 条/批）；硬停、卡与芯片上看得见 tokens 与 USD。答其它数即改默认。
2. **【推荐：是】有钥匙后「需关注」判定自动打开。** 插件开关旁已有隐私句，预算封顶；你会看到第一屏多出带概率与条款的行。答「否」= 三个功能全部手动开。
3. **【推荐：全部频道账号的文本可离开实例，附件/图片/webhook 原始载荷不可；每账号可「从不判断」。** 答「否」请指名哪些账号或类型除外。
4. **【推荐：预设存在但插件默认关】集群用户的 OpenRouter 预设。** 钥匙替他们填好，开关仍由本人打开（打开时看到「发给 OpenRouter」的句子）。答「否」= 集群用户默认开。

---

## 6 As built（lane decision-core，D1，rel261）

**D2 / D3 导入的契约。** `src/decision-model.js`（PURE）导出：`QUESTION_TYPES PROVIDERS PROVIDER_LABEL DEFAULT_MODEL PRICE_PER_MTOK_USD DAILY_BUDGET_CENTS_DEFAULT THRESHOLD_DEFAULT THRESHOLD_RANGE BACKOFF_MS MEMO_MAX FEATURES WHY DIALECTS USES PLANS NEVER JOURNAL_FIELDS RUBRIC GOLDEN CRITERIA_CATALOGUE` + `dialectOf urlOf questionError buildRequest normalizeAnswers usageOf estimateUsd usdOf estTokens questionTokens cutHeadTail fitTokens maskAddresses eraseSecrets cleanPart inputPlan buildInput memoMaterial memoKey batchQuestions unbatchAnswers dayOf tokensForCents budgetVerdict nextBackoff isWall journalRow rubricQuestions rubricText attentionVerdict criteriaProposal`。`src/server/decision-engine.js`（ORCH，唯一调用者）：`create({dataDir, integrations, serverNotice, now, tzOffset, fetchImpl, baseUrlFor})` → `{judge(use, parts, {questions, memo, accountNever, perHour}) → {ok, answers, memo, usage, usd} | {ok:false, why, status?, retryAt?}, testRunner, status(), attachPlugin, settings}`；用途 → 功能：attention→attention、rule→rules、routing→routing；`test` = 登记行的 Test（人按的，不看开关，计入预算）。

**与设计的出入（为什么）：**
- 模型模块**只 import 一个 PURE 模块** `src/peer-text.js`（不是「不 import」）：框架法在 channel-record 之外只允许一份拷贝（页面对话框那份，test-peer-text-census 钉死），再抄一份就是普查红；所以每段文本都走那一条带子（先截、折隐藏字符、去框架）。
- 登记行字段 = `provider (openai | openrouter) · model · apiKey`（简报范围；`other-decisions` + `baseUrl` 留给模拟档）；引擎的 `baseUrlFor` 只给测试的假服务用。「去哪拿钥匙」写进 apiKey 的 help（没有回调地址时卡不画 callbackNote）。
- 日预算默认 **100 美分**（owner 2026-10-12 裁定，不是 5）；单位 = 输入 tokens（100 美分 ÷ 0.10 USD/M = 1 000 万）；计数文件名 `data/decision-usage.json`（简报名，非 decision-budget.json）；备忘 `data/decision-memo.json`；journal `data/decision-journal.jsonl`（5 000 行 / 30 天）。
- 默认模型（r2，探针 2026-10-12 用 owner 的钥匙，probe-20261012T060934Z）：OpenRouter alpha 路由上**只有** `openai/gpt-6-luna-decisions` 回答（200，211 ms，194 输入 tokens，cost 0.000020564 USD ≈ 0.106 USD/1M）；`typesafe/jev-router` 与 `openai/gpt-6-luna` 都 400 ⇒ 钉入 `DEFAULT_MODEL.openrouter`；OpenAI 仍为 `gpt-6-luna`（没有 OpenAI 钥匙可测）。价格常量保持 0.10/1M（有 `usage.cost` 时按 cost 记账，常量只用于调用前的预算估计）。
- 批（r2）：「需关注」= **1 条记录/次**（见 §2.10 表）；`buildInput` / `judge` 对超过计划批量的请求按名拒绝（从不悄悄丢记录）；探针用显式 `{batch: 5}` 继续量。
- `estTokens`：ASCII 按 3 字符 ≈ 1（比厂商的 ≈ 4 保守），CJK 与其它非 ASCII 每字 1。
- 截法：句末优先；一个比窗口还长的句子退到空白，再没有才硬切（仍带省略标记）。
- 白名单行：`max 1`，gates = `budgetVerdict` · `pluginOn` · `resolveIntegration(ROW_ID)` · `DECISION_ENDPOINT`；`CONSTRUCT_HOSTS` 加 `openrouter\.ai` 与标记 `DECISION_ENDPOINT`；控制：模型里种一份 fetch ⇒ 红；引擎去掉 budgetVerdict ⇒ 门普查红。
- 「需关注」的条款词（`RUBRIC.clauses[].word`）是英文词表；三语与芯片 = D2。每账号「从不判」= D2（`judge(..., {accountNever})` 已在门里）。

**D2 as built（lane decision-attention，rel261）——第一屏「需关注」的判定行。**
- **一次一条记录**（D1 探针 2026-10-12 的裁定：一次 5 条改变了 needs_now 的判定，一致率 12/20，只省 9 % tokens）：每条记录一次调用，8 题（needs_now + 7 条款）同一次问；队列至多 3 个在飞。设计 §2.10 表里的「5 条/次」作废。
- **候选**（PURE `src/channel-focus.js` `judgeCandidate`）：第一屏的行，没有任何事实标签、最新消息在 24 h 内且不是本人的、不是 VibeSpace 内部的、账号没标「从不判」、本人没对这条消息下过标签；**入队时问一次，调用前对「此刻的行」再问一次**——普查腿抓到过一个真实的竞态：一次读先把行排进队，随后它被交给 agent，旧快照照样被送去判。正在飞的行不会被再次排队（重画腿抓到的重复计费）。
- **标签** `judged`：`TAG_ORDER` 中在 `held` 后、`direct` 前；只对它判过的那条最新消息有效（`lastAt`）；`p ≥ decision.threshold`（设置，0.50–0.90，默认 0.70，高级）；本人的标签优先（「不需要」立刻去掉，「需要」保留）。第一读的截断按 TAG_ORDER，再按 p，再按新旧。
- **样本** data/decision-examples.json（0600，src/server/channels-attention.js 是唯一写者）：`{key, lastAt, snippet ≤ 200, verdict, clauses, at}`，留最新 200 条，每次输入带最新 12 条；样本 hash 在备忘键里 ⇒ 下一次第一读会重判其余行（不是点按钮时立刻重判）。
- **草拟**：目录 20 题对最新 ≤ 30 条样本各问一次（同一备忘），`criteriaProposal` 提议几行放进编辑框，只有本人按保存才生效。
- **出入**：阈值放在设置 `decision.threshold`，插件配置里 D1 的 `threshold` 字段 D2 不读（卡上没有它的控件，留给集成者决定去留）；「从不判」= 账号记录字段 `judge: 'never'`（PUT /api/channels/adapters/:id `{judge}`），⋯ 菜单行只在判定开着或已标「从不判」时出现；条款词三语在 src/lib/channel-words.js `judgeClauseWord`。

### D3 as built（lane decision-rule，rel261）
- **规则种类 `decision`**（src/channel-filter.js）：`{kind, condition ≤ 500, question: predicate | choice, choices ≤ 8 × {value 短词, description ≤ 120, to?: {kind: group|agent, id, name}}, threshold 0.50–0.90（默认 0.70；比 D1 的 `THRESHOLD_RANGE` 上限 0.95 窄——以简报为准）, perHour 1–60（默认 20）}`；`none` 总是由题目附加，不存。`matchRecord` 仍同步 PURE：读 `ctx.decisions[decisionKeyOf(rule) + '|' + record.id]`，没答案 = 不命中。`decisionKeyOf` = 题型 + 条件 + 选项（含路由）的键；阈值与每小时上限不进键（挪滑块不重付）。无概率的 choice 答案（OpenRouter 可省）保留其选项。
- **路由的语义（与设计的出入，为什么）**：选项带 `to` = 路由；一条路由规则只对**本身就是那个 principal 的 watcher** 命中（`ctx.principal`；All-agents 的分发项算它指向的 agent，组成员项算它的组）。「路由到两个组之一」= 两个组各自的通知行带**同一条**规则（同键 ⇒ 每条记录只问一次）；选中的组经**它自己那一行**送达（送达方式、日上限、账本都是它的）——没有新的送达机制，也就不会绕过访问权；`none` = 谁也不送。选中一个没带这条规则的 principal ⇒ 不送达（编辑器的规则行写明「给那一行加上同一条规则」）。
- **预判**（src/server/channels-engine.js `preJudge`，onFresh 里所有过滤器之前）：收集生效 watcher 过滤器里的全部 decision 规则（按键去重、排序），每条新记录（owner 自己的、系统通知不判）**一次** `judge(use, {body, thread}, {questions, memo, accountNever})`——带路由题时 use = `routing`，否则 `rule`；**条件放在题目的 instructions 里**，输入只放记录（正文 + 之前 3 轮「名字: 文本」），条件只付一次（§2.10 ② 写的是条件进输入）。memo = `{id: 记录 id, rule: 排好序的规则键, groups: 路由规则键}`，D1 的备忘：重启后同一记录 0 次调用。拒绝（插件关、开关关、没钥匙、预算、退避、本规则每小时上限）= 不命中 + 每规则每小时一行服务器日志 `decision rule <key> not judged — <why>`。每规则 `perHour` 在 channels 引擎里按规则键计（备忘命中不计）——**不**用 D1 judge 的 `perHour`：D1 的小时窗全引擎一份（attention 的 60/h 会吃掉规则的 20/h）；D1 的日预算仍是唯一的钱门。
- **唤醒**：命中走现有 `wake()` → `billedWake` → `channel-message`，不加 SPEND_REASONS；why = `decision: <条件> → 0.82` / `→ Tech desk 0.85`。功能开关：predicate / 普通 choice 看 `rules`，路由看 `routing`（关着的那类题不进调用）。
- **接线（与 D2 共享的唯一一处）**：mounts-plugins-wiring 返回 `decisionEngine` → server.js（已有行上加名字，不加行）→ channels-wiring → `createEngine({decisionEngine})`。账号「从不判断」读 `rec.judge === 'never'`（§2.8 的字段名；D2 落地以它为准）。
- **估算与费用行**：`estimate` 对带 decision 规则的过滤器多给 `decision: {rules, judgedPerDay, hitsUnknown}`；`decisionCost` = 每天要判的记录（受每小时上限）× D1 `inputPlan(use).ceiling` × 价格，对比插件日预算（命中率「跑起来才知道」）。
- **编辑器 / CLI**：Notify… 的规则行（条件框、是否 / 其中一项、选项 + 路由到有访问权的组或 agent、阈值滑块、每小时、费用行；插件关 / 没钥匙 / 开关关在行内说明并给「打开插件」，从不置灰）；`vibespace-channels watch … --kind decision --condition "…" [--choice a,b] [--threshold 0.7] [--per-hour 20]`（服务器端解析，src/channel-watch-spec.js）。
- 门：test-channel-filter ⑲（真值表 + 拒绝 + 阈值控制）、test-channel-watch-spec、test-channel-agent-watch ⑩、test-decision-model ⑫、test-record-clear-census（`decisionTail` 的门）、新 test-decision-rule（重：假提供方 + 真 channels 引擎 + D1 引擎；Chrome 规则行 desk/phone）。
