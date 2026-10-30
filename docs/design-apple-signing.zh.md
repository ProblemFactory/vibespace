# 设计：Apple 开发者签名 — Mac 屏幕助手的稳定身份（一次授权，永久有效）与 iPhone Duo 的 VibeSpace iOS 应用

设计车道 apple-signing，2026-10-26，基线 2.369.358（91bf7e18）。Owner 的裁定（2026-10-26，逐字）：「我受不了了，我们来做开发者签名吧，把 mac helper 和 duo 的 app 版都做了」。设计文档法：每一节都是一笔债——只写会建的；每节末尾的 **「Owner 决定」** 是 owner 要定的，其余都是本文替车道定下的。§8 是本车道已建成的 P0（as-built），§9 汇总所有待决。

**不变的法（CLAUDE.md）**：「设备不 re-exec 任何未签名的东西」（agentd 发布签名法，q-042 D2）——本文把屏幕助手纳入同一条法；**密钥法**：agentd 发布私钥只在发布机上；Apple 证书只在 **owner 的 Mac 钥匙串**里——永不到 hub、永不到 CI、永不到车道；需要证书的构建在**发布时**经 exit road 在 owner 的 Mac 上跑。生产 checkout 与 data/ 只读。

## §0 今天的事实（不重推导）

- Mac 屏幕助手 `tools/vibespace-screen/vibespace-screen.swift` → `~/.vibespace/helpers/vibespace-screen`，**ad-hoc 签名**（`codesign -s -`，src/stream-plan.js `macBuildPlan`）。**TCC 法**（stream-plan.js「THE TCC LAW」）：macOS 把「屏幕录制」授权记在 **responsible process** 上，助手经 `--disclaim` 自己 re-spawn 成自己的 TCC client；ad-hoc 二进制的身份就是它的 **cdhash**，所以**每个新版本 = 一个新 client = owner 在系统设置里再开一次**（`helper_changed_regrant`）。这就是 owner 受不了的那笔重复授权。
- 助手来源的梯子（src/agentd/stream-mac.js `createMacHelper().ensure()`）：版本文件 = 随 bundle 的 `VERSION`（源码 sha，`vs-…`）⇒ ready；否则依次 **hub 推来的 prebuilt**（`vibespace-screen-<VERSION>`，src/server/desktop-webrtc.js `pushMacHelper`，从 hub 的 data/bin/helpers/）→ **Mac 上有 Command Line Tools 就本机编译**（swiftc ×2 + lipo + ad-hoc codesign）→ 都没有 ⇒ `no_helper`。
- Prebuilt 的发布：`scripts/build-mac-helper.sh` 在一台 Mac 上跑（本机或 `.github/workflows/mac-helper.yml` 的 macOS runner）产出 data/bin/helpers/{vibespace-screen, .version}；data/bin/helpers/ **不进 git**（.gitignore）；runner 把 ad-hoc 产物作为 release asset 上传；「asset 进 hub 的 data/bin/helpers/」= 发布步骤（B-817d，未建）。
- Owner 的 Mac：macOS 27.0.1，Xcode 27.1 + CLT；hub 只经 `vibespace-exit run <那台 Mac> -- '<sh -lc 行>'` 触达（≤ 30 s/次、命令 ≤ 4096 字节、长活 nohup、文件以 gzip+base64 3500 字节分片送达）。2026-10-26 实测：`security find-identity -v -p codesigning` = **0 个身份**（owner 尚未注册）；现装助手 ad-hoc，identifier 随构建变。
- iPhone Duo（lane iphone-duo-research 的记忆级事实）：Safari 的五个视口（CSS px）——外屏竖 382×580、外屏横 594×368、内屏竖 669×867、内屏横 951×585、内屏 Split View 385×571；**Device Posture / Viewport Segments 两个 API 在 Safari 27.1 是 feature flag 后的开发者预览，默认关，脚本翻不动；Apple 工程师（论坛 848036）：「cannot be enabled in WKWebView」**——所以原生壳必须自己读姿态再交给页面（§4.3）。原生侧的名字（本车道读 Apple 文档核对：「UIHingeInteraction」= iOS 27.1+，「An interaction for observing the hinge state associated with the view's hierarchy」，handler 收 `update.hinge` 的 `angle` / `status`；「UIViewReservedRegion」= iOS 27.1+，kind `divisionRegionKind`「An area where content splits into separate regions, such as at the fold of a hinge」，`frame`（含 margins）、`active`、由 UIView 的 `reservedRegionsOfKind:` 取；`UIHinge.Status` = closed / partiallyOpen / fullyOpen / unknown 来自 iphone-duo-research 的记忆级笔记）。模拟器：姿态由 Device Hub 的 pose 切换，1–2.5 s 后换屏。
- 今天**没有 iOS 应用**：手机档是 Safari（无 PWA）——输入框 < 16 px 就放大（lane phone-six 修字号）、返回键会重载（lane phone-back-reload 的 guard）、无推送、无钥匙串、Duo 姿态 API 关。

## §1 Apple Developer Program

两种会员都是 **$99/年**，都给同一套东西；差别只在注册者是谁、名字写谁、多久能用：

| | Individual（个人） | Organization（组织「ProblemFactory」） |
|---|---|---|
| 注册 | Apple ID（双重认证）+ **法定姓名**（Apple：「use your legal name … an alias, nickname, or company name … will cause a delay」）；Apple 不承诺时长，经验上当天到 48 小时 | **法人实体 + D-U-N-S 号**（Apple 页「D-U-N-S® Number」：免费，D&B 最多 5 个工作日发号，Apple 再要最多 2 个工作日收到）+ 有法律约束权的申请人 + 公司域名邮箱与网站；不收 DBA / 商号 / 分支 |
| 发布者名字 | **owner 的法定姓名**——出现在 `Developer ID Application: <姓名> (TEAMID)`、Gatekeeper 的「来自已识别的开发者」、TestFlight / App Store 的卖家栏 | 公司名 |
| 团队 | 一个人，一个 Apple ID；证书都在 owner 的钥匙串 | 可加成员（Admin / App Manager / Developer…），证书可按人签发 |
| 之后转换 | Apple 页「Updating your account information」：个人 → 组织要**提交申请**，申请人须是创始人 / 联合创始人，提供 D-U-N-S，可能要商业文件。**Apple 没有写明转换后 Team ID 是否保留**——转换前先问 Apple；若 Team ID 变了，§2 的 DR 跟着变 = 助手再授权**一次**、证书重签 | — |

