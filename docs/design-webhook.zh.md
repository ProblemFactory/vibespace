# Webhook 设计 v4 —— v3 的形状按契约对齐（设计台 2026-10-10；owner 定案"按 B"不变）

> 输入：v3（/var/tmp/vibespace-lanes/webhook-design/design-webhook.v3.zh.md，owner 默认在 §11）+ 两位只读审查者的 39 条意见（review-findings.md）。v4 保留 v3 的全部决定（§11 ①–⑤、§12 的方向），把每条意见裁决一遍（§1），再用 docs/design-communication-panel.zh.md 的形状重写：精确的能力行（§3）、入站门（§4）、回复动词与标志（§7）、token 去向普查（§9）、围栏（§10）、路由表行 + 门禁（§11）、三条车道 + 验证镜头（§12）。意见迫使某个决定换说法的，列在 §13 OWNER QUESTIONS，不替 owner 定。生产代码只读；行号为审查者引用的 2.369.24x。

## 0. 一段话

**Webhook 是一条不可移除、无登录的 channel adapter（`kind: 'webhook'`，`reach: 'grants'`——不是 agents 的 `builtin`）；它的每个会话 = 一条 path（`/hook/<slug>`）；会话对面是一个或多个 caller（外部系统，各自一把 token）；这一侧只有一个身份——"我"（契约里就是 `sendAs: ['user']`）。** 一次调用 = 一条经引擎推送门（`receive: 'push'` 的 `live.start → onEvent`）落进会话的记录：落盘后才答 200，默认谁也不叫醒；叫醒由会话上的现有规则决定（没有新规则种类；payload 字段在入站时映射成声明过的 facts，规则只看 text / facts）；能不能看由 AgentReach 决定。回复一律以我的身份：`vibespace-channels reply <conv> "…" --to <记录 id>` 回给那条记录的 caller（caller 从记录推出，不用再指名）；要发给指定的 caller 或全部，用 `compose --caller <id>|all`，一个 caller 一个 proposal。caller 从头到尾只看到一个对外身份、只拿到自己的回复和自己调用的回执（每 caller 的不透明 id，不透露任何内部事实）。两个实例互联（§12）= 彼此是对方的一个 `peer` 类 caller，配对完成走专用端点，token 永远不进记录。

## 1. 对 39 条意见的裁决

裁决词：**接受** = 照改；**部分** = 接受事实，落法有别（说明）；**反驳** = 不改（给出节）。

