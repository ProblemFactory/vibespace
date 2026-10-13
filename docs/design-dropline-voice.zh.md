# 设计：Dropline 语音输入插件 — q-029

owner 2026-10-12 已裁定：作为 plugin；用户自己登录或给 key；先在聊天输入框。设计台（Fable）2026-10-12。只设计，不建、不跑门。API 事实以题目 + 本目录 dropline-docs.txt（2026-10-12 抓取，文档日期 10-08，API「preview，免费，可能变」）为准。

**一句话**：插件 `voice-input`（「语音输入 · Dropline」）= 开关 + 用途开关 + 每种用途的输入计划；凭据是登记行 `dropline` 的两档（① 自己的 `dl_` key，② OAuth 2.1 PKCE，集群走集群 client + 中继页，和 Slack 行一样）；浏览器只录音，音频 → hub → Dropline，token 只在 hub；输入框多一个麦克风按钮，点一下录、再点一下停，文字落在光标处、Ctrl+Z 可撤；教 Dropline 默认关。

---

## 1 模型
- **插件**（src/plugins/voice-input.js + index 一行；契约 src/plugins.js:10–28）：`provides:['dictation']`；`status` = 已连接的账号（GET /v1/me 的 name/team，缓存 1 h）、今日次数、教学开关状态；`config` = 用途开关 `dictate`（随插件开）/ `teach`（默认关）+ 语言偏好（auto|zh|en，默认 auto）+ 本实例的每分钟上限；没有 `install`（无可装），`start/stop` = 开关。钥匙不在 data/plugins.json。
- **登记行 `dropline`**（src/integration-registry.js，决定 25：行与消费者同落）：`fields = apiKey(secret, 校验前缀 `dl_`) | clientId(集群预设或自注册得来) · relayUrl`；`clusterEnv: {json:'VIBESPACE_INTEGRATIONS', prefix:'VIBESPACE_INTEGRATION_DROPLINE_'}`；`test.kind:'credential-exchange'` = GET /v1/me，卡上写「已连接：<name> · <team>」；`consumers: ['src/server/dropline-client.js']`。两档和飞书/Slack 一样：**用户自填 key** > **OAuth（集群预设 client_id + 中继页；本地自注册 + GitHub Pages 中继页）** > 无。
- **唯一供应商面** `src/server/dropline-client.js`：`dictate(parts)`、`context(text,title)`、`terms(list)`、`me()`、OAuth 的 `register/authorize URL/exchange/refresh`；基址常量；test-vendor-whitelist 加主机 `api.dropline.fish.audio|api.fish.audio|fish.audio` 的 census 行 `{max: 6, gates: ['pluginOn', 'credentialOf', 'teachCap']}`，其它文件出现即红；设备守护进程为零。
- **token 存放**：登记行的 secret 存储（现有）；OAuth 对 = `{access, accessExp, refresh, refreshExp, clientId}`；**刷新单飞**（gmail.js:947 的 `refreshing` 形）；**轮换先落盘再用**（refresh 每次换新对，旧的立刻作废——写盘失败就不换）；刷新后仍 401 ⇒ 状态 `reconnect`（文档：「Refresh once, then ask the person to connect again」）。
- **归属**：实例 = 人（q-028 同法）；成员经频道使用的实例不碰它的 Dropline。
- **hub 代理** `POST /api/voice/dictate`（multer 内存，8 MB 上限，routes/files.js:416 的样子）：浏览器送 `audio`（webm/opus）+ `ctx`（§3 的 PURE 结果，hub 再裁一次）；hub 组 multipart **按文档顺序** request → context → audio；`single_line:false`，`locale` 取 UI 语言（zh-CN/ja-JP/en-US），`language` 取插件偏好；应答回 `{text, rewrite, transcript.language, request_id}`，音频不落盘不记日志。本实例上限 20 次/分（账号上限 30/分且与他的 Dropline 应用共享）。

