# 设计：浏览器子系统里的通行密钥库（WebAuthn passkey store）— q-027

owner 2026-10-12 GO；凭据类：先设计，再车道 + 一条验证车道。设计台（Fable）2026-10-12。只设计，不建、不跑门。

**一句话**：每个 profile 一份密封的通行密钥表，由对话 watch（src/server/browser-dialogs.js）这唯一的写者管理；Chrome 的 CDP 虚拟认证器**按标签页**挂、**平时为空**，只在 owner 放行的那一次仪式里装入那一把钥匙、仪式一结束就卸下；注册先问、断言按策略；一切复用 browser-passkey.js 已有的仪式记录与 AbortController，不建第二个追踪器。

> **As built (P1, lane passkey-store-core, rel261).** P0's headed measurements (/var/tmp/vibespace-lanes/passkey-headed-probe) changed §2.2:
> (a) the hook's fallback is NOT "release the native call after 1.5 s" — once the watch's CDP session or socket is gone the native get hangs ≥ 9 s past the page's own timeout with no window. The hook REJECTS IN-PAGE (NotAllowedError) when no verdict arrives in 1.5 s (`HOOK_HOLD_MS`); the native call is made only on the watch's `release`. The watch re-pairs `WebAuthn.enable({enableUI:false})` + `addVirtualAuthenticator` on every attach, and the hook's binding + key are kept PER PROFILE across sockets, so a re-arm REBINDS the wrapper already in the page instead of wrapping it twice.
> (b) `enable` and the authenticator are ONE step (`pairAuthenticator`); an add that fails disables the domain again. Teardown never uses `WebAuthn.disable` for an in-flight ceremony — the hook's own AbortController / reject does.
> (c) `enableUI:false` stays (no GPM bubble, no window).
> Built differently from the text below: the row's key field is `keySealed`; the key file is `data/browser-passkeys.key`; an autofill (conditional) get is HELD and judged like any get (no key ⇒ refused in-page; a key with policy ask ⇒ a card — never silent); one ceremony per tab at a time is serialized by the watch (a gate waits for the last ceremony's unload) and in the page (a queued ceremony waits for `drained`, 300 ms fallback); `passkey forget` of a key the PERSON registered is refused for the agent (the owner removes it — no proposal kind for it yet); the cards' rendering, the live-view banner's ask buttons, the panel table and the For-you notice words are P2's. Owner routes: `GET /api/browser/passkeys?profile=`, `PATCH /api/browser/passkeys/:profile/:id {policy}`, `DELETE /api/browser/passkeys/:profile/:id`, `PUT /api/browser/passkeys/:profile/switch {agentsOff}`; a card is answered through `POST /api/browser/proposals/pk-…/approve {shown, choice}` / `…/reject`.

---

## 1 事实（代码行 + 本次探针）

