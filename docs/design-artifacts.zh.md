# 产物模型：对话的交付物由产品"看到的"推导，从不靠智能体声明（lane artifacts-model，as-built）

## 为什么是推导
- 主人的两条裁决：(1) 绝不依赖"教智能体用一个工具"——采纳率不齐会让交付物分叉；(2) 每个交付物的**存储**与**展示**只有一种方式。
- 真实形态（一位舰队用户 16 份对话的只读研究）：智能体用 claude `Write` 把文章 / 简报 / 报告写成对话 cwd 下的 `.md`，再 `Edit`；只有约 40% 会在正文里点名文件；SendUserFile 为 0；一半的 Write 是配置 / 技能 / 代码（CLAUDE.md、SKILL.md、.py）；用户自己改了文件要手动告诉智能体。
- 所以：见证 = 各 harness 的**写记录**；噪声 = 代码；用户的修改要不用她打字就回到所属对话。

## 行（src/artifacts.js，PURE，只引用唯一扩展名表 src/file-type-table.js）
`{key: host+':'+path, host, path, name, kind, firstAt, lastAt, by: agent|user, writes, edits, lastOp, bytes, lastId}`。
- `kind` 闭集：doc（markdown / text / rst / docx / pdf / csv）· page（html）· design · media（图 / 音 / 视频）· upload · code（源码 / 配置，及 CLAUDE.md / SKILL.md / AGENTS.md / `.claude/` 等引导智能体的 markdown）· other（从不抛错）。en/zh/ja 词在 KIND_WORDS。
- 唯一的 reducer `apply / fold`：Write 新生或重生，Edit 计数；同一路径两次 = 一行；同一次调用（`lastId`，parse + 设备流各看一次）只动一次；相对路径按 cwd 变绝对；没写过的路径上的 Edit 仍是一行（by: agent）。
- 上限：每个对话 ≤ 500 行，先逐出最旧的 code 行，逐出的行被返回并记日志。`view(rows)` = 芯片的顺序：doc › page › design › media › upload › other，各组最近改动在前，code 折叠在计数后。

## 钩子（src/harnesses/）
每个描述符声明 `artifactsOf(record) → [{path, op: 'write'|'edit', bytes, id}] | []`（读法在 src/harnesses/artifacts-of.js）：
- claude：assistant 记录里 tool_use 的 Write（写）/ Edit / MultiEdit / NotebookEdit（改），`file_path` / `notebook_path`。
- codex：apply_patch——custom_tool_call 的信封（`*** Add File:` = 写，`*** Update File:` = 改）或实时 function_call 的 JSON `changes[]`（add / update）；FileChange 是同一次调用的结果，不重复计。
- ACP（opencode 等）：工具调用内容里的 `diff`（无 oldText = 新文件）及 fs/write_text_file。
- shell：`null` = 从不产生。test-harness-contract 对每个 harness 验证；下游从不按 id 分支（§78 harness 族不升）。

## 注册表与重放
- 行在活会话上（`session._artifacts`，session-schema 行，owner = stdout），持久化到 session-meta `artifacts`（1.5 s 去抖，同 taskRecords），boot-restore 两处恢复。
- 唯一写入者 src/server/artifact-registry.js：`observe(session, record)` 由每个 harness 的 stdout 消费者调用（claude 的 parse 与设备流 claudeSideEffects 同一调用；codex-events；acp-events），问会话的描述符钩子。
- 重建：normalizers.convertWithCards 的 `opts.artifacts`（artifactDeriveOpts）在同一批记录上推导行并放卡片（钩子没有 afterRecord：前一条记录在下一条之前折叠）；rebuildHistory 再与持久化行合并（用户的保存只在那里），每张卡片显示合并后的计数。只读历史（已结束会话的转录）在读取时同样推导。重启不丢东西，重建出同样的卡片。

## 界面
- **卡片**：每个交付物行在聊天里一张卡（system 消息，`noticeKind: 'artifact'`，id = `{view id}:af:{key 哈希}`），在第一次写的位置诞生，之后每次写 / 改**原地修补**（只带 content 的 edit 操作，从不重建）："BRIEF.md · 已改 3 次 · 2 分钟前"。点一下 = 按类型的查看器在聊天旁打开（`from`，与 Cmd+点击路径同一扇门，不需要 Cmd）。code 行没有卡片。
- **Artifacts 芯片**：聊天状态栏的键控芯片 `Artifacts · N`（GET /api/artifacts = 服务端的 `view(rows)`，整段对话而非已加载的分片）；弹层先列文档，代码折叠在 "Code (n)"。
- **用户自己的保存**：从聊天打开的编辑器窗口（openFile 保留 `fromWin`）保存时发一条 ws `artifact-touch {sessionId, host, path, summary}`；所属对话的行得到 `by: user, edits+1`，卡片原地修补，智能体在下一轮收到一条注记 "[Doc edit] <path>: +a −b lines"（stash，免费，从不计费唤醒）。
- **设置** `artifacts.autoOpenDocs`（Chat，默认开）：智能体**写**出新的 doc 行且聊天在屏幕上时，在聊天旁打开它；Edit 不会再次打开；关 = 只有卡片。

## 对 doc-window 的契约（兄弟车道）
- `ownerOf({host, path}) → {sessionId, row} | null`——持有该路径的最新对话。
- `noteEdit({sessionId, host, path, summary})`——经 stash 给那个对话一条下一轮注记："[Doc edit] <path>: <summary>"。
两者都在 src/server/artifact-registry.js；纯半部在 src/artifacts.js（ownerOfIn、editNoteText、lineDelta）。doc-window 用富 markdown 窗口替换了 `.md` 的原始查看器并调用这两个函数（lane artifacts-e2e 接入）；其他文件的原始代码编辑器保存仍以 "+a −b lines" 走 `artifact-touch`。