| # | 裁决 | 落在 | 一句话 |
|---|---|---|---|
| 0 | 接受 | §3 | `sendAs: ['user']`，owner 就是 user；`identityMarking: 'marked'` + 文案「caller 看到的 from 是 path 的 fromName」 |
| 1 | 接受 | §3 | 能力行按契约字面写全（threads 行、`history: 'page'` 空答、`avatars: null` + `avatarsWhy`、`glyph`、`idempotency: 'key'`） |
| 2 / 36 | 接受 | §4 | 入站门 = 引擎的推送门：`receive: 'push'`，`live.start({onEvent})` 注册发射器，路由在 PURE 判定后调 `onEvent`，200 = 落盘后；`pushTransport` 加闭集新值 `http-inbound`（index.js 的闭集 + 契约套件各一行） |
| 3 / 19 | 接受 | §2 §11 | 不复用 `builtin`：模块声明 `removable: false`、`consent: null`、`reach: 'grants'`、`listed: true`；引擎四处 `builtin` 分支改读声明的事实（架构普查：不再有 `builtin` 分支） |
| 4 / 21 | 接受 | §7 | 回复动词是 `vibespace-channels reply <conv> "…" --to <记录 id>`；`--in-reply-to` 与 `vibespace-msg send webhook/…` 全部删除；文档在 `vibespace-docs channels` |
| 5 / 20 | 接受 | §3 §7 | `replyEnvelope: true`：回给记录 R 就是回给 R 的作者 caller；`compose: true` + `prepareSend` 校验 `--caller`；placements `['chat','quote']`、`rootReply: 'quote'`（点名记录的回复是 quote 位） |
| 6 / 37 | 部分 | §6 | 不加 `from-caller` / `every-message`（= `from-address caller:<id>` / watcher `mode: 'all'`）；`json-path` 不做"对 raw 的路径规则"，改为入站时把选定字段映射成声明过的 facts + 一条 `fact` 规则（一行 + 两扇门）；能力不变（见 §13 Q2） |
| 7 | 接受 | §5 | `X-In-Reply-To: <replyId>` → `record.replyTo`；`send()` 返回 `vendorMessageId: replyId`；`threadKey` 保留 |
| 8 | 接受 | §6 | 删「规则可指向 owner」；单 caller 的 path 是 `kind: 'dm'` 会话 ⇒ 未读走 first-screen 的 `direct`；多 caller 走 assigned / read / held / awaiting |
| 9 | 部分 | §8 | policy 只走现有门（`store.index.update` 的 setPolicy）；caller 名进 people.json + `participants`；映射 / 限速 / 白名单 = 声明的每会话 options 行，经 `store.index.update` 写；caller 的凭据在 adapter 自己的一份文件（§8），Bearer 存哈希、HMAC 存 secret-box 密文 |
| 10 | 接受 | §4 | 顺序固定、被拒的调用什么都不存；409 保留但改为每 caller 的有界 `(key → body sha256)` 备忘（溢出按新键处理并计数） |
| 11 / 30 | 接受 | §7 §10 | 出站围栏 = 共享模块 `src/egress-fence.js`（`addressVerdict` 上提 + 解析一次、连判过的地址）；不跟随重定向；默认 https，`webhook.allowPrivateReplyUrl` 放开私网；响应体 ≤ 64 KiB、`withoutSent` 去签名、皮带 2 KiB；egress 普查加「owner 配置的主机，经 addressVerdict 判定」一腿 |
| 12 | 部分 | §4 §10 | 路径保持 `/hook/<slug>`（URL 不是 CLI 词；手册一句话说明与 vibespace-hook 工具无关）；auth.js 一行精确豁免 `POST /hook/*` 与 `/api/channels/webhook/*/pair`，各自有 pin 套件 |
| 13 / 38 | 接受 | §7 §11 | 一期没有 owner 侧 CLI；owner 的动作 = 面板 + cookie 路由（`refuseAgentBearer` 先行）；agent 侧不新增 webhook 动词，提议用 `vibespace-ask` |
| 14 | 部分 | §12 §13 | §12 写成 docs/design-instance-pairing.md 的候选方案 3，A 的 hook URL 由 `instanceUrl` 构造；"同款流程"改为真实形状（hub 铸两把、一次性码、专用完成端点）；是否以本设计取代旧文档 = §13 Q4 |
| 15 | 接受 | §7 | 广播 = 一个 caller 一个 proposal（outbox 列出 N 条、N 个回执） |
| 16 | 接受 | §5 | 记录 id 用仓库的 `${adapterId}:${convId}:${vendorId}`；caller 作者 `isBot: true`、`external: true`；卡片 = `agentBlock`；"invite" 改叫「登记 caller」；caller 文本可被 record-clear 清（§8） |
| 17 | 接受（critical） | §12 §10 | 配对完成绝不经 /hook：专用 `POST /api/channels/webhook/<slug>/pair`，PURE 判定在任何记录之前，只写 caller 行、不追加记录；/hook 对命中 `vswh_` 前缀的 body 按 401 同形拒绝 |
| 18 | 接受 | §4 | server.js 的全局 JSON 解析跳过 `/hook/` 与 pair 路由；路由自己按顺序先拒后读（`express.raw` 256 KB），签名在原始字节上验 |
| 22 | 接受 | §7 | 没有 `queued-for-poll` 状态；reply-url 的 `send()` 只在请求已发出后的超时/重置答 `unknown`（`detail.lost`），拒连 / 4xx 答 `failed`；`reconcile()` 答 `{unknown: true}`，人工重发是唯一重试；poll = 每 caller 有界队列（200 条 / 7 天），proposal 直接 `sent`，回执写「已排队等 <caller> 拉取」 |
| 23 | 接受 | §4 | `vendorId` 与推送 `eventId` = `<callerId>:<Idempotency-Key>`；409 备忘每 caller |
| 24 | 接受 | §6 §13 | 每 path 的叫醒预算（设置 `wakesPerHour`，默认 6）在 paceVerdict 之前；webhook 会话上的 `mode: 'all'` 默认 `digest`；拒绝语点名 path 与被叫醒的会话；谁付钱 = 被叫醒会话的 pool 席位（默认值 = §13 Q3） |
| 25 | 接受 | §4 §7 | 回执与 poll 游标 = 每 caller 的不透明 id（`HMAC(callerToken, recordId)` 截 16 hex）；内部 id 不出门 |
| 26 | 接受 | §5 | `author.name` 永远 = 登记时的 caller 名；payload 的 senderKey 值成为 `sender` fact |
| 27 | 接受 | §5 | 映射（textPath / senderKey / titleKey / facts）在入站时对完整解析体（≤ 256 KB，深度与路径长度有界、无过滤器/脚本）求值；`raw` 保留前 8 KiB 并在卡片上说「raw 截断于 8 KiB」 |
| 28 | 接受 | §7 §8 | caller 带 `generation`；长轮询每次醒来复核，撤销/轮换 ⇒ 401 结束；`send()` 发送时重读 caller（撤销 ⇒ `not-found`，轮换 ⇒ 用新 token 签）；铸 → 原子写 → 才在响应里显示一次；轮换默认无宽限 |
| 29 | 接受 | §9 | 明文只出现在登记/轮换的 HTTP 响应里一次；铸造经 pairing-token 新种类 `webhook`（前缀 `vswh_`，secret-shapes R4）；Bearer 存哈希、`tokenMatches` 常量时间比较；HMAC 存 `tokenEnc`；bearer 用 `bearerOf` 读；运行时去向普查套件 |
| 31 | 接受 | §3 §7 | 能力行 `honestyLine: 'never'`：引擎跳过诚实行、面板隐藏该选项；回 POST 的 body 形状固定 |
| 32 | 接受 | §4 | 固定检查顺序（method → 每 IP 限 → slug 语法 → 本 slug 的 caller 查找（未命中也跑一次 dummy `tokenMatches`）→ 头 → Content-Length → 原始读 → 签名 → 幂等 → 每 caller 限速 → 解析）；禁用的 path、零 caller 的 path、不存在的 slug 同形 401 |
| 33 | 接受 | §4 §10 | 重放备忘与 409 备忘每 caller、容量 rateLimit × 10 min、溢出按 401 同形拒并计数；签名串含 `ts.POST./hook/<slug>.body`；登记对话框默认 HMAC，Bearer 标注「https、无重放保护、别用于会叫醒的 path」 |
| 34 | 接受 | §8 §10 | IP 白名单只判 `req.socket.remoteAddress`，对话框说明「代理之后是代理的地址」；实例设置 `webhook.trustProxyHops`（默认 0）读右起第 N 跳 |
| 35 | 接受 | §12 | 配对码 = `{pairId, hookUrl(https，私网开关放开才允许 http), tokenA→B, exp: +10 min}`，一次性；完成走专用端点；pairId 绑一个 `peer` caller；重配对就地轮换两把；撤销一侧即两向失效；`X-VibeSpace-Peer-Version` 命名 payload 版本 |

反驳：无——39 条全部接受或部分接受；部分接受的三处（6/37、9、12、14）差别只在落法。

## 2. 概念映射（v3 §1 修订）