## 2 决策表
| # | 决策 | 推荐（理由） | 谁定 |
|---|---|---|---|
| **D1 https** | 跨机 `http://<主机>:3456` 没有 `getUserMedia`，OAuth 回调也要 https | ① 现在：按钮在、按下说明白「这个页面不是 https，浏览器不给麦克风：用 https 打开，或在这台电脑上打开 http://localhost:3456」（复制按钮）；② **根治 = 独立车道 H0**：hub 同时听 https（默认 3457），证书来源三选一：**Tailscale 证书**（插件已在跑 tailscaled；`tailscale cert <node>.<tailnet>.ts.net` 是真证书，需 tailnet 开 HTTPS；到期前 30 天自动续）> 自签 + 一次信任（卡上显示指纹）> 只用 localhost。这同时修 Mac ARD 剪贴板（picture-shell.js:107 的 `pageIsSecure`）、未来 WebAuthn。~250 行 | **owner**：做 H0 吗；证书来源 |
| **D2 教 Dropline 默认值** | /v1/context 与 /v1/terms 会把对话里的名词送到 fish.audio 并记两周 | **默认关**；开关旁一句「会把当前对话里的名字、术语与文件名发给 Dropline（Fish Audio），它记两周并加进你的词库；凭据、附件、别的对话不发」；开着时按 §4 的计划与上限 | **owner**：默认关？ |
| **D3 context 来源** | 每次听写的 `context` 只给这次识别有用的 | §3 的表（PURE `dictationContext`） | 设计台 |
| **D4 OAuth 注册粒度** | 动态注册按 `redirect_uris` 发 client_id，无 secret、无更新接口 | **一个部署一个 client**：集群 = 集群预设里的 client_id，`redirect_uri` = 中继页（集群 admin 的 https 页；实例是 https 也走中继，免得每新实例重注册）；本地自建 = 插件卡「注册」按钮一次调 `/oauth/register {client_name:'VibeSpace', redirect_uris:[GitHub Pages 中继页]}`，client_id 存登记行。中继页复用 docs/slack-relay（state 清文多一个 `k` = 种类，回送 `<u>/api/channels/oauth/cb/<k>`——q-018 的参数化落地路由就是那一扇门，`relayTargetVerdict` 表不变）；`paste` 回退仍在（中继页显示码）。PKCE 的 `code_verifier` 在 hub 的流记录里（oauth-loopback `public` 模式 :138–144），浏览器不碰 | 设计台 |
| **D5 入口与手势** | 输入框先行；按住说 vs 点开点停 | **点一下开始、再点一下停**（按住在手机上和滚动/长按菜单打架，且 180 s 上限不适合按住）；麦克风按钮放 inputWrap 里 attachBtn 旁（chat-input.js:320–358；SVG、主题变量）；录音中按钮变成胶囊「● 0:12 ▮▮▮ ✕」（AnalyserNode 电平、时长，✕ 或 Esc 取消，170 s 自动停并提示），占位符换成「正在听…」；停后胶囊转圈等 Dropline（≈1–2 s，输入框仍可编辑）；文字用 `document.execCommand('insertText')` 落在**停止时**的光标处（替换选区），原生 Ctrl+Z 可撤，5 s 内一个小芯片「已插入 · 撤销」；`rewrite.status≠used` 时芯片说「按原话插入」；手机同一按钮（attachBtn 本来就只在手机显示，麦克风两端都显示）；编码 MediaRecorder `audio/webm;codecs=opus` 32 kbps（170 s ≈ 700 KB ≪ 8 MB） | 设计台 |

## 3 每次听写的 context（PURE `dictationContext(parts)`，总上限 4 KB；只在这次识别里用）
| 字段 | 来源 | 上限 / 截法 |
|---|---|---|
| `app` | 固定 `VibeSpace` | — |
| `title` | 会话标题（侧栏显示名）| 200 字符 |
| `url` | 不送（hub 地址带主机名，无识别价值）| — |
| `before` | 输入框光标前的文字 | 尾 1 000 字符（句末对齐）|
| `after` | 光标后的文字 | 头 500 字符 |
| `selected` | 选区（P2 的 edit 模式才有意义；P0 也送，帮它认词）| 2 000 字符 |
| `text` | ① 最近一条 agent 消息的可见文本头部（代码块保留标识符行、去掉框架文本）② 工作目录名 ③ 最近一条 agent 消息里出现的文件名 / 标识符 ≤ 20 个 | 1 500 字符；②③ 各一行 |
| 从不 | 凭据/环境变量、别的会话、附件内容、系统提醒框架、用户邮箱 | — |

