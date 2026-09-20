# Harness 级全局设置：专用配置区 + 与 harness descriptor 打通（设计稿，2026-09-20）

> Owner 的问题（2026-09-20）："可能需要加一个专门的配置区域来存这些 harness-level 的 global setting，然后和 harness adapter 结构连起来，你看看怎么实现比较好。"
> 触发点：2.369.118 的 `claude.transcriptRetentionDays` 是第一条"VibeSpace 写进 harness 自己配置文件"的设置（→ `~/.claude/settings.json` 的 `cleanupPeriodDays`，远端靠 `VIBESPACE_CLAUDE_KEEP_DAYS` 一个 env 一个 key），和既有的 `claude.*/codex.*/opencode.*` 平铺行放在一起，而 descriptor 对它们一无所知。
> 方法：4 个只读 reader（设置面 / harness 层 / 服务端消费者与远端 / 先例与法律）→ 3 个独立设计（descriptor 派生 / 独立存储 / 最小增量）→ 3 位评审（owner 适配 / 架构 / 风险成本）。三位评审的推荐一致，本文是合成后的方案。**尚未开工**——按 owner 指示大规模开发暂停，本文等 go。

## 0. 结论（一句话）

**采用"descriptor 声明、schema 派生"的模型（设计 1），配"一个计划走既有通道"的传输（设计 3）；值继续放在 `data/settings.json`，零迁移；否决独立存储 + key 迁移（设计 2）。**

三位评审给出的分数（10 分制）：owner 适配 8 / 5 / 6.5，架构 8 / 6 / 5，风险成本 6 / 3 / 8（顺序：设计 1 / 2 / 3）。评审对设计 2 的一致判词：第二个设置存储 + 一次性 key 迁移在"每个 tab 都 POST 整个 sparse 对象、localStorage 先于首次 fetch 播种"（settings.js:52-56, 187-197）× "迁移只跑一次"（migration-runner）之下，是 fleet 自更新期间**可复现的丢写窗口**，且 Manage Agents 第四个 tab 重新把 2.262.0 收掉的"平铺缺分级"铺回来。

## 1. 今天的形状（reader 结论，带证据）

- 一条 harness 设置今天只是 `src/lib/settings-schema.js` 里 key 以 harness id 开头的平铺行；**可见**只因 `category` 在硬编码的 `SETTINGS_CATEGORIES`（settings-ui.js:88-131；`t('Claude')/t('Codex')/t('OpenCode')` 在 schema:1044-1046；§44 普查守着）。
- **持久化**：客户端 sparse 存储 → 500 ms 去抖 → `POST /api/settings` 整个对象 → `writeSettings`（writeJsonAtomic + `settings-updated` 广播 + `onSettingsWrite`）。
- **服务端读取**：`serverSetting(key)` 是裸查表（server.js:728-730），服务端从不加载 schema，所以 ~30 个调用点各自内联默认值——`claudeKeepDays()` 的 36500（server.js:788）就是 schema 默认值的第二份拷贝。
- 44 条 harness 前缀行分三类：(a) spawn 时默认值（defaultModel/Effort/PermissionMode/ExtraArgs/outputStyle/brief/systemPromptSnapshot/…/tuiRenderer）；(b) VibeSpace 服务端行为（autoResumeOnLimit——通用功能却挂着 claude 前缀、codex.limitResetCredit、disableModelFallback——spawn + 活会话 control_request 双路）；(c) **写进 harness 自己配置文件**（transcriptRetentionDays；以及更早的 `agents.vibespaceIntegration`，它开关 `~/.claude/settings.json`/`~/.codex/hooks.json` 里的 hook 条目——同一类，只是从没被这样命名）。
- descriptor 对设置管线只贡献 **一件事**：`settingsPrefix`（claude.js:154 / codex.js:139 / acp.js:82 = id / shell.js null），客户端还在 `BACKEND_META` 里手抄一份（agent-meta.js:57/110/145，test-harness-contract.mjs:154 钉着）；它不声明 key、默认值、分类，也不声明"哪个值写进我的哪个文件"。test-harness-contract.mjs:58 用**源码文本 grep** 钉 `<prefix>.defaultModel`，所以 `register()` 进来的插件 harness 在运行时永远满足不了它。
- 只有两处服务端代码经 descriptor 前缀取键（ws-create.js:480-481, 568-569），其余全是字面 harness id（usage-pool-engine.js:2899/3967 等 ~18 处）。
- 远端：`hosts.js:821-823` 在装 agent 工具时把 `VIBESPACE_CLAUDE_KEEP_DAYS=<n>` 塞给 `vibespace-hook-register.mjs`；**只在 Install 时**——一台只被 spawn 进去过的 ssh 主机、以及拨入设备（ws-create.js:1099-1123 走 fsWrite + runCmd），都拿不到这个值（reader 3 发现的缺口）。agentd 的 `run-cmd` 已经合并 `msg.env`（agentd.js:1757-1763），所以传一个 env 到设备**不需要新 op**。
- 副发现（未修）：schema 500/505/510 三行（agentd.autoGraduate/localPipeSessions/localDiscovery）的 category 是裸字面量 `'Integration'`，而分类表是 `t('Integration')`；中/日文界面下这三行会落到没人渲染的桶里，§44 普查在 node 里无语言跑，看不见。→ 顺手修（一行）。

