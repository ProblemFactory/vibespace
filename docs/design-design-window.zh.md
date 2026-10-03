# VibeSpace Design 窗口 —— 我们自己的设计画布，不再依赖 Claude CLI（设计稿，2026-10-02 04:35 PDT）

本文是 Design 窗口所依据的设计，存放在仓库里（英文版：docs/design-design-window.md）。每一节都标明负责它的 lane：**L1** lane design-core（模型、hub、路由、CLI），**L2** lane design-window（窗口、画布、状态栏芯片、发布页的运行时），**L3** lane design-docs-removal（手册与设计守则、删除 Claude CLI 工具包、迁移、更新日志），**L4** lane design-chrome（浏览器关卡 + 一轮对抗验证）。§3.7–§3.9 记录合同没说清的形状上各 lane 的实际做法。

**Owner 原话（2026-10-02 04:30 PDT）：** "要不别依赖claude cli了，我们直接自己复刻一个更好的版本。" —— 取代 04:05 的"legacy donor pin（K4）"裁定。此前仍然有效的约束：不走绑定账号的厂商路径（多账号系统）；不要过度设计；日常使用优先。

**调研：** 一个 workflow（3 个阅读者：skill 文本 / 运行时 + helper / VibeSpace 侧 + 使用情况 → 3 个方向 A 先做查看器、B 原生窗口、C 对齐编辑器 → 2 个评审）。两个评审都选了 **B**（40 分里 34 和 35；A 32/29；C 28/22）。（调研原文保存在仓库之外。）

## 0. 论点（所有 lane）
画布是一种 **VibeSpace 窗口类型 `design`**，渲染住在对话 cwd 里的纯 HTML 画板（`designs/<slug>/`）。没有模板语言、没有厂商运行时、没有厂商文件、不需要账号。agent 用它本来就有的编辑工具写画板（claude / codex / opencode 都一样）；`design.json` 摆放它们；文件一变，窗口原地重绘那一帧；点一下元素就变成一条带引用的评论，agent 把它当作用户本人的消息收到；Publish 把同一批文件打包成 `/p/<id>` 上的一张自包含页面，沿用现有的 CSP sandbox（重新发布 URL 不变）。Claude CLI 工具包（`src/server/design-kit.js` + lane design-kit-287 未合并的 donor 阶梯）删除；`data/design-kit/`（厂商文本）由一次迁移删掉。

## 1. 旧工具包是什么（按 CLI 2.1.274 的提取实测；owner 的 3 张画布）—— 由 L3 删除
- SKILL.md 56 KB（流程 + 一套厂商模板语法：`<x-dc>`、`{{dotted holes}}`、`sc-for`/`sc-if`、`dc-import`、带 `data-props` 调节芯片的 `DCLogic` 组件）· seed-canvas.mjs 40 KB（标题/文件名闸门、`<` 转义、`--extract`、`--check`）· payload.template.html 2.4 MB（React 19 + Base UI + Tailwind v4，平移/缩放、页面、便签、手写的 PNG/JPEG/PDF/zip 导出、评论、撤销、借 `data-dc-tpl` source map 的直接操作；Save = `window.claude.self.publish` —— VibeSpace 上没有，所以 /p 页只能看和导出）。
- 使用情况：3 张画布（08-21…08-24，全部公开，每张约 2.4 MB），对比 16 次普通页面发布（08-25 → 10-01）。没有人手动编辑过画布；每一处改动都经由 agent。
- 六周里它因 CLI 变化坏了三次（2.366.0、2.1.257 的 zstd 帧、2.1.287 移除），而 donor 阶梯在服务端执行一个提取出来的第三方 helper（verify r1：两个 MEDIUM；`execFile` 没有净化环境）。
- 2.1.287 的官方路径 = claude.ai Design artifacts，绑定账号 ⇒ 否决。

