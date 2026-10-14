# 设计：插件设置并入「全部设置」（VS Code contributes.configuration 式）— q-032

> **头注（2026-10-14，lane llm-plugin-rename，2.369.272）**：下文的「决策 API」插件（id `decision-api`）现在是 **LLM 插件**（id `llm`）：它的节是「插件 › LLM」，按功能排（每个功能一个开关，新增 `judgeModel` 与起草开关 `learn`），设置键 `plugin.llm.*`（`decision.*` 三个旧拼写不变）。见 docs/design-decision-api.zh.md 的头注。下文原文未改写。

owner 2026-10-13 提议；设计台（Fable）2026-10-13。只设计，不建。生产 .261（fa4ffd88b）。

**一句话**：每个内建插件 **一份 PURE 声明表**（src/plugin-settings.js，harness-settings.js 的形），设置窗口从它派生「插件 › <名>」节（可搜索、同一套行渲染、zh/ja），值只住 data/settings.json（`plugin.<id>.<key>`，manifest 插件早已这么住），服务端经 `serverSetting` 读；Plugins 面板的卡退化为**同一声明的视图**：状态 + 动作 + 至多 3 个「快捷行」（同一行画家），其余一个「全部设置 › 插件 › <名>」链接。钥匙永不进设置——留在登记行。先让 plugins-panel-grammar 落地，本设计的 P0 叠在它的头部/折叠之上。

## 1 事实
- **机制已存在一半**：src/lib/settings-schema.js:1633–1673 `registerPluginSettings(id, label, items)` 把 manifest 插件的 `contributes.settings[]` 登记为 `plugin.<id>.<key>`、分类「Plugin: <label>」；`settingsGroupOf` :1693 把这类分类归到 **Plugins 组**（:1681–1689 的树，Plugins / Other 殿后）；调用者 src/lib/plugin-client.js:120。类型 boolean / number / select / string（:1649–1653）。
- **内建插件绕开了它**：src/plugins.js:19/:161 `config(patch)` 写 data/plugins.json `{enabled, config, desiredUp}`；卡在 src/lib/plugins-ui.js 手绘（decisionCard :17–60：三个 checkbox、预算输入 + Save、计数）、src/lib/voice-plugin-card.js（钥匙、Test、语言）。
- **两处真相**：`decision.threshold` / `decision.attentionBlock` 是 settings-schema 行（:1267–1278，分类 Channels），引擎 src/server/channels-attention.js:64 经 `setting('decision.threshold')` 读；而 src/plugins/decision-api.js:17–20 还在 plugins.json 里收一个 `threshold`——没人读；卡上没有阈值（owner 找不到）。
- **先例**：docs/design-harness-settings.zh.md §0/§2——「descriptor 声明、schema 派生，值继续放 data/settings.json，零迁移」；PURE src/harness-settings.js 一张表 `{prefix, category, rows[{key,type,default,label,description,tier?,when?,apply}]}`，settings-schema.js:1487–1504 `deriveHarnessRow/Table`；`apply` 是封闭的 tagged union；scripts/test-harness-settings 钉派生行与快照逐字段相等。
- **服务端读写**：`serverSetting(key)` = 裸查 data/settings.json（server.js:605）；`onSettingsWrite(next, prev)` 是改值的唯一服务端钩子（:638–650，harnessConfig 已挂）。设置窗口有搜索（settings-ui.js:126–133）、`open({search})` :62 可预填搜索词；行类型 boolean / number / enum / text / json（:528–684），**没有** 动作/链接行。
- **正在建**：lane plugins-panel-grammar（基 7b6fa3c7b，on rel261）：卡头 = 名 · 状态芯片 · toggle · chevron；关着时折叠；已定块折成一行；布尔皆 switch；只改卡的语法与词，不动归属。

