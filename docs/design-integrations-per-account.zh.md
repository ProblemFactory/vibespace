# 频道保留自己的 store, 逐条采用 mounts 的模式 —— 集成凭据的重新设计 (design-integrations-per-account r4, 2026-09-23)

> **Owner 批评 (r1, 原话)**: "这个操作逻辑非常拧巴，为啥我需要特地跑到一个专门的界面里配置一个global的oauth，而我明明可以给每个account都配置不同的oauth？你要仔细思考下你的设计"
> **Owner 指示 (r2, 原话)**: "oauth部分的设计你应该参考一下remote，尽量让我们vibespace里的各种feature的UX和逻辑保持一致"
> **Owner 指示 (r3, 原话)**: "你得完整看看remote的UX，有些feature你可能没有意识到"
> **Owner 指示 (r4, 原话)**: "没必要把mounts和频道合并，我的意思是参考mounts那边的设计，比如凭据管理，复制，子mount（这个也许和频道无关）等等，而不是让你直接俩作为一个"
>
> **状态: SHIPPED (2.369.165, 四个 chunk: 1 共用对话框组件 D1 · 2 频道服务端 · 3 账号卡与对话框 · 4a 存储侧 D2 (独立 commit) + 4b 普查 `scripts/test-oauth-field-parity.mjs` 与文档); D1–D8 均按推荐默认值落地。** 以下是设计原文 (r4), 实现细节见 `docs/kb-features.md` (Communication panel / Mounts) 与 `docs/kb-file-structure.md`。设计时的状态行: **设计 + mockup (r4), 零产品代码。** r4 = **r2 的结构** (频道保留 `data/channels/` 与自己的面板小节; 账号对话框 = 挂载对话框的语法: 一个 "OAuth 客户端" 下拉 + 自定义就地字段, 选择存在账号记录上; 密钥库撤回; 集成窗口只剩浏览器 key) **+ mounts 侧的模式逐条采用** (§8: 每条 采用 / 改用 / 不适用 + 理由)。r3 的"频道账号 = mounts.json 凭据的子项"**撤回** —— 参考的是设计, 不是合并对象。§1 的 Remote 清单保留, 作为模式的来源。英文镜像: `docs/design-integrations-per-account.md`。

## §0 一段话

Remote 的存储侧有一套成熟的**凭据管理语法**: 一条连接就是一个登录 (状态点、健康行、"登录已过期或被撤销 —— 重新授权以修复"、行上的 `重新授权 {provider}…` 按钮); 添加对话框**类型优先**, 后面的字段按类型出现 (`when:`), OAuth 客户端是一个下拉 (`预设：…` / `自定义` 就地); 编辑对话框把每个参数 (含密钥) 预填出来, `重新授权` 与 `移除` 住在对话框里; 有子项的凭据不能移除; 曾经有一个 `创建副本` (⧉) 从一条连接派生一条新记录。r4 把这些**模式**一条条搬到频道账号上, 而频道的对象与 store 一个字节不动: 账号记录在 `adapters.json`, 面板小节还是那个小节, 引擎的 pass / index / outbox / reach 照旧。真正新的只有三样: **创建副本** (同类型 / 同客户端 / 同过滤的兄弟账号, 自己的授权, token 永不复制)、**移除的点名拒绝** (被分配 / 可见性授权 / 待审批提议引用时), 以及**一个共用的对话框组件** (`_mountsDialog` 或它的精确字段语法) 让两个功能的对话框成为一个。

## §1 Remote 标签页完整清单 (模式的来源; r3 Step 1, 原样保留)

列: 面 · 做什么 · 对象 · 动词 · 状态 · 住在哪。