### 1.1 已有的门（生产 d8a709566 / 2.369.254）
- **仪式记录**：src/browser-passkey.js:145–206 `installHook` 在主世界包住 `navigator.credentials.get/create`，每个 publicKey 仪式一条记录 `{id, kind, rpId, startedAt, tab, outcome}`（:51–53），`conditional` 中介**直接放行、不记录**（:188）；取消 = watch 用 128 位 key 调被包住的 `get('cancel', key)`（:180–184, :210）。记录 ≤ 16 条/标签页（:31）。
- **判定与句子**：`passkeyVerdict` 3 s 后 `passkey_open`（:28, :78–86）；`passkeyText` 的句子是「The agent's browser holds no passkey of yours…」（:88–91）；`loopVerdict`：动作动词答句子、读动词加注、出路放行（:103–108）；20 s 后一条 For-you 条目（:30, :131–143）。
- **watch**：每个 profile 一个 CDP socket（browser-dialogs.js:118 `pkBinding/pkKey` 每次武装随机）；每个标签页 `Page.enable` 后 `armPasskey`（:208–213）→ `Runtime.addBinding` + `Page.addScriptToEvaluateOnNewDocument` + `Runtime.enable`（:1061–1066）；绑定事件进记录（:277–279）；`passkeyIn` 对会话范围内已武装的标签页求判定（:1078–1084）；`cancelPasskey` 逐上下文 `Runtime.evaluate`（:1104–1118）。没武装的标签页读作 `unknown`，永不 `passkey_open`（:57）。
- **路由与 CLI**：POST /api/agent/browser/passkey `status|cancel`（src/routes/browser.js:1842–1861）；用户在接管时 `cancel` 被拒 `browser_interrupted`（:1860，`k.inputStateFor` browser-keeper.js:4550）。CLI 用法行 data/bin/vibespace-browser:133–134，动词 :1050–1063，循环判定 :744–761 / :882 / :944–956。作业也可调 `passkey`（src/browser-job-principal.js:32）。
- **动作行与卡片的路**：`permission` 动词的路（routes/browser.js:1871–1893）：watch 执行 → `ctx.traceDialogAct` 写 trace 行（mounts-plugins-wiring.js:919 → browserStream.tapDialogAct）→ 实时视图一行。通行密钥仪式走同一条路。
- **For-you**：`forYou.add` = `userTodos.add('browser', {kind:'notice'…})`（mounts-plugins-wiring.js:866–871）；kind 只有 `action|notice`（src/user-todos.js:119）；选项芯片 ≤ 6（:353, :450）；**已有的「人决定」门** = `action.type:'browser-proposal'` → POST /api/browser/proposals/:id/approve|reject（src/lib/user-todos-actions.js:245–259；routes/browser.js:60–67），同一张卡在聊天与托盘里都能按。
- **实时视图横幅**：passkey 态一个按钮 Cancel（src/lib/browser-live-window.js:983–1001）；prompt 态两个按钮（:974–976）是双按钮横幅的现成样子。
- **最近的库**：data/browser-kept.json，0600，进出都过 `normalizeKeptStore`（src/browser-kept.js:21–24）；**最近的密封**：src/accounts.js:46 `.accounts-key`（0600）+ :225–236 aes-256-gcm `_enc/_dec`。keeper 的其它库也是 0600（src/server/browser-keeper.js 全文 `0o600`）。
- **profile**：`bp-` id（src/browser-profiles.js:876）；谁能用 = `whoMayUse`（:1599–1610：`all` / `only [session|task…]`）；删除 = 注册表行走、**目录留着**（browser-keeper.js:1077–1104，「deletion is a human act」）；面板行的 ⋯ 菜单 `Delete…` 在最后（src/lib/browser-panel-model.js:98–110；ROW_ACTS :22）。
- **手册里要改的话**：docs/agent/browser-manual.md:35–38、:329–352、:759–760 都说「你的浏览器没有用户的通行密钥」。
- **q-026**：CDP 仍是动词之路，headed Chrome 在 xpra 显示上；原生对话框靠 X 窗口画面。通行密钥库上线后，被 watch 的标签页**不再出现 Chrome 自己的通行密钥窗口**（§1.2 T4/T10），X 画面只剩别的对话框。

