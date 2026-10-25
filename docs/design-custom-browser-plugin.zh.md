# 设计：自研浏览器内核插件（`vibespace.custom-browser`）在 VibeSpace 这一侧 — 五个阶段，每段一条车道契约

设计车道 custom-browser-design，2026-10-25，基线 2.369.353（b214278b）。只设计，不建、不跑门；每一节是一条车道的契约，写到"可以开工"的粒度。读法：§0 定边界，§1–§5 各一条车道（P0–P4），§6 交接与 CI。来自内核方而我方尚未实测/确认的事实用 **【待确认】** 标出；凡写成"决定"的，是本文替车道定下的；凡写成"D"的，是 owner 要定的。

## §0 决定与边界

**Owner 的裁定（逐字，2026-10-24）**：「目标是以后**默认走自研内核浏览器**（不只集群）；标准 Chrome 保留为可选项（`profile.browser = {kind:'default'}`）。passkey 与密码管理**尽量都归 VibeSpace 的保险库**；内核对"弹窗类"情况给出**专门的事件/标记**，让 VibeSpace 前端能正确展示给用户和 agent。」

**主开发给内核对话的 SPI（2026-10-24，notes/custom-browser-kernel-spi-2026-10-24.md）**，本文全部沿用：接入点 = `profile.browser` 的新 kind `{kind:'plugin', id:'vibespace.custom-browser'}`，由 `browserChoiceVerdict`（src/browser-builds.js）一处裁决，keeper 经 `AGENT_BROWSER_EXECUTABLE_PATH` 启动，内核消失**按名拒绝、不静默回退**；控制通道 = **同一条 CDP websocket**（src/server/browser-dialogs.js 已持有）上的 embedder domain `VibeSpace.*`；握手 `VibeSpace.getVersion → {protocol:1, kinds[], features[]}`，老内核不被问它没有的方法；每个非 DOM 的 UI 面是一个 **surface 事件**，kind 是**闭集**（20 个），未知 kind 渲染为通用 surface、永不丢弃；passkey 的钥匙在保险库、内核只做传输，UV = owner 在 VibeSpace 里的确认；内建密码管理器关闭、条目在保险库、谁能填 = GRANT 行；一个**假内核**驱动我方 CI。

**内核方的答复（2026-10-24，notes/…-reply-2026-10-24.md）** — 已确认：方案 (a) 同一条 socket + `vibespace.pdl` 生成的 `protocol::VibeSpace::Backend` 挂在 `ChromeDevToolsSession`；20 个 kind 各有 C++ 拦截点（`PermissionRequestManager`、`FileSelectHelper`、`LoginHandler`、`ChromeAuthenticatorRequestDelegate`…）；WebAuthn 在 `AuthenticatorCommonImpl` 层下沉为 `webauthnRequest/webauthnAnswer`，`IsUVPAA` 恒真，绝不回落 OS 认证器 / GPM；密码管理器三层关闭（pref、`LoginDatabase` 不初始化、气泡 no-op），表单解析复用 `form_data_parser`，只报 `fieldId` + 类型 + `pageOrigin`/`frameOrigin`。分三阶段落地（surface → webauthn → credentials）。

**内核对话的集成开场（2026-10-25）与本车道实读到的文件**：私有仓库，插件 id `vibespace.custom-browser`，包 47 个文件 / 30.2 MB，**不含 1.2 GB 内核二进制**。我按简报允许读了三个文件（2026-10-24 16:04–16:09 的盘上版本）：
- `server.js` = 本仓 plugin-loader 的 **IPC v1 子进程**（`process.send({t:'hello', api:1})`，`route` 消息答 `/health`、`/probe`、`POST /resolve-launch`，`shutdown`）。开场里说的 `activate(ctx)` / `deactivate()` / `createBrowserEngineProvider()` / `getTrajectoryGenerator()` / `createFakeKernelStub()` **不在这个文件里**【待确认：更新的 main？】。本文把 provider 写成 VibeSpace 需要的形状（§1.2），字段逐条标待确认。
- `src/vibespace-spi.mjs`：常量 `VIBESPACE_SURFACE_KINDS`（20，与 SPI 枚举逐字相同）、`VIBESPACE_FEATURES = ['surfaces','webauthn','credentials']`、`VIBESPACE_ERROR_CODES = ['no_such_surface','invalid_action','stale_origin','no_such_request','invalid_values','eval_failed']`；`probeBinary()`；class `VibeSpaceSpiBridge`（在普通 Chrome 上用页内 shim 模拟 `VibeSpace.*` 的联调层）。
- `src/fake-kernel-stub.mjs`：零依赖的 `/json/version` + `/json/list` + RFC 6455 ws，答 `Page.enable`、`VibeSpace.*`；`openSurface/updateSurface/closeSurface/triggerWebAuthn/detectCredentialForm`。**缺口见 §6.2。**
- 开场说的校验器 `src/plugins/schema.js validateManifest()+auditTree()` 在本仓是 `src/plugin-manifest.js validateManifest` + `src/server/plugin-install.js auditTree`（内容哈希）；清单**没有** `kind` / `tier` 字段（见 §1.1 怎么表达）。