## 2. 数据模型：harness 声明的"行"

PURE 模块 `src/harness-settings.js`（CJS，不 import 任何东西——backend-caps.js 的模式；浏览器 bundle、服务端、daemon 三处同一份），每个 harness 一张表：

```js
// TABLE = { prefix: 'claude', category: t('Claude'), rows: [ROW…] }
// ROW（全是纯数据——不能有函数，表要能过线、能进 bundle）
{
  key: 'transcriptRetentionDays',                 // 持久化路径 = `${prefix}.${key}` —— 现有拼法逐字保留
  type: 'number', default: 36500, min: 0, max: 36500, step: 30,   // enum 行带 options[{value,label}]（运行时从 /api/available-models 刷新的选项仍留在 schema 行上）
  label: t('Keep Claude Code conversations for (days)'),          // English-string-as-key；PURE 文件里 `const t = (s) => s` 只是提取标记，客户端加载时用真 t() 重包（同一 key ⇒ 同一 zh/ja 条目）
  description: t('…'),
  scope: 'instance',                              // v1 唯一 scope：每实例一个值（per-session 覆盖仍是会话状态，照旧）
  apply: { kind: 'cli-config', file: 'settings', path: ['cleanupPeriodDays'], off: 0, onUninstall: 'keep' },
}
```

`apply` 是封闭的 tagged union，`APPLY_KINDS = ['spawn', 'server', 'cli-config']`：

- `{kind:'spawn', how:'--brief', live?:'formatSetFallbackPolicy'}` —— 由 `adapter.buildSessionArgs({…, settings})` 以 `opts.settings.<key>` 消费；`how` 只是**展示文字**（argv 还是 env 还是 inline `--settings` JSON 是 adapter 的事——codex effort 在 chat 走 env、在 terminal 走 `-c`，声明传输就是撒谎）；可选 `live` 点名 adapter 动词，值变化时服务端对该 harness 的每个活 chat 会话调用（今天 disableModelFallback 那段 server.js:765-779 的通用化）。
- `{kind:'server', how:'pool engine'}` —— VibeSpace 在决策点通过 `harnessSetting()` 读；没有 applier。
- `{kind:'cli-config', file:<configFiles id>, path:[…json 路径…], off:<值>, onUninstall:'keep'|'strip'}` —— 写进 harness 自己的配置文件；强制转换后等于 `off` 的值 = "不动 CLI 自己的值"（不写、不删）。

descriptor 用**对象同一性**接上这张表，和今天 `caps: BACKEND_CAPS.claude`（claude.js:64 vs :154）一模一样：