| 概念 | 落在 | 变化 |
|---|---|---|
| Webhook channel | adapter 行 `{ id: 'webhook', kind: 'webhook' }`，模块声明 `removable: false, consent: null, reach: 'grants', listed: true, seed: true` | 不用 `builtin`；引擎播种循环泛化为"声明了 seed 的模块"；reach 走 AgentReach 授权（会话 / 账号两粒度）；进列表、进 first-screen 候选 |
| path | 会话 `convId = slug`；会话行 + 声明的每会话 options 行 `{ textPath, senderKey, titleKey, facts: [{key, path}], rateLimit, ipAllow, disabled }` | policy 只走现有 setPolicy 门；options 经 `store.index.update` |
| caller | 会话对面的 external peer：`{ id: 'c-<8hex>', name, kind: 'system'|'peer', auth: 'hmac'|'bearer', tokenHash | tokenEnc, generation, delivery: {mode: 'none'|'reply-url'|'poll', replyUrl}, registeredAt, rotatedAt, lastCallAt }` | 「登记 caller」（不叫 invite）= 铸 token 显示一次；名字进 people.json 与 `participants`；作者 `{ id: 'caller:c-…', name: 登记名, isBot: true, external: true }` |
| "我" | `sendAs: ['user']`；对外 `from.name` = path 的 `fromName`（默认 "VibeSpace"） | 不新造身份词 |
| 谁能看 | AgentReach（会话 / 账号粒度） | 同 Lark |
| 谁被叫醒 | 现有 watcher：`mode: 'all'`（默认 digest）或规则 `from-address caller:<id>` / 关键字 / regex / `subject` / 新增 `fact <key> == <value>` | 不加 from-caller / every-message 种类 |
| 一次调用 | 经推送门的 `ChannelRecord` | §5 |
| 回复 | `reply … --to <记录 id>`（caller 由记录推出）/ `compose --caller <id>[,<id>]|all`（一 caller 一 proposal） | `--to` 的含义与 Channels CLI 一致 |

## 3. 能力行（契约字面；`validateCaps` 必须在模块加载时通过）

```js
caps = {
  kind: 'webhook', vendorName: 'Webhook', glyph: 'robot', titleForm: 'name',
  receive: 'push', pushTransport: 'http-inbound', pushAckBudgetMs: 2000, pushOptIn: false,
  history: 'page', olderHistory: 'none', listConversations: true,
  sendAs: ['user'], identityMarking: 'marked', identityMarkingWhere: 'from', identityMarkingText: 'the caller sees from: {name: <the path\'s fromName>} — never an agent',
  policyModes: ['direct', 'review'], policyDefault: 'direct', honestyLine: 'never', sendStartsTurn: false,
  replyEnvelope: true, compose: true, prepareSend: true,
  idempotency: 'key',
  threads: { read: 'none', replyInto: false, listing: 'none', placements: ['chat', 'quote'], rootReply: 'quote' },
  reactions: { read: 'none', add: false, remove: 'none', vocabulary: 'names', custom: 'none', perMessageMax: null },
  attachments: 'none', sendAttachments: null, sendAttachmentsWhy: 'a webhook reply carries text only (phase 2: attachments by URL + sha256)',
  avatars: null, avatarsWhy: 'a caller is a system; it has no picture',
  facts: ['sender', 'event', 'subject'],   // + the per-path declared keys, each a FACT_SCHEMA row of type line
  readReceipts: false, editSent: false, retention: 'keep', tosRisk: 'none',
  budget: { unit: 'request', default: 60, settingKey: 'channels.budgetWebhookPerMin' },
};
```
新的闭集值各一行 + 契约套件一行：`pushTransport` + `'http-inbound'`；`policyModes` / `policyDefault` / `honestyLine` / `prepareSend` 若在 2.369.24x 尚未成为行（012 设计的 Slack 车道已引入 `policyModes` 与 `prepareSend`——以集成树为准），由 L1 补齐并在 validateCaps 里按名拒绝。

## 4. 入站门

- **豁免与解析**：auth.js 一行 `req.method === 'POST' && /^\/hook\/[a-z0-9][a-z0-9-]{0,62}$/`（+ pair 路由一行）；server.js 的全局 `express.json` 跳过 `/hook/` 与 pair 路由（与 `/proxy/` 同一处）；路由自己 `express.raw({ type: '*/*', limit: '256kb' })`，JSON / form 最后解析。
- **顺序（PURE `src/webhook-auth.js` 的 `verdict(step)`，套件逐步钉死；被拒的调用不读 body、不存记录）**：① method ≠ POST ⇒ 405（任何 slug）→ ② 陌生人门（每客户端地址 30 次/min，1 000 地址；int248 r2：只计 ①–⑤ 被拒的请求——证明了身份的 caller 只受自己的 rateLimit，它的 poll 也不计）⇒ 超出时存在与不存在的 slug 同答 429 → ③ slug 语法，保留名 `~side` / `groups` 拒 → ④ 本 slug 的 caller 查找（禁用的 path、零 caller、不存在的 slug 都继续跑一次 dummy `tokenMatches`，计时同形）→ ⑤ Bearer（`bearerOf`，`tokenMatches` 常量时间）或 HMAC 头齐全 + 时间窗 5 min → ⑥ Content-Length > 256 KB ⇒ 413 → ⑦ 原始读 → ⑧ 签名（`v1=hmac(token, ts + '.POST./hook/' + slug + '.' + body)`）→ ⑨ 每 caller 重放备忘 `(callerId, signature)`（容量 rateLimit × 10 min，溢出 401 同形并计数）→ ⑩ 幂等：`eventId = vendorId = <callerId>:<Idempotency-Key>`（无键 ⇒ `<callerId>:<sha256(body)[:32]>`）；每 caller 的 `(key → body sha256)` 备忘，同键异体 ⇒ 409 → ⑪ 每 caller 限速（429 + Retry-After，只在鉴权后）→ ⑫ 解析（JSON / form，415 其它）。401 对 token 错、slug 不存在、path 禁用、零 caller 同形。
- **门**：路由把 `{ convId: slug, eventId, record }` 交给 `live.start({onEvent})` 登记的发射器（引擎的 `onPushEvent`：先落盘、按 eventId 去重（有界 5 000）、再索引 / 广播 / `onFresh` 规则漏斗）；`onEvent` 返回 `persisted: true` 才答 200；洪水 = 推送通道的合并窗（fence 12）。`auth.state()` 恒答 `connected`（agents 的形状）。
- **回执（200）**：`{ ok: true, receiptId: <HMAC(callerToken, recordId) 截 16 hex>, path: slug, reply: { mode } }` + poll 时 `pollUrl`；没有计数、没有内部 id、没有任何关于叫醒 / 规则 / agent 的字。

## 5. 记录