### 1.2 本次探针（Chrome 154.0.8037.57，headless，localhost 页；脚本与原始输出 /var/tmp/vibespace-lanes/browser-design/q027-probe/{probe.mjs,probe.out.json}）
- **WebAuthn 域（此版本）**：`enable(enableUI?)` / `addVirtualAuthenticator` / `addCredential` / `getCredential(s)` / `removeCredential` / `clearCredentials` / `setUserVerified` / `setAutomaticPresenceSimulation` / `setResponseOverrideBits` / `setCredentialProperties(…, backupEligibility?, backupState?, signCount?)`；事件 `credentialAdded` / `credentialDeleted` / `credentialUpdated` / `credentialAsserted`。`Credential` 含 `privateKey`（PKCS#8）、`userHandle`、`signCount`、`userName`、`userDisplayName`、backup 两位。
- **T-scope 认证器按标签页**：A 页加的认证器，B 页 `getCredentials` 答「Could not find a Virtual Authenticator matching the ID」，反向亦然。⇒ 不是「每个 CDP 会话一个」，是**每个标签页一个**（watch 已经按标签页武装，正好）。
- **T1/T2 isUserVerified=false**：`create` 在 `required` 与 `preferred` 下都 1–3 ms 失败 NotAllowedError；**T6** `get` 同样。（`discouraged` 未测；§2.3 的围栏不依赖它。）
- **T3 isUserVerified=true**：`create` 2 ms 成功，flags 69（UP+UV+AT）；`credentialAdded` 事件**带私钥**（138 字节 PKCS#8）、userName/displayName、signCount 1 —— 收钥匙不必再 `getCredentials`。
- **T4 认证器为空**：`get` 1–8 ms 失败 NotAllowedError，没有窗口、没有等待 ⇒ 挂了空认证器的标签页上，事故那种「看不见的 Chrome 窗口」不会再出现。
- **T5 signCount**：`addCredential(signCount 5)` → 断言返回 6，`credentialAsserted` 事件带 6，`getCredentials` 同。
- **T7 条件中介（autofill）**：认证器里有可发现凭据且 UV=true 时，`get({mediation:'conditional'})` **1 ms 自行完成、无人点选**（signCount 7）⇒ 钥匙若常驻认证器，页面不经任何门就能登录。这是「平时为空」的根据。
- **T8** `setCredentialProperties({signCount})` 在 154 上接受。
- **T9 用 presence 模拟「挂起」**：关掉后请求挂起；**重新打开后 2 s 内仍挂起**，不是可放行的闸 ⇒ 否决「在认证器层等 owner」。
- **T10/T11** 环境已 enable 但没有认证器、或 disable 后：`get` 挂起（2.5 s 未归）⇒ **enable 与挂认证器必须成对**，永不只 enable。
- 车道 browser-passkey-chrome 的重控（0.38.1，headed/隐藏窗口）已量：有凭据的虚拟认证器 < 0.2 s 完成仪式、从不 `passkey_open`；Chrome 自己的对话框是**标签页模态**画在浏览器窗口里。

---

## 2 设计

### 2.1 模型（每 profile 一表，唯一写者，密封，随 profile 删）
- **行**：`{credentialId(b64url), rpId, userHandle(b64), userName, userDisplayName, keySealed, signCount, createdBy:'agent'|'human', createdAt, bySession(注册它的对话 key，可空), lastUsedAt, uses, policy:'yes'|'ask'|'no'}`。
- **文件**：`data/browser-passkeys.json`，0600，按 profileId 分组（browser-kept.json 的样子）；PURE `src/browser-passkey-store.js`（`normalizeStore` 进出同一套门、`rowsOf`、`publicRow`（永不含 keySealed）、`gateVerdict`、`rpMatches`、`countLine`）；**写者只有 watch 所在的那一处**（browser-dialogs 的 `pkStore` 句柄，经 keeper 的 wiring 注入 fs 与 seal），路由与 CLI 只读 `publicRow`。
- **密封**：`keySealed` = aes-256-gcm，密钥文件 `data/.browser-passkeys-key`（0600，首次写时生成，accounts.js:217–231 的样子），`{seal, unseal}` 由 wiring 注入 —— B-4a59(b) 的 keyring 到了，换这一对函数即可。老实话：机器上的 root 仍能同时拿到两个文件；它挡的是**只拷走 data/ 的备份、挂载与同步副本**。
- **永不导出**：没有任何路由、digest、trace 行、CLI 输出、面板字段带 `keySealed` 或明文钥匙（验证镜头 ①）；`cookies|storage|state save` 不含它（它不在 Chrome 的 profile 目录里）。
- **删除**：`removeProfile`（browser-keeper.js:1077）同时删该 profile 的行（目录留着，钥匙不留 —— 钥匙是我们的，不是 Chrome 的）；面板 Delete… 对话框多一句「含 n 把通行密钥，站点上对应的登录方式会失效」；`passkey forget` 删一行（§2.6）。
- **按实例**：钥匙属于**这个 VibeSpace 实例**的库，不在 Chrome profile 目录里；同一 profile 目录复制到另一个实例，那边**没有**这些钥匙、也登不进去（面板表与手册都写明）。