| 面 | 做什么 | 对象 | 动词 | 状态 | 住在哪 |
|---|---|---|---|---|---|
| `_renderMounts` | 整个标签页: Machines 段 → `添加机器` / `配对设备` → Storage 段 (**一张平的连接列表**, 凭据行与其子项紧挨) → `我创建的分享` → 页脚四动作 → `桥接令牌` → 注释 | 全部 | — | 首绘 "Loading…"; 之后原地换入 | Remote 标签 (手机同渲染器) |
| `_buildLocalMachineRow` / `_buildHostRow` / `_buildMachineMountRow` / `_autoTestHosts` | 本机行; 每台机器一行 (测试 / 设置 / 升级拨出 / 重新配对 / 推挂载 / 拉挂载 / 端口 / 出口节点 / 新会话 / 移除), 失败探测 = 行内 `.mounts-errline`; 机器挂载子行 (三态点, 徽标, ↻ / 打开 / 卸载); 2 分钟自动探测只换那一行 | host / device / machine-mount | 见左 | 点 / 徽标 / 芯片 / 错误行 | 行 + 图标动作 |
| `_showAddHostDialog` (+ `_askPrivateKey`) / `_showDevicePairDialog` / `_showGraduateDialog` / `_showBootstrapDialog` / `_showPortsDialog` / `_showHostMountDialog` / `_showMachinePullDialog` | 机器侧的对话框: 添加 (key 错误原地重试) / 配对命令 / 升级拨出 / 逐步引导 + 日志 / 端口转发与发布 / 推挂载 / 拉挂载 | host / device / machine-mount | — | — | `_mountsDialog` 或专用对话框 |
| **`_buildMountRow`** | 一条存储连接一行: 状态点 (或**仅凭据 = 钥匙图标**, 无 Connect), ↳ 箭头, 名字, `RO` / `EXPIRED`, `Connecting…` 芯片; 动作: 浏览 / 断开 (Gmail: 停止同步) / 连接 / 分享 / ＋ 子挂载 / ✎; 明细行 `[类型] 路径`; Gmail 同步线; **整行可点**; **错误行 + (auth 死亡时) `重新授权 {provider}…` 主按钮**; **`创建副本` (⧉) 与 `移除` 曾是行图标 —— 副本被子挂载取代, 移除搬进编辑对话框 (owner: 行上少放图标)** | mount / credential / child | 见左 | mounted / err / off / connecting / expired / credential-only / syncing | 行 |
| `_accessErrorMsg` (服务端) | OAuth 云的 auth 死亡句: *"connected but the sign-in has expired or been revoked — listings come from cache while every file read fails; re-authorize to fix"* | mount | — | — | 健康探测 → 行 |
| **`_showDriveReauthDialog`** | `重新授权 "{name}"`: 谁报的死亡, `用 {provider} 登录`, 状态, **跨浏览器链接行 `oauthLinkRow`**, 粘回框; token 写回记录 (子项写到父) 并重连 | credential | 登录 / 粘回 | 准备中 / 已打开 / 弹窗被拦 / 完成中 / 失败 | 对话框 |
| **`_showAddChildDialog`** | `在 "{name}" 下新建子挂载`: 名称 + 按父类型的路径字段 + 挂载点 + 权限; `创建并连接` | child | 创建并连接 | — | `_mountsDialog` |
| **`_showAddMountDialog`** | `连接存储`: **来源类型 select 决定字段** (`when:`); Drive / Gmail: **`OAuth 客户端`** 下拉 (`预设：…` / 内置 / `自定义`) + 自定义 id/secret 就地 + 就地授权块; 通用: 额外参数 / 模式 / 挂载点 (高级); `连接` | mount / credential | 连接 | 行内错误; 失败关对话框 + toast | `_mountsDialog` |
| `_wireDriveConnect` / `_wireGmailConnect` / **`_wireOAuthConnect`** | 对话框内授权块: 主按钮 → 状态 → `oauthLinkRow` → 粘回; token 落进字段; 按钮变 `重新连接` | — | 连接 / 重新连接 | 见左 | 对话框内 |
| `_wireGmailLabelsPicker` / `_wireSharedDrivePicker` | 云端 picker 用记录 id 或对话框里的 token | — | — | — | 添加 / 编辑对话框 |
| **`_showEditMountDialog` + `_mountEditFields`** | `编辑 "{name}"`: **每个参数预填真实值, 密钥含在内** (2.108.8); `OAuth 客户端` 下拉; token 文本框; 只发改了的 (PATCH); **`重新授权 {provider}…` 与 `移除…` 在对话框里** | mount / credential / child | 保存 / 重新授权 / 移除 | 行内错误 | 自己的表单 |
| `_showMintShareDialog` / `_showCephShareDialog` / `_showBridgeShareDialog` / `_showImportShareDialog` / `_showRcloneConfDialog` | 分享 (S3 / Ceph) / 桥接令牌 / 导入链接 / 导入 rclone.conf | share / token / mount | 创建链接 / 导入 | — | 对话框 |
| 页脚 ×4 / `我创建的分享` / `桥接令牌` / rclone 安装卡 / 孤儿挂载 | 动作与列表 | — | 撤销 / 安装 / 卸载 | — | 段 |
| **服务端 `mounts.js`** | `kind:'credential'`, `parentId` 子项, `_connOf`, `addChild` (不嵌套), **`remove` 有子项拒绝**, `update` (未改密钥不重加密), `config()` 解密全量, `list()`, `startDriveAuthForMount` (记录自己的 client), `applyDriveToken` (写到 holder, bounce 子项), 导出 / 导入 (子项按父名重连), `drivePresets()`, `_driveClient` / `gmail-sync._client` (自定义 > 预设 > 唯一) | — | — | — | — |
| **健康** | 60 s 扫 (凭据跳过; Gmail worker 死了重启; daemon 死立刻重连; 挂点探测挂起 → 断开 + 熔断 + 退避 1/2/5/10 min); **OAuth 云 10 min 后端探测**; **auth 类错误绝不自动重试** | mount | — | 错误行 | 后台 |
| `machine-mounts.js` / `hosts.js` / `webdav.js` | 机器挂载 (90 s 扫) / 机器注册表 / WebDAV 桥 + 作用域令牌 | — | — | — | — |

## §2 新模型 (r4 = r2 的结构)

### §2.1 三个名词 (不变)

```
provider = registry 里的一行 (lark / gmail; 浏览器六行不按对象绑定)   —— PURE: 字段、setup、test
preset   = 实例预设: env 里的一把 client, {key, label}, 只读, 由 env 轮换   —— 每个 env 名一个读者
account  = 一条 channel adapter 记录 (data/channels/adapters.json)         —— 自己记录客户端选择与 token
```

### §2.2 "OAuth 客户端" 这个字段 (r2 原样)

存储对话框 drive/gmail 行的字段: 标签 `OAuth client`; 下拉 `Preset: {name}` × N + `Custom (own client id/secret)` (Gmail / Lark 没有内置兜底 ⇒ 不列 Built-in); 预选 `presets[0]`, 没有预设时预选 `custom`; 每个 provider 一句提示 (注册表 `clientHint`); 自定义字段就地: `Custom {field.label}` (密的 password) + 注册表 `help` 作提示行; Lark 的 setup 只在 Custom 下画: 回调 URL = `oauthLinkRow` 形状的只读输入框 + 复制, 三条前置 = 提示行; 授权 = `{label} 授权` + `.mounts-drive-connect` 块; 提交 `.btn-create` "连接", 记录**在这时**才创建。