`src/webhook-record.js`（PURE）对完整解析体求值（≤ 256 KB；路径深度 ≤ 16、路径长度 ≤ 256、无过滤器 / 脚本 / 通配）：`text` = `textPath` 命中的字符串（否则整体 pretty JSON 代码块，皮带截断），`facts` = `sender`（senderKey 的值）+ `subject`（titleKey）+ 每 path 声明的 `facts[]` 键（每个一行 FACT_SCHEMA 的 `line`，经 validateFacts 与皮带），`author = { id: 'caller:<id>', name: <登记名>, isBot: true, external: true }`，`replyTo` = `X-In-Reply-To` 头（我们发出的 replyId），`threadKey` = `X-Thread-Key`，`raw` = 前 8 KiB（截断时卡片说明），`vendorId` 见 §4。记录 id = 仓库默认 `${adapterId}:${convId}:${vendorId}`。卡片 = `agentBlock`（头 `### Channel message — Webhook · <path 名>`，`from caller c-7f3a "CI deploy-bot" · sender: deploy-bot`，facts 行，`Reply with: vibespace-channels reply webhook/<slug> "…" --to <记录 id>`）。可清：record-clear 新增 `channel-webhook` 种类——清 text / raw / facts，保留作者与 id（§13 不问，设计定）。

## 6. 规则与叫醒

- 没有新的规则种类，除 `fact`：`fact <key> == <value>`（一行 RULE_KINDS、一张真值表、对话框 + CLI `--fact key=value` 两扇门），只对 §5 的 facts 求值，永不对 raw。
- 「每条都叫醒」= watcher `mode: 'all'`；在 webhook 会话上其默认动作是 `digest`（合并窗内一条），选 `wake` 要在对话框里明选并看到预算行。「某个 caller 的消息」= `from-address caller:<id>`。
- **每 path 叫醒预算**：会话 options 行 `wakesPerHour`（默认 6），引擎在 `paceVerdict` 之前对该会话的每个 watcher 判一次；拒绝语「path <slug> 本小时已用 N / M（叫醒了 <会话> 于 <账号>）」只给 owner 与 agent，caller 的回执沉默；付钱的是被叫醒会话的 pool 席位（`poolMemberOfSession`），设计写明。
- owner 自己：单 caller 的 path 是 `dm` 会话 ⇒ first-screen 的 `direct` 标签；多 caller 走 assigned / read / held / awaiting；没有「规则指向 owner」。

## 7. 回复

| 写法 | 去向 | 判定 |
|---|---|---|
| `vibespace-channels reply webhook/<slug> "…" --to <记录 id>` | 该记录的作者 caller（`replyEnvelope(convId, {anchorId})` 由 `author.id` 推出） | 记录不存在 / 不在本会话 ⇒ `not-found`（`reply-anchor-elsewhere`）；作者 caller 已撤销 ⇒ `send-not-available`，why 列出现存 caller |
| `vibespace-channels reply webhook/<slug> "…"`（无 `--to`） | 单 caller ⇒ 它；多 caller ⇒ 拒绝 `ambiguous-caller`，列出 caller，exit 1，什么都没发 | PURE `webhook-reply.js` 从 `prepareSend` 产出 |
| `vibespace-channels compose webhook/<slug> --caller <id>[,<id>]\|all "…"` | 指定 caller / 全部：**一个 caller 一个 proposal**（outbox 列 N 条、N 个回执） | `prepareSend` / `composeCaps` 对 path 的 caller 校验，`COMPOSE_MAX_RECIPIENTS` 兜底；`delivery: none` 的 caller 按名拒 |
| owner 手工 | Channels 窗口回复框 = reply（caller 随记录）；「发消息…」= compose 的「发给谁」选择器 | 同一扇门 |

- policy：path 默认 `direct`（§11⑤），可改 review——现有 setPolicy 门；守卫（链接 / 附件 / 非工作时间）照旧；`honestyLine: 'never'`：诚实行永不附加。
- 送达 `reply-url`：共享 `src/egress-fence.js`（解析一次、连判过的地址、不跟随 3xx、默认 https、`webhook.allowPrivateReplyUrl` 放开私网）；body `{ path, inReplyTo, replyId, at, from: { name: fromName }, text }`，`replyId = <callerId>:<hmacHex(该 caller 的 key, "reply:" + proposalId)[:16]>`（verify r1 #0 / int248 r2：与 receiptId 同法、每 caller 不透明——实例的出站计数与毫秒钟不出门；`vendorMessageId` 即它，`X-In-Reply-To` 照常对上；peer 线的 Idempotency-Key 也是它），签名用该 caller 当前代的 token；2xx ⇒ `sent`，拒连 / 4xx ⇒ `failed`，已发出后的超时 / 重置 ⇒ `unknown`（`detail.lost`）；`reconcile()` ⇒ `{unknown: true}`（没有 caller 侧查询）——人工重发是唯一重试，回执这么说；响应体 ≤ 64 KiB、`withoutSent` 去签名、皮带 2 KiB 后才进回执。`send()` 发送时重读 caller：撤销 ⇒ `not-found`；轮换 ⇒ 新 token。
- 送达 `poll`：每 caller 有界队列 `data/channels/webhook/replies/<slug>/<callerId>.ndjson`（200 条 / 7 天，丢弃计数在 path 行与下次 poll 的 `dropped`）；proposal 直接 `sent`，回执「已排队等 <caller> 拉取」；`GET /api/channels/webhook/<slug>/replies?since=<游标>&wait=25`（它自己的 token；每 caller 的游标，不透明）；长轮询每次醒来复核 `generation`，撤销 / 轮换 ⇒ 401 结束。
- 送达 `none`：`--caller` 它 ⇒ 按名拒绝。
- `send()` 返回 `vendorMessageId: replyId`，于是 `reply-to-sent` / "replied" 照常。

## 8. 存储