每种会员都给（Apple 页「Become a member」：$99/年）：**Developer ID Application** 证书（Mac 上 App Store 之外分发、公证——助手要的）；**Apple Development**（开发构建装到登记过 UDID 的设备）；**Apple Distribution**（Ad Hoc / TestFlight / App Store——iOS 应用要的）；**App Store Connect**（TestFlight、API 密钥——`notarytool` 的公证用它）。Developer ID Installer 不需要（我们不做 .pkg）。

**建议：现在用 Individual。** 理由：(a) 舰队是 owner + 几个人，没有「发布者是公司名」的需求；(b) 快——注册当天到两天内就能签，组织要等 D-U-N-S；(c) §2 的稳定身份是 **Team ID**，不是名字——以后真要公开发行，转成组织时 Team ID 不变、授权不丢；(d) 单人账号的证书只在 owner 的 Mac 上，正好符合密钥法。什么时候换组织：产品对外公开（App Store 上架、第三方下载 Mac 产物），那时卖家栏写公司名才对。

**Owner 决定 D1**：Individual（建议）/ Organization。

## §2 Mac 助手的稳定身份

### 2.1 签名方式（发布时，在 owner 的 Mac 上）

```
codesign --sign "Developer ID Application: <姓名> (TEAMID)" --options runtime --timestamp \
         --identifier com.problemfactory.vibespace.screen --force vibespace-screen
```

- **身份 = designated requirement（DR）**，Developer ID 证书下 codesign 默认生成：
  `identifier "com.problemfactory.vibespace.screen" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = TEAMID`
  ——只认 identifier 与 Team ID，**不含 cdhash、不含版本、不含姓名**。PURE `src/mac-helper-identity.js` `designatedRequirement({ teamId, identifier })` 产出这段文本，测试钉住它。**第二轮（2026-10-26）实证**：主开发在 owner 的 Mac 上抓了一个公证过的 Developer ID 应用（Chrome）的 `codesign -dr -`——与上面这段**逐字段相同**，只有 identifier 组与 Team ID 不同（OU 不带引号，照 codesign 打印的样子；两个 OID 正是 `1.2.840.113635.100.6.2.6` 与 `1.2.840.113635.100.6.1.13`）；今天的 ad-hoc 助手的 `-dr -` 是 `# designated => cdhash H"…" or cdhash H"…"`（`#` = codesign 算出来的、没嵌进文件；universal 二进制每个 slice 一个 cdhash）——这就是每版再授权的实物证据。
- **TCC 为什么从此不再问**：tccd 记每个 client 的 `csreq`（= 这段 DR）；非 bundle 的可执行文件的 client 是**它的路径**（client_type 1）+ csreq。路径固定（今天的法，B-a2f8）+ DR 固定 ⇒ 任何重建的助手都满足同一条 csreq ⇒ 授权保留。ad-hoc 的 csreq 是 `cdhash H"…"`——每次重建都变，这正是今天每版再授权的原因（stream-plan.js「an ad-hoc grant is keyed to path + cdhash」）。
- **只再授权一次**：第一个 Developer ID 构建替换 ad-hoc 构建时，csreq 从 cdhash 变成 DR——TCC 视为换了 client，owner **最后一次**在「屏幕与系统录音」里把 vibespace-screen 关掉再打开。之后：永不。设计与窗口的话都这么说（§8.6：新拒绝名 `helper_signed_regrant` = 「这是最后一次」）。
- **`--identifier` 固定**：不给时 codesign 取文件名（`vibespace-screen`，也稳定），但显式钉住，免得谁改了输出文件名就换了身份。
- **Hardened runtime（`--options runtime`）**：公证的必要条件。助手用到的都不受它限制——ScreenCaptureKit、VideoToolbox、CGEvent 投递（辅助功能 TCC）都**不需要 entitlement**；`--disclaim` 用 `dlsym` 从 libSystem 取 `responsibility_spawnattrs_setdisclaim`（stream-plan.js / 助手源码头部）——hardened runtime 管的是**加载非 Apple 签名的库、DYLD 环境变量、调试、JIT**，不管在 Apple 自己的 libSystem 里查符号（Chrome 公证版用的正是同一个 SPI）；助手不加载第三方 dylib（Swift 运行时随 macOS，目标 macos15.0）。**Entitlements：无。**
- **安全时间戳（`--timestamp`）**：证书到期（5 年）后签名仍然有效；吊销才会让 Gatekeeper 拒绝——TCC 不看吊销。

### 2.2 公证（belt and braces，不阻塞）

```
ditto -c -k --keepParent vibespace-screen vibespace-screen.zip
xcrun notarytool submit vibespace-screen.zip --keychain-profile vibespace-notary --wait
```

- Apple 页「Customizing the notarization workflow」原文：「The notary service accepts disk images (UDIF format), signed flat installer packages, and ZIP archives」「Although tickets are created for standalone binaries, it's not currently possible to staple tickets to them」——裸 Mach-O **可公证、不能 staple**。助手由 agent 经 `fs-write-stream` 写到 Mac 上，**没有 quarantine 属性**，Gatekeeper 不评估它——所以今天公证不是必需。做它的理由：将来 Gatekeeper 收紧、以及公证日志是对签名的第二份校验。Apple 页「Hardened Runtime」：「To upload a macOS app to be notarized, you must enable the Hardened Runtime capability」——所以 2.1 的 `--options runtime` 不可省。
- **决定**：发布时公证，**永不阻塞切版**——`build-mac-helper.sh --notarize vibespace-notary` 失败 ⇒ 脚本仍写出已签名的产物，`.identity.json` 里 `notarized: false`，发布记录说明。