### §2.3 数据: 选择存在账号记录上 (r2 原样)

| | 挂载 (`mounts.json`) | channel 账号 (`adapters.json`, r4) |
|---|---|---|
| 预设 | `clientPreset: '<key>'` | `credentialKey: 'cluster:<key>'` (**今天的值不动**) |
| 自定义 | `clientId` + `clientSecretEnc` (`.mounts-key`) | `credentialKey: 'custom'` + `credential: {appId, appSecretEnc}` (`.channels-key`) |
| token | 记录上 `tokenEnc` | 记录上 `auth.tokenEnc` (**今天的位置不动**) |
| 解析 | `_driveClient` / `gmail-sync._client`: 自定义 > 预设 | 引擎 `clientFor(rec)`: `custom` ⇒ 记录; `cluster:<k>` ⇒ `resolveIntegration(id,{credentialKey})`; `own` rung 退役 |

注册表加 `bindsPerAccount` (lark / gmail / fake = true): 不是卡片, 预设给账号对话框, 不画 Test。

### §2.4 线上 (r2 原样 + r4 的三个动词)

- 预设读者: Google = `drivePresets()`, Lark = integration store 的 `VIBESPACE_INTEGRATIONS`; 线上 `{key,label}`, 词 `Preset: {label}`; 不加路由。
- 授权: 挂载那族路由的形状 (`POST /api/channels/oauth/start {kind, clientPreset | clientId+clientSecret}` → `status` → `callback {url}`), 记录在 `connect {credentialKey|'custom', credential?, flowId, newAccount:true}` 时创建; `reauthorize {credentialKey?, credential?}` = 挂载语义 (换 client 就是重新授权)。
- **r4 新增**: `POST /api/channels/adapters/:id/duplicate {name?}` → 一条新记录 (复制的字段见 §8 第 2 条), 未授权, 答 `{adapter}`; 客户端接着为它走授权块。`DELETE /api/channels/adapters/:id` (= 移除) 在账号被引用时 `409 account-referenced {refs:[{kind:'assignment'|'reach'|'outbox', …}]}` 点名拒绝; `disconnect` 照旧只丢 token。
- 集成路由: `bindsPerAccount` 行不在 `GET /api/integrations` 里, PUT / DELETE / test 404。

### §2.5 面

- **账号小节 = 凭据优先的卡** (mockup `account-card`): 状态点 + 名字 + 客户端芯片 `预设：…` / `自定义客户端` + 计数 + ✎ + ⋯; **健康行** (存储行明细行的语法: `[Gmail] 已连接 · label:INBOX · 上次轮询 2 分钟前 · 推送: 独占`); auth 死亡 = `.mounts-errline` "连接失败: 登录已过期或被撤销 —— 会话列表来自缓存, 每次抓取都失败; 重新授权以修复" + `重新授权 {provider}…` 主按钮; **被跟踪的会话 = ↳ 行** (子行语法); **未跟踪任何会话的账号** = "仅登录 —— 尚未跟踪任何会话; 跟踪之前不会抓取任何内容。用「跟踪…」在这个账号下挑选会话。" + `跟踪…` (仅凭据行 "add submounts under it" 的措辞); ⋯ 动词顺序 = 存储行的动作顺序 (§8 第 6 条)。
- **连接账号** (mockup `connect-dialog` / `-custom`): **类型优先** (`类型` = Gmail / Lark …; = 连接存储的 `来源类型`), 之后每个字段带 `when:`; 名称; `OAuth 客户端` (§2.2); `{provider} 授权` 块; 类型自己的字段 (Gmail: 包含查询 + `列出标签`; Lark: 包含的群 (可选)); `连接`。
- **创建副本 "{账号}"** (mockup `duplicate-dialog`): 名称 `… (副本)`, 类型只读, `OAuth 客户端` (从原账号复制, 可改), 过滤与推送声明 (复制), 一段说明"复制什么 / 不复制什么", **自己的授权块**, `创建并连接`。
- **重新授权 "{账号}"** (mockup `reauth-dialog`): `_showDriveReauthDialog` 逐字 + 顶上 `OAuth 客户端` (换 = 新 token 在新 client 下)。
- **编辑 "{账号}"** (mockup `edit-dialog`): 名称 / `OAuth 客户端` / 自定义字段**预填含密钥** (2.108.8) / 授权状态事实 / 类型自己的字段 / 推送声明; 按钮 `重新授权 {provider}…` · `创建副本…` · `移除…` · `保存`; 换 client ⇒ 保存打开重新授权。
- **移除被拒** (mockup `remove-refused`): "无法移除 "{账号}" —— 这个账号还被引用着: 分配 ×2 / 可见性授权 ×1 / Outbox 待审批 ×1; 先解除"; `断开` 不受此限。

### §2.6 迁移 (回到 r2)

| 侧 | 做什么 | 风险 |
|---|---|---|
| **channels** | **`adapters.json` 不迁移**, 除一条: `credentialKey:'own'` 的账号把 integration 行的 `values` 解密 (`.integrations-key`) 后作为自定义 client 重新加密 (`.channels-key`) 写到记录上, 盖 `custom` —— 迁移 `2026-09-channel-custom-client-inline` (共享 runner, 账本键控); token 位置不变; **这台实例零个 `own` 账号 ⇒ 空跑** | 低 |
| **mounts** | **零** (r4 不碰 mounts 的记录; D2 若采纳是独立 commit) | 零 |
| **integrations.json** | lark / gmail 两行 `values` / `clusterKey` 原地留 (无读者) | 零 |