## Doc 窗口（as-built，lane doc-window，2.369.215）

- **入口**：`.md` / `.markdown` 经 `app.openFile` 进入窗口类型 `doc`（openSpec `{action:'openDoc', host, path, from}`，每个 (host, path) 一个窗口）；`:line` 链接、十六进制、临时文件仍走代码编辑器。归属 = 注册表的 `ownerOf`（持有这一行的最新对话），否则 `from` = 打开它的对话会话。
- **编辑器**：ProseMirror + prosemirror-markdown（官方 schema / parser / serializer，扩展了列表符号、有序分隔符、`*`/`_`、`**`/`__`、分隔线、围栏写法与软换行，使作者的写法原样保留），打成懒加载的 `public/doc-editor.js`（387.6 KB），首个 Doc 窗口时加载；主包只多 2.2 KB 代码（另有 7.5 KB 为中日文词条）。
- **保真规则**：打开时先判 `rawReasons`（表格、HTML、脚注、front matter、CRLF、setext 标题、超过 1 MiB），再做 parse → serialize 与原文逐行比较（忽略行尾空白和末尾换行）；不无损 ⇒ 以源码（Raw）打开并用提示条说明原因。保存写入序列化结果，只写本窗口打开的那个文件，经现有的 `/api/file/write`。
- **实时与冲突**：本机每 2 秒 stat、远程在重新聚焦时检查，外加 `file-changed` 转发；磁盘变了且无未保存修改 ⇒ 原地重绘（同一个编辑器元素、未变节点保留、滚动位置保留）；有未保存修改 ⇒ 顶部条「重新载入（你的修改会丢弃）｜继续编辑」；选「继续编辑」后保存会先问一次「覆盖智能体更新的版本？」。任何方向都没有静默覆盖。
- **批注**：选中文字 ⇒ 浮动「批注」按钮 ⇒ 备注框；批注在右侧栏（按 (host, path) 存于本设备；窄窗口 < 640 px 与手机上为底部面板）；「全部发送」= 一条 `[Doc comments] <path>\n① "引文" — 备注…` 消息（引文 ≤ 200 字、≤ 20 条、整条 ≤ 4 KB），经 peer-text 带子，走「设计窗口评论」同一路径：对话空闲则作为用户消息键入，否则进入 stash。无归属 ⇒ 侧栏写明「请从对话里打开这个文档，才能把批注发给它」。
- **编辑摘要**：每次保存（含从它打开的 Raw 编辑器）调用 `noteEdit({sessionId, host, path, summary})`，summary = 「+a −b lines; sections: <变动的标题 ≤ 3>」——免费的下一轮提示，从不开启新一轮。由 src/server/artifact-registry.js 实现（lane artifacts-e2e 接入；原 stub 已删）：注册表里有这一行 ⇒ `touch`（行得到 `by: user, edits+1`，卡片原地修补，并发这条注记）；只有 `from` 见证 ⇒ 只发 `noteEdit`。注记整条经 peer-text 带子（小节标题是文件里的字）。
- **门禁**：`scripts/test-doc-model.mjs`（快，纯函数 + 六个补丁副本对照）、`scripts/test-doc-window.mjs`（重，chrome 1280 px 与 390 px，中文截图）。

## 注册表（as-built，lane artifacts-registries）
三个早已列着对话产物的存储喂同一个 reducer——不另建列表；产物注册表是它们之上的 VIEW，各自保留存储与界面（Pages 列表仍读 published-pages.json，Design 窗口首页仍读 designs.json）。
- **page**——src/server/published-pages.js 的 `onPublished`（唯一通知点：发布、重发、改可见性、取消发布）⇒ server.js 交给 `artifact-registry.notePage` ⇒ 源文件上的一行 `page`（键 `host:srcPath`：同一页面发两次、或智能体先写后发，都是一行），带 `url`（/p/ 链接）与 `state` published | unpublished——取消发布从不删行。只有 srcKey 恰为 `<host>:<srcPath>` 时前缀才算机器。
- **design**——src/server/design-engine.js 的 `onDesign`（登记、再次打开、改名）⇒ `noteDesign` ⇒ 每个（对话，文件夹）一行 `design`，名字取登记表的标题。
- **upload**——输入框的附件：chat-input → `uploadFilesBatched({sessionId})` → POST /api/upload 的表单写明所属对话 ⇒ `noteUploads` ⇒ 每个落地文件一行 by: user 的 `upload`（文件浏览器上传不带对话，不产生行）。
- **reducer**（src/artifacts.js）：REG_OPS publish / unpublish / open / upload 只生出或命名一行，从不计作写或改；KIND_RANK design › page › upload › 扩展名的 kind（发布过的设计仍是设计；智能体改过的上传文件仍是上传）。`pageOp` / `designOp` / `uploadOp` / `storeRows` 是 PURE 的存储→op 翻译。
- **重放**——重建合并三路：转录推导 ∪ 持久化行 ∪ `storeRows`（normalizers 的 store-rows 接缝，由 artifact-registry.configure 设置：从各自存储读回本对话的页面与设计）。上传没有别的存储：持久化行就是输入框的附件记录。合并取较晚的事实（持久化的取消发布胜过较旧的存储记录；之后的重发又胜过它）与较高等级的 kind。
- **卡片**经同一个函数打开（ChatView._openArtifact——芯片列表行与卡片共用）：已发布页面开 /p/ 链接（app.openBrowser），设计开 Design 窗口（app.openDesign，带本对话），其余（已取消发布的页面、上传）在聊天旁打开文件。说明行写 已发布 / 已取消发布 / 你附上的。
- **未做：**已结束对话的只读历史（ws-handler 的读取）只推导转录行——那里没有存储行。

## 未做 / 后续