### 2.3 Agent 的校验（「设备不 re-exec 任何未签名的东西」延伸到助手）

- PURE `src/mac-helper-identity.js`：`HELPER_IDENTIFIER = 'com.problemfactory.vibespace.screen'`；`HELPER_TEAM_IDS`（agent 里钉住的 Team ID 列表，**今天为空**——owner 报 Team ID 后一次提交填入）；`parseCodesignInfo(text)` 读 `codesign -dv --verbose=4` 的输出（Identifier / TeamIdentifier / Authority 链 / `Signature=adhoc` / CDHash / Runtime 版本）；`identityVerdict(info, { teamIds, identifier })` → `developer-id`（Authority 以 `Developer ID Application:` 开头 + 链到 Apple Root + TeamIdentifier 在钉住的列表里 + identifier 相符）/ `adhoc` / `other`（签了但不是我们的队伍，或 identifier 不符）/ `unsigned`。
- **校验时机**：**放到固定路径之前**（= 任何 exec 之前）——agent 对推来的 `vibespace-screen-<VERSION>` 跑 `/usr/bin/codesign --verify --strict --verbose=2` 与 `-dv --verbose=4`（每台 Mac 都有 /usr/bin/codesign，不需要 CLT）；通过才 rename 到位，并把身份（kind / teamId / identifier / cdhash）写进 `.state.json`。**第二轮**：裁决为 developer-id 时再跑一次 `codesign -dr -`，读出的 DR 必须**正是** 2.1 那段（自定义 `-r` 的、cdhash 的、别队伍的、多一个子句的 ⇒ `helper_unsigned`——否则 tccd 记下的 csreq 不是我们以为的那条，下一版就丢授权）；写进 `.state.json` 的 `requirement` 是**读出来的**，不是假设的。ad-hoc 的不问（它的 DR 按构造就是 cdhash）。不每次 spawn 都校验：文件只在 agent 用户的家目录里，由 agent 自己写；状态文件里缺身份记录（老 agent 装的助手）时补校一次。
- **裁决表**（PURE `swapVerdict({ installed, incoming, teamIds })`）：

| 钉住的 Team ID | 推来的 prebuilt | 结果 |
|---|---|---|
| 空（今天） | ad-hoc | 接受（今天的路） |
| 空 | Developer ID（任何队伍）/ other / unsigned | **拒绝 `helper_unsigned`**（我们还不认识任何队伍；日志写出看到的 Authority） |
| 有 | Developer ID、队伍在列表里、identifier 相符 | 接受；**装着的是 ad-hoc 同版本也换**（这就是那最后一次再授权） |
| 有 | ad-hoc | 拒绝 `helper_unsigned`（hub 该推签名版；本机编译仍是 ad-hoc 的后备） |
| 有 | other / unsigned | 拒绝 `helper_unsigned` |

- 拒绝 = 删掉推来的文件 + 状态里记 `refused: { version, sha256, code: 'helper_unsigned', why, at, agent }` + 日志一行；**然后走后备**（本机编译）；没有编译器 ⇒ `state: 'missing', code: 'helper_unsigned'`，答复里**带着被拒的 version / sha256 / why**。**第三轮（验收 r1 M1）——拒绝是关于「那些字节」的事实**：同样的字节再推来，拒绝原样成立、不再跑 codesign；不同的字节、另一个助手版本、升级后的 agent（钉 Team ID 的那次提交）都重新裁决；一次「无需换」的推送也清掉旧拒绝。codesign 被超时杀掉 = **不是裁决**：文件留着（`pending`，下次 `ensure()` 再判），同一字节第三次仍无答案才算拒绝。hub（`pushMacHelper`）看到答复里的 sha256 等于自己那份 ⇒ **不再重推同一份**、把 why 写进流的裁决；不同的 prebuilt 才推。**第四轮（验收 r3 minor）**：`pending` 绑定被推的文件——文件没了（清理、磁盘工具、还原）⇒ 清掉、答 `no_helper` 不带 pending、hub 重推、同样字节从第 1 次重判；三次无回答的拒绝带 `until`（UNANSWERED_RETRY_MS = 30 分钟）与本进程的 `boot`——过了时间或 agent 下次启动，同样字节重判；why 写明时间（「codesign did not answer 3 times (…); it will be tried again at <时刻>, or at the agent's next start」——流裁决的 detail），hub 的「not sent again before <时刻>」也写。
- **DR 的比较按「意思」不按字节（第三轮 M2）**：Security 的 requirement dumper 把不能做裸标识符的值（以数字开头的 Team ID——约 28%）**加引号**打印；`requirementVerdict` 比较 token（带引号的值 = 裸值），`designatedRequirement` 与 build-mac-helper.sh 都按 dumper 的形状输出（数字开头 ⇒ 引号）。fixture 里的数字开头队伍是**按规则合成的**，不是捕获——owner 报 Team ID、第一次签名切版后，用真 `codesign -dr -` 替换（kb 的 open item）。
- **再授权的判定**：`regrant = wasGranted && !(旧身份是 Developer ID 同队伍同 identifier && 新身份也是)`——Developer ID → Developer ID 的换版**不**标 regrant（stream-mac.js §3 新腿钉住）。

## §3 谁签、在哪、何时