## §3 流程

| # | 场景 | 步骤 | 与挂载的差 |
|---|---|---|---|
| 3.1 | 只有一个预设, 第一个账号 | `连接账号` → `类型: Lark` → `OAuth 客户端` 预选 `预设：…` → `连接 Lark` → `连接` | 0 |
| 3.2 | 第二个 Gmail 账号, 另一个 client | `连接账号` → `类型: Gmail` → 下拉选另一个预设或 `自定义` → 授权 → `连接` | 0 |
| 3.3 | 自托管, 无预设 | 下拉只有 `自定义`, 字段就地, Lark 回调 URL 行 + 三条 | 0 |
| 3.4 | token 死了 | 小节错误行 + `重新授权 {provider}…` → 对话框 (可换 client) → `用 {provider} 登录` → 完成 | 0 |
| 3.5 | **创建副本** | ⋯ `创建副本…` (或编辑里) → 对话框 (设置已复制, token 没有) → 授权 → `创建并连接` ⇒ 兄弟账号 | 挂载的 ⧉ 已退役 (被子挂载取代); 频道没有子挂载, 副本正是它的位置 |
| 3.6 | 换 client / 换 secret | 编辑 → 改 → 保存 (换 client ⇒ 打开重新授权; 换 secret 直接) | 挂载今天静默换 client (D2) |
| 3.7 | env 撤掉预设 | 错误行点名 `预设 <k> 已不再提供` | 改进 (挂载无点名) |
| 3.8 | **移除** | ⋯ / 编辑 `移除…` → 被引用 ⇒ 点名拒绝; 否则移除记录 + index | = 有子项的凭据不能移除 |
| 3.9 | 跟踪会话 | 小节 `跟踪…` / 空账号的按钮 → 今天的 `showTrackPicker` (勾选列表) → 被跟踪的会话成为 ↳ 行 | 不是子挂载对话框 (§8 第 7 条) |

## §4 逐点影响

| 类别 | 内容 |
|---|---|
| **删除** | Integrations 窗口的 lark / gmail / fake 卡; 向导 stepper / 凭据步 / 自有流程对话框; `own` rung 对按对象绑定的行; `credentialDefault`; `credential-bound` (换成"换 = 重新授权"); 第一个账号留记录的特例 (`disconnect` 只丢 token; `移除` 一律走引用检查) |
| **保留** | `data/channels/*` 与引擎的一切 (pass / index / 选项 / 推送 / outbox / reach / 群); 注册表; env 双形态读者; secret-box (`.channels-key`); oauth-loopback; `LARK_CALLBACK_URL`; 浏览器六行; agent 路由; **mounts 侧零改动** |
| **新增** | `bindsPerAccount` + `clientHint`; 记录上的 `credential` (自定义); 引擎 `clientFor` / 临时授权流程三条路由 / `duplicate` / 移除的引用检查 `referencesOf(adapterId)`; UI: 凭据优先的小节 (健康行 / 错误行 + 按钮 / ↳ 行 / 空措辞), 类型优先的连接对话框, 创建副本对话框, 重新授权对话框 (r2), 编辑对话框 (r2 + 创建副本), 移除拒绝对话框; ⋯ 动词重排; 共用的对话框组件 (§8 第 12 条) |
| **迁移** | §2.6 |
| **手机** | 小节与 ↳ 行 = 存储行的手机布局 (同 CSS); 对话框同 shell (`*.phone.png`) |
| **i18n (zh + ja)** | 共用键: `OAuth client` · `Preset: {name}` · `Custom (own client id/secret)` · `Re-authorize {provider}…` · `Re-authorize "{name}"` · `Sign in with {provider}` · `Couldn’t connect:` · `Remove…` · `Edit` · `Duplicate` (已有: 创建副本) · `Create & connect` · `List labels` · `Track…` · `Options` · `Push…` · `Enable` / `Disable` · `Nothing is fetched for a conversation until you track it.`; 新键: `Connect an account` · `Type` · `Connected · {filter} · last poll {ago} · push: {claim}` · `connected but the sign-in has expired or been revoked — conversations come from cache while every fetch fails; re-authorize to fix` · `Login only — no conversation tracked yet; nothing is fetched until you track one. Use Track… to pick conversations under this account.` · `Duplicate "{name}"` · `{name} (copy)` · `Copied from the original; you can change it.` · `Copied: the type, the OAuth client, the query, the push claim, the sender line. NOT copied: the token (a login is one person's consent), tracked conversations, assignments, reach grants, the message log — the copy signs in on its own.` · `This copy needs its own sign-in — another account, or the same one authorized again.` · `Cannot remove "{name}"` · `This account is still referenced — release these first:` · `assignment: {conv} → {who}` · `reach: {who} may see the whole account` · `outbox: {n} proposal(s) awaiting approval` · `Disconnect only drops the token and keeps these; Remove needs them released first — the same rule as a credential with submounts.` · `Open conversation window` · `Custom App ID` · `Custom App Secret` · `Included groups (optional)` · `Include query (Gmail search syntax)`; 删除键: r2 §4 的删除列表 + `Add account…` (改为 `Connect an account`) |
| **测试** | `test-channels-accounts` (fast): 记录上的自定义 client; `clientFor` 顺序; 临时流程 → `connect {flowId}`; `duplicate` 复制的字段集 = 一张**声明的表** (`DUPLICATE_FIELDS`), token / tracked / assignments / reach / log **不在**; `DELETE` 被引用 ⇒ `409 account-referenced` 逐条点名 (分配 / reach / outbox), 无引用 ⇒ 移除; `disconnect` 不受引用限制; 迁移 `own → custom` 幂等 + 无引擎点名失败 + 修前副本; **`test-oauth-field-parity`** (fast, 新, grep 普查): 两个功能的连接对话框**同一批键** (类型优先字段、`OAuth client` 标签与下拉项、`Custom {…}` 标签、`.mounts-field-hint` / `.mounts-drive-connect` / `oauthLinkRow` / `.btn-create` / `.cfg-err`、`Re-authorize {provider}…`、`Duplicate`、`Remove…`) —— 一边改词另一边没跟 = 红; 若共用 `_mountsDialog`, 普查改成"channels-panel 不含第二个字段渲染器"; `test-integrations-ui` ⑩ 重写: 类型优先 / 预设预选 / 自定义就地 + 回调行 / 就地授权 / `连接` 才建记录 / 小节健康行与错误行 / 创建副本 (设置带过来、token 没有、自己的授权) / 移除拒绝点名 / ⋯ 顺序 / 375px; `test-channels-i18n`; `test-vendor-whitelist` 零新调用; `test-mounts-*` **不动** |