## 2. 为什么选 B（而不是 A / C）（所有 lane）
- **A（先做查看器的复刻）** 要把厂商的画板语法永远当作我们自己的规范来重新实现；codex/opencode agent 得学一门方言而不是直接写 HTML；人在发布之前仍然什么都看不到。它唯一独有的价值是渲染 8 月那 3 张画布（为 08-24 之后没人打开过的 3 个页面写约 700 行厂商语言渲染器）。
- **C（对齐编辑器）** 自己也承认是过度设计：为记录显示从未发生的手动编辑多写 9–11k 行；原地改字会拒绝 3 张真实画布中 2 张里绑定在 hole 上的文字。
- **B** 不需要语法、不需要对方的运行时、不需要提取任何东西；还给出了工具包从未给过的东西：agent 干活时看着草稿一点点长出来，指着一个元素说"这个，大一点"。

## 3. 合同（L1 和 L2 照此并行开发 —— 不经集成者不得修改）
### 3.1 对话 cwd 里的文件（L1 读取、L2 绘制、L3 教会 agent）
```
designs/<slug>/
  design.json      optional manifest (absent ⇒ artboards in a row, by name, Main first)
  Main.html        the entry artboard: a complete HTML document (inline <style>/<script> allowed)
  <Name>.html …    names ^[A-Za-z0-9_][A-Za-z0-9 _.-]{0,80}\.html$, unique case-insensitively, ≤ 2 MiB
  logo.png …       images referenced RELATIVELY (src="logo.png" / url(logo.png)); png/jpg/jpeg/gif/webp/svg ≤ 2 MiB each; inlined as data: at read + publish
```
`design.json`（键是封闭的 —— 加载器会丢掉的东西，校验器按名字拒绝）：
```json
{ "title": "Spring menu",
  "pages": [{"id":"p1","name":"Flows"}],
  "artboards": [{"file":"Main.html","x":0,"y":0,"w":1280,"h":800,"title":"Home","page":"p1","print":"fixed"}],
  "notes": [{"id":"n1","x":0,"y":-160,"w":320,"text":"Direction A: calm","color":"blue","page":"p1"}],
  "launch": {"view":"canvas","page":"p1"} }
```
边界：`w`/`h` 120–8000（就是 iframe 的尺寸，绝不缩放）；`print` fixed|flow（只影响打印 CSS）；每次读取 ≤ 40 个画板、≤ 40 个页面、≤ 200 张便签、便签文字 ≤ 5000、8 种具名便签颜色（gray red orange green teal blue purple pink → 主题变量）；`launch` = `{view:"canvas", page?}` | `{view:"focused", file}`。未知的顶层键或行键 ⇒ 按名字拒绝。没有坐标的行按 ≥ 80 px（同一行）/ 120 px（行与行）的间距排布；重叠只**警告**，绝不移动。
### 3.2 PURE `src/design-model.js`（CJS，不 import 任何东西；打进客户端 bundle，也被 hub require）—— L1
`validateManifest(json) → {ok, manifest} | {ok:false, refusals:[{code, where, why}]}` · `layoutOf(manifest, artboardNames)`（给缺坐标的行排位）· `artboardVerdict(name, html, {assets}) → {ok} | {ok:false, code, why}`（名字语法、大小、有 `<html>`+`<body>`、没有 `<base>`、每个相对引用都能解析）· `inlineAssets(html, readAsset)`（窗口和发布共用的**唯一**打包器）· `elementPath(nodeFacts)` + `pickQuote({file, path, tag, text})` = 评论的引用行，文字 ≤ 120 字符 · `bundleCanvas({manifest, files, runtimeJs}) → html`，带 `<script type="application/json" id="vibespace-design-doc">`（`<` 已转义）· `readBundle(html)` 反向 · `commentText(quote, text)` = `[Design comment] Main.html › header > nav > a.cta ("Get started"): <text>` —— **整行**都经过 `src/peer-text.js` `toAgentText`（census 一行：共享 Task Group 里另一个 agent 写的画板可能伪造帧）· `sizeVerdict(bytes)`（> 8 MB 警告，≥ 25 MB 按名字拒绝）。
### 3.3 ORCH `src/server/design-engine.js` + `src/routes/design.js` + ws —— L1
- 注册表 `data/designs.json`，行 `{id, sessionId, conversationId, host, dir, title, createdAt, openedAt}` —— 每个 (host, dir) 一行，`writeJsonAtomic`，每次写入都广播 `designs-updated`。
- `read(host, dir)` = 每台主机**一次**操作（本机 fs；ssh 主机 = 通过 RemoteFs 一次 exec 打包/输出列出的文件 —— 绝不做 40 次逐个 ssh 读取）；每次读取上限 40 个画板 / 24 MB ⇒ 按名字 `too_big`；`hostId` 是**参数**。
- 监视：每个 (host, dir) 按打开的窗口计数；本机 = 被监视期间每 2 秒对 manifest + 列出的画板做一次**异步、有界的 `stat` 扫描**（绝不用 inotify —— owner 的 cwd 在 NFS 上；同步 fs 这一类已经造成过三次事件循环停摆）；远程 = 只靠 CLI 的通知阶梯（P1：一个 daemon op）。有变化 ⇒ 每个文件沿用现有的 `file-changed {host, path, mtime, by:'design'}` 广播。
- 路由（owner，cookie）：`GET /api/design?host&dir`（manifest + 内联后的画板 + 每帧判定），`GET /api/designs?sessionId`，`POST /api/design/comment {sessionId, quote, text}` → **唯一**的输入发送器（`src/server/user-input.js createUserInputSender`；回合进行中的会话像聊天输入一样排队；没有活进程 ⇒ 持久 stash，输入框上方的条带说明有一条设计评论在等），`POST /api/design/publish {host, dir, title, public}`（服务端通过 `read` + `bundleCanvas` 打包 → 现有的 published-pages 存储，`srcKey = <host|local>:<dir>`，重新发布 URL 不变）。Agent（vsst_/jbt_）：`POST /api/agent/design/register {dir, title}`（注册 + 向所属会话的客户端推送一个 `openSpec`，打开或前置窗口），`POST /api/agent/design/changed {dir, files}`（通知阶梯），`POST /api/agent/design/check {dir}`（hub 读取 + 校验；按名字给出判定），`POST /api/agent/design/publish {dir, public}` → 现有的 agent 页面发布（和现在一样弹 ASK 卡片）—— **两边都由 hub 打包**，CLI 不带模型副本。
- ws：ws-handler 里的 `design-watch {host, dir}` / `design-unwatch`（按 socket 计数；socket 关闭即取消监视）。
### 3.4 CLI `data/bin/vibespace-design`（STATIC，在 AGENT_TOOLS 里；薄 HTTP，不 exec 任何东西，token 不上 argv）—— L1
`new <slug> [--title] [--dir designs]`（创建目录 + `design.json` + 一个 `Main.html` 骨架，注册，打开窗口，打印目录）· `add <file.html> [--title --w --h --page --x --y]`（经 hub 校验，追加/更新 manifest 行，通知）· `check [dir]`（按名字列出拒绝，exit 1）· `sync [dir]`（通知阶梯 —— 远程主机上每次编辑的最后一步）· `open [dir]` · `show [dir]`（用文字说明 manifest + 便签）· `publish [dir] [--public]`（ask 卡片；像 vibespace-page 一样原样打印相对路径 `/p/<id>`）· `list`。**没有** `set` / `note` / `page` 动词 —— agent 用自己的编辑器改 `design.json`，`check` 负责校验。Agent 工具规则：除了 `publish` = ask，其余动词都预先批准（vibespace-page 的先例）。
### 3.5 客户端 —— L2
- `src/lib/design-window.js`：`registerWindowType({type:'design', action:'openDesign', persist:true})`；openSpec `{action:'openDesign', host, dir, sessionId}`（布局恢复、跨客户端同步、桌面、手机）；加载 `GET /api/design`；每个画板**一个**沙箱化的 `srcdoc` iframe —— **只**给 `sandbox="allow-scripts"`（绝不加 `allow-same-origin`；agent 的 HTML 渲染在 owner 已登录的页面里）；绑定到 `winInfo._listenerCtl.signal` 的 `file-changed` 监听器原地替换**一个** srcdoc（保留平移/缩放；manifest 变化则重新布局）；拒绝加载的帧显示一张写明原因的卡片"artboard refused: <reason>"，绝不空白；工具栏经由 `toolbar-fold`：Fit · − · + · 页面 · Reload · Comment（选取模式）· Print（当前聚焦的画板，`@page` 取自 `print`）· Publish…；"上次读取"时间戳。
- `src/lib/design-canvas.js`（平移/缩放/适配/页面/帧/便签的核心，不依赖 App —— 与独立查看器共用）· `src/lib/design-pick.js`（注入每个帧的 head：悬停描边，点击 ⇒ `postMessage({kind:'design-pick', path, tag, text, rect})`；窗口只接受**自己**帧的消息，封闭的消息集合，有界字符串 —— 以 census 固定）。
- 独立的 `src/design-viewer-entry.js` → `public/design-viewer.js`（第二个 esbuild 入口，public/novnc.js 的先例，约 40 KB）内联进发布页，使 `/p/<id>` 像所有页面一样自包含 + 可离线。
- 芯片（`chat-status-bar.js`）：工具包状态行 + Retry **删除**；弹出框在页面列表（行不变）上方列出本会话的设计（Open · Publish…）；简述 ⇒ 一条可见的用户消息 `[VibeSpace design request] <brief> — Make it with vibespace-design (manual: vibespace-docs design): new → write plain-HTML artboards under the printed dir → add → check; say the directory. [--public requested]`；Create 永远不禁用。
- 手机 ≤ 768：全屏；捏合/拖动（browser-live 的捏合模式）；画板的底部抽屉（点按 = 聚焦）；Comment = 点一个元素，输入框滑上来（createModalShell）；Publish 在 ⋯ 里；44 px 触控目标。界面文案约 25 条 zh/ja；面向 agent 的文字用英文。
### 3.6 文档 + 删除 —— L3
`docs/agent/design-manual.md`（CLI）+ `docs/agent/design-skill.md`（用**我们自己的话**写的设计守则：先看上下文 —— 动笔前在代码库里找 token/组件；静态还是原型 —— 问一次，或者在简述是唯一一轮时自行推断并**说明**选择；只有在没有品牌约束时才出 2–4 个低保真方向；每次编辑前重读目录，绝不凭记忆重写；`add`/`sync` 作为最后一步）挂在 `AGENT_DOC_TOPICS.design` 下；一行工具介绍取代工具包那一行，保持在 9600 B 上限之下。删除 `src/server/design-kit.js`、`/api/design-kit/*`、`/api/agent/design-kit*`、`vibespace-page kit`、`PAGE_VERBS` 'kit'、`scripts/test-design-kit.mjs` + 它的 ci 行、server.js:1573 的接线、kb/census/文档里的行；迁移 `2026-10-design-kit-removed` 删除 `data/design-kit/*`（厂商文本）。3 张旧画布：按字节原样继续托管，照旧列在芯片的页面列表里，**不能**在新窗口中打开（已知的取舍，交付时说明；700 行的旧格式阅读器按需列为 P2）。