**留在内核方的**：Chromium 补丁与 C++ 拦截点、哪些原生 prompt 能在编译期关掉、内核二进制的构建与分发工件（每平台 url + sha256，§5.3）、`runtime/vibespace-surface-shim.js`。**本文不决定的**：默认切换的日期（D1）、二进制托管在哪、Mac / Windows 内核、UI 渲染稿（设计台另出）。

**不变的法**（CLAUDE.md 路由表）：内核进程由 keeper 在今天 spawn Chrome 的同一处起（无新 spawn 点，§94 普查不变），环境走 `serviceEnv()` 白名单；事件里不带机器名 / 用户名 / 密钥值；每个拒绝有名字，进 routes 的 `STATUS` 表；保险库条目对 bearer 只给用途 + 回执（use law）；插件代码**永不被 require 进编排进程**（loader 法）。

## §1 P0 — 引擎插件扩展点（lane engine-plugin）

### 1.1 两个插件家族，一张引擎注册表
本仓有两族插件：**内建**（src/plugins.js `PluginManager`：`{id,label,provides,create(h)}`，能力词 `provides`，`providerId(cap)`）与**清单**（src/server/plugin-loader.js：`data/plugins/<id>/vibespace-plugin.json`，`server: true` 的 `server.js` 以 `node --permission` fork，IPC v1）。内核方的包是**清单插件**。两族只在 ⚙ → Plugins 面板相遇；本车道让它们在**一张引擎注册表**相遇：
- 清单侧：新 `contributes.browserEngine: true`（src/plugin-manifest.js；要求 `server: true` 且 `contributes.routes: true`，否则按名拒绝；`needsConsent` 对它恒真 — 它决定哪个程序当浏览器）。这就是开场里"kind `browser-engine`, tier 1"的表达法；清单里不加 `kind`/`tier`。
- 内建侧：src/plugins.js `CAP_VERBS['browser-engine'] = ['probe','launchOptions']`（一个将来的内建引擎按同一契约答；今天没有成员）。
- 注册表：**ORCH** `src/server/browser-engines.js` `create({loader, plugins})` → `rows()`、`providerFor(id)`；清单成员只在 `enabled && trusted && state==='running'` 时在表里；每个 verb 是一次 loader `ask(rec, {t:'route', …})`（30 s IPC 上限，超时 = `browser_engine_unanswered`）。**PURE** `src/browser-engines.js`（imports nothing）：契约校验 `engineAnswerVerdict`、`{kind:'plugin'}` 的裁决片段、词。

### 1.2 provider 契约（VibeSpace 需要的子集；内核方的最终接口到了再对齐）
| verb（IPC 路径） | 答 | 状态 |
|---|---|---|
| `probe()`（`GET /probe`） | `{installed, executable, binaryPath, version: string\|null, protocol, kinds[], features[]}` | 盘上 `probeBinary()` 已有；**两处要改**：`--version` 失败时它编造 `'Chromium 142.0.7444.175'` → 必须答 `null`；它读 `process.env.CUSTOM_CHROMIUM_BIN` 且平台默认 `macos` → 路径由我方传入（§5.3），不读 env |
| `launchOptions({profileId, platform, binaryPath})`（`POST /resolve-launch`） | `{executablePath, args: string[], env?: {k:v}}` | 【待确认】盘上是 `resolveLaunch(body)`，形状未读到；`env` 的键只收白名单 `ENGINE_ENV_KEYS`（今天为空集），之外 ⇒ `browser_engine_env` |
| `version()` | = `probe()` 的 `{protocol, kinds, features}`；活的那份是 CDP `VibeSpace.getVersion` | 两份不一致 ⇒ 以 CDP 为准，journal 一行 |
| `attachTarget(cdp)` | **不是插件 verb**：`VibeSpace.enable` 由我方 dialog watch 在自己的 socket 上做（原始端点永不出服务器；插件 JS 不进编排进程） | 开场里的 `attachTarget(cdpClient)` 若是给我方用的 shim，不采用【待确认】 |

错误码（闭集，并入 src/browser-builds.js `BUILD_CODES`，routes `STATUS` 皆 409）：`browser_engine_missing`（插件未装 / 未启用 / 未信任）· `browser_engine_kernel_missing`（插件在、二进制不在 — `browser_build_missing` 同类：按名拒绝、复用 `p.buildMissing` 标记 + ONE For-you 条目 `BB.missingNotice`）· `browser_engine_not_executable` · `browser_engine_protocol`（`protocol !== 1` 或 `features` 无 `surfaces`）· `browser_engine_unanswered` · `browser_engine_env`。

