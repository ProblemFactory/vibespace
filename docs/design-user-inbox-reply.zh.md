# 设计：For you 收件箱 — 回复、运行点、窗口迷你收件箱、提升使用率 (design-user-inbox-reply, 2026-09-23)

> owner 原话 (verbatim): "实际上现在inbox功能被利用的很少，原因是agent经常大量发inbox，然后我做为用户也没有什么方便的方法快速针对一个inbox message给出响应，而只能markdone和叉掉，建议 1. 给inbox item一个回复按钮，我可以直接回复某个inbox item，然后会自动变成消息发给这个agent（如果agent没在运行回复按钮就是灰色禁用并给tooltip，并且在inbox里这个agent的标题的地方用一个小点标记这个agent是否在运行。2. 在窗口标题栏同样增加一个mini inbox，只展示这个窗口对应的agent发送的消息，其他行为一致。3. 你可以思考下其他可能的UX改进增加使用率。"
> owner 的引用规则 (verbatim): "注意回复inbox item的时候 发给agent的消息得带有对应的引用信息"
> 英文孪生: docs/design-user-inbox-reply.md。版本 2.369.169 (一个 CHANGELOG 条目, 分块递增)。

## §0 一段话

一条 For-you 项得到一个**回复框**: 你在项上敲的字, 走**聊天输入框走的同一条服务端路径**(不是投递梯, 不过 spend authorizer —— 它是你自己打的字), 前面自动带上这条项的**引用块**(稳定首行 `[For you reply #<id>]` + 归档时间 + 原文 + detail 的前 1500 字), 于是 agent 知道自己在答哪一问; 发送成功即把项标为 done (`resolvedBy: 'reply'`), 回复文本留在项上("你回复了: …")。agent 没在运行 ⇒ 按钮禁用 + tooltip; 每个 agent 的分组标题带一个**运行点**(实心绿 = turn 进行中, 空心绿 = 活着空闲, 琥珀 = 停在等你, 灰 = 未运行), 事实来自客户端已经拿着的 `active-sessions` 载荷(新增 `turn` 一列, 服务端 1 s 派生, 绝不新增轮询)。每个聊天窗口的标题栏得到一枚**迷你收件箱**徽章(只数这个会话的未处理项, 0 时隐藏), 点开是同一个行渲染器的弹层。提升使用率: **选项芯片**(`vibespace-ask --options "A|B|C"` ⇒ 一键回复标签)、**行内一行回复**、**决策优先排序**、**洪水折叠 + 按 agent 全部已阅**、**看板状态芯片**现在做; 其余(打字即自动 resolve、死会话过期、j/k/r/d、按 agent 静音、未运行时暂存到下一 turn、终端会话回复)列为将来。

## §1 现状 (只读事实, 代码里读来的)

- **项** (`src/user-todos.js`): `{id:'ut-'+10hex, sessionKey, text ≤300, detail ≤2000|null, urgency low|normal|high|urgent, kind action|notice, status open|done|dismissed, by, sessionName, jobId, i18n, action, expiresAt, createdAt, resolvedAt, resolvedBy user|agent|system|expired}`; 按 (sessionKey, text) 幂等; 20 open/会话 (add 抛错并教), 1000 总量 (只裁已 resolved); `snapshot()` = open 按紧急度再按最新排序 + 最近 15 条 resolved; 每次变更 `user-todos-updated {todos}` 广播; 落盘 tmp+rename 防抖 500 ms。
- **一条项怎么知道自己的会话**: agent 路由 `POST /api/agent/user-todo` (vsst_ Bearer, `agentSession(req)` 找到 activeSessions 里持有这个 token 的会话) ⇒ `sessionStatusKey(s, id)` = `<backend>:<backendSessionId>`, 早期为 `webui:<id>` 并在下一次调用时 rekey。服务端生产者 (spend-guard / login-expiry / channels / jobs) 用自己的键: `accounts`、`jobs`、或 owner 会话的 `claude:<cid>`。
- **面板** (`src/lib/user-todos-panel.js`): `#taskbar-user-todos` 分段徽章 + `#user-todos-popup`(按会话分组, 组头 → 跳转; ✓/✕/↺ → `POST /api/user-todos/:id {status}`; ⤢ 查看器; detail 折在 `<details>`; Notices 独立区; 最近已处理尾巴); 手机入口 `#mobile-nav-todos` 用**同一个** `renderBtn` / `togglePopup`; 弹层打开期间行序 APPEND-ONLY (inc-mtw02kbq-kj96, PURE `user-todos-layout.js`: `openLayout/nextLayout/entriesFor`), 但每次广播仍然是 `popup.innerHTML = …` 整体重绘 —— 这正是本设计必须改掉的(一个正在打字的回复框活不过一次重绘)。
- **客户端已有的活事实**: `active-sessions` 载荷 (`activeSessionsPayload()`, server.js) 每会话 `{id, name, backend, backendSessionId, sessionKey, mode, host, remoteState, …LIVE_SESSION_FACTS}`; 侧栏 `_merge()` 给行加 `status:'live'` 与 `webuiId`。**它不带 turn 状态**: `_isStreaming` / `_turnState` 只以 per-session 消息发给已 attach 的窗口 —— 没开窗口的会话在客户端看不出是否在 turn 中。`_isStreaming` 在服务端有 9 个写点、5 个文件 (ws-handler / session-stdout / codex-events / acp-events / claude-stream-json) —— 逐点加广播 = 孪生漂移温床。
- **打字这条路** (`src/ws-handler.js` case `'chat-input'`): `session.pty && session.mode==='chat'` ⇒ 清 interrupt 定时器 → `adapter.formatChatInput(text, msgId)` (毒帧守卫 ⇒ `error code:'input-rejected'`) → >64 KB 帧文件旁路 (wrapper 能力门) → `_isStreaming=true`、`_userInputAt` (§22: 这是 owner 自己的 turn)、`autoResume.noteRecovered` → `/compact` 标签 → `pty.write(payload+'\n')` → `feedLive(userMsg)` (所有订阅者立即看到用户气泡) → 5 s stdin-ack 自愈。**turn 进行中也是同一条路**: 帧照写, 由 CLI/wrapper 自己排队 (claude = CLI 自己的队列; codex = `thread/queue/add`, `queue_changed` 发布到队列条)。这是唯一"跟你自己打字一模一样"的路径 —— 投递梯 (`conversation-deliver.js`) 是"别人的消息"(peer 卡片、spend authorizer、stash), 不是它。
- **钱的普查**: `scripts/test-spend-paths.mjs §2` 按 SITE 普查 `formatChatInput(` 等原语; ws-handler 那一处以 `ALLOW` 行豁免 ("THE HUMAN PATH")。ws-handler 里**只有这一处** `formatChatInput` ⇒ 把它抽走后该行必须**改指向**新文件, 否则 "no dead allowlist entry" 断言变红。
- **human-only 路由的范式**: `src/routes/reset-credit.js` — `isAgentBearer(req)` (vsst_/jbt_) ⇒ `403 agent_forbidden`; cookie 认证由 `auth.middleware` 对每条非 `/api/agent/*` 路由施加。
- **可复用的组件**: `createPopover(anchor, cls, opts)` 自带 `data-popover` (全局 Esc 逐层关); `createModalShell`; `UI_ICONS`; 窗口标题栏 `setOwnerBadge(id, badge)` = 键控的标题栏徽章范式 (titleSpan 后的兄弟节点, tab 化时由 `_renderTabBar` 画); 手机上 `.usage-popup` 在 ≤768px 变整宽 sheet, `#user-todos-popup .ut-act` 已抬到 36 px。