- `data/channels/adapters.json`：`{ id: 'webhook', kind: 'webhook' }`（播种，无 token）。
- 会话行（index）：path 的 title / `participants`（caller 名）/ policy（现有门）/ 声明的 options 行（§2）。
- `data/channels/webhook/callers.json`：`{ [slug]: Caller[] }`——adapter 的唯一凭据文件，writeJsonAtomic，0600；Bearer 行 `tokenHash`（pairing-token `webhook` 种类），HMAC 行 `tokenEnc`（secret-box `data/.channels-key`）；`generation` 每次轮换 +1。
- 记录 `data/channels/msgs/webhook/<slug>.ndjson`；poll 队列见 §7；people.json 的 caller 名；reach / 规则 / outbox / 回执 / 审计 = 现有存储。
- 备忘（内存，有界）：重放、409、每 IP、每 caller 限速；重启即空（可能重复一条记录，不会丢一条）。
- IP 白名单（int248 r2 改，verify r1 #2 / #10）：判 `clientIp` 给出的客户端地址——与陌生人门同一个；`webhook.trustProxyHops`（默认 0，设置表一行，Helm chart 的 ingress 后面 = 1）；/hook、caller 的 replies poll、配对完成走同一个 PURE `allowVerdict`。

## 9. token 去向普查

- 铸造：pairing-token 新种类 `webhook`（前缀 `vswh_`）；secret-shapes R4 加前缀；secret-scan 同步。
- 明文**只**出现在：登记 / 轮换的 HTTP 响应里一次（铸 → 原子写 → 响应；写失败 ⇒ 500 且不显示）。**绝不**出现在：任何 GET、digest 广播、`store.audit`、日志行、callers.json（只有哈希 / 密文）、agent 转录（没有 owner CLI；agent 无 webhook 动词）、记录（/hook 对 `vswh_` 前缀的 body 401 同形拒）。
- 比较：Bearer `tokenMatches`（常量时间）；bearer 读取 `bearerOf`（不走正则）。
- 套件：`test-webhook-token-sinks`（test-dial-token-sinks 的形状：对日志、审计环、广播、转录 stash、paths / callers 文件做运行时普查，种一个泄漏作对照）。

## 10. 围栏

1. caller 隔离五条（v3 §2）各一腿 + RED 对照：不能 @（payload 里的 @ 只是文字）、读不到记录（只有自己的回复与回执）、回执无内部事实（§4 形状普查）、token 只认自己、`from` 永远 fromName（`honestyLine: 'never'` 也在此腿）。
2. 先拒后读：§4 的顺序逐步钉死；一个 300 KB 坏 token 的请求不读 body；`req.body` 在任何拒绝路径为 undefined。
3. 同形：401 对不存在 / 禁用 / 零 caller / 错 token；405 对任何 slug；429 由每 IP 门限对存在与不存在同答。
4. 有界：重放、409、限速备忘按 §4 容量，溢出 fail-closed 并计数；poll 队列 200 / 7 天；raw 8 KiB；响应体 64 KiB。
5. 出站：`src/egress-fence.js` 是回 POST 的唯一客户端；egress 普查新腿「owner 配置的主机，经 addressVerdict」；私网只在 `allowPrivateReplyUrl` 下。
6. 钱：每 path `wakesPerHour`，`mode: 'all'` 默认 digest，拒绝语点名 path 与会话，caller 沉默。
7. 配对（§12）：完成走专用端点，PURE 判定在记录之前，只写 caller 行；一次性码 10 min；重配对就地轮换。
8. 作者：`author.name` 永远登记名；senderKey 只成 fact。

## 11. 路由表行 + 门禁

| 块 | 层 | 文件 | 门禁 |
|---|---|---|---|
| 鉴权与顺序（§4 ①–⑫）、备忘容量、同形 | PURE | `src/webhook-auth.js` | `test-webhook-auth`（每步一腿 + RED；拒绝路径 `req.body` 未触碰；dummy 比较计时同形；300 KB 坏 token 不读） |
| 记录与映射（§5） | PURE | `src/webhook-record.js` | `test-webhook-record` + test-channel-record 的 FRAME 普查（caller 文本经皮带；深度 / 长度界） |
| `--caller` / 无锚判定（§7） | PURE | `src/webhook-reply.js`（adapter 的 `prepareSend` / `replyEnvelope` 调用） | `test-webhook-reply`（单 / 多 caller、撤销、`all` 展开、`none` 拒） |
| 出站围栏 | SHARED | `src/egress-fence.js`（`addressVerdict` 上提 + 解析一次连判过地址的 fetch） | `test-egress-fence`（每类地址 + rebinding 解析器 + 3xx 不跟随）+ `test-channels-egress` 新腿 |
| adapter（§3 行、`live.start` 发射器、`send` / `reconcile` / `replyEnvelope` / `compose` / `composeCaps` / `prepareSend` / `history` 空答 / `convCaps` 含 `audience: 'external'`） | ORCH adapter | `src/channels/webhook.js` | `test-channel-adapter-contract`（行可注册；闭集新值）+ test-channel-caps（`honestyLine: 'never'` 开关下无诚实行）+ `test-channel-placement` 普查 |
| 路由：`POST /hook/<slug>`、`/api/channels/webhook/<slug>/replies`、`/api/channels/webhook/<slug>/pair`、owner 的 `/api/channels/webhook/*`（path CRUD、登记 / 轮换 / 撤销、配对码） | ORCH | `src/routes/webhook.js` | `test-webhook-routes`（真 server：auth.js 豁免行 pin；全局 JSON 跳过；`vsst_` / `jbt_` bearer 打每条写 ⇒ 403 `agent-forbidden`；两 caller 的回执无公共前缀无单调计数；长轮询被撤销 ⇒ 401） |
| 引擎：声明的 `reach: 'grants'` / `listed` / `seed` 取代 `builtin` 分支；每 path 叫醒预算；`mode: 'all'` 的 digest 默认 | ORCH | `src/server/channels-engine.js`、`channels-access.js` | `test-architecture` 普查（无 `builtin` 分支）+ `test-channels-engine`（预算在 paceVerdict 前；digest）+ `test-spend-paths` 普查 |
| 规则 `fact`（一行 + 真值表 + 两扇门） | PURE + UI | `src/channel-filter.js`、`channel-watch-spec.js`、`channel-filter-editor.js` | 规则套件 + CLI 套件 |
| token | PURE | `src/pairing-token.js`（种类 `webhook`）、`src/secret-shapes.js` | §68 普查 + `test-webhook-token-sinks` |
| UI：Webhook 节、新建 path、caller 面板（登记 = 一次显示、轮换、撤销、送达方式、HMAC 默认）、「发消息…」选择器、预算行 | 前端 | channels-panel / channel-window / channel-account-dialogs | heavy chrome 腿 + PNG（桌面 + 390） |
| 互联（§12） | PURE + ORCH | `src/webhook-pair.js`（码的铸 / 验 / 一次性）+ routes | `test-webhook-pair`（过期、二次使用、http 拒、重配对就地轮换、完成帧打到 /hook ⇒ 401 且 msgs/ 无行） |