## 4 教 Dropline（用途 `teach`，默认关；q-028 的 per-use 形）
| 什么 | 何时 | 内容 | 上限 |
|---|---|---|---|
| `/v1/context` | 一个会话里**第一次**听写时，之后每 10 min 至多一次（内容 hash 变了才发；API 自己 1 h 内同文跳过）| `title` = 会话标题；`source` = `VibeSpace`；`text` = 最近一条 agent 消息 + 用户最近 3 条 + 工作目录的文件名列表 | 6 000 字符；本实例 6 次/h |
| `/v1/terms` | 每会话每小时至多一次 + Settings 里「常用词」改动时 | PURE `termsOf(text)`：CamelCase / snake_case / 文件名 / Task Group 名 / 用户在「常用词」里写的 | 50 词/次（API 300）；本实例 6 次/h |
| 不教 | 凭据、URL 查询串、邮箱、附件、别的会话 | | |
Settings → 插件卡 → 「教给 Dropline 的内容」：开关、常用词框、最近发送的 journal（时间、标题、字数、added/skipped 计数）、「在 dropline.fish.audio/app 查看或清除记忆」链接（API 不能清）。

## 5 失败要说话（PURE `voiceWords(code)`，三语；按钮永远在，按下才说）
| 情形 | 芯片 / 提示 | 动作 |
|---|---|---|
| 不是安全上下文（无 `mediaDevices`）| 「这个页面不是 https，浏览器不给麦克风——用 https 打开，或在这台电脑上打开 {localhostUrl}」 | 复制 localhost 地址 |
| 权限被拒 | 「浏览器拒绝了麦克风——在地址栏的站点权限里允许」 | — |
| 未连接 / `reconnect` | 「先连接你的 Dropline」/「Dropline 登录已过期，重新连接」 | 打开插件卡 |
| 429 | 「Dropline 限流，{n} 秒后再试」（Retry-After）| 倒计时后按钮恢复 |
| 413 / 本地 170 s 停 | 「录音最长 180 秒、8 MB」 | — |
| 422 audio_invalid | 「录音没能读出，再试一次」 | — |
| 502/503/504 | hub 自动重试一次（文档：Retry once）；仍败 ⇒「识别这次失败了，再试一次」 | — |
| `rewrite.status` skipped/rejected/failed | 文字照插，芯片「按原话插入（Dropline 没有改写）」 | — |
| 网络断 / hub 不通 | 「没发出去——录音还在，再按一次重发」（保留 blob 60 s）| 重发 |

## 6 分期与车道种子（≤ 2 屏，细节到简报）
- **P0 voice-p0-key**（~1 100 行）：WHAT = 登记行 key 档 + 插件行 + dropline-client + `/api/voice/dictate` + 麦克风按钮/录音/插入/撤销 + PURE `dictationContext` + `voiceWords` + i18n + 插件卡。TESTS = test-voice-model（新 PURE：context 组装与每字段截法、4 KB 总限、框架去除、words 表全码、request 三部件顺序、locale/language 映射）；test-voice-proxy（假 Dropline http：multipart 顺序与 8 MB 拒绝、429 带 Retry-After 透传、401 ⇒ reconnect 词、502 重试一次后放弃、音频不进日志（控制：种一个 console.log(audio) 的突变体 ⇒ 红））；test-voice-chrome（注入假 `navigator.mediaDevices.getUserMedia` + 假 `MediaRecorder` 吐一段小 opus blob + 假 Dropline；点→录→停→文字在光标处、选区被替换、Ctrl+Z 撤回；✕ 取消不发；`isSecureContext=false` 的词与复制按钮；桌面 1280 + 手机 390 PNG）；test-vendor-whitelist 新主机行 + 种拷贝红；test-integration-registry 普查；record-clear 新字段行。
- **P1 voice-p1-oauth-teach**（~900 行）：WHAT = OAuth `public` 模式（kind `dropline` 落 `/api/channels/oauth/cb/:kind`，PKCE 在 hub，state HMAC）+ 集群预设 client_id/relayUrl + 本地「注册」按钮 + 中继页 `k` 字段 + token 单飞刷新与轮换落盘 + `reconnect` 门；`teach` 用途：context/terms 发送器、PURE `termsOf`、上限与去重、Settings 卡、journal。TESTS = test-oauth-loopback（public + kind）；test-slack-relay 扩表（k）；假授权服务器（register 发 client_id 无 secret、authorize 校 S256、token 换对、refresh 轮换：旧 refresh 再用 ⇒ 拒；写盘失败 ⇒ 不换）；teach 的上限/去重/不发列表（突变体把 apiKey 拼进 text ⇒ 红）；隐私句 i18n。
- **P2 voice-p2-entries**（~700 行）：Doc 编辑器（Tiptap 选区 → `selected`）、批注条、终端（`single_line:true`）、`mode:'edit'`（`edit.outcome/delivery` → 替换选区 / 插入 / 删除 / 剪贴板 / 不动，各一句）；每入口一份输入计划。
- **H0 hub-https**（独立，D1 决定后）：https 监听 + 证书来源 + 设置里显示两个地址；chrome 腿证 `isSecureContext` 为真。
- 验证镜头（凭据 + 隐私类，一轮）：① 供应商面普查；② 音频与 token 永不进日志/journal/trace；③ 教学默认关 = 假服务器 0 次 /v1/context；④ 刷新轮换竞态（两并发刷新 = 一次网络）；⑤ 中继页只回送私网或白名单 https；⑥ 不安全上下文下 0 次 getUserMedia 调用且词正确。