1. **切版时**（主开发的一步，像今天的 `swiftc -typecheck`）：经 exit road 在 owner 的 Mac 上 `nohup bash scripts/build-mac-helper.sh --sign "Developer ID Application: <姓名> (TEAMID)" --notarize vibespace-notary`（swiftc ×2 ≈ 10 s；公证 1–5 min，detach）。产物在 **Mac 上的** data/bin/helpers/：`vibespace-screen`、`.version`、**`.identity.json`**（`{ version, sha256, kind: 'developer-id', teamId, identifier, notarized, at }`——都是公开事实，没有秘密）。默认（不给 `--sign`）仍是 ad-hoc，`.identity.json` 写 `kind: 'adhoc'`——证书还没有时切版照常。
2. **回到 hub**：助手约 1 MB（通用二进制）。路：**配对设备链路**（owner 的 Mac 是配对机器，hub 经 Files 窗口 / `fs-portable` 读文件——不经 exit road 的 3500 字节分片）；落到 hub 的 data/bin/helpers/（不进 git）。
3. **发布记录**：`npm run sign:agentd`（发布机）在 data/bin/helpers/ 有产物且 `.identity.json` 的 sha256 与文件相符时，把 **`helper: { version, sha256, identity: { kind, teamId, identifier } }`** 写进 release/agentd/manifest.json，**并用同一把发布密钥另签一条语句** `vibespace-agentd-helper/v1 ‖ version ‖ sha256(bundle) ‖ keyId ‖ helper <version> <sha256> <kind> <teamId|-> <identifier|->` 放进第二个字段 **`helperSig`**。**法（第三轮，验收 r1 B1）：bundle 的签名消息永远不变形**——每台设备用自己 bundle 里的那份代码重建它，老设备能验的记录必须一直能验（第一轮把这行塞进了消息本身：所有 ≤ 2.369.361 的 agent 会对第一个带 prebuilt 的发布答 `bad-signature`，每个平台、不重试、每台机器一条紧急项——整个 fleet 被困住）。知道这一行的 agent 校验 `helperSig`（改过的 / 外人签的 / 从别的发布搬来的行 ⇒ `bad-signature`，有行没签名 ⇒ `malformed`）；老 agent 看不见它。剩余（明说）：行和 `helperSig` 一起被删 = 一条没有助手的记录——老消息无法对这行作承诺；hub 的规则随后走 §3.4 (a) 的「没行」两条路（有记录就推、话说 unsigned；没记录按 sha256 推、再说 unverified——第四轮；第三轮这里曾写「一个字节也不推」，第五轮改正）。没有产物 ⇒ 没有这一行（记录如前）。
4. **Hub 推送**（desktop-webrtc.js `pushMacHelper`）多两条规则：(a) **规则（第四轮，验收 r3 M1 + M2——第三轮管得比 r1 简报要求的多）**：hub 推它**有的**那份 prebuilt（字节总能按 sha256 点名，从不「无名」）；发布记录的 `helper` 行与 `.identity.json` 是**在场时的附加检查**——在场就必须点名这一份（版本与 sha256 都要，否则按名拒：另一版本 / 另一份字节），**不在场不是拒绝**（Linux 发布机签的每个发布都没有这一行；mac-helper workflow 的资产第四轮前没有 `.identity.json`）：推送的话说「unsigned prebuilt — the device judges it」（没记录时再加「its identity is unverified here」），Mac 照旧用 codesign 按钉住的 Team ID 裁决。四条路（test-stream-mac §6）：有行且相符 ⇒ 推、话说发布点了名；有行不符 ⇒ 按名拒；没行 + 有记录 ⇒ 推、说 unsigned；没行 + 没记录 ⇒ 按 sha256 推、说 unsigned + unverified；`signedOnly`（签名版赢过 ad-hoc 版）仍只推 Developer ID 的那份（第五轮：有行按**签名行**的 `identity.kind`，没行才按记录的——推送结果的 `identity` 也是）；(a″) **第五轮（验收 r4）**：记录**在场但读不出**（截断 / null / 数组）按名拒「vibespace-screen.identity.json unreadable: <why>」、从不当作不在场（c9a6b6ede 当作不在场、推了、话还说「no record」）；记录没有 sha256 ⇒ 「malformed」（r4 说「vs undefined」）；**发出去的字节边推边哈希**（推送流上的 Transform），必须等于点名的那份——推送途中被换掉的 prebuilt（同大小）⇒ 按名拒（两个 sha256 都说）、请 Mac 删掉收到的文件（`fsRm`）、什么也不认领；设备给的 `until` 超出 Date 范围 ⇒ 话说「tried again later」、不再抛（r4 抛了，整个 stream start 变成 offer_failed「Invalid time value」）；(a′) agent 答复里带的 `refused.sha256` / `pending.sha256` 等于自己这份 ⇒ 不再推、把 why 写进答复；(b) **签名版赢过本机 ad-hoc 版**：offer 成功时 agent 的答复带 `helper: { version, identity, wantSigned }`（`wantSigned` = 装着的不是 Developer ID 且 agent 钉住了 Team ID），hub 的 prebuilt 是同版本的 Developer ID ⇒ **推一次**；**第五轮**：Mac 对这份字节的 hold（带门的拒绝 / 判定中，答复里的 `refused.sha256` / `pending.sha256`）从答复里**消失**——门开了：`until` 过了或 agent 重启——就**再推**（三次 codesign 无回答的拒绝到期后必须有新的推送，agent 写的「it will be tried again at」才成立；r4 每 hub 进程只推一次，30 分钟后的重试从不来），Mac 没说过 hold 的话按 hub 自己的 SIGNED_RETRY_MS = 30 分钟（= agent 的 UNANSWERED_RETRY_MS）后的第一次 stream start 再推；每台机器每 hub 进程最多 SIGNED_PUSH_MAX = 8 次尝试（第六轮：在 await **之前**同步认领，同时在飞的 stream start 只推一次、上限按推送计；Mac 答复里还点名 hold 时不试，hold 保持到答复不再点名），每次一行日志；agent 下一次 `ensure()`（≤ 30 s 的 facts 重读或下一个会话）校验后换上，标最后一次 regrant。
5. **mac-helper workflow**（macOS runner，无证书）：留作**编译门**（源码变了就编一次、artifact 留 30 天）；它上传的 release asset 仍是 ad-hoc——发布记录只认 §3.3 的签名行，所以 hub 不会把 runner 的 asset 当成发布的 prebuilt（sha 对不上）。B-817d「asset 进 hub」的发布步骤改成：**签名产物从 owner 的 Mac 来**，不从 runner 来。

**Owner 决定 D2**：切版时在你的 Mac 上跑签名（主开发经 exit road 操作，证书不离开 Mac）——同意 / 另议。