### 1.3 选择模型（src/browser-builds.js，user-only 如今天）
- `normalizeBrowserChoice`：`{kind:'plugin', id}`，`id` 过 plugin-manifest 的 `ID_RE`；`sameChoice`、`choiceView` 同步；`agentChoiceView` 答 `{kind:'plugin', id}`（插件 id 是公开名，不是路径 — D4 若 owner 不同意则只答 kind）；`buildWords` →「the <label> engine」；`missingNotice` 多一分支。
- `browserChoiceVerdict({choice, provider, by, builds, pathFact, engine})`：`engine` = 调用方交来的 `probe()` 答案或 `{code}`（像 `builds`/`pathFact` 一样是事实，PURE 不去问）。顺序：well-formed · `by==='user'` · provider 行 `buildChoice`（只有 chromium 行）· `engine` 在 · `installed && executable` · `protocol`。成功答 `{ok, choice, executablePath: engine.binaryPath, version, major: null}`。
- keeper `launchBuildOf(p)`：`c.kind==='plugin'` ⇒ `engines.launchOptions(id, p)` → `providerEnv = SW.launchEnvFor('chromium', {executablePath})`，`args` 并入 `AGENT_BROWSER_ARGS`（过 `BE.withQuietLogging`），`env` 过白名单。两条路都吃它：attach 路（`attachExe = buildEnv.executablePath || …`）与 driver 路（browser-serve.js `writeBuildView` 的 launch view 文件 → `AGENT_BROWSER_EXECUTABLE_PATH`）。`rec.browserChoice` 记 `{kind:'plugin', id}`。
- 面板：Change build… 对话框多一张卡「自研内核」（`SW.switchChoices` 读引擎表，卡上是 `probe()` 的 `version`，永不是路径）；词 en/zh/ja。

### 1.4 默认策略 = 一个带阶段的设置
- 设置键 **`browser.defaultEngine`**（src/lib/settings-schema.js，类别 Agent browser，tier advanced，enum `'default' | 'plugin:vibespace.custom-browser'`，默认 `'default'`）。读点两处：profile **创建**时 `choiceAtCreate(input.browser == null)`，与对话的**托管临时浏览器**启动时；选择随即**写在记录上**（`rec.browser`），之后翻设置只影响新建的 — 已有 profile 由用户在面板换（不静默迁移）。
- 阶段 A（本车道）：本地默认 `'default'`；集群用 **fleet 事实**而非 env（lane oauth-relay-one-source 的教训：env 只在重启时动）：Helm `values.yaml` 新块 `customBrowser: {enabled, default, source: {git, ref}, kernel: {url, sha256}}`，渲染进 presets 的 `fleet.json` 一个键 `browserEngine: {plugin, default: true|false, source, kernel}`（src/preset-layers.js `mergeFleet` 按字段合并）。优先级：用户自己设过的值 › `fleet.json` › `'default'`；设置行显示「由集群预设」。
- 阶段 B（D1，owner 的翻转，另一条小车道）：schema 默认改成插件值；之前建的 profile 不动。
- 门：test-browser-builds（PURE 新 kind 的每一行裁决 + 真 keeper 过一个答 `launchOptions` 的假引擎与共享假二进制 + 消失的内核按名拒绝且 ONE For-you + 补丁副本对照；现 6.9 s，新腿要留在 10 s 内或记名 `over:` 债）· test-plugin-loader（`contributes.browserEngine` 的校验矩阵 + fixture 引擎插件进表 / 不信任不进表）· test-plugins-grammar（能力词）· test-helm-render（`customBrowser.*` → fleet.json 键）· heavy test-browser-mediation-chrome 新腿：真 agent-browser 以**假内核**为"浏览器"（§6.2 的 Target.* 缺口是前提）。

## §2 P1 — surface 事件 → 对话框管线（lane browser-surfaces）

### 2.1 握手与来源
每个活着的本地浏览器一条 browser-endpoint socket（已有）：attach 时先 `VibeSpace.getVersion`（无该方法 = 老内核 / 标准 Chrome ⇒ 今天的路，一行 journal，不再问）；`features` 含 `surfaces` ⇒ 每个 page session `VibeSpace.enable`【待确认：事件发在 browser session 还是 page session；本文按"带 `targetId` 的事件、两处都收"写】。**一个浏览器一个来源**：有 `surfaces` 的内核上，`js-dialog` / `file-chooser` / `http-auth` / `permission` / `print` 都从 surface 读、用 `answerSurface` 答，**不再**读 `Page.javascriptDialogOpening`、`Page.fileChooserOpened`、`Fetch.authRequired`【待确认 Q10：内核是否仍发这些】；标准 Chrome 上旧路不变。`ST.autoAnswerVerdict`（alert 立即接受、其余 HELD）照用。

### 2.2 字段映射（PURE src/browser-surfaces.js，imports nothing）
`surfaceBlock(s, {now})` 产出与 `ST.dialogBlock` 同形的块，旧消费者（routes 事实、chip、live view、`notice`）不改读法：