```js
// src/harnesses/claude.js
const SETTINGS_FILE = { rel: ['.claude', 'settings.json'], format: 'json', createIfMissing: false, file: () => path.join(os.homedir(), '.claude', 'settings.json') };
module.exports = {
  …,
  settingsPrefix: 'claude',
  settings: HARNESS_SETTINGS.claude,                  // 同一性钉在 test-harness-contract 里（像 caps 那样）
  configFiles: { settings: SETTINGS_FILE },           // VibeSpace 唯一可写的 CLI 配置文件表；声明一次
  inject: { kind: 'hooks', hookFile: SETTINGS_FILE, hookEvents: […] },   // hook 条目和 managed key 指向同一个对象，路径永不写两遍
};
```

codex 的 `configFiles` 诚实地声明 `{ file: '~/.codex/config.toml', format: 'toml', writable: false }`（codex.js:110/117 只 touch + symlink 它）——校验器对着只读文件的 cli-config 行按名拒绝，而不是靠"没声明"。shell：`settings: null`。ACP/opencode：`settings: specFor(id) || null`。

校验（`checkTable`，PURE）：type 在封闭集合、cli-config 行的 `file` 必在 `configFiles`、`rel` 不含 `..`/绝对段、每个 `live` 动词 adapter 必须实现、prefix 与 `settingsPrefix` 一致。

## 3. 存储：不动

值就在今天的位置——`data/settings.json`，sparse，`<prefix>.<key>`。行 key 就是现有后缀、表 prefix 就是现有前缀，所以持久化拼法**逐字节相同** ⇒ 零迁移、配置导出/导入（persistence.js:711/773）不动、多客户端同步路径不动、旧 bundle 的 tab 照常读同样的 key。默认值只活在一处（PURE 表），schema 行 `...harnessRow(prefix, key)` 展开它，`server.js:788` 那份 36500 的孪生消失。

**回执不持久化**（评审两票）：`cliConfigStatus()` 每次探测都重读目标文件（本机 `agentHooksStatus()`、远端 helper `--status`）——一旦有人手改 settings.json，持久化的"applied at"就成了第二个真相（2026-07-21 hook 中毒事件正是 agent-tool-generators.js:385-395 每次现读的原因）。本机最近一次写入的回执只留在内存（`lastCliConfigReceipt`，随 `/api/agent-hooks` 下发），UI 能显示"3 分钟前写入"直到下次重启。

## 4. UI：专用区域 = 派生出来的每 harness 分区 + 行下的"写到哪里了"

不新开窗口、不新开 tab、不新开分类（评审一致：Manage Agents 第四个 tab 会重新平铺；一个值两处可编辑是硬伤）。

1. **Settings 窗口**（settings-ui.js）就是那个"专门的配置区域"：Claude/Codex/OpenCode 三个分区从此**由 descriptor 表派生**，不再手抄 20 行和 3 个分类字面量：
   ```js
   for (const tbl of Object.values(HARNESS_SETTINGS)) for (const r of tbl.rows)
     SETTINGS_SCHEMA[settingPath(tbl.prefix, r.key)] = { ...r, label: t(r.label), description: t(r.description), category: t(tbl.category), liveApply: true, harness: tbl.prefix, apply: r.apply };
   ```
   `registerHarnessSettings(id, table)` / `unregisterHarnessSettings(id)` 镜像已有的 `registerPluginSettings`（settings-schema.js:1055-1092），插件 harness 走这条运行时路径。§44 普查、搜索、布局同步全部白拿。
2. **每个分区顶部一行说明**："这些值决定新会话怎么启动；标着『写入 CLI 配置』的行会被写进 `~/.claude/settings.json`，写到了哪台机器见行下方。"
3. **cli-config 行下方一个 apply 芯片 + 每机器一行回执**：`✓ 已写入 ~/.claude/settings.json → cleanupPeriodDays = 36500（本机，3 分钟前）` / `⚠ userW-mac：30（想要 36500）—— 下次装工具或起会话时写入` / `⚠ 手改后不是合法 JSON —— 未触碰` / `？ 未检查 —— 重装工具`。回执来自 `/api/agent-hooks`（本机）与 `hosts.agentToolsStatus()`（远端，见 §6）。
4. **Agents → Machines 卡片**在既有 hook 状态芯片旁加同样的芯片（manage-agents.js:1438-1505 那一排）——这是用户看"哪台机器"的地方；不是第二个编辑面。

## 5. 服务端接线：一个访问器，字面 harness id 归零