### 3.7 L1 的实际做法（lane design-core，2026-10-02）—— 合同没写明、现已定下的部分（只增不改；§3.1–§3.6 的键 / 路由 / openSpec 一概未变）
- **模型。** `inlineAssets(html, readAsset)` → `{html, inlined:[names], missing:[names]}`；`readAsset(name)` 以 BASE64 返回文件（或 null）。合同留空的边界：坐标 ±100000；画板行的 `x`/`y` 要么都给要么都不给（都不给 = 放进行里；`w`/`h` 默认 1280×800）；便签 `w` 40–4000，便签的 `id`/`x`/`y`/`w`/`text` 必填，`color` 默认 `gray`；页面 / 便签 id `^[A-Za-z0-9_-]{1,40}$`；没有 `name` 的页面以 id 为名。`layoutOf` 的帧带 `{file, x, y, w, h, title, page, print, placed:'manifest'|'auto', missing, dup}`。相对引用 = 标签上的 `src=` + style 属性 / `<style>` 块里的 `url()`（绝不在 script / 注释 / textarea 里）；根路径、子目录、非图片都是 `bad_ref`。状态块 = `{v:1, title, manifest, files:{<name>: inlined html}}`。另外导出：`commentVerdict(text)`（空 / >4000 拒绝）、`readCapsVerdict`、`assetRefsOf`、`PLACEHOLDER_RUNTIME`（在 public/design-viewer.js 存在之前随发布一起走）。
- **`GET /api/design?host&dir`** → `{ok, host, dir, design, title, manifest, refusals:[{code, where, why}], warnings, frames:[{…layout, bytes, mtime, verdict:{ok}|{ok:false, code, why}, html (only when ok, images inlined)}], pages, notes, launch, totalBytes, overBudget, readAt, mtimes:{name: ms}}`；失败 `{error, code}`（`not_registered` 404、`too_big` 413、`not_found` 404、`host_unreachable` 502、`bad_dir` 400）。被拒绝的 design.json 以 `refusals` 返回，帧按**不用**它的方式布局（绝不出现空白窗口）。
- **`GET /api/design`** 在 `frames` 旁**还**带 `artboards: [{file, html, ok:true} | {file, ok:false, code, why}]`（窗口的读取形状 —— 判定相同；为 L2 的规整器而加，第 4 步）。
- **`GET /api/designs?sessionId&conversationId`** —— 任一匹配即可（resume 会生成新的 session id；都不给 = 所有行）；行带 `page: {id, path, public, updatedAt} | null`（该目录的已发布页面，srcKey `<host|local>:<dir>`）。
- **`POST /api/design/publish`** 回答页面发布的形状 `{ok, page: {id, name, url, path, public, replaced, …}, size, frames}`；失败 `{error, code}`（`not_publishable` 409 点名被拒的 manifest / 第一个被拒的画板，`too_big` 413）。
- 合同没写的**边界**：注册表保留 1000 行（最久未打开的离开），一次读取 ≤ 200 张图片，监视每个 socket ≤ 16 个目录 / 总共 32 个。
- **`POST /api/design/comment`** 的请求体加 `host, dir`（可选）：没有活的聊天进程接收评论时，它们指明 stash 条目在等哪个设计的对话。回答 `{ok, delivered:'sent'|'stashed', msgId?, conversationId?, text}`（`text` = 过了 belt 的那一行）。拒绝 `empty` / `too_long` / `no_conversation` 409 / `input_rejected` / `too_large` / `send_failed`。
- **打开窗口的推送** = 向注册会话的客户端发 `design-open {sessionId, design, openSpec:{action:'openDesign', host, dir, sessionId}}`（`broadcastToSession`）。每次注册表写入都向所有客户端发 **`designs-updated {design, created?}`**（芯片重新拉取本会话的列表）。
- **ws 应答**：`design-watch` / `design-unwatch {host, dir, reqId?}` 的应答是 `design-watch-ack {op:'watch'|'unwatch', host, dir, ok, watchers?, polled?, code?, error?}` —— **不带** sessionId。`polled:false` = 远程目录（计数，但从不轮询：由 CLI 的 `sync` 触发重绘）。
- **新增的 agent 路由**：`GET /api/agent/designs`（CLI 的 `list`：标题过了 belt 的行 + `page`）；`POST /api/agent/design/publish` 接受 `page`（**本**对话发布过的已有页面 —— 裁剪表里的"publish --page"嫁接）→ 否则 `page_forbidden` 403。`check` 回答 **agent** 视角（判定 + 布局 + 页面名 + 便签文字，每个字符串都过 belt，绝不返回 HTML）+ `size`。
- **Stash**：等待中的评论是 `{source:'design-comment', kind:'peer', fromName:'Design comment'}`；src/stash-summary.js 有 `design-comment` 这一类（"a design comment" —— L1 在 src/lib/i18n-zh.js / i18n-ja.js 里加了 zh/ja：2 + 4 个卡片词条，挨着 "a window request"）。