## §4 iOS 应用「VibeSpace」（iPhone Duo 与 iPhone）— 只写 P0

### 4.1 形状
- **一个 WKWebView 壳**：全屏、safe-area 感知（`viewport-fit=cover` 由页面说，壳把 `safeAreaInsets` 交给 WKWebView 的默认处理）；里面是 hub 的手机档网页（**没有第二套 UI**）。
- **首次运行**：原生一页——hub 地址（https://… 或 http://<LAN IP>:端口）+「连接」：壳请求 `/api/version` 确认是 VibeSpace，然后装载；地址存 UserDefaults（不是秘密）；登录走页面自己的登录，cookie 留在 `WKWebsiteDataStore.default()`（随应用持久）。钥匙串在 P0 只放**一样东西**：无（登录态是 cookie）；「记住 hub 地址 + 登录」就是以上两处。
- **UA**：`applicationNameForUserAgent = "VibeSpace-iOS/<版本>"`——页面据此认出壳（`src/lib/mobile-back.js` 不装 sentinel，见 4.2）。
- **ATS**：`NSAllowsLocalNetworking = YES`（Apple 页「NSAllowsLocalNetworking」：「controls whether App Transport Security (ATS) allows your app to connect to unqualified domains, .local domains, and IP addresses」，默认 NO，iOS 10+——LAN 上 `http://<IP>` 的 hub 要它），`NSLocalNetworkUsageDescription`（iOS 对 LAN IP 的 unicast 也会问一次「本地网络」）。远程 hub 走 https。

### 4.2 壳在原生侧加的（只有这四样）
- (a) **不放大输入框**：WKWebView 与 Safari 不同，**遵守** viewport meta 的 `maximum-scale`；壳不注入——页面的 ≥ 16 px 规则（lane phone-six）本就不触发放大；壳只在 `WKWebViewConfiguration` 里关 `ignoresViewportScaleLimits`（默认即 false）。【模拟器实测确认】
- (b) **返回不重载**：`allowsBackForwardNavigationGestures = false`（Apple 页「allowsBackForwardNavigationGestures」：「The default value is false」）；iPhone 没有系统返回键，边缘滑动就是 WKWebView 的历史手势——关掉。页面认出壳后 `mobile-back.js` 不装 sentinel、不写返回日记；关层靠页面自己的 ‹ 行与 ✕。
- (c) **Duo 姿态交给页面**：壳装 `UIHingeInteraction`（status）+ 读 window scene 上 kind = division 的 `UIViewReservedRegion`（`isActive`、`frame`，换算成 CSS px）→ 每次变化 `evaluateJavaScript` 设 `:root` 的 `--vs-posture: continuous|folded`、`--vs-segments: 1|2`、`--vs-fold-x / --vs-fold-w`（竖折）或 `--vs-fold-y / --vs-fold-h`（横折），并派发 `document` 上的 `vibespace:posture` CustomEvent `{ posture, segments: [rect…], hinge: { status } }`。页面侧：`src/fold-posture.js` 的梯子（`targetOf`）在六条媒体查询之外多**一个来源**——壳的变量优先（它来自 UIKit，不等 Safari 的 flag）。角度不进页面（Apple：布局用 status 不用角度）。
- (d) **推送：P1**，不在此。

### 4.3 分发——四条路比较与分阶段建议（Owner 2026-10-26：「到时候怎么分发 app 呢，放在 GitHub Release 里吗？上架 App Store 吗？」「testflight？」）

每条路的事实都对照 Apple 现行文档读过（页名在括号里）：

| 路 | 谁能装 | 要不要审核 | 有效期 | 要什么 | 判定 |
|---|---|---|---|---|---|
| **TestFlight**（「TestFlight overview」「Add internal testers」「Invite external testers」） | **内部测试员**：团队的 App Store Connect 用户，≤ 100 人（「up to 100 internal testers (App Store Connect users with access to your content)」）；**外部测试员**：≤ 10 000 人（「you can invite up to 10,000 external testers per app」），用邮件邀请或**公开链接**（「Create Public Link」→「Open to Anyone」，可设 1–10 000 的上限）；**不需要 UDID** | 内部：无；外部：**Beta App Review**（「The first build you submit requires a full review, but later builds for the same version might not」） | **每个 build 90 天**（「Your build becomes unavailable for testers after 90 days」）——我们的发布节奏本来就会重新上传 | App Store Connect 的 App 记录 + 上传（§5）；外部测试要 Test Information（反馈邮箱、联系方式，Apple 页原文「Enter test information, such as Feedback Email and Contact Information」） | **第一阶段就用它**：公共仓库的用户带着自己的 hub 地址装同一个 app，不用登记设备 |
| **Ad Hoc OTA**（「Devices overview」「Distribute proprietary in-house apps to Apple devices」） | **只有 UDID 登记在开发者账号里的设备**（「register up to 100 of the following devices, per product family, per membership year」；停用不释放名额，续费时可重置） | 无 | 描述文件**约一年**（Apple 现行帮助页不写年限；退役的「Creating and Downloading a Distribution Provisioning Profile」写「A provisioning profile is valid for one year」——hub 的安装页从 ipa 里的 embedded.mobileprovision 读 ExpirationDate 显示，不假设） | 一个 **HTTPS** 站点放 manifest.plist + .ipa（「need to be downloaded from a website whose address begins with HTTPS」），链接 `itms-services://?action=download-manifest&url=<https manifest>`；hub 自己就是这个站点（`/ios/install`，已登录的人；页面写 UDID 步骤与到期日）。**GitHub Release 能镜像 .ipa + manifest，但对 iOS 什么都买不到**（没登记的设备装不了）；私有仓库（自研内核那种）更不行——itms-services 不带认证 | **只做 Beta 审核受阻时的备用**（一小段，§5 的同一个 ipa 换 `release-testing` 导出即可） |
| **App Store**（「App Review Guidelines」） | 所有人 | **完整审核**；4.2 Minimum Functionality 原文：「Your app should include features, content, and UI that elevate it beyond a repackaged website. If your app is not particularly useful, unique, or "app-like," it doesn't belong on the App Store」；4.2.2「apps shouldn't primarily be … web clippings, content aggregators, or a collection of links」——一个只装载 URL 的 WKWebView 壳**有被拒的风险** | — | 商店页、隐私政策、截图、App 隐私详情（「App Privacy Details」：「required to submit new apps and app updates to the App Store」） | **最早第三阶段**，等壳有了真正的原生价值（姿态、钥匙串、推送、文件、exit-road 的设备功能） |
| **Enterprise（in-house）**（「Apple Developer Enterprise Program」） | 组织内员工 | — | — | $299/年，**「Have 100 or more employees」**，且「only for the internal use and distribution of proprietary apps … not adequately addressed with … Ad Hoc distribution, or beta testing through TestFlight」 | **不适用** |