### 2.2 认证器（每标签页一个，平时为空）
- **挂法**：`armHook`（browser-dialogs.js:1061）钩子武装成功后紧接 `WebAuthn.enable({enableUI:false})` + `addVirtualAuthenticator({ctap2, ctap2_1, internal, hasResidentKey, hasUserVerification, isUserVerified:false})`，记在 `e.pk.auth`；钩子没武装 ⇒ **不 enable**（保持今天的 Chrome 原生行为，T10 的挂起不能发生在没钩子的页上）。弹窗/新标签页走 watch 已有的 auto-attach。接管中的人、自己浏览的人用的也是这些标签页 ⇒ 同一个库（owner 要的）。
- **空载不变量**：两次仪式之间 `getCredentials` 恒为 `[]`（T7 的根据）；装入只在「放行」那一刻、只装**这次仪式匹配的行**（`get` 的 allowCredentials 命中的，或空 allowList 时该 rpId 下 policy≠no 的可发现行）；`end` 事件后 `removeCredential`。
- **一次仪式的流程**（钩子 ↔ watch）：① 钩子 `start`（扩字段：`uv`、`allow[]`≤20、`user{name,displayName}`、`origin`）并**扣住原生调用**，等 watch 的 `release(id,key)` / `refuse(id,key,why)`（与 `cancelExpression` 同路）；② watch 用 PURE `gateVerdict({kind, rpId, origin, rows, grant, input, policy})` 判：`release-now` / `ask` / `refuse(why)`；③ `release`：`addCredential`（断言）或 `setUserVerified(true)`（注册，仅本次）→ 放原生调用 → Chrome < 5 ms 完成；④ `credentialAdded` / `credentialAsserted` 事件 = 收获（新行或新 signCount，`lastUsedAt`，trace 行）；⑤ `end` → `removeCredential` + `setUserVerified(false)`。
- **钩子的保底**：`start` 后 1.5 s 没收到 watch 的判定（watch 死了）⇒ 放原生调用 —— 认证器是空的，页面 1 ms 得 NotAllowedError；钥匙永不裸露、页面永不卡死。
- **signCount**：放行前先把库里的 `signCount+1` 写盘再 `addCredential(旧值)`（认证器恰好产出 +1），事件回来再对账 —— 放行与收获之间崩溃也不会倒退。
- **远程 profile**（配对机器上的 keeper）：watch 的 socket 本来就通到那台 Chrome；钥匙只在仪式那几毫秒里经设备隧道（已加密）进出，机器上不落盘。
- **同一标签页的并发**：放行期间同文档再来的 `get/create`（含 conditional）在钩子里排队到本次 `end` 之后再跑（跑在已卸空的认证器上）。跨源 iframe 用不了别站的 rpId（Chrome 先校验 rpId 与源的可注册后缀关系，错配 SecurityError 到不了认证器）；watch 再加一道 `rpMatches(标签页 URL 的源, 行.rpId)`，只装源能用的行。

### 2.3 门（PURE `gateVerdict` 的判定表）
| 仪式 | 谁在操作（`inputStateFor`） | 条件 | 判定 |
|---|---|---|---|
| create | agent | 有该 (profile, rpId, 本对话 browserKey) 的**未用注册授权**（10 min 内、一次） | release（isUserVerified 仅本次）；收获行 `createdBy:'agent'`, `policy:'ask'`（owner 问题 1）|
| create | agent | 没有授权 | **refuse 立刻**（AbortError，站点显示「已取消」，站点那边不留半个注册）+ agent 句子：先 `passkey register <rpId>` |
| create | human（接管 / 自己浏览） | — | release；`createdBy:'human'`（owner 问题 3）|
| get | agent | 命中行 policy `yes` | release + 日志行 |
| get | agent | 命中行 policy `ask` | **ask**：一张 For-you 卡（§2.5），放行/拒绝/一直允许/永不；5 min 没答 ⇒ refuse（站点「已取消」，卡标「过期」）|
| get | agent | 命中行 policy `no`，或 profile 开关「agent 永不用通行密钥」 | refuse 立刻 + 句子「owner 已关闭」|
| get | agent | 该 rpId 没有行 | release 立刻 —— 认证器为空，页面 1 ms 得 NotAllowedError 并显示自己的其它登录方式；记录 `outcome:'error'`，agent 下一动词正常跑（不再 `passkey_open`）|
| get | human | — | release（人自己在登录）|
| 任何 | 人正在接管、仪式由 agent 在接管**前**发起 | — | 以**发起时**的操作者为准；接管不抬升挂起中的 agent 仪式；卡仍是唯一的「是」。agent 的 `passkey cancel` 在接管期间照旧 `browser_interrupted` |
| conditional get | 任何 | — | 钩子照旧直放（T4：空认证器 1 ms 失败），不进记录、不出卡 |