## 7 需 owner 定（推荐在前）
1. **【推荐：做 H0，Tailscale 证书】** 本地 hub 同时听 https，证书从 Tailscale 插件拿；没有 tailnet 的实例退到自签 + 一次信任。你会看到：设置里多一个 https 地址，跨机打开它麦克风、剪贴板都正常。答「否」= 只靠 localhost 与集群实例。
2. **【推荐：默认关】** 「教 Dropline」用途。开了之后对话里的名词和文件名会进你的 Dropline 词库与两周记忆。答「否」= 连接后默认开。

## 8 Owner 决定（2026-10-12）
- D1：做 H0，Tailscale 证书（lane https-tailscale）。D2：教 Dropline 默认关 —— 并加码：`/v1/terms`、`/v1/context` 永不自动写；开着时只提议、用户逐批确认（卡片「加入词库 / 忽略」），显式第三档「本项目的文件名/标识符自动加入」按项目 opt-in；`/v1/context` 单独开关 + 首次预览 + journal。读 `/v1/vocabulary` 不需确认。P0 不写。
- **as built（2026-10-13，lane voice-teach-candidates，userW：一张卡列了约 70 个全勾的 API 字段名）**：提议 = 人会**说出口**的词。来源只取人的句子 + agent 的散文（代码块、反引号、URL 先剪掉 —— 那是本项目自动档的地盘）；`SHAPE_EXCLUSIONS` 普查剔除 id / 占位符 / API 字段名 / 两个以上下划线 / 数字结尾 / ≤ 3 个大写字母 / 密钥形 / 人从没写过的 snake_case·camelCase；排序 = 形状（有已知扩展名的文件名、PascalCase 名字）≫ 次数（人写的算两次，至少 2）> 能读出来；每批 ≤ 12，切在线下的词只有再次出现才进下一批；只预选人写过的、或出现 ≥ 2 次的文件名 / PascalCase 名字；卡片 = 词 chip +「加入所选 (n)」/「忽略这批」，无「显示更多」。本项目自动档（`autoSourcesOf`）不变。
- **更正（2026-10-13，lane voice-teach-ids-allowed，owner：「没必要把 id 啥的从词库排除吧，毕竟 id 这种是最容易识别错的，加入词库反而有助于使用」）**：听写词库收的是听写**最容易认错**的词，标识符正是最好的例子。候选 = 人的句子 + agent 散文里的每个标识符（snake_case、CamelCase、带点的文件名、`*_id` / `*_token` / `*_type` 这类**名字**；行内反引号算散文，代码块与 URL 仍剪掉）；`SHAPE_EXCLUSIONS` 缩成四行：密钥形的**值**（scrubSecrets 表 + ≥ 16 位无元音的 hex/base64 串）、占位符（`xxx`、`ou_xxx`、`<id>`）、厂商不透明 id（`cli_`/`ou_`/`oc_`/`om_` 等前缀 + 带数字或 ≥ 8 位的串，`om_id` 这种名字不算）、URL / 主机名 / 邮箱 / 纯数字。排序、每批 ≤ 12、线下词等再次出现都不变；预选 = 人写过的，或出现 ≥ 2 次的文件名 / PascalCase 名字 / 标识符（只有 agent 用过的普通词不勾）。卡片说明改为「本对话里出现 ≥ 2 次的名字与标识符（听写最容易认错的词）；密钥和占位符不在这里」。