**Mac 助手不是 app**：它随 VibeSpace 发布走（签名的 prebuilt + agentd manifest 的 `helper` 行，§3），由 hub 推到配对的 Mac——GitHub Release 可以镜像，**从不必需**。

**分阶段建议**：
1. **第一阶段（现在）= TestFlight**：Owner 本人等团队成员是内部测试员（上传后即可装，无审核）；其他装 VibeSpace 的人走**公开链接**（第一个 build 过一次 Beta App Review，一般 1–2 天；之后同版本的 build 多半免审）。不收集 UDID，公共仓库的用户也能用。
2. **备用**：Beta 审核受阻时，同一个 archive 用 `release-testing` 导出成 Ad Hoc ipa，由 hub 的 `/ios/install` 发给登记过 UDID 的两三台设备。
3. **第三阶段**：App Store——只在壳长出原生功能、能过 4.2 之后；需要商店材料与隐私详情。

**Owner 决定 D3**：第一阶段 TestFlight（建议，按你的追问）/ 先 Ad Hoc；以及 App Store 阶段的时机（建议：不定日期，等 P1 的原生功能落地后再议）。

## §5 iOS 的构建与上传之路

- 仓库里 **`apps/ios/VibeSpace/`**：`project.yml`（xcodegen 的描述，人读的真源）+ **生成一次并提交的 `VibeSpace.xcodeproj`**（只有 project.yml 变了才重新 `xcodegen generate`；owner 的 Mac 不必装 xcodegen 也能 xcodebuild）；Swift 源：`App.swift`（场景 + 首次运行页）、`WebShell.swift`（WKWebView + 4.2 的四样）、`Posture.swift`（铰链 + reserved region → CSS 变量）；`Info.plist`（ATS、本地网络说明、**`ITSAppUsesNonExemptEncryption = NO`**——Apple 页「Complying with Encryption Export Regulations」：「the use of encryption that's built into the operating system—for example, when your app makes HTTPS connections using URLSession—is exempt」，这个键让上传跳过出口合规问答）；`ExportOptions.plist`。Bundle id `com.problemfactory.vibespace`，无特殊 capability。版本：`MARKETING_VERSION` = package.json 的版本，`CURRENT_PROJECT_VERSION` = 单调递增的 build 号（脚本写入——App Store Connect 要求同版本的 build 号递增）。
- **`scripts/build-ios-app.sh`**（owner 的 Mac，发布时，经 exit road，detach）：
  1. `xcodebuild -project … -scheme VibeSpace -configuration Release -destination 'generic/platform=iOS' -archivePath build/VibeSpace.xcarchive archive`
  2. **TestFlight 上传**：`xcodebuild -exportArchive -archivePath … -exportOptionsPlist ExportOptions-testflight.plist -exportPath build/ -allowProvisioningUpdates -authenticationKeyPath ~/.private_keys/AuthKey_<KEYID>.p8 -authenticationKeyID <KEYID> -authenticationKeyIssuerID <ISSUER>`，ExportOptions 的 `method` = `app-store-connect`、`destination` = `upload`、`teamID`、`signingStyle: automatic`——xcodebuild 自己上传到 App Store Connect（Xcode Organizer 里对应「App Store Connect — Distribute using TestFlight or through the App Store」，Apple 页「Distributing your app for beta testing and releases」）。**这些 `method` / `destination` / `-authenticationKey*` 的拼写来自 `xcodebuild -help` 打印的 exportOptionsPlist 键表，不在 Apple 的网页文档里——主开发在 owner 的 Mac 上跑一次 `xcodebuild -help` 核对后再写进脚本**。凭据 = §6.6 的那把 App Store Connect API key（公证也用它），私钥不离开 Mac。
  3. **备用 Ad Hoc**：同一个 archive，`ExportOptions-adhoc.plist`（`method: release-testing`，Organizer 里的「Ad Hoc — Distribute to a limited number of devices you register」）→ `build/VibeSpace.ipa` + `manifest.plist`（ExportOptions 的 `manifest: { appURL, displayImageURL, fullSizeImageURL }` 让 Xcode 顺手产出），经配对设备链路到 hub 的 **`data/ios/`**（gitignore），hub 以 `/ios/*` 提供给已登录的人（manifest.plist 的 URL 按 hub 的外部 https 地址改写）。
- **不进 GitHub Actions**（没有证书）。
- **Owner 决定 D4**：以后是否允许 macOS runner 用仓库 secrets 里的证书构建（.p12 + 密码 + API key 进 GitHub secrets = 证书离开 Mac；**建议：不**——发布频率低、exit road 够用）。
- **Owner 决定 D5**：项目形式——xcodegen `project.yml` + 提交生成的 .xcodeproj（建议）/ 只提交 .xcodeproj。

## §6 Owner 要做的事（精确到点击；没有任何秘密离开你的 Mac）