- **注册授权**：`vibespace-browser passkey register <rpId> [--user <name>]` → 路由在 owner 的 For-you 托盘发一张 `browser-proposal` 卡「<profile 标签> 要在 <rpId> 为 <name> 注册一把通行密钥 · 允许一次 / 不要」；批准 = `w.pkGrants.set(rpId+browserKey, {expiresAt, by})`，首个匹配的 `create start` 消费它；10 min 自动失效。CLI 的 `register` 同步等卡的结果（同 `--wait`，上限 5 min），答「已允许：现在去页面点『创建通行密钥』」或「owner 拒绝」。
- **默认**：新行 `policy:'ask'`；卡上「一直允许」→ `yes`，「永不」→ `no`；面板随时改（§2.5）。

### 2.4 词（browser-passkey.js 的句子分支；§16：agent 面英文、UI 面 t()）
- 新状态码 `passkey_ask`（`passkey_open` 的同类：动作动词答句子、读动词加注、出路放行、CLI 长轮询同样在 3 s 唤醒）：「This page is waiting for the owner to allow the passkey for <rp> (a card is in their For-you tray). Do not retry the click — `vibespace-browser passkey status` says when it is answered; `passkey cancel` withdraws the request.」
- `refused` 的句子按原因：no-grant（「Registering a passkey on <rp> needs the owner's permission first: run `vibespace-browser passkey register <rp>`, then press the page's button again.」）/ policy-no / expired。
- 老句子「holds no passkey of yours」只剩 `unknown`（没武装的标签页）；`passkey status` 多一段「this profile holds n passkeys for <rp>: <user> (policy …)」。手册 :35–38、:329–352、:759–760 改成三条：没有行 → 页面自己会说；有行 → 按策略；注册 → 先 register。

### 2.5 UI（主题变量、SVG、t() zh/ja/en、按键行就地打补丁、无灰按钮、无原生对话框）
- **面板**：Agent 浏览器面板 ▸ profile 行 ⋯ 菜单加「通行密钥 (n)…」（ROW_ACTS + `passkeys`；n=0 也在，开关在里面）→ 一张表（桌面：面板内的折叠区，按 q-015 的 subgrid；手机：底部 sheet）：列 **站点** · **用户名** · **来源**（agent / 你，日期）· **最近使用** · **策略**（三段：允许 / 每次问 / 不允许，就地切换，一次 PATCH）· ⋯（删除…）。表头一行：开关「agent 永不用通行密钥登录」（owner 问题 2）+ 一句「钥匙只在这台 VibeSpace 里；复制 profile 不会带走它们」。空表：「还没有通行密钥 —— agent 请求注册时你会在 For you 里看到。」
- **For-you 卡**（两种，都是 `browser-proposal`，聊天卡与托盘同一张）：注册「<profile> 要在 <rpId> 为 <user> 注册通行密钥」· 允许一次 / 不要；登录「<profile> 要用 <user> 的通行密钥登录 <rpId>」· 允许一次 / 一直允许 / 不允许 / 永不。卡上写清 agent 之后能做什么（「允许后 agent 可以用这个账号登录该站」）。
- **实时视图横幅**（`passkey_ask` 态）：同样两/四个按钮，走同一个 approve/reject 路由；看直播的人就是能答的人（他必须是 `whoMayUse` 里的人；不是则按钮不画、横幅说「等 owner」）。
- **仪式的痕迹**：每次 end 一行 trace（`action:'passkey'`, kind, rpId, user, outcome, by）→ 聊天里的浏览器卡一行「用 alice 的通行密钥登录了 github.com」/「注册被拒：没有 owner 许可」。

### 2.6 CLI
`vibespace-browser passkey list`（本 profile 的 publicRow：站点、用户名、来源、最近、策略、credentialId 前 8 位；**永无钥匙**）· `register <rpId> [--user <name>]`（§2.3）· `forget <rpId|credentialId>`（agent 注册的行直接删 + trace 行；人注册的行 → 一张 proposal 卡）· `status`（加库的答案）· `cancel`（不变；撤回 `ask` 中的卡）。作业路由表 `JOB_ROUTES_ALLOWED` 不变（同一个 `passkey` 路由）。