## 2 设计（三层表位置）
| 层 | 位置 | 内容 |
|---|---|---|
| PURE | **新** `src/plugin-settings.js`（CJS，不 import；harness-settings 的形） | `PLUGIN_SETTINGS = { <pluginId>: { label, rows[], quick[], integration?, links? } }`；ROW = `{key, type ∈ boolean|number|enum|string|text, default, label, description, tier?, when?, apply ∈ {kind:'server'} | {kind:'plugin-config'}, path?}`——`path` 只给**遗留键**（`decision.threshold`、`decision.attentionBlock` 保留原拼法，只换节，零迁移）；`quick[]` ≤ 3 个 key = 卡上也画的行；`integration` = 登记行 id（钥匙在哪）；**没有 secret 行**（`checkPluginRows` 拒绝 `secret:true`——钥匙是登记行的）。`checkPluginRows(rows)` = **ONE validator**：manifest 的 `contributes.settings[]` 与内建表同一个（两扇门：plugin-loader 校验 manifest；plugins.js 注册时校验内建表） |
| 派生 | settings-schema.js：`derivePluginTable(id, tbl)`（镜像 deriveHarnessTable；分类仍是「Plugin: <label>」⇒ 自动进 Plugins 组；`registerPluginSettings` 改为调同一派生）+ 新行类型 **`link`**（PURE 数据 `{type:'link', label, description, to: {kind:'plugins-panel'|'integration', id}}`，settings-ui 画成一行 + 一个按钮；≤ 30 行） | 每个插件节 = ① 一行 `link`「插件开关与状态在插件面板」（`enabled` **不是**设置：它有 start/stop/bootReplay 副作用，留 plugins.json；VS Code 的「启用扩展」也不是 setting）② 表里的行 ③ 有 `integration` 时一行 `link`「钥匙与提供方：Services › Integration 的 <row>」 |
| 值与服务端 | data/settings.json 的 sparse 存储（`plugin.<id>.<key>` 或 `path`）；`pluginSetting(id, key)` = `serverSetting(pathOf)` 带默认（host 句柄 `h.setting(key)`）；`onSettingsWrite` 多一支：`apply.kind:'plugin-config'` 的行变了 ⇒ 调该插件的 `config(patch)`（frp 中继字段、tailscale 模式这类要重启才生效的）；`server` 行懒读 | **一处真相**。迁移 = PluginManager 启动时**一次**：每张表的 key 若 `rec.config[key] !== undefined` 且 settings 无覆盖 ⇒ 写进 settings（一次 writeSettings）并从 rec.config 删，日志一行；decision 的 `config.threshold` 直接丢（没人读）|
| 卡（退化） | plugins-ui.js（叠在 grammar 的头部/折叠上） | 头部不变（名 · 芯片 · toggle · chevron）；体 = **状态事实**（provider/账号/今日计数…插件 `status()` 的话）+ **动作**（Login / Test / Start / Stop / Connect / Register —— 动作永远在卡）+ `quick[]` 行**用设置窗口同一个行画家**（`renderSettingRow(path)` 从 settings-ui 导出；值经 SettingsManager，`settings-updated` 同步 ⇒ 卡与设置窗口两扇门一个真相）+ 一行「全部设置 › 插件 › <名>」（`settingsUI.open({search: label})`）。decisionCard/voice 卡的手绘配置行删掉；钥匙块仍是卡上 grammar 定的折叠行 |

**归属**：钥匙/提供方 = 登记行（Services › Integration，已有卡）——设置节只放链接；开关 = plugins.json + 卡的 toggle；其它一切可配置值 = settings。**manifest 插件零改动**（已经是这条路），且因共用 validator 与派生，内建与 manifest 的节长得一样。

**与 plugins-panel-grammar 的先后**：**先 grammar、后本设计**，不合并——grammar 改卡的语法（头/折叠/switch），本设计改值的住处与卡画哪些行；P0 基于 grammar 合并后的树，卡体替换只发生在它的折叠体内。若 grammar 还没合，P0 的 PURE 表 + 派生 + 迁移 + 设置节可以先做（不碰 plugins-ui.js），卡的退化等它。

**被拒**：两处 + 交叉链接（owner 的痛点正是两处真相）；把 `enabled`/钥匙搬进设置（副作用 / 秘密进 sparse JSON 广播到每个 tab）；再开一个插件设置存储（harness 设计 2 被三位评审否决的同一理由）。

## 3 削减 / 成本 / 风险 / 做否
| 项 | 成本 | 风险 | 做否 |
|---|---|---|---|
| PURE 表（6 个内建：decision-api、voice-input、frp、tailscale、opencode-serve、proc）+ 共用 validator + 派生 + `link` 行 + `pluginSetting`/`onSettingsWrite` 分支 + 一次迁移 | ~450 行 | 迁移写一次 settings（已有 writeJsonAtomic）；遗留键靠 `path` 零迁移 | **做（P0）** |
| 卡体退化（quick 行走同一画家 + 动作 + 链接；删手绘配置） | ~250 行（grammar 合并后） | 与 grammar 同文件——顺序解决 | **做（P0 后半）** |
| manifest 插件的 `quick`/`integration` 字段 + 动作声明进表（卡体全派生） | ~200 行 | — | P1 |
| 设置节里画插件状态/计数 | — | 设置窗口变成仪表盘 | **不做**（状态归卡）|