1. **注册**：developer.apple.com/programs → Enroll → 用你的 Apple ID（已开双重认证）→ Individual → 身份证件 → 付 $99。邮件说「Welcome」才算完（通常 ≤ 48 h）。
2. **证书**（在 Xcode）：Xcode → Settings… → Accounts → **+** 添加 Apple ID → 选你的团队 → **Manage Certificates…** → **+** 三次：**Developer ID Application**、**Apple Distribution**、**Apple Development**。（Xcode 会把私钥和证书放进你的登录钥匙串。）
3. **设备**：Xcode → Window → **Devices and Simulators** → 用线连上你的 iPhone Duo（和 userW 的 iPhone，或让 userW 发你 UDID：设置 → 通用 → 关于 → 轻点「序列号」切到 UDID）→ developer.apple.com → Certificates, Identifiers & Profiles → **Devices → +** 登记 UDID。
4. **App ID**：同页 → **Identifiers → +** → App IDs → Bundle ID **explicit** `com.problemfactory.vibespace`，Capabilities 什么都不勾。
5. **描述文件**：**Profiles → +** → **Ad Hoc** → 选 App ID → 选 Apple Distribution 证书 → 勾设备 → 命名 `VibeSpace Ad Hoc` → 下载并双击（进 Xcode）。（`signingStyle: automatic` 时 Xcode 也会自己管；手动建一次是为了看到到期日。）
6. **公证凭据**：appstoreconnect.apple.com → Users and Access → **Integrations → App Store Connect API → +**（角色 **Developer**）→ 下载 .p8（只能下载一次，放 `~/.private_keys/`）；记下 **Key ID** 与 **Issuer ID**；在终端：
   `xcrun notarytool store-credentials vibespace-notary --key ~/.private_keys/AuthKey_<KEYID>.p8 --key-id <KEYID> --issuer <ISSUER>`（凭据进钥匙串，profile 名 `vibespace-notary`）。
7. **告诉主开发（都是公开信息）**：`security find-identity -v -p codesigning` 打印的**名字**（例 `Developer ID Application: <姓名> (ABCDE12345)`——括号里就是 **Team ID**），以及 Ad Hoc 描述文件的到期日。主开发把 Team ID 钉进 `src/mac-helper-identity.js` `HELPER_TEAM_IDS`（一次提交），之后的切版就按 §3 签。
8. **TestFlight 的材料**（App Store Connect，都是公开信息）：**App 记录**（My Apps → + → 平台 iOS、名称「VibeSpace」、主要语言、Bundle ID 选 `com.problemfactory.vibespace`、SKU 任意、分类 Developer Tools / Productivity）；**图标** 1024×1024（随 archive 上传，放在 asset catalog 里）；**Test Information**（Beta App Description、反馈邮箱、联系人姓名 / 邮箱 / 电话——外部测试必填）；**隐私政策 URL**（外部测试与商店都要一个可访问的页面——建议 hub 仓库 docs 里一页：「app 不收集数据；它只连接你自己指定的 VibeSpace 服务器」）；**App 隐私详情**（问卷答「Data Not Collected」——Apple 页「App Privacy Details」：「Data that is processed only on device is not 'collected'」；提交商店时必填，TestFlight 不问）；**出口合规**：Info.plist 的 `ITSAppUsesNonExemptEncryption = NO`（只用 HTTPS = 标准豁免，§5）；**外部测试组** + **公开链接**（TestFlight 标签 → External Testing → 建组 → Create Public Link → Open to Anyone）。
9. ~~**主开发顺便要你的 Mac 上抓两份输出给测试当 fixture**（公开信息）：`codesign -dv --verbose=4 ~/.vibespace/helpers/vibespace-screen`（现在的 ad-hoc 助手）和任一 Developer ID 签名的程序。~~ **已抓（2026-10-26 第二轮，主开发经 exit road）**：fixtures 已是逐字输出（`scripts/fixtures/stream/codesign-outputs.mjs`，家目录改写为 /Users/me，哈希原样）。

## §7 门与法

- PURE `src/mac-helper-identity.js`（imports nothing；进 test-architecture 的 PURE 集）：DR 文本、`parseCodesignInfo`、`identityVerdict`、`swapVerdict`、`helperRow` / `helperRowVerdict`（manifest 行的形状）、校验 argv、词。
- **test-mac-helper-identity**（fast，PURE，< 0.3 s——fast 档总和 909.2 / 910 s，只容得下这么大）：fixtures = owner Mac 上的**逐字**输出（第二轮：ad-hoc 助手的 `-dv --verbose=4` 与 `-dr -`、Chrome 的 Developer ID 签名者行与 DR；Apple Development / 未签名仍是文档形状）；每条裁决一腿 + RED 对照（去掉 Team ID 检查的变体接受别人的签名；钉住 `HELPER_TEAM_IDS=[Chrome 的队伍]` 的变体接受 Chrome 的形状、仍拒 ad-hoc；DR 文本与 Chrome 的逐字段相等；`-dr -` 按自己的形状解析；去掉 DR 相等检查的变体放过别队伍的 DR）。
- **test-stream-mac §3**：推来的 prebuilt **先校验后到位**；`helper_unsigned` 按名拒绝（RED 对照：去掉校验的补丁副本接受它）；签名版赢过本机编译；同版本 ad-hoc → Developer ID 的换版 = 一次 regrant；Developer ID → Developer ID 不 regrant；§6 真 daemon 的推送腿用假 codesign（bundle 副本里 `/usr/bin/codesign` 换成假程序——与 §6 已有的三处 darwin 补丁同法）。
- **test-agentd-upgrade-signature**：manifest 带 `helper` 行 ⇒ 校验通过；伪造 / 篡改该行 ⇒ `bad-signature`；畸形行 ⇒ `malformed`；`sign-agentd` 在 scratch 仓里有 data/bin/helpers 产物时写出该行。
- 普查：test-sync-fs-census 的 `pushMacHelper` 行（同步读 2 → 4：`.identity.json` 与 manifest）；spawn-env-census 不变（校验复用 `run()` 的 execFile）；test-exit-forensics 不变（无新 kill）。
- kb：kb-features「Desktop apps — the Mac helper's stable identity」、kb-file-structure 索引行 + 本文行；CHANGELOG ×3 `## 2.369.360` 一条：「Mac 屏幕助手改为开发者签名：屏幕录制只需授权一次，之后更新不再重复询问」（iOS 应用那条随它的车道）。
- 不变：没有版本文件改动；CLAUDE.md 不动；Swift 源码**不动**（本箱没有 swiftc；签名不需要改源码——助手 `VERSION` 不变）。