## §5 精简的 build list

| 文件 | 改动 |
|---|---|
| `src/integration-registry.js` (PURE) | `bindsPerAccount` + `clientHint`; `checkRow` 断言 |
| `src/server/integration-store.js` · `src/routes/integrations.js` | `bindsPerAccount` 行不是卡 (404); `own` rung 只对 false 行 |
| `src/server/channels-engine.js` | `clientFor(rec)`; 临时授权流程 (`startOAuth` / `oauthStatus` / `oauthCallback`); `connect({credentialKey, credential, flowId, newAccount})`; `reauthorize` 改绑语义; **`duplicate(adapterId, {name})`** (`DUPLICATE_FIELDS` 声明表); **`referencesOf(adapterId)`** (assignments / reach grants scope.kind==='adapter' / outbox 未结提议) + `remove` 拒绝; 记录上的 `credential` 经 `.channels-key` |
| `src/routes/channels.js` | 三条 `/api/channels/oauth/*`; `POST /adapters/:id/duplicate`; `DELETE /adapters/:id` 的 409 |
| `src/lib/channels-panel.js` | 小节 = 凭据优先的卡 (健康行 / 错误行 + 按钮 / ↳ 行 / 空措辞); ⋯ 重排 + `创建副本…` + `移除…`; 连接对话框 = **`_mountsDialog` 规格** (类型优先 + `when:`); 创建副本 / 重新授权 (= `_showDriveReauthDialog` 同形 + 下拉) / 编辑 (= 挂载编辑语法 + 创建副本) / 移除拒绝对话框 |
| `src/lib/sidebar-mounts.js` | **零改动** —— 除非采纳 §8 第 12 条的"抽出 `_mountsDialog` 为共用模块" (纯搬家, 行为不变) 与 D2 (独立 commit) |
| `src/lib/mounts-dialog.js` (新, 可选) | `_mountsDialog` + `oauthLinkRow` + `_wireOAuthConnect` 搬成共用模块, 两边 import (§8 第 12 条) |
| `public/style.css` | mockup.css 标记线以下: `.chan-sec-health`, `.chan-row-tracked`, 错误行缩进 (3 条) |
| i18n zh/ja · `docs/kb-file-structure.md` (channels-panel / channels-engine / integration-store) · `docs/kb-api.md` · `docs/design-communication-panel.zh.md` §14.5 末尾指向本文 · `CHANGELOG.md` | 同 commit |
| `src/server/migrations.js` | `2026-09-channel-custom-client-inline` |

估算: 一条 lane, 4–5 轮 (引擎 + 路由 + 迁移; 面板小节 + 四个对话框; 共用对话框模块 + 普查; 套件; 对抗验证 —— 凭据 / 移除 / 复制属于必验类)。

## §6 只有 owner 能拍的决定 (r4; r3 的 D1 / D3 / D5 / D6 / D7 随合并一起消失)