| surface 字段 | 块字段 | 规则 |
|---|---|---|
| `surfaceId` | `id` | 原样（≤ 64 字） |
| `kind` | `kind`；`type` = `js-dialog` 时 `detail.dialogType`（alert/confirm/prompt/beforeunload），否则 = kind | 未知 kind ⇒ `kind:'unknown'`，`kindSaid` 带原词（clip 32） |
| `title`, `message` | `title`, `message` | 页面文字：`ST.pageText`（MESSAGE_MAX）；向 agent 的那份过 src/peer-text.js `toAgentText`（新普查行） |
| `origin`, `frameOrigin` | `url`, `frameOrigin` | 只收 origin 形状（scheme+host+port），不收路径 |
| `fields[{fieldId,type,label,required,options?,defaultValue?}]` | `fields` | type 闭集 `text|password|file|choice|credential`；≤ 16 项 |
| `answers[{id,label,kind}]` | `answers` | kind 闭集 `accept|dismiss|choose|text|file|credential`；≤ 8；盘上 bridge 另给 `actions[]`（字符串别名）— 以 `answers` 为准，`actions` 只用于校验 |
| `blocking`（bridge 另有 `blocksInput`、`modality`） | `blocking`, `modality` | `modality` 闭集 `tab-modal|non-modal|anchor|page`；缺省由 kind 表给 |
| `createdAt`/`openedAt`, `expiresAt` | `openedAt`, `openForMs`, `expiresAt` | 服务器时钟差校正如今天 |
| `detail` | `detail` | **每 kind 一个键白名单**（§2.3 表的"detail 收"列），值 clip；其余丢 — 永不整段转发 |

`surfaceUpdated {surfaceId, patch}` ⇒ 只允许改 `message/fields/answers/detail/expiresAt`；`surfaceClosed {surfaceId, how, by}`（bridge 另带 `reason/outcome`，忽略）⇒ `emit({kind:'closed', answered:{how, by}})`。

### 2.3 20 个 kind 的处理类（census：每 kind 一行，缺一行 = red）
处理类：**HELD** = 在飞的 verb 立即以 `dialog_open` 收尾并点名 kind，之后每个 verb 重复，chip / live-view 横幅 / 无 verb 时 ONE 免费 notice；**NOTED** = 不挡页，下一个结果里一句话 + chip；**SILENT** = 只写 trace 行；答法：**A** = agent 可答（`vibespace-browser answer <id> <answerId> [--value k=v]`）、**O** = 只有 owner（live view 横幅 / For-you 卡；agent 只能 `cancel`，否则 `surface_owner_only`）、**P** = 策略自动答。

| kind | 类 | 答 | 默认 / 规则 | detail 收 |
|---|---|---|---|---|
| js-dialog | HELD（alert P accept） | A accept[text] / dismiss | 今天的规则 | dialogType, defaultPrompt |
| http-auth | HELD | O（填 = §4 的 `web-login` 条目）/ A cancel | 不再出现原生 sheet（`NATIVE_SHEET_PAGE_RE` 之路只留给标准 Chrome） | isProxy, host, realm, scheme |
| client-cert | HELD | O select / A cancel | 候选只列 subject/issuer/有效期 | host, candidates[{id,subject,issuer,notAfter}] |
| permission | NOTED | P deny（today 的 deny-ahead 法）；`vibespace-browser permission <kind> allow` 预先放行 ⇒ P allow | 永不挂起 | permissions[], requestingOrigin |
| file-chooser | HELD | A select-files（只在 profile 的 downloads 目录内）/ cancel；`save` 模式 O | 路径 realpath 在沙箱内，否则 `surface_path_refused` | mode, acceptTypes, defaultFileName |
| download | NOTED | P allow 进沙箱下载目录；`dangerous` ⇒ HELD O | 进度走 `surfaceUpdated` | suggestedFilename, mimeType, totalBytes, receivedBytes, state |
| print | HELD | A save-pdf（写进会话工件目录）/ cancel | 今天的 print 释放法 | initiatorOrigin, title |
| popup | NOTED | A open-in-tab / deny；P deny（被策略拦下的） | 新标签页归 opener 的持有者（`openerId` 法） | targetUrl, openerOrigin, blockedByPolicy, newTargetId |
| select-popup | HELD（anchor） | A select / cancel | VibeSpace 画下拉；`fieldId` 原样回传 | fieldId, multiple, options[{index,label,disabled}], anchor |
| webauthn | HELD（passkey 态） | §3 | `passkey_open/passkey_ask` 词不变 | requestId, op, rpId, userVerification |
| credential | NOTED | §4 | `fill` 只经 `login` 动词 | formId, kind, pageOrigin, frameOrigin |
| payment-request | HELD | A cancel（唯一答案） | 内核答 NotSupportedError | — |
| external-protocol | NOTED | P deny（固定） | 永不唤起宿主程序 | scheme, initiatingOrigin |
| interstitial | HELD | A go-back / O proceed | proceed 要 owner | interstitialType, certError, overridable |
| fullscreen | NOTED | A allow / exit | 视口尺寸不变 | origin |
| pointer-lock | NOTED | P deny；A allow | — | origin, userGesture |
| media-picker | HELD | O select / A cancel | 只暴露受控 tab 源 | audioRequested, sources[{id,kind,title}] |
| device-chooser | HELD | O select / A cancel | — | deviceKind, devices[{id,name}] |
| native-picker | HELD（anchor） | A set-value / cancel | VibeSpace 画 date/color | pickerType, fieldId, currentValue, min, max, step, anchor |
| suppressed | SILENT | — | trace 一行 `surface:suppressed <suppressedKind>` | suppressedKind, reason |
| （unknown） | `blocking` ? HELD : NOTED | A 的 answers 原样 | 通用卡，永不丢 | title/message 以外全丢 |