### 3.8 L2 对 §3 留空形状的理解（lane design-window，2026-10-02 05:20 —— 只增不改，上文未动；由集成者与 L1 对齐）
- `POST /api/design/comment {sessionId, quote, text}`：客户端把 `quote` 作为经过围栏的选取**事实** `{file, path, tag, text}` 发送（绝不是拼好的一行）—— 由 hub 拼写（`pickQuote` / `commentText(quote, text)` 本来就接受对象）。成功 `{ok:true, delivered|via|lane|how: 'typed'|'queued'|'stashed'}`（toast 文案按 /stash|wait|held/ ⇒ 等待，/queue/ ⇒ 已排队，否则已发送）；拒绝 `{error, code}` —— 芯片会说明的代码：`no_session` / `session_required` / `unknown_session`、`empty`、`too_long`，其余用 hub 自己的 `error` 句子。
- `GET /api/design?host&dir` → `{ok:true, title, manifest, frames?: layoutOf(...).frames, artboards: [{file, html, ok:true} | {file, ok:false, code, why}]（或 `files` 映射，或 `verdicts`）, warnings: [{code, where, why}], readAt}`；失败 `{error, code, refusals?}`（manifest 的拒绝列表按名字显示）。本机时省略 `host`。
- `GET /api/designs?sessionId=<webui>[&conversationId=<conv>]` → `{designs: [{id, sessionId, conversationId, host, dir, title, createdAt, openedAt}]}`（conversation id 与 `/api/pages` 的取法相同 —— resume 会生成新的 session id）。
- `POST /api/design/publish {host, dir, title, public}` → `{page: {id, url|path, public, name}}`（页面发布的形状）；失败 `{error|why, code}`。
- ws：`design-watch {host, dir}` / `design-unwatch {host, dir}`（host '' = 本机）—— 打开时、**每次**重连时、关闭时发送。读取的广播：`file-changed`（目录下任何路径 ⇒ 合并成一次重读）、`designs-updated`（一个信号：活窗口重新读 `/api/designs`），以及 agent 的打开推送 **`design-open {sessionId, openSpec:{action:'openDesign', host, dir, sessionId}}`** —— 客户端在显示那个对话（`app.sessions`）时打开 / 前置窗口。
- 发布页：运行时挂载到 `#vibespace-design-root`，读取 `#vibespace-design-doc` = `{v:1, title, manifest, files}`（L1 的 `bundleCanvas`）；`public/design-viewer.js` 在 gitignore 里，由 `npm run build` 生成（novnc 的先例）。