## 12. 分期：三条车道 + 验证镜头

- **L1 server（adapter + 门 + 回复）**：§3 行与闭集新值；§4 的鉴权与顺序；§5 记录；`live.start` 发射器；§7 的 reply / compose / 送达 / reconcile；`egress-fence.js`；callers.json 与 pairing-token 种类；`reach: 'grants'` 等声明取代 `builtin` 分支；每 path 预算与 digest 默认；规则 `fact`。真 server 套件。
- **L2 UI**：Webhook 节（不可移除、无登录、进列表）、新建 path 向导（映射、facts 键、限速、白名单与代理说明、policy）、caller 面板（登记一次显示、HMAC 默认、轮换 / 撤销、送达方式）、规则 / reach 接入（现成对话框 + `fact` 规则行）、回复框与「发消息…」的 caller 选择器、预算行与拒绝语、chrome 腿 PNG（桌面 + 390）。
- **L3 CLI + 文档 + 互联骨架**：`vibespace-channels reply / compose --caller` 的话与 `read` 头部的 caller 列表（id、名、送达、最近调用、代）、`vibespace-docs channels`、agent 手册（提议登记用 `vibespace-ask`）、kb-api / kb-features / design as-built；§12 的配对码 + 专用完成端点 + `peer` caller（一期只到"可配对、规范 payload 直译"，artifact 交接二期）。
- **验证（credential + peer-content 类，≤ 3 轮）镜头**：token 混用（A 的 token 打 B 的 slug）、重放（Bearer 捕获 + 新幂等键 ⇒ 文档写明的限制；HMAC 重放拒）、跨 caller 幂等键（命名空间）、回执 / poll 的信息泄露（计数、前缀、内部 id、诚实行）、caller 文本的 frame 注入（皮带）、senderKey 冒充（作者名不动）、SSRF（私网 / rebinding / 3xx / NAT64）、洪水下的钱（预算、digest、谁付）、撤销 / 轮换竞态（长轮询、in-flight send、显示前写盘）、配对帧打到 /hook、agent bearer 打 owner 路由、300 KB 坏 token 不读。

## 13. OWNER QUESTIONS（意见迫使决定换说法的；推荐在前；每题只答是 / 否）

1. **【推荐：是】** ④「多 caller 必须 `--to`」改为：回复某条记录（`reply … --to <记录 id>`）自动回给那条记录的 caller，不用再指名；只有不针对某条记录的消息才必须 `compose --caller <id>|all`。保证不变（永远不会发错人），只是写法跟 Channels CLI 一致。同意吗？
2. **【推荐：是】** ⑤ 的三种规则落法改变、能力不变：「某个 caller 的消息」= 现有 `from-address caller:<id>`；「每条都叫醒」= 现有 watcher 的「全部」模式；「按字段」= 建 path 时声明要提取的字段，规则对提取出的字段匹配（新增一种 `fact` 规则），不对原始 JSON 跑路径。同意吗？
3. **【推荐：是】** 每条 path 默认每小时最多叫醒 6 次（可改），「每条都叫醒」在 webhook 上默认合并成摘要再叫；超出时 owner 与 agent 看到「path 已用 N / M」，caller 看不到。同意吗？你会看到：path 设置里一行预算、规则对话框里的预算行。
4. **【推荐：是】** §12 的互联形状登记为 docs/design-instance-pairing.md（B-9069）的候选方案 3，并把旧文档标为「由 webhook 设计 §12 取代」。同意吗？答「否」= 旧文档保持搁置，§12 只作本设计的附录。


## 14. As-built — L1 server（2.369.249，lane webhook-l1-server）

以下记 L1 实际落地与 v4 字面不同或补充之处（L2 / L3 在其后追加各自的 as-built）。