## 9 as built — P0 voice-p0-key（2026-10-12，lane voice-p0-key，2.369.260）
- **建了**：登记行 `dropline`（key 档；`dl_` 校验；Test = GET /v1/me，卡上「已连接：<name> · <team>」）· 插件 `voice-input`（`provides:['dictation']`；无 key 时开关被拒、默认关；语言 auto|zh|en；钥匙不进 plugins.json）· 唯一供应商面 `src/server/dropline-client.js`（vendor census 行 max 6，gates pluginOn/credentialOf）· hub 代理 `src/routes/voice.js`（`GET /api/voice/status` + `POST /api/voice/dictate`，multer 内存 8 MB）· 输入框麦克风 `src/lib/voice-input.js` + 插件卡 `src/lib/voice-plugin-card.js` · PURE `src/voice-model.js`。
- **与设计的差异**：① §3 `text` 按 owner 2026-10-12 裁定改为「最近 ≤ 6 条用户 + agent 的文字消息（agent 头 400、用户 300）+ 工作目录名一行 + ≤ 20 个文件名/标识符一行」，≤ 1 500。② multipart 由 hub **手工拼**（request/context 是带 `Content-Type: application/json` 的普通字段，audio 是唯一文件部件）——Node 的 FormData + Blob 会把 request/context 变成文件部件（filename="blob"），与文档的 curl 形不同。③ hub 的接线在 mounts-plugins-wiring（server.js 已到行数预算）；插件通过 `voiceBind` 把自己的记录读法交给路由。④ 按下麦克风先问 `GET /api/voice/status`：未连接/已关时直接说话、不录音（免得录完 30 秒才被告知）。⑤ 不安全上下文：按钮在，按下只说话 + 复制 localhost 地址，**从不**调 getUserMedia（D1 的 H0 是另一条车道）。
- **没建（按简报）**：OAuth、教 Dropline（/v1/context、/v1/terms）、Settings journal（P1）；文档编辑器/终端/edit 模式（P2）。
- **门**：test-voice-model（44）、test-voice-proxy（24，假 Dropline；种 `console.log(audio)` 的拷贝 ⇒ 红）、test-voice-chrome（16，真 ChatInput 打包 + 真路由 + 假 Dropline；桌面 1280 / 手机 390 / `voice.test` 非回环源；PNG）、test-vendor-whitelist（新主机行 + 种在路由里的拷贝 ⇒ 红）、test-integration-registry、test-builtin-plugins、test-architecture（PURE 集）。

## 9b as built — P1 voice-p1-oauth-teach（2026-10-12，lane voice-p1-oauth-teach，2.369.260）
- **建了**：OAuth 档 `src/server/dropline-oauth.js`（一部署一 client：集群预设 clientId + relayUrl，否则首次 Connect 自注册一次、client_id 写回登记行；回调 = hub 自己的 https `instanceUrl` › 中继页 › 卡上说「连接需要 https 地址…」；oauth-loopback `public` 流程，PKCE verifier 只在流程的 exchange 闭包里；state = `v1.<{u,f,t,k:'dropline'}>.<本次启动的 HMAC>`；token 对存 data/dropline-oauth.json，0600，临时文件 + rename）· `src/server/oauth-doors.js`（非频道 kind 的落地门，参数化路由先问它）· 中继页认 `k`（缺省 slack；畸形 ⇒ 显示 code）· 供应商模块加 register / authorizeUrl / connectWith / 单飞刷新（轮换先落盘，写失败保留旧对）/ 刷新后仍 401 ⇒ reconnect / vocabulary / terms / context。教：PURE `src/voice-teach.js` + `voice-model.js` 的 `termsOf` / `termKind` / `teachContextOf` + `src/server/voice-teach-engine.js` + 卡片 `src/lib/voice-teach-ui.js`。
- **与设计的差异**：① token 对不在登记行的 secret 字段里（字段就是卡片的输入框），而在 data/dropline-oauth.json（0600）；登记行只多了两个非秘密字段 clientId / relayUrl。② For-you 条目的「加入词库」= 加入卡片上列出的全部词（逐词取消勾选在插件卡上做）。③ 自注册时记下注册用的回调（registeredFor），回调变了（例如开了 https）就再注册一次。④ 「设置里的每项目列表」= 插件卡（设置 → 插件）里的项目列表，✕ 撤销。⑤ Task Group 名：`termsOf` 接 `groupName`，但聊天视图还不传（P2 接）。
- **门**：test-voice-oauth（20，假授权服务器）· test-voice-teach（35，含两个 RED 突变）· test-voice-model +8（never-list 突变 RED）· test-oauth-loopback +4 · test-slack-relay +2 · test-integration-registry +3 · heavy test-voice-teach-chrome（16，https://hub.test 自签；PNG）。