### 3.9 L3 的实际做法（lane design-docs-removal，2026-10-02）—— 只增不改，上文未动
- **教学。** `vibespace-docs design` 依次打印**两个**文件 —— `docs/agent/design-manual.md`（逐个动词的 CLI、目录与画板规则、design.json 的键与边界、评论、拒绝、发布前的询问）和 `docs/agent/design-skill.md`（我们的设计守则：动笔前先看、说明静态还是原型、只在没有约束时出多个方向、每个画板是一整页并按 390 / 1280 设计、每次编辑都从磁盘开始并以 `add` / `sync` 结束、交付时说什么）—— `AGENT_DOC_TOPICS.design` 是一个列表，`serveAgentDoc` 用一条分隔线拼接列表。**一行**工具介绍取代工具包那一行（495 B；整段介绍不超过 7.9 KB，上限 9600 B）。agent 索引里有 `design` 一行。
- **Census。** `scripts/test-design-docs.mjs`（fast）让手册对齐代码：手册里的 design.json 示例能通过 `validateManifest`；`KEYS` 的每个键、每种便签颜色、两种打印模式和各项边界都在手册里出现；CLI 分派的每个动词都有文档，且没有多余的；手册列出的每个拒绝代码都是模型的代码（或 hub 的 `not_registered`）；该主题经真实路由返回两个文件；工具介绍包含这一行且不超上限；工具包已从代码树里消失（对受跟踪文件做 git grep census，覆盖工具包及其 donor 阶梯用过的每种写法 —— 更新日志、设计记录、这次迁移和反向固定点除外；src/lib/design-window.js 存在后客户端也一并判定）。
- **删除。** `src/server/design-kit.js`、`/api/design-kit/status`、`/api/agent/design-kit` + `/file/:name`、`vibespace-page kit`、`PAGE_VERBS` 里的 `kit`（及其卡片文案）、`scripts/test-design-kit.mjs` + 它的 heavy 行、server.js 的接线 + `getDesignKit` getter、census 行（raw-filename、record-clear）以及 kb / CLAUDE.md 里的行。迁移 `2026-10-design-kit-removed`（src/server/migrations.js）一次性删除 `data/design-kit/`（符号链接只 unlink，绝不跟随）；失败则下次启动重试。远程主机镜像到 `~/.vibespace/design-kit/` 的工具包副本**不**删除（本 lane 没有设备侧迁移 —— 它们是没有任何东西会读的惰性文件）。
- **三张旧画布** 按字节原样继续托管在 `/p/<id>` 上，并列在芯片的页面列表里；它们不能在 Design 窗口中打开（已知的取舍；旧格式阅读器按需列为 P2）。