```js
// server.js，挨着 serverSetting，同样经 deps 下发
function harnessSetting(id, key) {                 // 类型化：应用默认值；未声明的 key 大声抛
  const h = harnessOf(id); const row = h.settings && rowOf(h.settings, key);
  if (!row) throw new Error(`harness '${id}' declares no setting '${key}'`);
  return coerce(row, serverSetting(settingPath(h.settingsPrefix, key)));
}
function harnessDeclares(id, key) { … }            // 跨 harness 的决策点先问"你有没有这条"
function harnessSpawnSettings(id) { … }            // 所有 spawn 行 → 一个 bag 交给 buildSessionArgs
```

改动的调用点（字面 id → descriptor 驱动）：
- ws-create.js:481 `instDefault(key)` → `harnessSetting(backend, key) || ''`；:569 outputStyle 同；:587-601（brief、prompt-cache 三件套、disableModelFallback）删掉，换成 `buildSessionArgs` 的一个字段 `settings: harnessSpawnSettings(backend)`；:598 tuiRenderer 服务端统一读，session-lifecycle.js:149 客户端那处 `backend === 'claude' && …` 字面读删除。
- adapters/claude-code.js：`PROMPT_CACHE_FLAGS` 改用行 key 而不是 `'claude.*'` 路径；`opts.settings?.brief` 等。值进 argv 前的校验仍在 adapter（规则不变）。
- usage-pool-engine.js:2899 `serverSetting('codex.limitResetCredit')` → `harnessSetting(member.backend, 'limitResetCredit')`（在既有 caps.resetCredit 分支内）；:3967 → `harnessDeclares(sess.backend, 'disableModelFallback') && harnessSetting(…)`。评审对"最小增量"设计的致命一击就是它把字面量从 key 挪进参数（`hsetting('codex', …)`）——普查会绿而字面量还在；这里必须从会话/成员上取 harness id。
- server.js:788-790 `claudeKeepDays/syncClaudeRetention` → `syncCliConfig()` = `ensureCliConfig({ plan: cliConfigPlan() })`，boot 时保留 `VIBESPACE_SKIP_AGENT_HOOKS` 守卫**并新增 `hookRegistrationSafe()`**（今天的 retention 写入没守它：一台 /tmp 工作树服务器可以写真实 HOME 的 settings.json——reader 3 的发现，顺手修）；`onSettingsWrite` 的字面比较改为通用：`cliConfigKeys().some((k) => prev[k] !== next[k])`。
- server.js:765-779 disableModelFallback 活循环：会话过滤从 `sess.backend !== 'claude'` 改为能力检查 `adapterRegistry.get(sess.backend)?.formatSetFallbackPolicy`。
- `autoResumeOnLimit`：**移出** claude 表（它是通用功能，注释自己都这么说，settings-schema.js:470-477），保留 legacy key 拼法在 Chat 分类。
- 新普查（test-architecture 加一节）：服务端代码里 `serverSetting\(['"](claude|codex|opencode)\.` 与 `harnessSetting\(['"](claude|codex|opencode)'` 两种字面形都为 0，带合成 offender 的负控。

## 6. 远端与设备：一个计划，一个 env，既有通道（设计 3 的传输）

原则：hostId 是参数。**一个** plan 对象（`{ v: 1, files: [{ rel, format, createIfMissing, set: [{ path, value }], hooks?: {events, cmd} }] }`，自包含、只有相对路径）、**一个** env 名（`VIBESPACE_CLI_CONFIG` = base64 JSON，评审 3 的嫁接：base64 让 ws-create.js:1046 那处 shell 引号问题不存在）、**一份** applier 源码；三种机器只差怎么起 helper：