### 2.7 不做（点名）
从密码管理器导入（credential exchange）；hybrid/QR、BLE、USB 钥匙（被 watch 的标签页上 Chrome 自己的选择器不再出现 —— 想用自己手机上的钥匙，仍是「在你自己的设备上登录」）；无 CDP 的 xpra 档（q-026 已统一）；largeBlob/PRF 扩展；跨实例同步。

### 2.8 威胁行
| 威胁 | 围栏 | 证明（验证镜头）|
|---|---|---|
| agent 不经点击就在 owner 的账号上注册通行密钥 | 没授权的 create 在钩子里被 abort，私钥从未产生；授权一次一用、10 min、绑本对话 | 突变体去掉授权检查 ⇒ 重腿「未授权 create」必须失败 |
| agent 导出钥匙 | 行只经 `publicRow` 出门；`keySealed` 不进任何输出；CLI 无 export | 全面普查 `privateKey|keySealed` 在路由/CLI/digest/trace/面板输出 = 0 |
| 删 profile 留下钥匙 | removeProfile 同删行；对话框说数量 | 删后文件无该 profileId；突变体漏删 ⇒ 红 |
| 重放 / signCount 倒退 | 预增写盘再放行；事件对账 | 放行与收获之间 kill 进程，下一次断言的计数仍 > 库值 |
| 同一 profile 在两个实例 | 钥匙按实例；面板/手册写明 | 复制 profile 目录到第二个 keeper，`list` 为空 |
| owner 接管与 agent 仪式赛跑 | 发起时定操作者；接管不抬升；agent cancel 被拒 `browser_interrupted` | 重腿：agent 发起 → 接管 → 无卡不放行 |
| 页面假冒 rpId | Chrome 的 rpId/源校验在前；watch 只装 `rpMatches(标签页源, 行)` 的行 | evil 源请求 github 的 rpId ⇒ SecurityError，认证器始终空 |
| 条件中介静默登录（T7）| 平时为空；同文档并发排队 | 有行时 conditional get 永不成功 |
| 没钩子的标签页挂着认证器 | enable 只在钩子武装之后、且成对挂认证器 | 突变体先 enable 后钩子 ⇒ 红 |
| 钥匙经隧道 | 仅仪式内、设备隧道已加密、机器不落盘 | 远程 keeper 的 `getCredentials` 仪式外为空 |
| 页面预先包住 `CredentialsContainer.prototype.get`，在重新武装时拿到控制钥匙 + 特权 binding（passkey-verify 镜头 ②，已关闭 2026-10-13，lane passkey-prewrap-fix）| 控制只经钩子闭包里的 `ctl`：它存在原型的**私有字段**里（名字 = profile 的随机槽名，页面脚本读不到也造不出），watch 用 `Runtime.getProperties`（privateProperties）按**对象身份**找到它、`Runtime.callFunctionOn` 直接调用；包装函数不再接受任何控制动词，源码里不再有标记字符串；钥匙与 binding 名**每次武装**新铸，重新武装后旧钥匙被拒；重新武装发现槽位里是页面的函数 ⇒ 我们的包装放回去（`hook-displaced`：trace 一行 + Passkeys 卡片一句「页面替换了凭据 API（已重新接管）」，每个标签页文档一次） | 重腿 S9：页面放一个带旧标记的函数后断开重连 ⇒ 该函数零调用、槽位归我们、trace 一次；之后登录照常；旧钥匙经槽位与经 `ctl` 都被拒；突变体「按槽位找」「不接管」「不换钥匙」各自变红；基线树同一腿：该函数收到 `["rebind", 钥匙, binding]` |

**镜头 ② 的立场（lane passkey-prewrap-fix）：** 槽位**继续** `configurable`（锁死就是指纹）；防护是「身份 + 每次武装的钥匙」，不是锁槽。残余（不在本修复内）：活文档重新武装时 `Runtime.addBinding` 会把新 binding 短暂挂在全局上直到 REARM 取走（几个往返）；一个持续轮询全局名的页面能抢到它并伪造事件——上限仍是 trace / 卡片伪造，拿不到钥匙、不能跨源（Chrome 的 rpId↔源校验在前）。