## §2 D1 回复语义 (定案与默认值)

**D1.1 路径 = 打字的那条路, 抽成一个实现。** 把 ws `'chat-input'` case 的主体抽成 `src/server/user-input.js` `createUserInputSender(deps)` → `send(sessionId, text, {msgId, origin}) → {ok:true, msgId} | {ok:false, code, error}`; server.js 构造它(它已持有全部依赖: activeSessions / adapterRegistry / BUFFERS_DIR / broadcastToSession / feedLive / autoResume / reattachLocalPty / ptyQuietSince), 经 ctx 交给 ws-handler (`WS_CTX_CONTRACT` +1 键 `sendUserInput`, 三面同提交: 契约 / 解构 / 调用点 —— test-ws-contract 钉住), 也交给回复路由。ws case 变薄: `const r = sendUserInput(...)`; 只有 `input-rejected` / `too_large` 仍映射成今天的 `{type:'error', code:'input-rejected'}` 帧, 无会话 / 非 chat 仍是静默 `break` (行为逐字不变)。回复**不过** spend authorizer (owner 的逐次动作, D6 的"打字不计"), **不过**投递梯; spend 普查的 `ALLOW` 行从 `src/ws-handler.js#user-frame` 改指向 `src/server/user-input.js#user-frame`, why 照抄 "THE HUMAN PATH" 并加一句"回复路由是同一个函数的第二个调用者"。路由文件自身不拼帧 ⇒ 普查里没有第二个 site。

**D1.2 发给 agent 的文本 (owner 的引用规则)。** PURE `src/inbox-reply.js` (CJS, 零依赖, 进 bundle) `composeReply(item, replyText, {now})`:

```
[For you reply #ut-3f9a1c2b7d]
> filed 12 min ago (2026-09-23 06:02 UTC) · urgency high
> Approve the migration plan before I continue
> detail:
> Options: A) run now  B) wait for tonight's backup. I recommend B.
> options: run now | wait for backup
> … (detail cut at 1500 of 1987 chars — `vibespace-ask list` prints the whole item)

wait for backup — and tell me when it is done.
```

- 首行**逐字** `[For you reply #<id>]` (英文, 协议值, 永不 i18n —— agent 侧文本不翻译, 且英文最好 grep); 正则 `^\[For you reply #(ut-[0-9a-f]{10})\]$`。
- 引用块每行 `> ` 前缀: 第 1 行 归档时刻 (相对 + UTC 绝对) 与紧急度; 然后原文 `text` 整条 (≤300); 有 `detail` 则 `> detail:` + detail 逐行前缀, **只取前 `DETAIL_QUOTE_CAP = 1500` 字符**, 截断时追加 `> … (detail cut at 1500 of N chars — …)` 一行 (没截断就没有这一行); 有 `options` 则 `> options: A | B | C`。服务端生产者的 i18n 项用其英文 `text`/`detail` (store 的去重键 = agent 的契约)。
- 空行, 然后回复正文逐字 (`REPLY_MAX = 4000` 字符, CRLF 归一; 超长 ⇒ 400 `too_long`, 空白 ⇒ 400 `empty`)。选项芯片的回复正文 = 标签本身。
- `parseReply(text) → {id, quote, reply} | null` 是逆向 (渲染器与手册共用同一实现); `composeReply` 与 `parseReply` 互为 fixture (往返表 + 恶意字符串原样穿过 —— 这是文本不是 HTML)。
- 整帧 < 6 KB, 永远碰不到 64 KB 帧文件门, 但共享 sender 照样处理它。