| # | 决定 | 选项 | 建议 |
|---|---|---|---|
| D1 | **`_mountsDialog` 抽成共用模块** (两个对话框 = 一个组件) vs 频道照抄它的字段语法 (普查钉拼写) | 抽 / 照抄 | **抽** (`src/lib/mounts-dialog.js`, 纯搬家; 挂载零行为变化); 普查退化成"channels-panel 没有第二个渲染器" |
| D2 | **挂载也采用"换 client = 重新授权"** | 采用 (独立 commit) / 不动 | **采用, 独立 commit**: 今天编辑里静默换 `clientPreset`, 下次 refresh `invalid_client` |
| D3 | **编辑对话框自定义 secret 预填** | 跟挂载 (2.108.8) / Replace-never-Reveal | **跟挂载**: 指示的对象就是"编辑连接的对话框"; 代价 (`GET …/config` 返回明文) 与挂载相同; 浏览器六行不跟 |
| D4 | **创建副本复制哪些字段** | 声明表 `DUPLICATE_FIELDS` = {类型, 客户端选择 (预设 key 或自定义 id+secret), 包含查询 / 包含的群, 推送声明, 发送者说明行} / 更少 (只类型 + 客户端) | **声明表如左**; token / tracked / 分配 / reach / 消息记录永不复制 (每一项在 §8 第 2 条有理由) |
| D5 | **移除的引用检查范围** | 分配 + 可见性授权 + 未结 outbox 提议 (建议) / 只分配 / 再加"agent 群里的引用" (群引用的是 agent 会话, 不是频道账号 ⇒ 不算) | **如左三类**; `断开` 不受限 (只丢 token, 引用保留) |
| D6 | **⋯ 动词顺序** | 存储行的动作顺序 (打开 → 跟踪… → 选项 → 推送… ‖ 重新授权/连接 → 创建副本… → 断开 → 移除… ‖ 禁用) / 保留今天的分组 | **存储行顺序**; `移除…` 同时住在编辑对话框 (挂载的家) |
| D7 | **Test 动词 / 集成窗口余下六行** | (r2 D5 / D7) | 无 Test; 六行不动 |
| D8 | **健康句的措辞** | 逐字借挂载的 ("登录已过期或被撤销 —— … 重新授权以修复") / 频道自己的四值 why | **逐字借**, 频道的 `why` 码作为句尾括注 (`(refresh-refused)`) |

## §7 Mockups (`docs/mockups/integrations-per-account/`, r4)

| 文件 | 画的是 | 对照的 mounts 模式 | PNG (桌面 / 手机 390) |
|---|---|---|---|
| `account-card.html` | 面板: 三个账号小节 (健康行 / 打开的 ⋯ 菜单含 `创建副本…` `移除…` / ↳ 被跟踪会话 / auth 死亡的错误行 + 按钮 / 空账号的"仅登录"措辞) + `连接账号` | `_buildMountRow` + 错误行 + 仅凭据行 + 子行 | `account-card.png` / `.phone.png` |
| `connect-dialog.html` | `连接账号`: 类型优先 (Gmail) → 名称 → `OAuth 客户端` → 授权块 → 包含查询 → `连接` | `_showAddMountDialog` (类型优先 + `when:`) | `connect-dialog.png` / `.phone.png` |
| `connect-dialog-custom.html` | 同上, 类型 = Lark, `自定义` ⇒ 自定义字段 + 回调 URL 行 + 三条 | 同上 (Custom 分支) | `connect-dialog-custom.png` / `.phone.png` (+`.full`) |
| `duplicate-dialog.html` | `创建副本 "{账号}"`: 设置复制, token 不复制, 自己的授权 | 已退役的 ⧉ (2.107.0) | `duplicate-dialog.png` / `.phone.png` |
| `reauth-dialog.html` | `重新授权 "{账号}"` | `_showDriveReauthDialog` | `reauth-dialog.png` / `.phone.png` |
| `edit-dialog.html` | `编辑 "{账号}"`: 预填含密钥 / 重新授权 · 创建副本 · 移除 · 保存 | `_showEditMountDialog` | `edit-dialog.png` / `.phone.png` |
| `remove-refused.html` | `无法移除 "{账号}"`: 引用点名 | `remove()` 的"有子项拒绝" | `remove-refused.png` / `.phone.png` |

`mockup.css` = `public/style.css` 里对话框壳、`.mounts-*`、`.chan-*` 规则逐字拷贝 + 标记线以下 (打开的菜单只是 mockup 的静态画法, 用产品的 popover token; 产品经 `showContextMenu` 渲染)。`shoot.mjs` / `check.py` 同前: **28 帧 268 个探针全过**。重跑: `node docs/mockups/integrations-per-account/shoot.mjs && python3 docs/mockups/integrations-per-account/check.py`。

## §8 mounts 的模式, 逐条

### §8.1 十二条模式: 采用 / 改用 / 不适用 + 理由