### 2.9 被拒的方案
- **常驻装入（attach 时装、仪式后收）**：T7 证明条件中介会静默登录；且需要在每个新标签页重复装入。
- **在认证器层等 owner（关 presence 模拟）**：T9 证明重开不放行。
- **靠 UV 失败当围栏**：T1/T2/T6 在 154 上确实失败，但 `discouraged` 未测、版本可变；钩子扣住原生调用的围栏不依赖 Chrome 的内部选择。
- **第二个仪式追踪器 / 独立进程**：owner 明令不建；watch 已经是每标签页的唯一 CDP 客户端。
- **每次站点提示都自动出卡**：很多站登录后自动弹「创建通行密钥？」，会刷屏且不知 agent 意图；注册由 agent 先 `register` 表明意图。
- **用 Chrome 自带的 GPM 存钥匙**：钥匙在 Chrome 里、受 Google 账号与 OS 钥匙串约束，我们既管不了策略也删不干净。

---

## 3 削减 / 成本 / 风险 / 做否
| 项 | 成本 | 风险 | 做否 |
|---|---|---|---|
| PURE store + gateVerdict + 钩子扣住/放行 + watch 的挂/装/收/卸 + signCount + 文件 + 随 profile 删 + 新词 + CLI list/register/forget + trace 行 | ~900 行 + 重腿 | 钩子多一次往返（≈10 ms）；watch 死时的 1.5 s 保底 | **做（P1，MINIMAL）** |
| For-you 两种卡 + 实时视图横幅按钮 + 面板表 + 开关 + i18n + 手册 | ~600 行 | 无 | **做（P2）** |
| 验证车道（凭据类，≤ 3 轮） | 一轮 ~1 天 | — | **做（V）** |
| headed 探针（真实 Chrome 154 在 xpra/隐藏窗口上：空认证器 ⇒ 无窗口；GPM「创建通行密钥?」气泡不出现；UV 仅本次） | 半天 | 若 headed 下 enableUI:false 仍弹窗 ⇒ P1 加一条 `Page.handle…`/X 窗口回退 | **做（P0，先）** |
| 人注册的行要 owner 同意才能 forget | 50 行 | 过度？ | 做（一行分支）|
| `credentialUpdated` 事件用于 signCount | 0 | — | 不用（我们卸载后无更新）|
| 远程 keeper 本地落盘钥匙 | — | 多一份秘密 | 不做 |

**MINIMAL** = P0 → P1 → P2 → V（P2 可与 V 第一轮并行）。

---

## 4 车道简报骨架
- **P0 passkey-headed-probe**（主开发经生产门、owner 的 cookie，不改代码）：在一个真实 profile 的标签页上手工走 §1.2 的 T4/T3/T5/T7（CDP 直连 keeper 的 cdpUrl，WebAuthn 域），截 xpra/隐藏显示：① 空认证器下 `get` 是否无窗口即失败；② `create` 放行后 Chrome 是否弹 GPM/同步气泡；③ 远程 keeper 的 profile 同样四步。写到 browser-design/q027-probe/headed.md。
- **P1 passkey-store-core**：文件 src/browser-passkey-store.js（新 PURE）、src/browser-passkey.js（start 扩字段、hold/release/refuse、新码与句子、`loopVerdict` 认 `passkey_ask`）、src/server/browser-dialogs.js（挂认证器、仪式流程、grants、store 写者）、src/server/mounts-plugins-wiring.js（注入 fs/seal、proposal 工厂）、src/routes/browser.js（passkey 路由的 list/register/forget + proposal approve 的 grant 落点）、src/server/browser-keeper.js（removeProfile 删行）、data/bin/vibespace-browser（用法行 + 三个子动词）、docs/agent/browser-manual.md。门：test-browser-passkey（PURE：判定表每行一例 + 句子）、test-browser-passkey-store（新：normalize 进出、publicRow 无钥匙、seal 往返、signCount 预增、rpMatches 正反例）、test-browser-passkey-chrome 加重腿（§1.2 各 T 为腿：按标签页、空载 1 ms 失败、授权 create、断言 signCount、conditional 不成功、未授权 create 被拒、ask→放行、接管赛跑）、test-architecture（AGENT_TOOLS 不变、新 PURE 的 import 普查）、i18n 普查。控制：突变体「漏 removeCredential」「跳过授权」「enable 不挂认证器」各一个 ⇒ 对应腿红。
- **P2 passkey-ui**：src/lib/browser-panel-model.js（`passkeys` 行为 + 表模型 PURE）、src/lib/browser-trace-view.js（表与 sheet）、src/lib/browser-live-window.js（`passkey_ask` 横幅按钮）、src/lib/browser-proposal-card.js（两种卡）、i18n zh/ja、public/style.css（主题变量）。门：test-browser-panel-model（表行、策略切换、空态、开关）、test-i18n、chrome 套件一条（卡→approve→grant 可见）、手机 390 截图。
- **V passkey-verify**（凭据类，≤ 3 轮）：镜头 = §2.8 的证明列 + 「老句子普查」（有库答案的标签页上永不出现「holds no passkey of yours」）+ 「一张卡」（同一仪式托盘/聊天/横幅三处只对应一个 proposal id）+ 「作业」（job 令牌调 register 是否该被拒 —— 建议拒：作业没有 owner 在场的对话）。