- 本机（设备 #0）：进程内 `applyConfigPlan(plan, { home })` 走 CAS 写入器——不跑 helper（本机和并发写 settings.json 的 CLI 之间是真竞态，CAS 循环就是为它存在的）。
- ssh 主机，Install（hosts.js:821-823）：把 env 前缀换成 `VIBESPACE_CLI_CONFIG=<b64>`，同一条 `"$VS_NODE" …/vibespace-hook-register.mjs`；helper stdout 的 `CFG|…` 行解析成回执，随 install 结果返回。
- ssh 主机，每次 spawn 的 prelude（ws-create.js:1045-1046）：同一个 env 前缀——补上 reader 3 的缺口：只被 spawn 进去过的主机在下次起会话时拿到值。
- 拨入设备（ws-create.js:1119-1123）：`dm.runCmd('sh', ['-c', …helper…], { env: { VIBESPACE_CLI_CONFIG } })`——agentd 的 run-cmd 已经合并 `msg.env`，**不需要新 op、不需要能力位、不需要 hello-ack 改动、不需要重建 daemon**；老 daemon 一样收到（run-cmd 早于本变更）。
- 远端状态：`hosts.agentToolsStatus()` 加一条**有门的**探测行：`if grep -q VIBESPACE_CLI_CONFIG "$HOME/.vibespace/bin/vibespace-hook-register.mjs"; then … --status; else echo "CFG|*|*|unknown"; fi`——老 helper 不认识 `--status`，会把它当成一次普通注册**运行**（只读探测里的一次写），所以没有新标记的 helper 永远不被调用，UI 说"未检查——重装工具"。
- helper 本身：`vibespace-hook-register.mjs` 是 ESM（`import … from 'fs'`），而 SHARED applier 是 CJS——评审 2/3 都点了这个雷（`require` 在 .mjs 里是自由标识符 = 2.340.2/2.341.1 那一类"潜伏丢绑定"）。解法：helper 模板顶部 `const require = createRequire(import.meta.url)`，applier 源码从**模块文件文本**嵌入（不是 `Function.toString`——闭包引用会变自由标识符），fast 层用 `node --check` + 真跑 helper 双钉；helper 里那份 hook 事件表（:263-266）并进 plan 的 `hooks` 字段，孪生同时死。
- `--uninstall` 永不碰 managed key（用户要的保留天数不是"我们的条目"）。
- **不做**改动时向远端主机的扇出：下次 Install 或下次在那台机器 spawn 时再写（那也正是 CLI 会清扫的时刻）；Machines 卡片在此之前显示 `differs`。每次设置写入就 ssh 一圈是风暴源。
- v1 不做 `harness-config` daemon op；如果将来要"改动即推到所有设备"，再按三触规则加，届时 SHARED applier 已经在 daemon bundle 里。

## 7. 插件 harness

`register(h)` 进来的 harness 和内建一样在 descriptor 上带 `settings` 表；`validate(h, {full:false})` 在字段存在时跑 `checkTable`，外加两条只对贡献者的规则：`settings.prefix === h.id`（只能拥有自己的命名空间，不能蹲 `claude.*`，也不用 `plugin.<id>.*`——那是插件自己非 harness 设置的家），且不得等于任何内建前缀；行数 ≤ 50、类型限封闭集合（同 contributes.settings，plugin-manifest.js:244-280）。`configFiles` 只接受 tier-5 可信加载（loader 决定），`checkTable` 已拒绝含 `..`/绝对段的 `rel`，所以贡献者的 cli-config 行永远指不出 $HOME。客户端：`/api/home` 的 harness 行带上非内建 harness 的 `settings: {prefix, category, rows}`，app.js 调 `registerHarnessSettings`——ws-create 的 spawn 梯和客户端的 `${settingsPrefixFor(backend)}.defaultModel` 组合已经存在，插件 harness 的 defaultModel/PermissionMode 零新代码就能用。

## 8. 门（与代码同一提交）