## §8 本车道建成的 P0（as-built，2026-10-26）

- `src/mac-helper-identity.js`（PURE）+ `scripts/test-mac-helper-identity.mjs`（fast）。
- `src/agentd/stream-mac.js`：`ensure()` 的新梯子（§2.3 裁决表）、校验在到位之前、`helper_unsigned`、身份进 `.state.json` 与 facts（`helper.identity`、`helper.wantSigned`）、`helper_signed_regrant`（最后一次）；`src/stream-plan.js`：`MAC_WHY.helper_unsigned` / `helper_signed_regrant`、`macVerifyPlan`。
- `src/agentd/stream-host.js`：offer 成功答复带 `helper`；`src/server/desktop-webrtc.js`：`pushMacHelper` 的两条新规则（§3.4）。
- `src/agentd-signature.js` + `scripts/sign-agentd.mjs` + `scripts/agentd-release.mjs`：manifest 的 `helper` 行在签名消息里。
- `scripts/build-mac-helper.sh --sign / --identifier / --notarize`（默认 ad-hoc）+ `.identity.json`。
- 窗口的话：`helper_signed_regrant`（「这是最后一次」）与 `helper_unsigned`（en/zh/ja）。
- **第二轮（2026-10-26，主开发抓回真机输出）**：fixtures 改为逐字捕获；DR 文本改为 codesign 打印的形状（OU 不带引号）并与真 DR 逐字段相等；`parseDesignatedRequirement` / `requirementVerdict`（PURE）+ agent 在 developer-id 裁决后第三次跑 `codesign -dr -`、不是那条 DR 就拒；`build-mac-helper.sh` 签完同样核对 DR 再写 `.identity.json`。
- **第三轮（2026-10-29，验收 r1：一个 blocker、两个 major、三个 minor，全部在 skeptics 的 harness 下复现）**：B1 **法**——签名消息不变形，助手行改走 `helperSig`（§3.3）；M1 拒绝 = 关于字节的事实、超时不是裁决、hub 不重推同一份（§2.3）；M2 数字开头的 Team ID 按 dumper 的引号规则、按 token 比较（§2.3）；M3 用户 changelog 只说用户今天看得见的；minor：hub 拒推没记录点名的字节、`swapVerdict` 自身 fail closed、build-mac-helper.sh 的可执行位。
- **第四轮（2026-10-29，验收 r3：法成立——基线 verify() 29/29 收 r3 的带行记录、每种 helperSig 攻击按名拒；两个 major 都在 hub 的推送规则里、都是第三轮管多了）**：hub 推它有的 prebuilt，行与记录在场才检查、不在场不拒（§3.4 的四条路；mac-helper workflow 多发第三个资产 `.identity.json`——build-mac-helper.sh 本来就写它）；minor：`pending` 绑定被推的文件（文件没了就清、下次推送重判）；三次 codesign 无回答的拒绝有门——30 分钟后或 agent 下次启动重判，why 写明时间（§2.3）。
- **第五轮（2026-10-29，验收 r4：四条路、pending 绑文件、带门的拒绝、第三个资产都成立；五个 minor 全在 hub 的推送边界 + 一处文档）**：记录在场但读不出 ⇒ 按名拒（不当作不在场；没 sha256 = malformed；一个 mutant 对照）；发出去的字节边推边哈希、必须等于点名的那份（途中换掉 ⇒ 按名拒、请 Mac 删掉）；设备给的 `until` 超范围 ⇒ 「later」不抛；`signedOnly` 先看签名行的 kind；签名路的再推：Mac 的 hold 消失就再推、否则 30 分钟、最多 8 次（§3.4）；§3.3 那句「一个字节也不推」改成四条路。
- **第六轮（2026-10-29，验收 r5：r5 成立、已钉为 .363 #20；一类 crash（早于本车道）、一个钉 Team ID 之前不显的 major、四个 minor，全在 hub 的推送边界；入 .364）**：prebuilt 在 hub 算完摘要、推送流打开之前消失（操作员 rm 再拷）⇒ 按名拒（«prebuilt vanished: <why>»），hub 不再从 uncaughtException 退出；每条出路都销毁流（open 时被拒的推送不再留 fd：50 次 ⇒ 0）；签名路的每台机器在 await 之前同步认领（同时在飞的 stream start 只推一次，上限按推送计：3 并发 ⇒ 1、12 波 ⇒ 8）；Mac 答复里还点名 hold 就不试（hold 保持到答复不再点名——时钟差 2 s 不再烧掉一次、门开即推）；签名行先对文件再读 kind（过期行按名说「names another version」）；日志只许诺机器会做的（到上限后 «not pushed again in this hub's life»）；`timeOf` 只收数字（null / '' / false / [] / true ⇒ «no legible time»）。顺带：test-record-clear-census 自第三轮起红（desktop-webrtc.js 三个未判的 receiver）⇒ 两行 census 归类。
- **未建（下一条车道）**：`apps/ios/` 的壳——等 D3 / D5 定下（两者改文件形状），而且本箱没有 xcodebuild、没有门能跑它；§4–§5 已写到可以开工。证书落地后的那条车道：钉 Team ID、第一次签名切版。

## §9 Owner 决定汇总

- **D1** 会员：Individual（建议）/ Organization。
- **D2** 签名在你的 Mac 上、由主开发经 exit road 在切版时操作：同意 / 另议。
- **D3** iOS 分发：第一阶段 TestFlight（建议，Owner 的追问）/ 先 Ad Hoc；App Store 阶段的时机（建议：等 P1 原生功能后再议）。
- **D4** 以后是否允许 GitHub macOS runner 持证书 + API key 构建上传：不（建议）/ 允许。
- **D5** iOS 项目形式：xcodegen project.yml + 提交生成的 .xcodeproj（建议）/ 只提交 .xcodeproj。