- **文件**：PURE `src/webhook-auth.js`（①–⑫ 的 `verdict(step)` + 有界备忘，加密原语由路由注入）、`src/webhook-record.js`（映射 + 界 + 记录）、`src/webhook-reply.js`（reply / compose 的去向判定）；SHARED `src/egress-fence.js`（`addressVerdict` 从 app-manifest 上提于此，src/app-serve.js 改从此读）；ORCH `src/channels/webhook.js`（能力行、callers.json 存储、poll 队列、send）、`src/routes/webhook.js`（门、caller 的 poll、保留的 pair、owner 路由）。
- **头**：HMAC 三头 `X-Webhook-Caller` / `X-Webhook-Timestamp`（unix 秒）/ `X-Webhook-Signature: v1=<hex>`；`Idempotency-Key`；`X-In-Reply-To`、`X-Thread-Key`；`X-Event` ⇒ `event` fact。
- **facts**：FACT_SCHEMA 加两行——`event`（line）与 `fields`（parties：每个声明键一个 party，id = 键、name = 值），于是"每 path 声明的键"不必是闭集的行；`fact` 规则对 kind 自身的值或 `fields` 中同 id 的项判等（不分大小写），永不读 raw。能力行 `facts: ['sender','subject','event','fields']`。
- **能力行**：与 §3 一致，唯 `budget` 不带 `settingKey`（webhook 不是 manifest 列表里的 vendor，没有设置表行）。`PUSH_TRANSPORTS` 闭集 = `ws-long-conn | pubsub-pull | long-poll | http-inbound`（long-poll 为 placement 套件的 Telegram 固件所用）。`honestyLine` 闭集 `option | never`；`policyDefault` 须在 `policyModes` 内；`sendStartsTurn` 布尔；`caps.kind` 须为自身。
- **builtin → 声明的事实**：模块声明 `removable / consent / reach（grants | msg-acl） / listed / seed`；agents 声明 `msg-acl / listed:false / seed`，记录上仍投影 `builtin: true` 供客户端（L2 可改读 `listed` / `reach`）。播种：`http-inbound` 的模块在服务器挂了入站门处（`deps.httpInbound`）播种，push 声明 `exclusive`（入站门是唯一来源）。test-architecture §88 普查：src/server、src/channels（agents 除外）不再有 `.builtin` 分支。
- **鉴权落点**：auth.js 一行豁免 `/hook/<slug>`（任意方法——非 POST 由路由答 405，满足"405 对任何 slug"）+ caller 的 `GET …/replies` + `POST …/pair`。server.js 的全局 JSON 在同一处跳过 `/hook/` 与 pair。签名的密钥：HMAC caller = 其 token；Bearer caller 的回 POST / 回执 / 游标用 `sha256(token)`（记录只存哈希，caller 可自算）。
- **回复**：`replyEnvelope(convId, {anchorId, implicit})`——无 `--to` 时引擎选最新记录并带 `implicit`，多 caller ⇒ `ambiguous-caller`（`detail.named` 让引擎按名转出）；`compose --caller` = 引擎 `composeEach(ctx, adapterId, convId, {text, recipients})`：adapter 的 `prepareSend` 展开并判一次，再逐个 `propose({recipient})`，提案的信封 `pinned: true`、无锚。
- **预算**：会话 options `wakesPerHour`（owner 路由建 path 时写，默认 6）；`wakeNow` 在 `paceVerdict` 之前判（test-spend-paths §12 钉序），拒绝语 `path <slug> used N / M wakes this hour (woke <会话>[ on <账号>])`（账号由可选 `deps.accountOfSession` 给出，未接线时省略）；带预算的会话上 `mode:'all'` 未写 notify ⇒ `digest`。作用域 digest（账号级 watcher）尚未计入每 path 预算——L2/L3 或下一轮。
- **record-clear**：新种类 `channel-webhook`（清 text / `raw.callText` / facts，保留作者与 id；只 owner），经 channel-store 新门 `rewriteRecords`。`raw` = `{callText, bytes, cut?}`（字段名避开 `body`：record-clear 普查把每个文本字段名当汇点读）。
- **replyName**：§2 / §7 的 path `fromName` 落为选项 `replyName`（默认 "VibeSpace"）——test-peer-text-census 的 fromName 普查把 `fromName` 一词留给发往 ladder / stash / 卡片的投递；回 POST 的 body 仍是 `from: { name }`。
- **pair**：`POST /api/channels/webhook/<slug>/pair` 今答 `501 pair-reserved`（L3 填）。

## 15. As-built — L2 owner surface（2.369.249，lane webhook-l2-ui）

- **门控**：账号视图新投影 `pushTransport`（能力行原值）；客户端 `offersPaths(a)` = `http-inbound`——Webhook 节的「New path…」、path 行的 robot 静音头像、窗口的「Callers… / Send a message…」都按它，不判 kind（test-channel-caps 普查五个文件）。
- **向导**：slug 用服务端同一个 PURE `slugProblem`（`null | grammar | reserved`）实时说话，建 path 的路由也改用它；`replyName` 留空即服务端默认 "VibeSpace"；policy 选 review 时创建后走现有 `PUT …/policy`；最后一步给地址 + Copy +「Register a caller…」。
- **token 一次**：登记 / 轮换的回答只交给 `showTokenOnce`（Copy、"Shown once — rotate to get a new one."、关掉即丢）；caller 列表模型 `callerRow` 只取具名字段。test-webhook-ui §2 普查 + 变异对照。
- **多端**：L1 的 `syncRow` 只写索引不广播，另一端要等下一轮才看到新 caller——改为写完调用引擎 `notify(['webhook/<slug>'])`；caller 面板订阅 `channels-updated`，按 caller id 键控就地更新。
- **发消息**：新 owner 路由 `POST /api/channels/webhook/paths/:slug/send {text, callers: ids|'all'}` ⇒ `composeEach({kind:'user'}, …, {direct:true})`，一 caller 一 proposal；选择器里 delivery none 的 caller 禁用并在旁写原因；结果逐条 toast（已发 / 已排队等 poll / 失败附服务端原话）。
- **预算**：会话视图新字段 `wakeBudget = {used, lim, spent, why}`（引擎 `pathBudgetVerdict` 的结论）；窗口头部显示「path <slug>: N / M wakes this hour」，用尽时显示引擎原话；Notify 对话框在有预算的会话上新通知默认 digest，并列预算行。
- **回复框**：引用一条调用 ⇒ 框下「to <caller> (caller)」；无引用时单 caller 写它，多 caller 指向引用或「Send a message…」；path 上不显示 Reply all（回复只去一个 caller）。规则对话框加 `fact` 行（键 + 值）。

## 16. As-built — L3 CLI + 文档 + 互联一期（2.369.249，lane webhook-l3-cli-pair）