| # | mounts 的模式 (§1 里在哪) | 频道侧 | 判定 | 理由 / 怎么做 |
|---|---|---|---|---|
| 1 | **凭据优先的记录**: 连接行就是登录 —— 状态点 (mounted / err / off / connecting), 健康线, auth 死亡句 *"sign-in has expired or been revoked — … re-authorize to fix"*, `连接` / `断开` 动词, **仅凭据行**的措辞 ("this token can't open the storage root; add submounts under it") | 小节头有点与四值 auth 行; 没有健康线; 空账号只有 "No conversations discovered yet." | **采用** | 小节 = 卡: 点 (adapter 状态: connected / needs-reauth / needs-credentials / unknown → ok / bad / warn / idle), **健康行**用明细行语法 (`[Gmail] 已连接 · label:INBOX · 上次轮询 2 分钟前 · 推送: 独占`), auth 死亡句**逐字借**挂载的并附 why 码 (D8), `连接` / `断开` 动词同名; 未跟踪任何会话的账号用仅凭据行的措辞: "仅登录 —— 尚未跟踪任何会话; 跟踪之前不会抓取任何内容。用「跟踪…」在这个账号下挑选会话。" + `跟踪…` 按钮 |
| 2 | **创建副本**: `docs/mounts.md` "Duplicate (⧉) derives a new standalone mount from an existing connection" (2.107.0); 在 `_buildMountRow` 里**已退役** —— "duplicate is superseded by submounts, and Remove moved into the Edit dialog (fewer per-row icons)"; 挂载行没有 ⋯ 菜单, 动作是图标 | 无 | **采用** (频道没有子挂载, 副本正是它的位置) | ⋯ 里 `创建副本…` + 编辑对话框里 `创建副本…`; **复制**: 类型、OAuth 客户端选择 (预设 key, 或自定义 id + secret —— 同一个 app 的两个账号是常态)、包含查询 / 包含的群、推送独占声明、发送者说明行; **永不复制**: token (登录是一个人的一次同意; 副本要自己的授权 —— 另一个人, 或同一人再授权一次)、已跟踪的会话 (跟踪是按账号的选择)、分配、可见性授权 (授权指向的是这个账号的 id)、消息记录与游标 (属于原账号的会话); 路由 `POST /adapters/:id/duplicate {name?}` → 未授权的新记录, 对话框接着走授权块 → `创建并连接`; `DUPLICATE_FIELDS` 是引擎里的**声明表**, 套件钉它 |
| 3 | **重新授权**: 行上错误行里的 `重新授权 {provider}…` 主按钮 (auth 死亡正则识别) + `_showDriveReauthDialog` (谁报的 / `用 {provider} 登录` / `oauthLinkRow` / 粘回) + 编辑里也有 | ⋯ `重新授权`, 自己的流程对话框 (`chan-flow-*`), 倒计时行 | **采用, 逐字** | 小节的错误行 + 同一个按钮; 对话框 = `_showDriveReauthDialog` 的形状 + 顶上 `OAuth 客户端` (换 = 重新授权, §8 第 4 条); Lark 走固定端口流程, 同一对话框; 频道自己的流程对话框**删除** |
| 4 | **编辑**: `编辑 "{name}"` 全部参数预填含密钥 (2.108.8), `OAuth 客户端` 下拉 (`(自定义 / 内置)` + `预设：…`), 只发改了的, `重新授权…` / `移除…` 在对话框里 | ⋯ `选项` 对话框 (声明的 schema) / `推送…` 对话框 | **采用** (频道侧) | `编辑 "{账号}"`: 名称 / `OAuth 客户端` / 自定义字段**预填含密钥** (D3) / 授权状态事实 / 类型自己的字段 (选项 schema) / 推送声明; `重新授权…` · `创建副本…` · `移除…` · `保存`; **换 client = 重新授权** (保存打开重新授权对话框, 预填新 client); 挂载侧采用同一条 = D2 独立 commit; `选项` / `推送…` 保留为快捷入口, 内容与编辑对话框同源 |
| 5 | **移除**: `remove()` —— "This credential still has mount points under it — remove those first"; `移除…` 住在编辑对话框 | `断开` (丢 token; 之后的账号连记录一起删) | **采用** | `移除…` (⋯ + 编辑): 被引用 ⇒ `409 account-referenced` 点名: 分配 (`assignment: 会话 → 谁`)、可见性授权 (scope.kind==='adapter' 的 reach grant)、未结的 outbox 提议; 无引用 ⇒ 删记录 + index; `断开` 保持"只丢 token, 引用保留"; agent 群引用的是 agent 会话, 不算 (D5) |
| 6 | **动作的位置与顺序**: 挂载行的图标顺序 = 浏览 → 断开 / 连接 → 分享 → ＋ 子挂载 → ✎; `移除` 在编辑里 ("行上少放图标"); 机器行同法 | ⋯ 分组: 跟踪… / 选项 / 推送… ‖ 发送者行 ‖ 重新授权/连接 / 添加账号… / 断开 ‖ 启用/禁用 | **改用** (频道有 ⋯, 挂载没有) | 保留 ⋯ (小节头本来就有), 但**顺序**照挂载行: 打开会话窗口 (= 浏览) → 跟踪… (= ＋) → 选项 → 推送… ‖ 重新授权 / 连接 → 创建副本… → 断开 → 移除… ‖ 禁用; `添加账号…` 出 ⋯, 由面板底部 `连接账号` 承担 (= 页脚 `连接存储`); `移除…` 同时在编辑对话框 (挂载的家) |
| 7 | **子挂载**: `_showAddChildDialog` —— 一条凭据下 N 个路径 | 一个账号下 N 个被跟踪的会话 / 一个过滤 | **改用: 更轻的形态, 不是子挂载对话框** | 频道账号的"子项"是它跟踪的会话 —— 它们**已经存在于对面** (发现列表), 不是用户创建的路径; 所以: 被跟踪的会话渲染成 ↳ 行 (子行语法), 添加 = 今天的 `跟踪…` 勾选列表 (`showTrackPicker`), 不是"新建"对话框; 过滤 (Gmail 查询 / Lark 包含的群) 是账号自己的字段 (编辑里), 不是子项; owner 自己说"子mount 也许和频道无关" —— 是的, 只借它的**渲染**语法 |
| 8 | **分享 / 导入链接 / 桥接 / rclone.conf 导入** | 无 | **不适用** | 分享 = 铸一把下放范围的存储凭据给别人 —— 频道账号是一个人的登录, 没有"下放"的形态; 导入链接 = 吃别人铸的存储凭据 —— 频道没有可导入的东西; 桥接 = 把本地文件夹经 WebDAV 给另一个 VibeSpace —— 频道没有文件夹; rclone.conf = 吃已有的 rclone remotes —— 频道没有等价的既有配置文件 (Lark / Gmail 的 token 不会以文件形式存在于别处) |
| 9 | **健康 / heal**: 60 s 扫 + 10 min OAuth 探测 + 退避 1/2/5/10 min 重连 + auth 类错误等人 (挂载); 15 min 对账是**频道**引擎的 (`RECONCILE_SECONDS`) | 引擎 5 s 调度: 热 30 s / 冷 300 s / 对账 15 min; 3 次失败变琥珀; auth-expired 不重试 | **保留频道自己的** | 挂载的 heal 修的是**挂载点** (daemon 死 / IO 挂起 / 熔断); 频道账号没有挂载点, 它的活性就是 pass; 两边**已经**都不自动重试 auth 类错误 —— 借的只是**行上的表达** (错误行 + 按钮 + 措辞), 不是循环 |
| 10 | **手机布局**: 存储行在 ≤768 同一渲染器, 行 / 子行 / 错误行同 CSS, 对话框同 shell | 面板走窗口回退; 小节同 CSS | **采用** | 小节 / ↳ 行 / 错误行用同一批 `.mounts-*` 类 (错误行、重新授权按钮、子行缩进), 于是手机上与存储行**同一套 CSS** 生效; 对话框 = 同 shell (`*.phone.png`) |
| 11 | **类型优先的对话框**: `连接存储` 第一个字段 `来源类型`, 之后每个字段 `when: is('drive')` | 每种 kind 一个入口按钮 | **采用, 完全一样** | `连接账号` 第一个字段 `类型` (Gmail / Lark / …), 之后每个字段带 `when:`; 一个对话框服务所有 kind; 面板底部一个 `连接账号` 按钮 (= 页脚 `连接存储`); kind 的入口按钮退役 |
| 12 | **`_mountsDialog` 组件**: 字段规格数组 (`{key,label,type,options,value,when,hint,advanced,autocomplete}`) → label / 控件 / 提示行 / 高级折叠 / `.cfg-err` / `.btn-create`, 条件重算, `_lastMountsDialog` 上下文 | 手写 DOM | **采用** | 两个对话框 = **一个组件**: 把 `_mountsDialog` + `oauthLinkRow` + `_wireOAuthConnect` 搬到 `src/lib/mounts-dialog.js` (纯搬家, D1), channels-panel import; 若不搬 (D1 否), 照抄它的精确字段语法并让 **`test-oauth-field-parity`** 钉共用拼写 (标签 / 下拉项 / 类名 / 按钮文案) —— 一边改词另一边没跟 = 红 |