### 2.4 重连、答、画
- **三触规则**（设备 op 法移用）：① 每次 (re)attach 后 `VibeSpace.enable`；② `VibeSpace.listSurfaces {targetId?}` 把 `w.open` 对齐 — 不在列表里的 emit `closed {how:'navigated', by:'kernel'}`，新出现的 emit `open`；③ CLI 的长轮询 `waitForOpen` 重新武装（`held/heldAt` 逻辑不动）。
- **答**：routes `POST /api/agent/browser/dialog`（现有）的 body 多 `{answerId, values?, files?}` → `D.answer` → `VibeSpace.answerSurface`；内核的六个错误码按名映射：`no_such_surface→no_dialog`、`invalid_action→bad_answer`、`stale_origin→surface_stale`、`invalid_values→bad_values`、`eval_failed/no_such_request→answer_failed`。用户：live-view 横幅按 `answers` 画按钮（`text/credential/file` 类打开 sheet）；For-you 卡 `action.type:'browser-surface'` approve/reject 带 `shown`（r6 A-F8 法）。CLI 新词 `vibespace-browser surfaces`（列表）、`answer <id> <answerId> [--value k=v]`。
- **画**：VibeSpace 画（actor + verb + object 一张卡，细节折一层，主题变量，无原生对话框）；内核**不画**；`blocking` 站着时 live-view relay 丢弃向页面的输入；X 画面之路（lane browser-x-in-window）不再有原生 sheet 可看。
- 门：**test-browser-surfaces**（新 fast：PURE 块 + 20+1 行 census 与 `VIBESPACE_SURFACE_KINDS` 的本仓副本 `SURFACE_KINDS` 逐字相等（drift = red）+ dialog watch 过 §6.1 的假内核：open/update/close/listSurfaces 重连/三触/每个错误码）· test-peer-text-census（新行）· test-record-clear-census（新 emit kinds）· test-browser-dialogs 现有腿不动 · heavy 腿见 §1.4。

## §3 P2 — passkey 下沉（lane passkey-sink）

- **开关**：`features` 含 `webauthn` 的浏览器上，watch **不注入** `PK.installHook`、**不配对**虚拟认证器（这两段代码留给标准 Chrome）；仪式记录 `PK.applyEvent`、`passkeyVerdict`、For-you、chip、`passkey status|cancel` 全部复用 — 记录的来源换成 `VibeSpace.webauthnRequest`。
- **请求**：`VibeSpace.webauthnRequest {surfaceId, requestId, targetId, rpId, origin, kind|op:'create'|'get', clientDataHash, challenge, allowCredentials?, pubKeyCredParams?, residentKey?, userVerification?, user?:{id,name,displayName}, extensions?}`（bridge 同时给 `kind` 与 `op`；以 `op` 为准）→ `PS.gateVerdict({kind, rpId, origin, rows, grant, input:{allow: allowCredentials, mediation}, answer, profileSwitch, takeover})` — §2.3 表原封不动。
- **签名者**：新 **PURE** `src/webauthn-sign.js`（imports nothing；node `crypto` 注入）：`authenticatorData({rpId, flags:{up,uv,at,be,bs}, signCount, attested?})`、`assertion({privateKeyPkcs8, clientDataHash, authenticatorData}) → {signature}`（ES256）、`makeCredential({rpId, user, challenge…}) → {credentialId(32 B 随机), publicKeyCose, attestationObject}`（`fmt:'none'`，内含最小 CBOR 编码器：uint/bytes/text/map/array）。密封键材料就是今天 `keySealed` 里的 PKCS#8（虚拟认证器时代同一形状，老行可直接用）。**UV 位 = gate 的 `uv`**（只有 owner 的答 / policy yes / takeover 才真）；`signCount`：签前 `PS.bumpSignCount`，答后 `reconcile`。
- **答**：`VibeSpace.webauthnAnswer {surfaceId, requestId, get:{credentialId, authenticatorData, signature, userHandle}}` / `create:{credentialId, attestationObject, clientDataJSON?}` / `error:'NotAllowedError'`。`ask` ⇒ 现有卡（`pkNewAsk`），内核的请求等着；ASK_MS 过期 ⇒ `error`。拒绝 ⇒ `error` + 原因进记录（REASONS 不变）。`cancelPasskey` ⇒ `VibeSpace.cancelSurface`【待确认 Q4：页面收 NotAllowedError（内核方说法）还是今天的 AbortError】。
- **新建**：密钥对在服务器生成（P-256）→ `cipherOf(crypto, key).seal` → 行 `{credentialId, rpId, userHandle: user.id, userName, displayName, keySealed, signCount:0, createdBy, policy: NEW_KEY_POLICY}`；写者仍只有 browser-dialogs.js。
- **拒绝（按名，闭集）**：现有 REASONS + `webauthn_alg_unsupported`（`pubKeyCredParams` 无 ES256 -7）· `webauthn_rp_mismatch`（我方再查一次 `rpMatches`，不信内核）· `webauthn_key_locked`（`keyRefusal` — 保险库锁着 ⇒ `error` + 现有 key For-you 行）。
- **不做**：OS 认证器 / GPM 回落（内核侧已封死，我方不配虚拟认证器）；`conditional` 中介无钥匙 ⇒ 页内 refuse 的那条规则由内核答 `NotAllowedError` 替代。
- 门：**test-webauthn-sign**（新 fast，PURE：authenticatorData 字节、flags 位、CBOR 向量、断言用 node `verify` 对公钥验签、attestation 'none' 字节钉死、signCount 单调）· test-browser-passkey-store（+ 新建行的形状）· test-browser-passkey ⑦（内核路的事件 → 记录）· chrome 腿：§6.1 假内核 `triggerWebAuthn` → 我方 `get.signature` 对密封钥的公钥半边验签通过；`cancel` ⇒ stub 的 promise 以 `cancelled` 落地；三个变体对照（uv 恒真 / signCount 不动 / rp 不查）RED。