- **CLI**：`vibespace-channels compose webhook/<slug> --caller <id>[,<id>]|all "…"` → agent 路由 `POST /api/agent/channels/compose {conv, caller}` → 引擎 `composeEach`（一 caller 一 proposal，逐行打印）；`reply` 被拒且答里带 callers（`ambiguous-caller` / `delivery-none` / `caller-revoked`）⇒ 逐行 `c-… "名"` + 两条出路，exit 1；`read webhook/<slug>` 在记录前打印 `callers:` 头（id、名、kind、送达、最近调用、代）——adapter 新增 `callersOf`，经 wrapper 透传、`readFor` 附在答里（无 key / 哈希 / URL）。CLI 的答复门 `answerOf`：读到的每个 server 答复（6 处）先经此解析，`vswh_…` 一律成 `vswh_[withheld]`（peer-text 普查禁止改绑 console）；动词闭集，无登记 / 铸 token / 配对动词（test-webhook-cli 普查 + 两个 RED 对照）。
- **`vibespace-msg list`**：它只列会话，不列 channel 会话——path 以 `webhook/<slug>` 出现在 `vibespace-channels list`（heavy 腿钉）。
- **互联一期**：PURE `src/webhook-pair.js`。码 = `vswp_` + base64url(JSON {v, u: A 的 hook URL, c: A 为 B 留的 caller id, t: A 发给 B 的 token, n: nonce, e: 到期, m: A 的名})，10 min、单次；hook URL 判定（https，`allowPrivateReplyUrl` 才放 http；无凭据 / query；以 `/hook/<slug>` 结尾，前缀保留在 pair URL）。完成帧 `{v, nonce, hook, caller, token, name}`，签名 = A 的 token 对 `ts.POST./api/channels/webhook/<slug>/pair.body` 的 HMAC，头 `X-Webhook-Caller` = A 留的 id、`X-VibeSpace-Peer-Version: 1`。
- **路由**：owner `POST /api/channels/webhook/paths/:slug/pair-code {callerId?, name?}`（码只在此答一次；`callerId` = 现存 peer ⇒ 重配对）；owner `POST /api/channels/webhook/join {code, slug?, name?}`（B：判码 → 铸 B 发给 A 的 token → 经出站围栏 POST 完成帧 → 只在 A 答 200 后写 path + peer 行）；`POST /api/channels/webhook/:slug/pair`（L1 的 501 → 完成端点：先按头查待用码，查不到 ⇒ 同形 401 且一字节不读；`complete` = PURE 判定在唯一一次写之前；码随即作废）。完成帧打到 `/hook` ⇒ 帧内含 `vswh_` ⇒ ⑦ 同形 401、无记录。
- **peer 行**：`kind: 'peer'`、HMAC；`tokenEnc` = 对方出示的（本侧所发），`outEnc` + `outCaller` = 本侧在对方 path 上出示的（对方所发）；送达 reply-url = 对方 hook；重配对就地轮换（同 id、generation + 1），撤销同时删 `tokenEnc` 与 `outEnc`。发往 peer = 规范 payload `{text, threadKey, inReplyTo, attachments: [], from: {name}}`，以 `outCaller` 身份对 `/hook/<slug>` 签名（前缀不入签名）。`/hook` 收 peer 的调用用固定映射（作者 = 登记名，`from.name` 只成 sender fact；附件为链接行，二期再做 artifact 交接）；`X-VibeSpace-Peer-Version` 非 1 ⇒ 拒。
- **偏离**：待用码只在内存（≤ 32，重启即失效，owner 重铸）；配对只有 owner 路由（设计不设 owner CLI；Channels 窗口里的「粘贴配对码」框属 L2 / 后续）。
- **门禁**：test-webhook-pair（PURE + 两个进程内实例：码、加入、二次使用、过期、http、帧打 /hook、重配对、写在判定前的变异体 RED）、test-webhook-cli（真 CLI 对桩：reply / compose --caller / read 头 / 动词普查 / 输出门 + RED 对照）、test-webhook-token-sinks（+ 自配对：码与两把 token 只出现在 pair-code 一答）、heavy test-webhook-pair-e2e（两台真 server、真 CLI 两向、重配对后旧 token 401）。

## 17. Verify r1 → r2 as-built（int248，2.369.249；裁定见 /var/tmp/vibespace-lanes/webhook-design/verify-rel249-r1.md）

- **#0 replyId**：每 caller 不透明 `<callerId>:<HMAC(key, "reply:" + proposalId)[:16]>`（§7 改）；poll 答、reply POST 体、peer 的 Idempotency-Key 都不再带出站计数 `p-<ms>-<seq>`。
- **#1 / #12 配对码是凭据**：门在原始字节 ⑦ 与解码后的每个 JSON / form 字符串（⑫ 之后的 `credentialVerdict`，深度 32、20 000 串有界）上拒 `vswh_` 与 `vswp_`，同形 401；CLI 的答门与 agent 读的皮带把两者都写成 `…_[withheld]`。
- **#8 agent 读的 raw**：`agentCopy` 把 `raw` 每个字符串过 `agentText`（定点折叠），整份拷贝再扣凭据拼写；peer-text 普查有这一行。
- **#2 / #10 一个客户端地址**：`clientIp`（`webhook.trustProxyHops`，设置表一行，默认 0）同时喂陌生人门与 `allowVerdict`；/hook、replies poll（长轮询每次醒来复查）、配对完成都判白名单。`webhook.allowPrivateReplyUrl` 也有了设置行。
- **#4 陌生人门**：② 只问不计；只有 ①–⑤ 被拒的请求计数；证明身份的调用只受 caller 自己的 rateLimit（最多 600/min），poll 不计。
- **#9 重放备忘先查后记**：⑨ / ⑩ 只检查，记录持久化（或重复）之后才 `commit` 签名与幂等键；被 415 / 429 / 503 拒的调用原样重试照常判；已接受调用的重放仍 401。
- **#6 一个形状**：auth.js 豁免整个 `/hook` 前缀；`/hook/<slug>/`、`/hook/<SLUG>`、`/hook/x/y`、`/hook` 都是门的未命中（405 / 429 / 401 同形）。
- **#15 出站围栏**：加 SIIT `::ffff:0:a.b.c.d`、6to4 `2002::/16`（判内嵌 IPv4）、Teredo `2001:0::/32`（判服务器与去混淆的客户端 IPv4）、本地 NAT64 `64:ff9b:1::/48`（整段拒）。
- **#16 无幽灵 caller**：登记写行后索引 / 人名同步抛错 ⇒ `unregister` 收回该行，再答 500（无 token）。
- **#13 预算话语到 agent**：`read` 在 callers 头下打一行 `path <slug>: N / M wakes this hour (K held)`；仍被扣着的记录下面一行 `held — …; it rides the next wake`；caller 仍什么都听不到。
- **#3 Bearer 的两个限制说出来**：无重放保护（截获的调用换 Idempotency-Key 可重发）、回复签名用 sha256(token)——token 一次框、Signing 选择器旁、`vibespace-docs channels`、kb-api。
- **#14 / #17 卡片**：owner 卡片在 raw 被截时说「raw cut at 8 KiB (N bytes received)」；agent 的叫醒块在正文下带 adapter 声明的事实（`wakeFactKeys`：sender + 声明的 fields）。
- **不动**：#5（拒在读之前的固有性质）、#7（owner 路由的 CSRF，越出本车道，backlog B-60cf）、#11（后一次轮换胜出即设计）。