**最小 P0**：PURE `src/plugin-settings.js`（先 decision-api + voice-input 两张表，其余四张随后同车道）→ 派生 + `link` 行 → 服务端读 + 写钩子 + 迁移 → 设置窗口搜索「threshold」即见「插件 › Decision API」节 → 卡体退化（grammar 之后）。门：test-plugin-settings（新 PURE：validator 真值表含拒 secret、派生快照逐字段相等、遗留 path、迁移表：有/无覆盖 × 有/无 rec.config）；test-settings-view（节落 Plugins 组、搜索命中）；test-harness-settings 不变；test-architecture §44 分类普查 + 「没有 `config(` 的插件也没有表 / 有表的插件 `config` 只剩 plugin-config 行」census；scripts/test-plugins-grammar（grammar 的）加一腿：卡上的 quick switch 与设置行同值、翻一边另一边跟（settings-updated）；record-clear 新字段行；i18n zh/ja；docs/settings.md + gen-settings-reference 自动含插件节。

## 4 需 owner 定（推荐在前）
1. **【推荐：一份声明，设置节为主、卡为视图】** 你会看到：全部设置里多一组「插件」，每个插件一节，搜索能找到阈值；插件卡只剩状态、动作和两三个常用开关。答「否」= 两处 + 交叉链接。
2. **【推荐：钥匙留在 Services › Integration，节内只放链接】** 答「否」= 节内嵌登记卡（同一张卡复用，不另存）。

## 5 As-built（lane plugin-settings-p0，2026-10-13，基 7b6fa3c7b）

owner 对 §4 的回答：① 是，设置为主 —— 而且更进一步：侧栏**只留基本列表**（开关、安装/卸载、打开设置），不要 quick 行、不要卡体；② 钥匙留在 Services › Integrations，节内只放链接。所以 §2「卡（退化）」那一行与 `quick[]` **没有建**。

- **PURE 表** `src/plugin-settings.js`：decision-api 7 行（attention / rules / routing / inbox（lane inbox-decision-group 的第 4 个开关，config.inbox 同样迁移）/ dailyBudgetUsd + 遗留键 `decision.threshold`、`decision.attentionBlock` 经 `path` 保留拼法，从 Channels 节移到「Plugin: Decision API」）、voice-input 4 行（language / teach / context / autoProjects）、frp 3 行（serverAddr / serverPort / subDomainHost，`apply: plugin-config` = 改了就重启中继）、tailscale 2 行（mode = plugin-config 重连；upFlags）。opencode-serve 没有表，在自己的描述符上写 `noSettings: '<为什么>'`。`checkPluginRows` = 唯一校验器（manifest 的 `contributes.settings[]` 经 `manifestRows` 走同一个；拒 secret 形状的行与 `enabled`）。
- **钥匙与秘密**：不是行。节末的 LINK 行（`linksOf`）：「开关与状态」→ 插件列表；「钥匙与提供方」→ Services › Integrations；frp 的中继 token 是插件自己持有的秘密（data/plugins.json `config.token`），节内一个只写不读的输入框直接写给插件。
- **服务端**：PluginManager 拿 `settings: {read, patch}`（唯一的 settings 存储）→ 宿主句柄 `h.setting / h.settings / h.writeSettings`；decision-engine、voice-teach-engine、routes/voice 只读这些行。`onSettingsWrite` → 插件可选动词 `applySettings`（frp 重启、Tailscale 重连）。迁移 `2026-10-plugin-config-to-settings`（src/server/migrations.js，经活的 PluginManager）一次性把旧 `config` 搬进 settings.json（settings 已有值则以它为准），decision 的 `config.threshold` 丢弃。
- **侧栏列表**（plugins-ui.js `pluginRow`）：点 · 名称 + 一行描述 · 状态芯片 · 一个 role=switch · [安装 / 卸载…] · ⚙（`_settingsUI.open({category})`：桌面选中树节点并滚到节；手机只显示这一节，直到用搜索）。芯片有事等你时是一扇动作门：Voice「N 条待处理」→ 连接 + 提议卡；Tailscale「登录…」→ 登录链接；manifest 插件 → 它的窗口 / 能力 / 更新。Decision 芯片的提示 =「今天：判断了 n 条 · 命中 m 条」+ 花费。
- **门**：test-plugin-settings（新，fast）、test-plugins-grammar（新，fast：src/plugins/*.js 有表或说理由；每行一个开关、无其他控件 —— 基线卡 RED；无引擎读 plugins.json config —— 基线 RED）。