## §4 P3 — 密码管理器（lane browser-login）

- **条目形状 — 决定：保险库 ENTRY，不是 STORE_KEYS 行**。名 `web-login:<origin>#<user>`（`origin` = scheme+host(+port)，`user` = 用户名小写；`SECRET_RE` 加前缀 `web-login`），值 = 密封 JSON `{v:1, origin, origins?:[], username, password, totpName?, createdAt, by:'owner'|'agent', lastUsedAt}`。理由：entry 之路白拿 use law（`noteUse` 用途 + 回执）、揭示门（验证是你）、审计、Vault 窗口分区（src/vault-inventory.js `PURPOSES` 新行 `web-logins`「网站登录」）；STORE_KEYS 行是给"一张有自己写者与计数的表文件"的（passkeys），一个登录不是。
- **GRANT 行**：src/grant-model.js `DOORS` 加 `browser-login`，resource = `<origin>#<user>`（与条目名同拍，一行一条目）；owner 的门 = Vault 窗口该条目的「用于…」（totp 同款）→ `grants.set`；判定 `admits(rowsFor('browser-login', res), facts)`，拒绝按模型的名（`not_granted/excepted/…`）。LEGACY 无（新门）。test-architecture §97 自动覆盖。
- **检测**：`VibeSpace.credentialFormDetected {surfaceId|formId, targetId, pageOrigin, frameOrigin, actionOrigin?, kind:'login'|'signup'|'change-password', fields[{fieldId, type:'username'|'password'|'new-password'|'otp'}]}`（bridge 另带 `hasSubmit`，忽略）→ watch 记在 tab 上（`e.forms`，≤ 8，随导航清）。
- **填**：新动词 `vibespace-browser login [<origin>] [--user <u>] [--submit]`（无参 = 当前 tab 的 origin）→ `POST /api/agent/browser/login` → 判定链（PURE `src/browser-login.js` `fillVerdict`）：tab 上有表单 · **钓鱼规则**：`pageOrigin === frameOrigin === entry.origin`（精确到端口，不放宽到可注册域；`http:` 只允许 localhost）· 多个条目 ⇒ `login_ambiguous` 要 `--user` · grant admits · 保险库开着（否则 `vault_locked`）→ `VibeSpace.fillCredential {surfaceId, values:{<usernameFieldId>: u, <passwordFieldId>: p, <otpFieldId>?: code}, expectedOrigin: entry.origin, submit:false}`（内核再比一次 origin ⇒ `stale_origin`）→ agent 得 `{ok, purpose, receipt}`，**永不得值**（`noteUse('web-login:…', {by:'agent', door:'browser-login'}, {purpose:'sign in at <origin>'})`）。
- **TOTP**：条目 `totpName` 指向 `totp:<name>`；`otp` 字段的码由服务器 `T.totp` 算出直接填入 — **D3**：browser-login 的 grant 是否即覆盖配对的两步码（推荐：是 — 码不出服务器，agent 看不到任何值，再要一次 totp grant 只是重复点头）。
- **提交后保存**：`VibeSpace.credentialSubmitted {surfaceId, origin, usernameHint, password?, outcome:'navigated'|'error'}` — 密码只走 loopback 的那条 CDP socket；watch **只在内存**持有（`w.pendingSaves` ≤ 4，10 分钟，过期清零），一张 For-you 卡「保存 <origin> 的登录 <user>？」（`browser-proposal` 的新 kind `save-login`，带 `shown`）；approve ⇒ 经保险库 create-only 门写条目（已有同名 ⇒ 卡上写「更新？」按名区分）；reject / 过期 ⇒ 清零。bearer 永不能 approve（use law）。已有条目且密码相同 ⇒ 不发卡。
- **生成强密码**：`login <origin> --new-user <u> --generate` ⇒ 服务器生成（≥ 20 字，`new-password` 字段若带 `minlength/maxlength/pattern` 则遵守【待确认 Q5b：内核是否报约束】），填入，走同一条 pendingSave → owner 一次点头才落库（D5：是否允许"agent 建账号自动保存"— 推荐否）。
- **内核侧**：密码管理器三层关闭（已确认）；我方不再在这条路上读 `Fetch.authRequired`；`http-auth` surface 的 O 答 = 选一个 `web-login` 条目（同样的钓鱼规则与 grant）。
- 门：test-vault-law（新前缀过 `lawfulKey`/`noteUse`；一个把值答给 route 的补丁副本 RED）· test-grant-model（新门行 + resource 语法）· test-grants-store · **test-browser-login**（新 fast：PURE 判定每一行、字段映射、pendingSave 状态机、词；+ §6.1 假内核的 `detectCredentialForm`→`fillCredential` 腿，断言只看 stub 的 `filledCredentials` 计数与 `expectedOrigin`，从不比对值）· test-vault-inventory ⑧（purpose 行）· test-browser-cli（新动词）。