## 4. 裁剪表（B + 嫁接；精简集）（所有 lane）
| 功能 | 削减? | 成本 | 风险 | 做否 |
|---|---|---|---|---|
| 纯 HTML 画板 + 封闭 manifest + 校验器 | 保留 | 450 PURE | 低 | P0 |
| 设计窗口（openSpec、沙箱帧、平移/缩放/适配/页面/便签） | 保留 | ~1 400 | 低 | P0 |
| 实时重绘：CLI `sync` + 被监视时本机 2 秒异步 stat 轮询 | 保留 | 210 | 若用 inotify 则 NFS 静默 ⇒ 轮询 | P0 |
| ssh 主机经 daemon op 实时重绘 | 推迟 | 200 | ssh 开销 | P1（那里 `sync` 已经可用） |
| 元素选取 → 经**唯一**输入发送器 + peer-text belt 的引用评论 | 保留 | 330 | 不可信帧的 postMessage ⇒ 只收自己的帧、封闭集合 | P0 |
| 持久化的评论串 / 解决状态 / 计费唤醒 | 砍掉 | 400+ | 第二个存储；花钱 | 不做（评论就是用户本人的消息） |
| 从 manifest 绘制的便签（agent 写） | 保留 | 80 | — | P0 |
| 用户写的便签回写进 design.json（按 mtime 做 CAS，409 file-changed） | 推迟 | 200 | agent/人同写一个文件的竞争 | P1 |
| 打印当前聚焦的画板（打印样式表，`@page` 取自 `print`）—— 从 A 嫁接 | 保留 | 60 | — | P0 |
| 每个画板导出 PNG（foreignObject → canvas） | 推迟 | 150 | web 字体 | P1 |
| 自写 PDF / zip 导出 / 关键帧 / 演示 / pptx 钩子 | 砍掉 | 800+ | — | 不做 |
| 属性面板 / 拖拽缩放 / 撤销 / 原地改字 | 砍掉 | 9–11k | 编辑器内核 | 不做 |
| 厂商模板语法；旧 `.dc.html` 阅读器；导入旧画布 | 砍掉 | 1.3–1.8k / 700 / 250 | 为 3 个页面写厂商语法 | 不做（继续托管） |
| 旧格式 `extract <pageId> --to <dir>`（把状态块当数据，不渲染）—— 从 A 嫁接 | 推迟 | 60 | — | 按需 P2 |
| `publish --page <id>` 发布到调用者可写的已有页面 —— 从 A 嫁接 | 保留 | 30 | — | P0 |
| 设计页更严格的 CSP（`default-src 'none'` + 字体） | 推迟 | 60 | 未测量就会弄坏 Google Fonts | 测量后 P2 |
| 弹出框里的缩略图；快照历史 | 砍掉 | 500 | 渲染开销 / 存储 | 不做 |
| 手机布局（捏合、画板抽屉、输入框抽屉） | 最小保留 | 200 | 手势 | P0 |
| 芯片改指向；删除工具包 + 迁移 | 保留 | 120 / −650 | 固定点要在一次提交里一起挪 | P0 |
| 自己的守则文本 + 手册 | 保留 | 400 行文字 | 与运行时漂移 ⇒ 对手册里点名的 manifest 键做 census | P0 |
| fleet 的 CLI 版本钉（K4） | 砍掉 | — | — | 不做（不再依赖 CLI） |