- **改**：test-harness-contract.mjs:58 源码文本钉 → 表钉：`h.settings === HARNESS_SETTINGS[h.settingsPrefix]`（同一性，像 :40-41 的 caps 钉）、有 defaultModel/defaultPermissionMode 行、`Object.values(h.configFiles).includes(h.inject.hookFile)`（同一性，永不第二种拼法）、每条 cli-config 行的 `file` ∈ configFiles；**spawn 一致性**（§10 法律做成物理的）：每条 `apply.kind==='spawn'` 行，`ad.buildSessionArgs({...base, settings:{[key]: 非默认值}})` 必须在 args/env/inline JSON 上与 base 不同——声明了却没人消费的 spawn 行是红的；负控 = 合成一行 `{key:'nobodyReadsMe', apply:{kind:'spawn'}}` 必须被抓；每条 `live` 行 adapter 有该动词。
- **改**：test-claude-retention.mjs 保名字（避免 §43 普查动荡）：§1 目标换成 `ensureCliConfig({plan})`（七条断言不变），§2 helper 用 `VIBESPACE_CLI_CONFIG`，新 §3 `--status` 打印 `CFG|claude|cleanupPeriodDays|differs|30|36500` 且文件字节+mtime 不变，新 §4 helper 文本含 applier 源码且 `node --check` 过，新 §5 hosts.js/ws-create.js 的 install/prelude/dial 三处源码都带 `VIBESPACE_CLI_CONFIG`，而 `VIBESPACE_CLAUDE_KEEP_DAYS` 全树为 0。
- **改**：test-architecture.mjs：PURE 集合 += `src/harness-settings.js`；SHARED 集合 += `src/harness-config.js`（仅 fs/path）；§44 照旧（分类现在派生，仍必须在 SETTINGS_CATEGORIES 里）；新一节 = 字面 harness id 普查（§5）；`'Integration'` 裸字面量那三行（§1 副发现）顺手修并加负控。
- **新**：scripts/test-harness-settings.mjs（fast）：checkTable 的每条拒绝各一个 fixture；schema 派生行与旧 20 行**逐字段相等**（把 2.369.120 的 settings-schema.js 存成对照 fixture，一次性）；`harnessSetting` 默认值/强制转换/未声明抛错；plan 构建（off 值 ⇒ 不写）；`applyConfigPlan` 在 scratch HOME 上：写入/幂等/坏 JSON 拒绝且字节不变/缺文件按名报告；`readConfigPlan` 的四种状态；`registerHarnessSettings` 的前缀规则。
- **不新增** heavy 套件（没有新 daemon op）。

## 9. 风险、迁移、体量

- 迁移：**无**。持久化拼法逐字节相同；导出/导入不动；老 bundle 的 tab 读同样的 key；老 helper 靠 grep 门永不被误调用；老 daemon 靠 run-cmd 的 env 合并直接可用。
- 回滚：撤掉派生就回到手抄行，值不受影响。
- 行为变化（有意）：retention 写入开始遵守 `hookRegistrationSafe()`；只被 spawn 进去的主机和拨入设备**开始**收到 cli-config 值；`autoResumeOnLimit` 离开 Claude 分区回到 Chat 分区（key 不变）。
- 体量：约 24 个文件、净 +650～800 行、一个版本、一次 heavy 跑。新文件三个：`src/harness-settings.js`（PURE，~280 行含搬过来的 20 行）、`src/harness-config.js`（SHARED，~130，含搬过来的 CAS 写入器）、`scripts/test-harness-settings.mjs`（~350）；server.js 净减（ratchet 之下）。

## 10. 需要 owner 拍板的四点

| # | 问题 | 推荐 | 备选 |
|---|---|---|---|
| D1 | 专用区域放哪 | Settings 窗口里由 descriptor **派生**的 Claude/Codex/OpenCode 分区 + 行下"写到哪里了"回执（一个编辑面） | Manage Agents 第四个 "Harnesses" tab（评审一致反对：两处可改一个值、重新平铺） |
| D2 | 回执要不要持久化 | 不持久化：每次现读目标文件；本机最近写入只留内存 | 独立 `data/harness-config-receipts.json`（第二个真相，手改文件后会撒谎） |
| D3 | 改动时要不要推到所有远端 | 不推：下次 Install / 下次在那台机器 spawn 时写；卡片先显示 `differs` | 每次设置写入 ssh 一圈 + daemon op（风暴源，且要新 op） |
| D4 | codex 的 config.toml | 只声明、标 `writable:false`、校验器按名拒绝写；等有真实需求再做 toml 写入器 | 现在就做 toml 写入器（没有需求方，且注释保留是雷） |

D1–D4 都按推荐做的话，就是 §0 的方案原样。等 owner 说"继续开发"再开工（backlog 已停）。