### §8.2 逐元素表 (Remote/存储 今天 · Channels 今天 · 统一规则 · 谁改)

| 元素 | Remote 今天 | Channels 今天 | 统一规则 | 谁改 |
|---|---|---|---|---|
| 入口 | 页脚 `连接存储` | ⋯ `添加账号…` / kind 按钮 | 面板底部 `连接账号` (类型优先) | Channels |
| 对话框形状 | `_mountsDialog` | stepper + `chan-flow-*` | 一个组件 (D1) 或精确同语法 + 普查 | Channels (+ 可选搬家) |
| OAuth 客户端字段 | `预设：…` / 内置 / `自定义` 就地 | 单选 → 集成窗口 | 同一个字段 | Channels |
| 选择 / token 存在哪 | 每条记录 | 每条账号 + 行级 own | 每条账号记录 (r2) | Channels |
| 预设来源 | `drivePresets()` | 注册表 | 每个 env 名一个读者; `{key,label}`; 不加路由 | 无 |
| 授权流程 | `_wireOAuthConnect` + `oauthLinkRow` + 粘回 | 自有流程对话框 | Remote 的, 别无 | Channels |
| 卡 | 状态点 / 明细行 / 错误行 + 按钮 / 仅凭据措辞 | 头 + auth 行 | 凭据优先的卡 (§8.1 #1) | Channels |
| 重新授权对话框 | `_showDriveReauthDialog` | 流程对话框 | Remote 的 + 客户端下拉 | Channels |
| 编辑 / 移除 | 预填含密钥 / 重新授权 / 移除 (有子项拒绝) | 选项 / 推送 / 断开 | 挂载编辑语法 + 创建副本 + 移除拒绝 | Channels; D2 = Remote 可选 |
| 创建副本 | 已退役 ⧉ | 无 | 频道采用 (声明的字段表) | Channels |
| 子项 | ＋ 子挂载对话框 | 跟踪… 勾选 | ↳ 行 + 跟踪… (不是子挂载对话框) | Channels (渲染) |
| ⋯ 顺序 | 图标顺序 | 分组 | 挂载行顺序 | Channels |
| 健康 | 挂载点 heal | 引擎 pass | 各自; 表达同 | Channels (措辞) |
| 分享 / 导入 / 桥接 / conf | 有 | 无 | 不适用 | 无 |
| 手机 | 同渲染器 | 同 shell | 同 CSS | 无 |
| 全局页 | 无 | ⚙ 集成与密钥 | OAuth 无全局页; 窗口只剩浏览器 key | Channels |

**撤回记录**: r1 密钥库 (共享 client 条目 + 删除拒绝) → 撤回 (Remote 没有); r3 "频道账号 = mounts.json 凭据的子项" → 撤回 (owner: 参考设计, 不合并对象); r4 = r2 结构 + 模式。

## §9 不做什么 / 未验证

- 不做: 合并 store; 集群鉴权中继; 浏览器 key 行; agent 路由; mounts 侧改动 (D1 的搬家与 D2 除外, 各自独立 commit)。
- 未验证: 一个 Lark 租户下两个自建 app 各一条长连接互不影响 (每 app 50 条, 文档说法); Google 对同一账号在两个 client 下各铸 refresh token 的行为 (应独立)。均不影响模型。