## §5 P4 — 私有 Git 安装与集群分发（lane engine-distribution）

### 5.1 私有仓库的凭据
src/server/plugin-install.js 的 `git` 源已在（`git clone --depth 1`，https/ssh 形状校验，`GIT_TERMINAL_PROMPT=0`，`GIT_SSH_COMMAND='ssh -o BatchMode=yes'`，60 s，去 `.git`）— 私有仓库今天**必失败**（无凭据之路）。凭据 = 一条 **integration 行** `plugin-git`（src/integration-registry.js：`host`（非秘密）· `token`（秘密，https PAT）或 `deployKey`（秘密，多行 ssh 私钥）· `test.kind:'reachability'` = `git ls-remote`；`consumers: ['plugin-install']`，`wiredIn: P4`；集群层由 presets 的 `integrations.json` 下发，每个 pod 都有）。安装器 `resolveIntegration('plugin-git')` 后把凭据交给 git **只经文件**：https ⇒ `GIT_ASKPASS=<0600 脚本>` 读 0600 临时文件；ssh ⇒ `GIT_SSH_COMMAND='ssh -i <0600 key> -o IdentitiesOnly=yes -o BatchMode=yes'`；clone 结束 `replaceShredding` 粉碎临时文件；URL 里永不带 token（`GIT_HTTPS_RE` 本就拒绝 `user@`）；env = `serviceEnv()` + 这两个变量（§94 普查：既有 spawn 行，env 改 ⇒ 该行改）。`update(id)` 重拉记录的源；能力哈希变 ⇒ 禁用 + 重新同意（loader 法不动）。

### 5.2 一致性与同意
清单 `engines.vibespace` 定最低主机版；`capabilities.server` 只需 `fs.read` 自己目录（内核由 keeper 起，插件进程**不要** `childProcess`、不要 `net`）。同意：`contributes.browserEngine` ⇒ `needsConsent` 恒真 — **D2**：集群管理员装的插件可否带 `trust {by:'fleet'}` 预信任（面板写「由集群安装并信任」）？推荐：**可**，但只对 `fleet.json` 点名的那个 id + 记录的 `contentHash`；用户自装的仍点一次。

### 5.3 内核二进制（1.2 GB，不在包里）
决定：**VibeSpace 下载，插件只回答路径与参数**。包内 `kernel.json`【内核方交付】`{platforms: {'linux-x64': {url, sha256, bytes, version}, …}}`；`probe()` 答 `installed:false` 时，我方走 design 004 的 Chrome-builds 下载路（`downloadPlan` / `buildCompatVerdict` 的磁盘与平台硬行 / sha256 校验 / `zipShapeVerdict` / 永不出 builds 目录）落到 `~/.agent-browser/browsers/engine-<id>-<version>/`，再把 `binaryPath` 放进 `/resolve-launch` 的 body。拒绝复用 `build_fetch_failed / build_verify_failed / disk / build_platform_unsupported`。好处：插件进程零网络、零子进程；坏处：解压形状由我方校验（`kernel.json` 要写 `layout`）。