## 5. Lane 划分（所有 lane；P0 ≈ 4.1k 行含测试，净增 +3.4k；2 个 Opus builder，3–4 天）
- **L1 design-core**（Opus）：模型 + 引擎 + 路由 + ws + CLI + fast 关卡 `test-design-model`（表格 + 拒绝 + 布局 + 重叠 + inlineAssets + elementPath + 打包往返 + 6 个 mutant-copy 对照）和 `test-design-routes`（在临时目录上跑真实引擎：注册 / changed / 读取上限 / 监视计数 / 注入时钟的轮询能看到 mtime 变化 —— 假定时器，绝不用墙钟时间 / 评论 → 一个桩输入发送器 / CLI 对路由的端到端 / 未注册目录按名字拒绝）；peer-text census 一行；agent-tool-rules 一行。
- **L2 design-window**（Opus，并行）：窗口 + 画布 + 选取 + 查看器入口 + esbuild 入口 + 芯片 + CSS + i18n；`test-window-types` 的固定点 15 → 16；一张不依赖 DOM 的 fast 表格覆盖画布算术（适配/缩放/页面）+ 选取消息的围栏。
- **L3 design-docs-removal**（Opus，在 L1 的路由就绪后）：守则 + 手册 + 工具介绍那一行；删除工具包（代码、路由、测试、ci 行、kb/census/文档行、server.js 接线）；迁移 + `test-migrations` 一行；改写 `test-published-pages` 的固定点；CHANGELOG en/zh/ja 的用户行；docs/design-design-window.md（+ .zh）= 本文，分节。
- **L4 design-chrome**（Fable verify，在 L1+L2 之后）：heavy `test-design-window` —— 桩 agent 的 `new` 打开窗口；写一个文件只重绘**一个**帧（平移保留，其它帧的节点不变）；选取 → 准确的引用行到达桩 CLI 的 stdin；zh 375 px 的矩形 census；`/p/<id>` 在 CSP 头下渲染且 Fit 可用；一次 opencode 桩运行证明从请求文本能找到手册。然后**一轮**对抗验证（peer 内容 + XSS 类：帧、选取通道、评论 belt、发布路径）。
顺序：design-kit-287 这个临时方案今早仍随 .200 发布（让 /design 今天还能通过 2.1.281 的工具包工作）；Design 窗口在 .202（.201 热修复之后）落地并删除它。

## 6. 风险（沿用调研结论）（所有 lane）
NFS：轮询保持异步 + 有界、只看列出的文件、每次扫描一个目录 · owner 页面里的不可信 agent HTML：沙箱不带 allow-same-origin、只收自己帧的封闭选取集合，一处疏漏 = 全 fleet 的存储型 XSS · 打包大小 vs 25 MB 发布上限：`check` 会报出大小 · 没有活进程时的评论必须在条带里**可见**（2026-09-27 "看不见的队列"那一类）· 五个 census 固定点要在一次提交里一起挪（L3 与 L1 一起落地）· 字体：目前没有 connect-src 围栏；收紧 CSP 前先测量 · harness 教学：claude（SessionStart）+ codex（prompt-context）已确认，opencode 未验证 ⇒ 请求文本本身点名 `vibespace-docs design`。