**D1.3 agent 看到什么。** `docs/agent/ask-manual.md` 新增 `## Replies from the inbox`: 首行形状、引用块各行、截断标记、`options` 行、"回复正文可能正是你给的某个标签"; agent 路由的教学段 (`agent-routes.js` ~1697) 只加一个 `[--options "A|B|C"]` 与一句 "the user can reply from the inbox: the message opens with `[For you reply #<id>]`"。手机/桌面一致。

**D1.4 回复之后这条项。** 路由顺序: 判定 → 发送 → 成功才 `userTodos.resolveByReply(id, text)`: `status:'done'`, `resolvedBy:'reply'`, `reply:{text ≤4000, at}` (新字段; 已 resolved/dismissed 的项**也接受回复** —— 回复只因投递原因被拒, 从不因簿记: 此时保留原 `resolvedBy`, 只写 `reply`), ONE save + ONE broadcast。面板: 已处理行的 meta 说 `你回复了: <前 80 字>` (escHtml), 查看器全文; `resolvedByText('reply')` = t('by your reply')。agent 若之后又 `vibespace-ask resolve` 同一 id ⇒ 幂等 no-op (已 done)。

**D1.5 可用性阶梯 —— 一个判定, 两种投影。** PURE `replyVerdict({item, session}) → {ok:true} | {ok:false, code, why}` (`src/inbox-reply.js`), 服务端喂真实会话记录的投影 `{live, mode, remoteState}`, 客户端喂 `active-sessions` 载荷的投影; 码与句子一致:

| 情形 | 客户端 | 服务端 |
|---|---|---|
| 键是 `accounts` / `jobs`, 或 `item.jobId` (答案面是 job 面板 / Manage Agents) | 按钮**不渲染** | 409 `no_session` / `job_item` |
| 会话不在 activeSessions (未运行) | 禁用, tooltip "agent 未运行 — 打开会话后再回复" | 409 `no_live_session` |
| `mode !== 'chat'` (终端会话) | 禁用, tooltip "终端会话 — 在它的窗口里回复" | 409 `not_chat` |
| `remoteState` 非 null (主机不可达) | 禁用, tooltip "主机不可达 — 恢复连接后再回复" | 409 `host_unreachable` |
| 正常 (空闲或 turn 中) | 启用 | 发送 |

turn 进行中不禁用: 帧照写, 会话自己的发送模式接手 (默认排队; codex 的队列条会显示它; claude 由 CLI 自己排队)。客户端判定只决定按钮态; 服务端判定是真门 (两台客户端之间几秒的陈旧态就靠它)。

**D1.6 失败必达。** `fetchJson` 不抛 ⇒ 面板检查 `r?.ok`; 任何非 ok 都 toast: `无法回复: <why>` (why 来自 `replyVerdict` 的句子, 或路由的 `error`); 码表: `not_found` 404 · `empty`/`too_long`/`input_rejected` 400 · `no_session`/`job_item`/`no_live_session`/`not_chat`/`host_unreachable` 409 · `agent_forbidden` 403 · `send_failed` 500 (pty.write 抛)。回复框保留文本, 不清空。

**D1.7 运行点 = 已有事实 + 一列。** 服务端 `src/server/turn-facts.js`: PURE `turnOf(s)` = `s._turnState==='requires_action' ? 'waiting' : s._isStreaming ? 'running' : 'idle'`; `turnDigest(activeSessions)`; server.js 一个 1 s unref 定时器: 摘要变了才 `broadcastActiveSessions()` —— **派生, 不在 9 个写点上各加一手**(view-visibility.js 的"派生、绝不写"法)。载荷新增 `turn`; 侧栏 `LIVE_SESSION_FACTS.turn: {digest:null}` (只携带 —— 每个 turn 两次的变化若参与门控就是 2.72.0/2.106.1 那类列表重绘抖动; 侧栏卡片今天也不画它)。客户端 PURE `liveDotState({live, remoteState, mode, turn})` (`user-todos-layout.js`) → `running` 实心绿 · `idle` 空心绿 · `waiting` 空心琥珀 (harness 自己的 requires_action = "停在等你") · `unreachable` 虚线灰 · `off` 实心灰; tooltip 各一句。面板订阅 `active-sessions` 消息, 只改 `.ut-live-dot[data-key]` 的 `data-state`/title —— 键控芯片, 不重绘行。

**D1.8 聊天卡片。** 这条消息在 CLI 与转录里就是用户消息 (`typed:true`); 渲染器**按文本**认标记首行 (`parseReply`) ⇒ 卡片头 `For you · 回复 #<id>` + 折叠的引用块 (`<details>`, 默认收起) + 回复正文。规则来自文本 ⇒ 活流与历史两条载体一致 (2.369.112 的两载体律), 不需要新 originKind。

**D1.9 多客户端与原地重绘。** 所有变化仍走 `user-todos-updated` 一条广播; 面板改为**键控行**: `renderPanel` 对已有 `.ut-item[data-id]` 只 patch (dot / meta / 已处理态 / 芯片), 新行 append, 消失的行 remove; 一个**有焦点或有文本的回复框永不被替换** (a3 键控芯片律 + inc-mtw02kbq-kj96 的槽位律)。`user-todos-layout.js` 的槽位算法不变, 只是消费者从"生成 HTML 串"变成"对账 DOM"。