### 5.4 集群
PVC 即 home：清单插件在 `data/plugins/<id>`，内核在 `~/.agent-browser/browsers/`，都在 PVC 上；镜像**不带**内核（镜像体积法）。pod 启动（chart `customBrowser.enabled`）：server.js 一步**离主循环**的 job — 注册表无该 id 或记录的 `ref` 不同 ⇒ `loader.install({source:'git', value})`；`customBrowser.preinstall:true` ⇒ 随即下载内核，否则首次启动时按需（1.2 GB + 解压 ⇒ `disk` 拒绝点名 PVC 剩余）。每次 boot 只比对记录，不重拉。
- 门：test-plugin-trust（git 源 + 凭据文件：spawn 的 argv/URL 钉死无 token；粉碎后文件不在）· test-integration-registry（新行 + env 名普查）· test-browser-builds（引擎下载腿复用 004 的假文件主机）· test-helm-render（`customBrowser.*` → fleet.json）· test-plugin-loader（boot 安装步骤过假 git 源）。

## §6 交接与 CI

### 6.1 假内核 = 快速层的 oracle
我方 CI 不能依赖私有仓库 ⇒ **本仓自己的假内核** `scripts/fixtures/fake-kernel.mjs`（说本文 §2–§4 的协议：surface 形状、`Target.setDiscoverTargets/attachToTarget` + 带 `sessionId` 的帧路由、六个错误码、`webauthnRequest/Answer`、`credentialFormDetected/fillCredential/credentialSubmitted`），喂 test-browser-surfaces / test-browser-login / test-browser-passkey ⑦ / test-browser-builds 引擎腿（fast，in-process，各 < 10 s）。**ONE** heavy 腿（test-browser-mediation-chrome）在 `VIBESPACE_CUSTOM_BROWSER_PLUGIN=<path>` 指向内核方包时跑**他们的** `fake-kernel-stub.mjs`，否则 SKIP 带证据；两只假内核之间的漂移是**发现**（报告行），不是红。真内核：本机 heavy chrome 套件跑一轮（`--chrome <binary>` 的既有口）。

### 6.2 今天读到的 stub 缺口（交内核方）
① 不答 `Target.setDiscoverTargets` / `Target.attachToTarget`（返回 `{}` 无 `sessionId`），不发 `Target.targetCreated`，帧无 `sessionId` 路由 ⇒ 我方 watch 永远 attach 不上 page；② `probeBinary` 读 `CUSTOM_CHROMIUM_BIN`、平台默认 `macos`、版本编造字符串；③ `fillCredential` 以 `data-vs-field-id` / `id` 找元素 — 真内核的 `fieldId`（`f-<frameRoutingId>-<rendererId>`）要由内核解析，不是 DOM；④ `webauthnAnswer` 经主世界 `window.__vsSpi` 队列 — C++ 下沉路**不得**向页面暴露 `__vsSpi`；⑤ `surfaceClosed` 多 `reason/outcome`、`answerSurface` 收 `action` 别名 — 可留，我方只读闭集。

### 6.3 交接清单（每条车道合入前）
PURE 行：`src/browser-engines.js` · `src/browser-surfaces.js`（`SURFACE_KINDS` 副本）· `src/webauthn-sign.js` · `src/browser-login.js`，皆进 test-architecture 的 PURE 集；能力词 `browser-engine`（CAP_VERBS）+ 清单键 `contributes.browserEngine`；`STATUS` 新码：§1.2 的六个 + `bad_answer / surface_stale / bad_values / surface_owner_only / surface_path_refused / login_ambiguous / login_frame_mismatch`；census：20+1 kind 行、peer-text 行、record-clear 的新 emit kinds、§94 的 git spawn 行、§97 的新门；设置键 `browser.defaultEngine` + Helm `customBrowser.*` + fleet 键 `browserEngine`；保险库：`SECRET_RE` 前缀 `web-login`、`PURPOSES` 行；CLI 词 `surfaces / answer / login` + 手册段；kb-file-structure 每个新文件一行；词 zh/ja/en。

### 6.4 待定问题
**Owner**：D1 默认翻转的时点与范围（本地也翻？）· D2 集群预信任（§5.2，推荐可）· D3 login grant 覆盖配对 TOTP（推荐是）· D4 agent 可读引擎 id（推荐可）· D5 agent 建账号的密码自动保存（推荐否，一次点头）。
**内核方**：Q1 provider 最终接口 + `/resolve-launch` 的 body/答形状 · Q2 `VibeSpace.*` 事件发在 browser 还是 page session · Q3 `js-dialog` 是否与 `Page.javascriptDialogOpening` 双发 · Q4 `cancelSurface` 后页面的错误名 · Q5 `fieldId` 的解析归属（+ Q5b 字段约束是否上报）· Q6 `kernel.json` 每平台工件 + sha256 + 解压 layout · Q7 stub 的 Target 域（§6.2 ①）· Q8 开场所列 `activate/createBrowserEngineProvider` 与盘上 `server.js` 的关系 · Q9 `kind/tier` 以 `contributes.browserEngine` 表达是否接受 · Q10 有 `surfaces` 时是否仍发 `Page.javascriptDialogOpening/fileChooserOpened` 与 `Fetch.authRequired`。