---

## 5 需 owner 定（推荐在前）
1. **【推荐：是】新钥匙默认「每次问」，卡上可选「一直允许」/「永不」后记住。** 你会看到：agent 第一次用某站的通行密钥登录时托盘里一张卡；点「一直允许」后同站不再问；面板表里随时改回。答「否」= 默认「允许」（注册过即可静默登录，只留日志行）。
2. **【推荐：是，默认关】每个 profile 一个开关「agent 永不用通行密钥登录」。** 开着时 agent 的注册与登录一律被拒、面板表仍可看；你接管时自己登录不受影响。答「否」= 不加开关，靠逐把钥匙的「不允许」。
3. **【推荐：是】你接管或自己浏览时在页面上注册/使用通行密钥不出卡**（你在操作就是同意；钥匙落到同一张表，来源标「你」）。答「否」= 接管中的注册也出一张卡确认。

## 6 P2 as-built（lane passkey-ui，2026-10-12）
- **面板**：profile 行 ⋯ 菜单「通行密钥 (n)…」（n 来自 profiles digest 的 `passkeyCounts`，只是计数；n=0 也在）→ `src/lib/browser-passkeys-view.js` 的 `createPasskeysSection`：桌面放在该行下方（跨整张表的网格，面板重建时保留），手机是底部 sheet。表模型是 PURE 的 `passkeyTable`（browser-panel-model.js）：只拿具名字段，带钥匙字段（keySealed/key/privateKey/userHandle/credentialId）的行被拒绝、不画（`refused` 计数；红控制 = 一份展开 publicRow 的副本被钥匙普查抓到）。策略三段 = 一次 PATCH，用答复就地重标该行；开关 = 一次 PUT；删除… = showConfirmDialog 点名站点与用户 ⇒ DELETE ⇒ 行离开。
- **卡**：`passkeyCardWords`（src/browser-passkey.js）是唯一的卡词：谁要做什么、之后 agent 能做什么、决定后的结果 + 现行策略。托盘行（`pk:<choice>` 答案）、聊天卡（watch 的 `passkey-proposal` 事件 → `normalizers.feedProposalCard`，只活在本次，不进 rebuild 源）、实时横幅都用它，都 POST `…/pk-…/approve {shown, choice}`；允许类主按钮遵守 press-arm。
- **P1 的两处修正**：For-you 项的 `action.choices` 改成一个空格连接的字符串（user-todos `normalizeAction` 拒绝数组 ⇒ 卡从未进托盘）；`i18n.detail` 改成行数组（`forYouItem` 与卡项都是）。
- **横幅**：`stuckForKey` 对 `passkey_ask` 也返回 `state:'passkey'` 并带上那张打开的卡；横幅画卡的按钮（不再画取消）。`passkey_open` 的横幅与 For-you 词换成三句（没行 → 页面自己会说；有行 → 按策略；注册 → 先许可）。
- **痕迹**：browser-trace `commandText` 的 `passkey` 行：「registered a passkey on <rp>」「signed in with <user>'s passkey on <rp>」「refused: …」。
- **门**：test-browser-panel-model ⑦（表、策略段、开关、空态、删除词、菜单计数 + 红控制）、test-browser-passkey（卡词、ask 横幅、For-you 项形状）、重腿 test-browser-passkey-ui（P1 的真路由在进程内 + 有头 Chrome 上的真仪式 + 无头 Chrome 里的真客户端模块；桌面 1100 + 手机 390 PNG）。