**将来 (列出, 不做):** ① 未运行时"暂存到下一 turn" (投递梯 rung 3 stash + 项上 `pendingReply`; 走 stash 就要过 ladder 与 authorizer, owner 先定); ② 终端会话回复 (往 TUI 敲键: 模式未知, 危险); ③ 从系统通知 (toast) 直接回复。

## §3 D2 窗口标题栏的迷你收件箱

- `window.js` `setInboxBadge(id, {count, urgency})` — `setOwnerBadge` 的孪生: `win._inboxBadge`, 键 `count:urgency`, titleSpan 之后的 `.win-inbox-badge` 按钮 (`UI_ICONS.inbox` + 数字, `data-urgency` 上色), 0 ⇒ 移除; tab 化时 `_renderTabBar` 照画 (tab-group.js 的 `_ownerBadgeEl` 旁加 `_inboxBadgeEl`); `setTitle` 不吞它 (它是 titleSpan 的兄弟)。
- 数据: 面板模块是客户端**唯一**的项存储 (`todos`); 它维护 `keyByWebuiId` (来自 `active-sessions` 载荷的 `sessionKey`, 加 `webui:<id>`) 并在每次 `apply()` 与每次 `active-sessions` 后对 `app.sessions` (winId → view, `view.sessionId` = webuiId) 逐窗调用 `setInboxBadge` (只 chat/terminal 会话窗; 计数 = 该会话键的 open **action** 项, notice 不计)。
- 点击 ⇒ `openMiniInbox(anchorBtn, sessionKey)`: `createPopover(anchor, 'ut-mini-popover', …)` (自带 `data-popover` ⇒ 全局 Esc 逐层关, 先关它再关面板), 内容 = **同一个行渲染器** `renderRows(entries, {mini:true})` 过滤到该键 (含该键的 resolved-in-place 行, 同一槽位律, 弹层生命周期内 append-only); 动作全同 (回复 / 选项 / ✓ / ✕ / ↺ / ⤢); **jump 是 no-op** (就在这个窗口); 广播 ⇒ 弹层原地对账。
- 手机: 标题栏徽章一样; 弹层走 `.usage-popup` 整宽 sheet 规则; 面板 sheet 同样得到回复框 (同一渲染器, 无第二份)。
- 快捷键: 可选, 不做 (Ctrl+\ 前缀键表已满; 记为将来)。

## §4 D3 提升使用率 — 逐项打分

评分: 价值 / 成本 / 风险 / 现在还是以后。

| # | 选项 | 价值 | 成本 | 风险 | 决定 |
|---|---|---|---|---|---|
| a | **选项芯片** `--options "A|B|C"` (≤6 个, 每个 ≤40 字, 去重; 行上一键回复标签; 引用块带 `options:` 行) | 高 (决策类 = 最多的 ask, 一键完) | 中 (CLI + 路由 + store 校验 + 芯片 + 手册 + 教学行) | 低 | **现在** (chunk 1+2) |
| b | **行内一行回复** (Enter 发, Shift+Enter 换行, Esc 收起, 文本随广播存活) | 高 | 中 | 低 | **现在** (chunk 2) |
| c | "在别处答了"自动 resolve (owner 在该会话打字后 N 分钟内 resolve 其 open 项) | 中 | 低 | **高**: 误 resolve (打的字与问题无关; 一会话多问只答一问) ⇒ 训练用户忽视收件箱, 正是要治的病 | **以后**; 替代: agent 已被教 `resolve`, Stop 钩子提醒; 迷你徽章本身就是提醒 |
| d | **洪水折叠**: 一组 open > 5 ⇒ 只展开最新 5 行 + "还有 N 条" 展开器 (打开期间记住展开态); **按 agent "全部已阅"** (`POST /api/user-todos/resolve-many {ids, status:'dismissed'}`, ONE 广播) | 高 (owner 抱怨 #1 = 量) | 中 | 低 (dismiss 可 ↺) | **现在** (chunk 4) |
| e | 死会话陈旧项过期 (spend notice 的 `expiresAt` 先例) | 中 | 低 | 中: 远程/离线主机的会话"看不见"≠死; 一个 ask 不因为 agent 停了就不需要答 | **以后**; 不推断, 若做则由生产者声明 (`vibespace-ask --expires 24h`) |
| f | **决策优先排序**: 同紧急度内带 `options` 的先 (store 的 `snapshot()` 排序键, 各客户端一致) | 中 | 极低 | 无 | **现在** (chunk 1) |
| g | 键盘 j/k/r/d | 低-中 | 低 | 低 | 以后 |
| h | **看板状态芯片**: 组名旁显示 `session-status` 的 state (needs-input / blocked / review / working; 客户端已有 `_sessionStatuses` 与其广播) | 中 | 低 | 无 | **现在** (chunk 4) |
| i | 按 agent 静音 | 低 | 中 | 中 (静音的是"需要你"的项) | 以后; d 已答"刷屏" |

现在做的精简集 = a + b + d + f + h。

## §5 D4 构建分块 (≤4, 每块自带门与 kb)

**Chunk 1 — 服务端核心: 一个发送器、引用、路由、turn 事实、选项。**
文件: `src/server/user-input.js` (新, 抽自 ws case), `src/ws-handler.js` (case 变薄; `WS_CTX_CONTRACT` + `sendUserInput`), `server.js` (构造 sender; 路由挂载; turn 定时器; `activeSessionsPayload` + `turn`), `src/server/turn-facts.js` (新 PURE), `src/inbox-reply.js` (新 PURE: `composeReply/parseReply/replyVerdict/REPLY_MARKER_RE/DETAIL_QUOTE_CAP/REPLY_MAX/normalizeOptions`), `src/user-todos.js` (`options` 字段校验 + 合并; `resolveByReply`; `snapshot()` 选项优先), `src/routes/user-todos-reply.js` (新: `POST /api/user-todos/:id/reply {text}` → `{ok:true, msgId, item}` | `{error, code}`; `isAgentBearer` ⇒ 403), `src/agent-routes.js` (`add.options` 透传; 教学行 `[--options]` + 一句回复形状), `data/bin/vibespace-ask` (`--options "A|B|C"`; `list` 打印 options), `docs/agent/ask-manual.md` (Replies 一节), `scripts/test-spend-paths.mjs` (ALLOW 行改指向), `package.json`/`package-lock.json` 2.369.169, CHANGELOG 条目 (后续块追加要点)。
腿 (`scripts/test-inbox-reply.mjs`, fast, 先红): PURE 往返表 (含 1500 截断标记、无 detail 无截断行、options 行、恶意字符串原样、CRLF 归一、超长/空拒绝); `replyVerdict` 表 (五种投影); store (`options` 校验: 7 个/41 字/非字符串/去重 抛名; `resolveByReply` 对 open ⇒ done+reply, 对 dismissed ⇒ 保留 resolvedBy 只写 reply; 排序 options 优先; ONE broadcast); 路由 over 假 express + 真 sender + 真 claude adapter + **录音会话 stub** `{mode:'chat', pty:{write→wrote[]}, _isStreaming, _remoteState, backend:'claude'}`: 空闲 ⇒ 恰一帧, 文本 = `composeReply(...)`, `_userInputAt` 已盖, `_isStreaming` true, 项 done/reply, feedLive 被调一次; turn 中 (`_isStreaming:true`) ⇒ 帧照写 (排队是会话自己的事); 未运行 ⇒ 409 `no_live_session` 零写入 项仍 open; 终端 ⇒ 409 `not_chat`; `remoteState:'unreachable'` ⇒ 409; vsst_ ⇒ 403 零写入; jbt_ ⇒ 403; 超长 400; 未知 id 404; **wiring pin**: ws-handler 的 case 不再拼 `formatChatInput` 而调 `sendUserInput`; 负控 = 去掉 `isAgentBearer` 的补丁副本放 vsst_ 通过。还要跑: test-spend-paths (ALLOW 行改后普查绿, 无死行), test-ws-contract, test-architecture, test-user-todos-layout, test-user-todos-expiry, test-session-schema (若 `_userInputAt` 之外有新字段 ⇒ 先登记), `npm run build`。
kb: kb-file-structure (user-todos.js / ws-handler.js / agent-routes.js / 新三文件各一段), kb-api (路由 + 载荷 `turn` + 广播里的 `reply`/`options`), kb-features (收件箱一节), CLAUDE.md 三行索引 (≤300 字, ⇒ 指针)。

**Chunk 2 — 面板: 键控行、回复框、选项芯片、运行点、手机 sheet、i18n。**
文件: `src/lib/user-todos-row.js` (新: ONE 行渲染器 `renderRow(entry, ctx)` + `patchRow(el, entry, ctx)`, 全部 escHtml, SVG 只来自 icons.js), `src/lib/user-todos-panel.js` (对账式 `renderPanel`; 回复框 `.ut-reply` textarea 1 行自增, Enter 发 / Shift+Enter 换行 / Esc 收; 选项芯片 `.ut-opt`; 组头 `.ut-live-dot`; "你回复了"; `active-sessions` 订阅只 patch dot), `src/lib/user-todos-layout.js` (PURE `liveDotState`, `replyButtonState` 投影), `src/lib/sidebar.js` (`LIVE_SESSION_FACTS.turn: {digest:null}`), `public/style.css` (主题变量; ≤768px 块里回复框与芯片 ≥36 px), `src/lib/i18n-zh.js` / `i18n-ja.js`。
i18n 键 (英文为键; zh+ja 各一条): 'Reply' / 'Reply…' / 'Send reply (Enter) · newline (Shift+Enter)' / 'Agent not running — open the session, then reply' / 'Terminal session — reply in its window' / 'Host unreachable — reconnect, then reply' / 'You replied: {text}' / 'by your reply' / 'Could not reply: {why}' / 'Reply sent' / 'running (mid-turn)' / 'running, idle' / 'waiting for you' / 'not running' / 'host unreachable' / 'Reply with "{label}"'。
腿: test-user-todos-layout 新 ⑥⑦ (dot 表 + 投影表 + wiring pin: 面板 import 行渲染器, 无第二份 itemHtml); **chrome 腿** `scripts/test-inbox-reply-ui.mjs` (heavy; test-mobile-gaps 的骨架: worktree 服务器 + scratch HOME + stub `claude` 经真实 create 路径; `ONBOARDED_SOURCE` 先于每次 navigate): ① 种入恶意项 (title `<img src=x onerror=window.__xss=1>`, option 标签 `"><svg onload=…>`, detail 同) ⇒ 行 textContent 等于原串, `window.__xss` 未定义, 芯片文本原样; ② 活会话 (stub) 组头 dot `idle`, 回复启用; 输入 + Enter ⇒ stub 的 stdin 收到首行为标记的帧 (stub 把 stdin 落盘), 行原地翻成已处理 + "你回复了", 聊天窗口出现回复卡 (折叠引用); ③ 停止的 fixture 会话 ⇒ 按钮 disabled 且 title = tooltip 句; ④ 回复框里有字时用 stub 的 vsst_ (stub 把 env 落盘) 再 `POST /api/agent/user-todo` 一条 ⇒ 广播后回复框与文本仍在, 新行 append 在组末; ⑤ 点选项芯片 ⇒ 帧的回复行 == 标签; ⑥ 390×844 sheet: 同一回复框, 目标 ≥36 px, Esc 关 sheet; ⑦ 负控: 用 `innerHTML = raw` 的补丁副本让 `__xss` 变 1 (证明腿能红)。
kb: kb-file-structure (user-todos-panel.js / user-todos-layout.js / 新 row 文件 / sidebar.js 的 LIVE_SESSION_FACTS 一行), kb-features, kb-design-lessons §17 若有新约定; kb-patterns 一行 ("键控行对账")。

**Chunk 3 — 标题栏迷你收件箱。**
文件: `src/lib/window.js` (`setInboxBadge`), `src/lib/tab-group.js` (`_inboxBadgeEl` + tab 渲染), `src/lib/user-todos-panel.js` (`keyByWebuiId`, 逐窗 `setInboxBadge`, `openMiniInbox` 复用行渲染器, jump no-op), `public/style.css`, i18n ('{n} items from this agent' / 'Inbox for this session')。
腿: chrome 腿追加 ⑧ 徽章计数 = 该会话 open action 数, 0 隐藏; ⑨ 点开弹层 = 同一行集, 从弹层回复 ⇒ 同 ②, 徽章归零消失; ⑩ Esc 先关弹层再关面板 (data-popover 逐层律); ⑪ 合并成 tab 后 tab 上有徽章; ⑫ 徽章 XSS: 会话名不进 innerHTML。test-window-types / test-ax-paint 若钉 titleBar 子节点 ⇒ 更新 (徽章 `aria-label` 带数字, 图标 aria-hidden)。
kb: kb-file-structure (window.js / tab-group.js / user-todos-panel.js), kb-features。

**Chunk 4 — 使用率精简集: 洪水折叠 + 全部已阅 + 看板芯片 (+ 排序已在 chunk 1)。**
文件: `src/lib/user-todos-layout.js` (PURE `foldGroup(entries, {max:5, expanded})` → 可见行 + 隐藏数), `src/lib/user-todos-panel.js` (展开器 `.ut-fold`; 组头 "全部已阅" `.ut-seen-all` ⇒ 一次 POST; 看板芯片 `.ut-board` 读 `app.sidebar._sessionStatuses[key].state`), `server.js` 或 `src/routes/user-todos-reply.js` (`POST /api/user-todos/resolve-many {ids, status}` owner-only, ≤200 ids, ONE save/broadcast: store `setStatusMany`), i18n ('{n} more…' / 'Mark all seen' / 'needs input' / 'blocked' / 'review' / 'working')。
腿: test-user-todos-layout ⑧ (fold 表: 5/6/50 行, 展开态, 槽位律下折叠只隐藏不移动); test-inbox-reply.mjs 路由腿 (`resolve-many`: 200 上限, vsst_ 403, 未知 id 部分成功报名, ONE broadcast); chrome 腿 ⑬ (30 项的组折成 5 + "还有 25 条", 展开, "全部已阅" ⇒ 全部原地划线, 徽章清零)。

*实际建成 (2.369.169, 块4):* `foldGroup` 另收 `prev` (弹窗打开期间上一次绘制的 shown/hidden id —— 显示过的行不再被藏, 藏着时被处理的行继续藏着, 新到的项并入折叠); "全部已阅" 放在组头按钮**旁边**的 `.ut-group-bar` 里 (按钮不能套按钮); store 快照的 `resolved` 尾巴改为最新 15 条 + 最近一小时 (≤ 250) —— 平的 15 条让 30 行的批量处理在打开的弹窗里消失了 15 行划线行。chrome 腿落为 ⑮ ⑯, layout 表为 ⑨ ⑩ (⑧ 已被块3占用)。
kb: 同上三处 + CHANGELOG 收尾 (一个条目, 四块要点, 门数)。

## §6 门与不变量 (每块提交前自查)

- 回复路由: cookie 认证 (middleware 天然覆盖 `/api/user-todos/*`), `isAgentBearer` ⇒ 403; **不在** spend 普查里成为新 site (路由不拼帧); 不进 `SPEND_REASONS` (不是无人 turn)。
- 无静默失败: 每个非 ok ⇒ toast 点名原因; 回复框保留文本。
- XSS: 项标题 / detail / 选项标签 / 会话名 / 回复文本全部 escHtml 或 textContent; 引用块是**文本**进 CLI, 卡片渲染时再 escHtml。
- 多客户端: 只有 `user-todos-updated` 与 `active-sessions` 两条已有广播; 面板/弹层/徽章全部原地对账; 回复框永不被重绘吞掉。
- 持久化: store 仍是 tmp+rename; 新字段 `reply`/`options` 走同一 `_save`。
- i18n: 所有新 chrome 字串 `t()` + zh/ja; 协议串 (`[For you reply #…]`, `options:` 行, 码名) 永不翻译。
- 图标: icons.js 的 SVG (`inbox`, `refresh`, 新增 `reply` 若无); 主题变量; `createPopover`/`createModalShell`; `data-popover` Esc 逐层。
- 载荷/事实: `turn` 只携带不门控; 派生自 1 s 摘要, 不碰 9 个写点。
- 手机: `#mobile-nav-todos` 同一 popup ⇒ 自动获得回复框; 触摸目标 ≥36 px 在 ≤768px 块里声明。
- 版本/文档: 2.369.169, 一个 CHANGELOG 条目; 每块同提交更新 kb; CLAUDE.md 索引行 ≤300 字带 ⇒。

## §7 待 owner 的两点 (默认已选, 可改)

1. 标记首行用英文 `[For you reply #<id>]` (协议值不翻译; 例子里的"回复"改成了英文) —— 若要中文可只换这一行常量, 手册同改。
2. 终端会话 (`mode:'terminal'`) 的项: 默认**禁用并说明**, 不往 TUI 敲键; 若 owner 要, 下一步做"暂存到下一 turn"或 cli-inbox 投递 (后者是"别人的消息"形状, 过投递梯)。

## §8 按来源分组的通知 (B-328d, 2026-09-24, 已建成)

> Owner: 原本以为花费通知会有第三个收件箱标签页, 结果发现它们埋在所有通知里。建前已定: **不做** Spending 标签页 —— 通知区按**产生它的生产者**分组, 上方是筛选芯片, 两个标签页的标签带计数。

- **字段。** 每个条目带 `origin`, 一个**封闭集合**, 定义在 PURE `src/inbox-origin.js` (CJS, 零依赖; store、普查与 bundle 共用一个拼写): `spend` (spend-guard.js) · `login` (login-expiry-watch.js) · `pool` (usage-pool-engine.js 的 reset-credit 询问) · `jobs` (jobs-wiring.js) · `channels` (channels-engine.js, 五处) · `browser` (browser-handback.js + 浏览器路由的切换提议, 由 mounts-plugins-wiring.js 接线) · `agent` (agent-routes.js = `vibespace-ask`) —— 恰好是会建条目的那些生产者 (r2 删掉了 `system` 行: 从来没有谁以 `by: 'system'` 建过条目, 它描述的是一个不可能出现的分组)。数组顺序即分组顺序。初稿里的 `mounts` 被删掉: mounts-plugins-wiring.js 里唯一的 `add()` 是浏览器切换提议, 存储侧没有任何生产者会建条目。
- **store。** `add({…, origin})` 经 `normalizeOrigin` 校验: 没给 ⇒ **抛错** `origin required (one of …)`, 什么都不建 (r2, 失败即关闭 —— r1 的默认 `agent` 让普查看不见的生产者悄悄落进 Agents); 集合成员 ⇒ 原样; 其它一律**按名抛错** (`origin must be one of spend/login/…`), 什么都不建。每个调用方都要声明: agent 路由写 `agent`, 每个服务器生产者写自己的, 每个测试夹具显式写。重复建同一条目时**保留**已声明的 origin (条目的生产者不会变); 字段出现之前建的旧条目, 被一个声明了 origin 的生产者重建时取其声明。`snapshot()` 与 `user-todos-updated` 广播原样携带。
- **不迁移: 旧条目规则。** B-328d 之前落盘的条目没有 origin, 在**读取时**由**唯一**的 PURE 函数 `originOf(item)` (src/lib/user-todos-layout.js) 归类: 已声明的成员 ⇒ 原样; 否则 `sessionName === 'Spending'` ⇒ spend (spend-guard 在每条上冻结的名字), `'Channels'` ⇒ channels, 其余 ⇒ agent (三行; r2 删掉了从未有生产者产生过的 `by === 'system'` 行)。只为已经在盘上的条目写一次, **永不扩展** (新生产者在调用处声明); 集合之外的 origin (更新的服务器写的, 或伪造的字符串) 走同一规则。接受的后果: 旧的 login / pool / jobs / browser 条目读作 `agent` —— 它们全是 ACTION, 通知区本来就不列。
- **普查 (store 抛错旁边的第二道门)。** test-user-todos-layout ⑪ 遍历 src/ 下所有 `.js` 与 server.js 里**任何接收者上的每一个两参数** `.add(` / `?.add(` (r2 —— r1 只匹配 `userTodos.add(` / `todos.add(`, 别名的 store 或 `?.add` 都能绕过; DOM 的 `classList.add(a, b)` 与注释行除外), 读每个调用的**顶层**选项 (注释、模板串主体、嵌套对象都丢掉 —— action 载荷自己的 `origin:` 永远不算): 每处必须写出一个集合内的字面量 `origin:`, 且是它所在**文件**生产的那个 (文件 → origin 表); 未知的生产者文件、错误的 origin、拼写错误、不再建条目的 PRODUCERS 行、没有生产者的 origin (r2 起没有豁免) 全部按名失败。套件里的负控: 去掉 origin 的 spend-guard 副本、种植的生产者、声明成 `agent` 的 jobs 调用、嵌套的 origin、拼写错误、`mounts` 与 `system` 死行, 以及 (r2) 别名的 store、`?.add`、来自变量的选项对象 —— 在 r1 的匹配下三者都是全绿。建成时: 12 处, 全部已声明。
- **算术 (PURE, src/lib/user-todos-layout.js)。** `noticeGroups(notices, filter, {prev})` → `[{origin, label, entries, open, total, shown}]`, 新打开时按集合顺序; 弹窗打开期间 `prev` (上次绘制的 origin 列表) 让每个分组守住槽位, 新 origin **追加**在末尾 (inc-mtw02kbq-kj96 的槽位律用到分组上); 被筛掉的分组以 `shown: false` 返回, 从不丢弃。`noticeChips(notices, {prev})` → `all` 在前 (未处理通知总数), 然后每个**出现的** origin 一枚, 顺序同分组, 各带未处理数 (某 origin 的行全被原地处理掉时, 行还占着槽位, 芯片留着显示 0)。`noticeFilterFor(filter, notices)` → **生效中的**筛选: 其 origin 还有通知时是 `filter`, 否则 `all`; 面板**持有**这个答案 (r2 —— 见面板一条)。`tabCounts(open, toastHistory, lastSeenTs)` → `{inbox: {action, notice, urgency}, history: {unread}}` —— `action` 即 `badgeCounts` 的数 (任务栏徽章的数), `urgency` 其最高级, `unread` = 比上次查看更新的 toast 历史条数 (没有记录 ⇒ 全算; 面板在安装时补记)。
- **面板。** 通知区 = 标题、`.ut-chips` 芯片条 (`role=group`; 只有 ≤ 1 个 origin 时隐藏 —— 只有一组时筛选毫无意义) 与 `.ut-notice-groups`: 每个 origin 一个 `.ut-notice-group[data-origin]`, 组头 (origin 的词经 `t()` + 未处理数) 与经**唯一**行对账器 (`reconcileRows`, 唯一的行渲染器) 的行。芯片与分组按 `data-origin` 键控原地修补; 点芯片设置筛选 (再点当前芯片 = 全部), 其它分组被**隐藏** (`display: none`) 而不是删除 —— 任何行上的回复框保留节点与文字; 上方的询问分组不受影响。筛选**按设备** (`localStorage vibespace.ut-notice-filter`, 默认全部, 关掉再开仍在), 且弹窗打开期间**被持有** (r2): 每次打开时读取, store 加载后每次绘制都经 `noticeFilterFor` —— 其 origin 没有通知时答案 `all` **就成为**筛选, 既持有也存储, 于是芯片条与设备一致, 之后到达的通知永远不会改变显示内容 (只有点芯片才是选择)。r1 让存储值不动 ("该 origin 的下一条通知会把选择带回来"): 一条携带这种通知的广播随即悄悄重新套用它, 在激活的"全部"芯片下其它分组全部消失 —— inc-mtw02kbq-kj96 那一类问题, 粒度是分组。分组顺序按每次打开。标签条每次打开只建**一次**然后修补: 收件箱 = 按最高级着色的未处理询问数 (徽章的规则; title 就是任务栏徽章那句话 —— 同一个 `actionWords`) + 灰色通知数; 通知 = 这台设备上次查看之后的 toast 数 (`localStorage vibespace.ut-history-seen`, 每次显示该页时记录, 没有记录的设备在安装时补记, 升级后不会一打开就是 100 条"未读"); 新 toast 原地加一。切页只替换标签条下方的页面, 输入到一半的回复作为草稿保留。手机: 同一个底部面板, 芯片 ≥ 36 px。
- **不变。** 过期 (花费通知仍按 `expiresAt` 消亡; 组头对此只字不提); 标题栏迷你收件箱 (只列 ACTION; 徽章仍排除任何来源的通知 —— ⑪ 与 test-inbox-reply-ui ⑨ 钉住)。
- **门。** test-user-todos-layout ⑪ (集合、旧条目规则、分组/芯片/筛选/标签计数、持有的筛选、store 含失败即关闭的抛错与 `stop()` 的 flush、普查及其负控、接线钉、zh/ja); test-inbox-reply-ui ⑱c (r2: 选中登录到期, 其唯一通知在别处被忽略, 重开弹窗 ⇒ 显示并存储"全部"; 该通知在别处被重新打开 ⇒ 每个分组仍显示, "全部"仍激活 —— 在 r1 面板上 2 条按名失败复现了这次翻转), ⑰ (真页面上的芯片与分组; 真实点击芯片隐藏其它分组, 而每个询问行、每枚芯片、标签条和输入到一半的回复框都保留节点; 筛选中新建的通知落进隐藏的分组, 其芯片与灰色标签计数原地加一), ⑱ (真 toast 让通知标签原地加一, 显示该页即清零, 标签条节点从不重建, 输入的回复以草稿回来; 筛选跨关闭/打开保留), ⑲ (忽略筛选的 `noticeGroups` 补丁副本显示全部分组), 手机面板腿。本块跑过的负控: 把 user-todos-panel.js 换回本块之前的版本跑整套 ⇒ 11 条按名失败 (⑰ ⑱ ⑲ 的钉与手机腿)。
- **r2 (对抗验证者一轮, 2.369.169)。** 四条发现, 每条先复现再修, 并由一条在 r1 树上会失败的腿钉住: ① *广播重新套用了一个打开时其分组不存在的存储筛选* —— 在激活的"全部"芯片下其它分组全部消失, 没有任何点击 (无头复现: 存储为 `login`, 其唯一通知被忽略, 重开弹窗, 一条登录通知到达) ⇒ 筛选按每次打开**持有**, 答案 `all` 被存储 (见上面面板一条; ⑪ 的 PURE 行, UI 腿 ⑱c); ② *store 对每个调用方都把缺失的 origin 默认成 `agent`, 两种普通写法 (别名的 store、`?.add`) 绕过了普查* ⇒ `add()` 抛出 `origin required`, 普查计入每一个两参数 `.add(`, 两种绕过都成为负控; ③ *`system` 从构造上就是死行* (从来没有谁以 `by: 'system'` 建过条目) ⇒ 从集合、标签与旧条目规则里删除; ④ (既有问题, 修复范围可控) *`stop()` 留着 500 ms 的写定时器* ⇒ `stop()` 立即 flush。按验证者的 info 保留不改: 通知页的未读数包含用户自己的反馈 toast (规格原文如此; 若不想要, 按 toast `type` 过滤是开关), 以及 test-mobile-gaps 的截图目录不被回收 (属于另一个套件)。
