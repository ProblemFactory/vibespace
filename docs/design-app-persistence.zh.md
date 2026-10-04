# 应用持久化设计 — 用户（和他们的 agent）装的应用，重启 pod 之后还在

日期 2026-09-27 · 状态 **设计稿；owner D1–D6 已答；§5 的必须 / 应该档探针已在测试实例上跑完（2026-09-27）** · 触发：owner "我们现在开始支持 app 了，也要考虑怎么让用户自己装 app，以及 persistent 的问题 … 最好让他们的 agent 可以帮他们装，装完之后重启 pod 也能保留数据和 app。也许可以考虑类似 SteamDeck 那种或者系统和 chroot 分离的方案"

评审过程：四份独立方案（overlay / chroot 应用系统 / Nix / 清单重放）+ 三位独立评审（运维视角 / 用户视角 / 系统工程师视角）按同一张打分表打分，逐条核对事实错误。原始评审记录在个人项目组的共享目录（不入公开仓库）。本文是综合结论。

**公开仓库规则：本文零集群细节** — 没有主机名、镜像仓库、IP、集群名；一律用 `<registry>` / `<domain>` / `<storage-class>` 这样的占位。

---

## §0 一段话（给 owner）

**推荐：一份"包清单 + 本地 .deb 缓存 + 一键批准"做骨架（所有 pod 都能用，不改镜像不改 chart），在有挂载权限的 pod 上再加一层"应用系统"（PVC 上一个独立的小 Linux 用户空间，apt 装进去就永久在，启动零重放，镜像升级碰不到它）。** 用户对 agent 说"装个 GIMP"，agent 只能**提议**；用户在右下角 For you 托盘看到"装 GIMP？612 MB"，点一下 Install，日志流出来，应用出现在"桌面应用"列表里，agent 就能按 id 打开它。pod 重建后：有应用系统的 pod **什么都不用重装**，应用直接在；没有挂载权限的 pod 退化为"服务器先起来，后台从本地缓存离线重装，几十秒到几分钟，桌面应用行显示 restoring…"。数据从来没丢过——HOME 本来就在 PVC 上。

SteamDeck 式"不可变系统 + 持久 overlay 上层"这条路，三位评审一致**不推荐作为真源**：它是唯一能让 pod **起不来**（DNS/sudo 被用户数据破坏）、每次镜像重建都牵连全员重装、还踩在内核 overlay 叠层深度上限上的方案。它的好处（裸 `sudo apt` 也能持久）恰恰是我们不想要的——没人知道装了什么。它的几条运维教训被吸收进推荐方案（§3.7）。Nix 是"权限最省"的第二名，但等于给每个用户再养一套生态（LibreOffice 一个人 2–3 GB、GL/字体要另接线），**不做**，留作以后无权限 pod 上 CLI 工具的可选层。

---

## §1 事实（从代码读来的，不是猜的）

| 事实 | 出处 |
|---|---|
| 今天唯一跨 pod 重建存活的是 **HOME 那块 PVC**（RWO，默认 100Gi 薄配）。容器 rootfs（/usr /etc /opt /var/lib/dpkg …）每次重建全丢，包括 `sudo apt` 装的一切 | `deploy/helm/vibespace-user/templates/main.yaml`（PVC + Recreate 策略） |
| VibeSpace 本体在镜像里烤好后**首次启动拷进 PVC**（`cp -a /opt/vibespace-dist/. ~/vibespace/`），之后从 PVC 跑、`git pull` 自更新 | `deploy/docker/Dockerfile`、`deploy/docker/entrypoint.sh` |
| 用户 `vibe` uid 1000 非 root，**免密 sudo**（pod 内 root 等价）；容器以 root 起 → `runuser` 降权（fleet 镜像启动时把 `vibe` 改名为实例名，`/home/vibe` 留作兼容软链） | Dockerfile、`boot-root.sh` |
| **CAP_SYS_ADMIN + AppArmor Unconfined** 在 `fuse.enabled` 或 `cephfs.mons` 任一设置时授予；`/dev/fuse` 走 device plugin。没有 privileged、没有 loop 设备、没有 user namespace 设置、seccomp 未设（kubelet 默认 = 无过滤，P1 实测 `Seccomp: 0`） | `main.yaml` 97–115, 276–278；P1 |
| pod **已经从内部做内核挂载**：`sudo -n mount -t ceph …`（My storage）、rclone FUSE、tailscaled（tun）。⇒ 在有 SYS_ADMIN 的 pod 里 `mount(2)` 可用是**已证事实** | `src/mounts.js`、`src/opslog.js`、`src/plugins.js` |
| 今天系统包唯一的"持久化"约定 = `~/.vibespace-init.sh` **每次启动同步重放**（apt 跑在 node 起来之前；liveness 约 5.5 min 兜底；失败忽略）。产品代码不写不管它 | `entrypoint.sh` 39–44 |
| 已有的"产品安装通道"：桌面应用的 **xpra 安装计划**（先出计划 → `sudo -n sh -c` → setsid 分离 + pidfile 槽 + flock → 流式日志 → 重连不重跑）；插件系统的 **boot replay**（意图在 `data/plugins.json`，二进制在 PVC，启动时按 enabled+desiredUp 拉起） | `src/desktop-apps.js` 1111–1298、`src/server/desktop-access.js`、`src/plugins.js` |
| agent 工具模式：`data/bin/vibespace-*` 静态 CLI（AGENT_TOOLS 随会话下发），`VIBESPACE_API` + `vsst_` token → `/api/agent/*`；人类门 = For you 托盘的一个条目 + cookie 路由（agent bearer 一律 403） | `src/agent-routes.js`、`src/hosts.js` |
| 桌面应用目录是代码固定的 `DEFAULT_REGISTRY`，规则"exec 是人的，不是 agent 的"（`vibespace-window open` 只认目录 id） | `src/desktop-apps.js` 950–960 |

**已澄清的事实（探针 P1，2026-09-27，在测试实例的 pod 上实测；fleet 全部 pod 跑同一个镜像 digest）：**

| 事实 | 实测 |
|---|---|
| 底座 | **Debian 12 (bookworm) amd64**，即仓库 Dockerfile 这一系（`node:22-bookworm-slim`）：**Node 22**、**TigerVNC 1.12 + XFCE 4.18 + Debian 的 chromium**（真 deb，不是 snap 存根）。私有部署笔记里的 Ubuntu 24.04 + KasmVNC + Node 20 + 首次启动 git clone 是早期设计，从未上线；首次启动是从镜像 `cp -a` 离线播种 |
| xpra | **fleet 现役镜像里没有**（也没有 xdotool、Xvfb）：它早于 Dockerfile 加 xpra 的那一版。⇒ 桌面应用的 xpra 档在 fleet 上要么等新镜像，要么走产品内 "Install xpra"（装在一次性 rootfs 上，重建即丢——正好是本设计 Layer 0 的对象） |
| uv | 不在镜像里（§3.4 的 `uv tool` 种类要先把 uv 装进 `~/.local/bin`） |
| 权限 | `capabilities.add: [SYS_ADMIN, NET_ADMIN]`、AppArmor Unconfined、**seccomp 完全没有**（`Seccomp: 0`）、NoNewPrivs 0；bounding set = 运行时默认 14 项 + 这两项，含 SYS_CHROOT，**不含 SYS_PTRACE**（root 读不了 uid 1000 进程的 smaps/environ；setuid bwrap 用不了）。fleet 每个 pod 都有（生产 values 里 fuse 与 cephfs 都开着） |
| HOME | 块设备 PVC 上的 **ext4，`rw,relatime`（没有 nosuid/noexec）**；PVC 根目录因 fsGroup 是 `root:<user> 2775`（setgid——在它下面 mkdir 的目录继承组与 setgid，见 §5 P3）。`/tmp` 在容器 overlay 根上；`/dev/shm` 64 MiB |
| 内核 | 6.x（节点发行版内核）；`apparmor_restrict_unprivileged_userns=1`，但 pod 用户 `unshare -Ur` 可用 |
| pid 1 | `runuser`（没有 init），不回收孤儿进程（孤儿成僵尸，无害；keeper 是自己 shim 的父进程，照常回收） |

---

## §2 四条路与评审结论

| | ① Overlay 上层 (SteamOS 式) | ② 应用系统 (chroot sysroot) | ③ Nix on PVC | ④ 清单重放 + .deb 缓存 |
|---|---|---|---|---|
| 一句话 | 启动时把 PVC 上的 upper 叠在 /usr /etc /opt /var/lib 上，apt 写进 upper | PVC 上一个同发行版的 minbase 用户空间，每次启动应用时私有挂载命名空间 + rbind + chroot 进去 | /nix 挂到 PVC，`nix profile install`，无 root | 产品持有的清单 + 本地 .deb 仓库，pod 重建后在 listen 之后离线重装 |
| 持久 | 4 | 5 | 5 | 3（每次重建都重装） |
| agent 可装 | 5 | 4–5 | 3–4 | 4–5 |
| 权限 | 2 | 2–3 | 5 | 3–4 |
| 镜像升级安全 | 3 | 4–5 | 5 | 4 |
| 启动延迟 | 4–5 | 5 | 5 | 2 |
| 磁盘 | 3–4 | 3 | 2 | 4–5 |
| GUI 保真 (xpra) | 5 | 4 | 3 | 5 |
| 运维简单 | 2 | 2–3 | 3 | 4 |
| 工作量 | 2 (~16 d) | 3 (~12–13 d) | 2–3 (~15–17 d) | 3–4 (~13.5 d) |
| 三位评审总分 | 31 / 30 / 30 | **34 / 35 / 33** | 33 / 35 / 35 | 33 / 35 / 35 |
| 评审排名 | 三位都排最后 | 两位第一 | 一位并列第一 | 一位第一（作"骨架"） |

**三位评审共同的结论**：单独一条路都不够；**②的执行模型 + ④的记录层**是最优组合（评审 1、2 明说；评审 3 选 ① 做"可丢弃的加速缓存"叠在 ④ 上，理由同样是"④ 做真源"）。本文采纳 ② + ④，并把 ① 的运维教训收进来（§3.7）。

**评审抓到的事实错误（已在本文修正）：** 
- 在这种 pod（init user namespace + SYS_ADMIN + AppArmor Unconfined）里，`mount -t proc` **不会**被内核拒绝（`mount_too_revealing` 对 init userns 直接放行）——但应用系统仍用 `--rbind /proc`，为的是继承容器的 /proc 遮罩，不是因为做不到。
- overlay 的 workdir **每次挂载都要写**（探测 rename-whiteout/xattr/tmpfile）：PVC 满了 overlay 不是"照样挂"而是**只读挂或 ENOSPC**。
- `bwrap` 以 root 跑**不需要** user namespace（本机实测）；`sudo chmod u+s bwrap` 后 flatpak 也许可行 —— 列为探针，不再写死"flatpak 不行"。（P16 实测：在 fleet 的 pod 里 setuid bwrap 不行——缺 SYS_PTRACE；只有 pivot_root + 新 proc 的进入方式能跑，见 §5。）
- 镜像带 `dbus-x11` ⇒ 有 `dbus-launch --autolaunch`，GTK 应用的 dconf 写入**大概率能存**，不是"没有会话总线所以肯定丢"。
- 二进制 .deb 里的 setuid 是否有效看的是**执行路径所在的挂载**的 nosuid 标志，不是 PVC 的。

---

## §3 推荐方案：三层，一份清单，一个门

### §3.0 总图

```
                 ┌──────────────── Layer 0：清单 + 缓存 + 人类门（每个 pod，先建）────────────────┐
  agent ──propose──▶ vibespace-app ──▶ /api/agent/apps/proposals ──▶ For you 托盘 [Install] ──▶ 分离安装槽
                 │   ~/.vibespace/apps/manifest.json（意图/批准/解析版本/第三方源+密钥指纹）        │
                 │   ~/.vibespace/apps/debs/（sha256 索引的本地 .deb 仓库）                         │
                 └────────────────────────────────┬────────────────────────────────────────────┘
                                                  │ 按 pod 能力选一个执行层
                 ┌────────────────────────────────┴────────────────────────────────────────────┐
   Layer 1：应用系统（有 SYS_ADMIN 的 pod）            │   Layer 2：重放（没有挂载权限的 pod）
   ~/.vibespace/sysroot/rootfs/ 一个同发行版 minbase  │   listen 之后，从本地缓存离线 apt 重装（rung 1），
   apt 装在里面，永久在；启动零重放；镜像升级不碰它     │   底座变了才联网重解析（rung 2）；行显示 restoring…
   每次启动应用：sudo 直接 exec 助手 → 私有挂载命名空间 │
   → rbind /proc /sys /dev /home /tmp → chroot → 降权   │
```

同一份清单、同一个门、同一个目录（桌面应用对话框），**持久机制按 pod 能力选**。用户级的东西（`uv tool`、`npm --prefix ~/.local`、解压过的 AppImage）直接落在 HOME，两层都不需要重放。

### §3.1 Layer 0 — 清单、缓存、门（先建，不改镜像不改 chart，`git pull` 就到）

**在哪**（机器的状态，不是实例的：重播种 `~/vibespace` 不丢应用；配对机器同一布局）：
- `~/.vibespace/apps/manifest.json`（唯一写者 = 服务器，writeJsonAtomic）：`{v, generation, sources:[{id, uris(https only), suites, key, keySha256, pin?}], entries:[{id, kind:'apt'|'uv-tool'|'npm'|'appimage', packages, source?, addedAt, by:{kind:'user'|'agent', conversation?}, approvedAt, rows:[目录行], services:[unit]}], resolved:{codename, arch, baseSha, debs:[{package, version, file, sha256, size}]}}`
- `~/.vibespace/apps/debs/`（root:root 0755）：`*.deb` + 每个一份 `.stanza`（`dpkg-deb -f` + Filename/Size/SHA256）+ 拼出来的 `Packages` —— 一个 `file:` 源，apt 自己校验 sha256。**P15 实测的两条规则**：① `Keep-Downloaded-Packages` 只存 apt 这一次真下载的包——rootfs 漂移过（例如产品自己装过 xpra）就会缺依赖，所以缓存完整性按**底座包表**（§3.7 `base-packages.tsv`）判定：闭包 − 底座 ⊆ 缓存，缺的用 `apt-get download` 补；② apt 的 `_apt` 沙箱用户进不了 `~/.vibespace`（0700），`file:` 这一档要带 `-o APT::Sandbox::User=root`（或换一个 `_apt` 能进的路径）。
- `~/.vibespace/apps/{keys,etc/sources,etc/preferences}/`：第三方源的密钥/deb822/pin 的固定副本，重放不再下载密钥。
- `~/.vibespace/apps/replay.{log,pid,exit}` + flock：**一台机器一个包槽**，xpra 安装、应用安装/卸载/刷新、启动重放全走它，产品永远不会同时跑两个 apt。

**计划（PURE，批准前不以 root 跑任何东西）**：以用户身份 `apt-get -o Dir::State::Lists=~/.cache/… -s install <pkgs>` + `--print-uris` → `{closure, downloadBytes, installedBytes, newSources, keyFingerprints, script, commands, canRun, code}`；拒绝有名字：`needs_snap`（闭包含 snapd）、`conflict`（模拟整份清单 + 新请求失败）、`bad_name`、`bad_source`（非 https / 无 Signed-By）、`no_sudo`、`no_apt`。

**安装**（批准后的脚本，走槽分离执行，包名走 argv 位置参数，绝不插值）：装源/密钥/pin 副本 → `apt-get -o Dir::Cache::archives=$A/debs/ -o APT::Keep-Downloaded-Packages=true install -y <pkgs>` → `dpkg-query -W` 前后差 → `= delta / = desktop / = service` 行 → 服务器（PURE 解析）写清单、生成目录行（`.desktop` 的 Name/Exec/Icon，去掉 `%f/%U`，过 validateAppRow，id `app.<entry>`）。

**agent 流**：
```
$ vibespace-app search gimp
$ vibespace-app install gimp --why "you asked for an image editor"
Proposed ap-7c1e: gimp + 87 packages, 142 MB download, 512 MB on disk.
Nothing is installed until you approve it in VibeSpace (For you → "Install GIMP?").
$ vibespace-app wait ap-7c1e            # ≤100 s 一次，重复调用继续等（vibespace-job poll --wait 的形状）
approved by you 14:02 · installing · done 14:05
App: app.gimp — open it with: vibespace-window open app.gimp
```
`search/list/plan/install(=提议)/remove(=提议)/status/wait/docs` 全部预批准（都不执行任何东西）；`add --kind uv|npm|appimage` 是 HELD（跑任意安装脚本，CLI 自己弹权限卡，和 `vibespace-job run` 一样）。结果**免费**回到 agent 的下一轮（投递梯的 stash，不是计费唤醒）。

**人类门**：一个 For you 条目（新 origin `apps`，进封闭集与普查）："<会话> 想装 GIMP（+87 包，142 MB）— 原因：…  [Install] [Not now]"。Install 打开**和"Install xpra on {machine}…"同一个组件**：每条命令、包列表、新源 + 密钥指纹、大小、"pod 重启后如何恢复（应用系统：直接在 / 重放：约 N s）"。执行路由 cookie-only，agent bearer 403。**用户不用 agent 也能装**：桌面应用 → Install an app… → 搜 → 计划 → Install。

**批准即目录行**：批准安装 = 批准该包 `.desktop` 变成目录行，agent 之后可 `vibespace-window open app.gimp`（`exec_is_human` 对任意可执行文件仍然成立——目录 id 才是 agent 的词汇）。

**谁来装（owner D3，2026-09-27）**：owner 的判断——"装 app"不是高频需求，不值得给每个会话的注入 context 再加教学行。所以：
- **主入口是用户自己**：桌面应用对话框 → "Install an app…" → 搜索 / 计划 / Install（§3.1 的门与槽原样）。
- **普通会话零注入**：`vibespace-app` 只是 PATH 上的一个二进制，每回合注入的教学文本**不加任何一行**；手册只在按需拉取的 `vibespace-docs` 索引里占一行（`vibespace-docs apps`），agent 知道就能用、不知道不花钱。它照旧只能**提议**。
- **"让 agent 帮我装"按钮**（对话框里，用户不会装时点）：从这里起一个**临时帮手会话**——走现有的"新建会话 + 预填首条提示"路径（不是新 harness）：首条提示 = 用户的请求 + 完整的 apps 手册 + 当前机器的事实（发行版、已装、可用空间）；它有这一件事需要的**完整 context**，提议后用户在同一个对话框（或它的聊天里）批准；装完它说一句"done"，会话可关可归档（标记为 helper，不进常驻列表）。
- 批准后目录行对**所有** agent 可按 id 打开（`vibespace-window open app.<entry>`）——这不占 context，`vibespace-window` 本来就在。

**手动 .deb（owner D4，2026-09-27）**："Install from a .deb file…"：从资源管理器选一个 .deb（或输入那台机器上的路径）→ 计划 = `dpkg-deb -I` + `apt-get -s install ./file.deb`（依赖闭包、大小、维护者脚本存在与否）→ 同一个批准门 → `apt-get install ./file.deb`（自动解依赖）→ 该 .deb **复制进本地仓库**并记 sha256，重放 / Rebase 都能重装；来源栏写 "local file"。第三方 apt 源同 §3.1（每个源单独提议、URL + 密钥指纹）。

**D4 修订（owner 2026-10-02 22:22 PDT，设计 009 / lane apps-install-core）**：agent 现在可以**提议**厂商的安装包——`vibespace-app install --from <https 地址>`（VibeSpace 以用户身份下载：只认 https + 公网域名，每一跳重定向都重新判定、连接到判定过的那个地址，≤ 5 跳、≤ 2 GiB）或 `--file <那台机器上的文件>`（复制）；种类按字节判定（.deb / AppImage，其它一律删掉并说出原因），sha256 绑定，应用自己的 .desktop（名字、`Name[zh_CN]`/`Name[ja]`、图标）不安装就读出来。卡片一张、点一次；点击运行的就是展示过的那些字节（文件变了 = `changed`，什么都不运行）。拒绝 / 撤回 / 24 小时过期 / 装完 ⇒ 暂存文件立即删除。用户那一次点击仍是唯一能让它运行的东西。

**漂移绊线**：`/etc/apt/apt.conf.d/99vibespace-apps` 的 `DPkg::Post-Invoke` 触碰一个标记 ⇒ 桌面应用对话框显示"这些包是在 VibeSpace 之外装的，pod 重启会丢 — [Adopt] 进清单"。`~/.vibespace-init.sh` 保留为逃生口，一次性提示"把这几行 apt 挪进 Apps"。

**磁盘底线**：可用空间 < 已装体积 + 2 GiB 时拒绝安装并报数字；缓存每包只留一个版本（Refresh 期间短暂两个）。

### §3.2 Layer 1 — 应用系统（有 SYS_ADMIN 的 pod；推荐的持久层）

**在 PVC 上**：`~/.vibespace/sysroot/rootfs/`（root:root 0755，同发行版同架构的 minbase：自己的 /usr /etc /var/lib/dpkg /var/lib/apt）+ `rootfs/etc/vibespace-sysroot.json`（身份：codename/id/arch/createdFrom/helperContract）+ `~/.vibespace/sysroot/bin/`（用户属主的导出启动器，挂在 PATH **末尾**：镜像同名赢；目录行用绝对 shim 路径，永不冲突）。`rootfs.next/`、`rootfs.prev/` 只在 rebase 期间存在。

**每次启动由服务器重装到临时 rootfs 上的两个小文件**（`sudo -n install`，`/sbin/modprobe` 垫片的先例；只在 chart 设 `VIBESPACE_APP_SYSTEM` 时做，裸机/systemd 安装永远不碰 sudoers）：
- `/usr/local/libexec/vibespace/vs-sysroot-enter`（源码在仓库 `deploy/sysroot/`）；
- `/etc/sudoers.d/~vibespace-sysroot`（`visudo -cf` 验证后装，0440；文件名以 `~` 开头，排在任何以用户名命名的 drop-in 之后——见 §9 加固 r2）：`Defaults!<helper> !use_pty, !pam_session, !pam_setcred, env_keep += "DISPLAY XAUTHORITY VIBESPACE_DESKTOP_APP … LANG TZ"` —— **不授予任何新权限**（用户本来就是 NOPASSWD: ALL），只让 sudo **同 pid 直接 exec** 助手且保留 X 环境。

**助手** `vs-sysroot-enter [--root] [--cwd DIR] -- CMD ARGS…`：
1. 从 `SUDO_UID` 的 passwd 取 HOME（绝不信环境里的路径）；`realpath(R)==R`、root 属主（只看 uid 与不可被他人写；组不要求 root——fsGroup 会改组）、身份文件在、arch = `dpkg --print-architecture`，否则拒绝。参考实现：`deploy/sysroot/vs-sysroot-enter`（§5 探针实测通过的那一份）。
2. `exec unshare --mount --propagation private`（同 pid）。
3. 私有命名空间里：`--rbind /proc`（继承容器遮罩）、`--rbind /sys` 后只读重挂、`--rbind /dev`（pts/shm/fuse 都在）、`--rbind /home`（PVC + 启动时刻 HOME 下的 ceph/rclone 挂载 + `/home/vibe` 兼容软链）、`--rbind /tmp`（xpra 的 `/tmp/.X11-unix/X<N>`）、`/run/user/$UID`、只读 bind `/etc/{resolv.conf,hosts,hostname,localtime}`、只读 bind 镜像的 `/usr/share/fonts` 到 `…/fonts/vibespace-host`（Noto CJK/emoji 不复制）；把用户的 passwd/group 行 upsert 进去。
4. 用户态：`chroot --userspec=$UID:$GID … env -i <白名单> PATH=<系统 PATH> sh -c 'cd "$0" || cd "$HOME"; exec "$@"'`（`VIBESPACE_SESSION_TOKEN` 永不进去；宿主 `~/.local/bin` 不在内层 PATH）。`--root` 只给 apt/dpkg，只有服务器用，shim 永远不用。
命名空间随最后一个进程消亡：**没有东西要 umount，崩溃不留残挂载，宿主文件管理器看不到 HOME 套 HOME**。

**shim**（`~/.vibespace/sysroot/bin/gimp`，模板带版本、启动时旧了就重生成）：`exec sudo -n <helper> --cwd "$PWD" -- /usr/bin/gimp "$@"`。keeper 用 setsid 起 shim 得到 pid P，之后 sudo → 助手 → unshare → chroot → sh → 应用**全是 exec 在 P 上** ⇒ keeper 的句柄、starttime、组杀、`VIBESPACE_DESKTOP_APP` 标记、PSS 资源报告**一字不改**（探针 P7 必须证实 sudo 直接 exec）。

**启动序列**：boot-root.sh / entrypoint.sh **不变**；node listen（readiness/liveness 路径 0 ms）；listen 之后：装两个小文件（实测 35 ms，子进程）→ 读身份+清单（5 ms）→ 重生成旧 shim → `--root dpkg --audit` + 残留锁检查（200–500 ms，子进程）：中断的安装显示"An install was interrupted — Repair"横幅。应用系统的**创建**只在人类点击时做一次：rung A 镜像内烤好的 minbase tarball（15–60 s，离线）或 rung B `debootstrap`（实测 23 s / 206 MB，联网；目标目录先建成 `root:root 0755` 并清掉 setgid，否则 fsGroup 的组与 setgid 会漏进整个用户空间，见 §5 P3）。每次启动一个应用多付约 75 ms（实测，bash 参考实现：47 次外部命令 + rbind；编译版可降到 20–40 ms）。

**镜像升级**：两个包世界从不共享 dpkg 数据库 ⇒ "dpkg 状态压在换了的底座上"这一类问题**按构造不存在**。同发行版升级：应用系统原样能用。换发行版（bookworm→trixie 或换 Ubuntu 底座）：应用系统留在旧发行版**照常运行**（X11/GLX 是线协议，内核 ABI 共享），目录显示"你的应用系统是 Debian 12；底座已是 <new> — Rebase…"；Rebase 人类触发、走槽、流式：建 `rootfs.next` → 按清单重放顶层包与第三方源 → 校验每个导出的 exec 存在、列出新发行版没有的包（不阻塞）→ `rootfs`→`rootfs.prev`、`rootfs.next`→`rootfs`、重生成 shim；`rootfs.prev` 留到用户删，Roll back = 改回名字。**换架构**（另一节点池）：身份 arch 不匹配 ⇒ 拒绝 + Rebase。

**安全更新的归属**：镜像重建**不再**给应用系统打补丁 ⇒ 每个用户一个"N updates · last refreshed N days ago"芯片 + Refresh（= 槽里 `apt-get upgrade`）；运维的 fleet 杠杆 = 每 pod 一条 `runuser -u <u> -- vibespace-app refresh --all`（脚本或 owner 定时的后台任务）。**这是本方案最大的运维缺口，明说。**

**GUI**：应用系统的应用和镜像应用一样被 keeper 起（DISPLAY、XAUTHORITY 在 HOME 下同路径可解析、GDK_BACKEND=x11、QT_QPA_PLATFORM=xcb 经 sudoers env_keep + 助手白名单进去）；X 走 `/tmp` rbind；GL = 应用系统自带的 Mesa llvmpipe 对 Xvfb 的软件 GLX；字体走只读 bind；dbus 走镜像的 `dbus-launch --autolaunch`（探针 P14 证实 dconf 写入存不存）。

### §3.3 Layer 2 — 重放（没有挂载权限的 pod；同一份清单）

listen 之后（readiness 不变）：读清单 → 读临时 rootfs 上的标记 `/var/lib/vibespace/apps-replayed`（服务器重启/崩溃重生一律命中，1 ms）→ 新 rootfs 才起分离 runner（`sudo -n sh -c`，setsid，pidfile，flock）：还原源/密钥/pin → **rung 1 离线**（`file:` 本地仓库，`apt-get install <顶层包>`；P15 实测：GIMP 117 包 / 92 MB 下载 / 397 MB 离线 8.9 s，几个小包约 1 s——瓶颈是 dpkg 解包不是下载，联网装同一套 9.9 s）→ 底座变了/rung 1 失败/Refresh 才 **rung 2 联网**（重解析、刷新缓存、GC 旧版）→ 逐条失败点名（state.json + 一条 For you 通知），从不阻塞别的条目。重放期间目录行灰显 `restoring…`；标了 `after: apps` 的后台服务任务等重放完再放行。pod 在重放中被杀无害（下次从干净 rootfs 再来，没有"dpkg 被中断"的状态可继承）。

### §3.4 用户级种类（两层都不需要重放）

**AppImage（设计 009 S2）**：不再是 agent 自己的 `add --kind appimage`（解到 agent 的 cwd、没有目录行、删不掉）——它是一种**提议**：点击后由 VibeSpace 自己的 SquashFS 读取器（`src/app-squashfs.js`，gzip / zstd；从不运行 AppImage 本身）解到 `~/.vibespace/apps/appimage/<id>/root/`，AppImage 文件随即删除，目录行来自它自己的 .desktop（以 `AppRun` 运行）；`remove` 按种类删掉它自己的目录（uv / npm 用它们自己的卸载命令）。
`uv tool`（uv 自管 Python，底座无关）、`npm --prefix ~/.local`（node ABI 变了才 `npm rebuild -g`）、AppImage 一次解压到 `~/.local/opt/<id>`（运行时不需要 FUSE）。清单记录它们（谁装的、为什么），不需要 For you 批准（它们不授予 agent 的 Bash 没有的东西），只有 HELD CLI 卡。

### §3.5 服务类包（v1 明确的边界）
postgresql/redis 之类：postinst 在没有 systemd 时能完成，但没人在重启后拉起它，`/var/lib/<pkg>` 在应用系统里持久、在重放层不持久。v1：清单记录 `services:[unit]`，用户用 `vibespace-job run --keep-up` 做服务并标 `after: apps`；"持久化这些路径"字段留 v2。

### §3.6 桌面应用目录与 agent 的词汇
目录 = `DEFAULT_REGISTRY` ∪ 清单行（`app.<entry>` / 应用系统 `sys.<name>`）；图标走一个 cookie-only 小路由（image content-type + nosniff，`img.src`，绝不 innerHTML）；行灰显时带原因（restoring / unavailable: 应用系统需要 pod 的挂载权限 / interrupted — Repair）；"在 VibeSpace 之外装的" 单列 + Adopt。

### §3.7 从 overlay 方案吸收的运维规则（对任何"启动路径上的持久层"都成立）
- 镜像烤一个 **base-id 戳** `/usr/share/vibespace/image.json {version, built, codename}` + `base-packages.tsv`："底座变了"是事实不是猜。
- **启动路径上的脚本一律从镜像或检出 exec，绝不从 PVC**（用户数据不能让 pod 起不来）。
- 任何在 listen 之前的持久层工作都要有 **smoke test + 尝试计数 + 安全模式**；本方案把所有工作放在 listen 之后，天然满足。
- 遮住 /etc 的任何东西都要先 **save-and-rebind** `resolv.conf/hosts/hostname`（应用系统用只读 bind 做到了）。
- 备份/恢复 PVC 时注意 fsGroup 的 `OnRootMismatch` 递归 chown（改 gid 与组位，uid 不变，setuid 位会被 kubelet 重新加回）：助手按**身份文件**判断而不是按 root 属主，属主漂移用 `--reinstall` 从缓存修。

---

## §4 不做 / 以后

| 项 | 决定 | 原因 |
|---|---|---|
| Overlay 上层做真源 | 不做 | 唯一能让 pod 起不来的方案；每次镜像重建全员重装；叠层深度 EINVAL 风险；备份对 xattr 敏感 |
| Overlay 做"可丢弃加速缓存"（评审 3） | 不做 v1 | 应用系统已经零重放；再加一个内核挂载层换不来新东西 |
| Nix on PVC | 不做 v1，留作无权限 pod 的 CLI 工具可选层 | 第二套生态；每用户每大应用 2–3 GB 不共享；GL/字体/图标要另接线 |
| flatpak --user | 探针 P16 定 | `sudo chmod u+s bwrap` 后可能可行，不预设失败 |
| 内置 docx 之类的应用级编辑器 | 无关 | 应用装好用 xpra 跑 |
| 配对的 Linux 机器 | 自动得到清单 + 目录行（rootfs 本来持久，rung 0 永远满足）；应用系统不需要 | CS 分离：`hostId` 是参数 |

---

## §5 探针 P0（在**测试实例的 pod** 上跑，一天；每条带通过判据；代码一行不写之前先做）

| # | 探针 | 通过判据 | 实测（2026-09-27，测试实例） |
|---|---|---|---|
| P1 | `cat /etc/os-release; dpkg --print-architecture; command -v uv; sudo -n grep -E 'Cap(Bnd|Eff)' /proc/self/status \| capsh --decode; grep Seccomp /proc/self/status; cat /proc/self/attr/current` 在**每种 chart 档**（默认 / fuse / ceph）的 pod 里 | 记下 codename/arch/uv；SYS_ADMIN + SYS_CHROOT 在 bounding set、AppArmor unconfined、seccomp 值 — 解决 §1 的两个疑问 | **通过**：Debian 12 bookworm / amd64 / 无 uv；SYS_ADMIN + SYS_CHROOT 在 bounding set、无 SYS_PTRACE，AppArmor unconfined，seccomp 无（详见 §1）。只有 fleet 档（fuse + ceph）的 pod 可测，默认档没有现成 pod |
| P2 | `sudo -n unshare --mount --propagation private sh -c 'mkdir -p /tmp/p/a /tmp/p/b && mount --bind /tmp/p/a /tmp/p/b && mount --rbind /proc /tmp/p/b && echo OK'` 后在 pod 自己的命名空间 `findmnt \| grep /tmp/p` | 打印 OK 且 findmnt 空（没泄漏）；EPERM = seccomp/AppArmor 挡了 | **通过**：打印 OK，pod 自己的命名空间无泄漏；新挂 proc / sysfs 也成功（init userns） |
| P3 | 真 PVC 上 rung B 建一个 scratch rootfs，助手进入跑 `id; ls /home/<u>; ls /tmp/.X11-unix; getent passwd <u>` | uid 1000、HOME 可见、X 套接字可见 | **通过**：uid 1000（改名后的用户）、HOME 可见（含兼容软链）、resolv.conf 可读、字体可见、`--cwd` 保留；拒绝路径（无 SUDO_UID / 直接调第 2 阶段 / arch 不符）全部拒绝且无泄漏。debootstrap 23 s、206 MB、6,768 inode。**发现**：fsGroup 的 setgid 让 110 个目录继承用户组 + setgid ⇒ 先建 `root:root 0755`、清 setgid 的空目录再 debootstrap（重跑后为 0）；minbase 的 `etc/localtime` 是软链、没有 `etc/hosts` ⇒ 助手替换 / 创建挂载目标 |
| P4 | `findmnt -no FSTYPE,OPTIONS /home/<u>`；在应用系统里 `apt-get install -y xterm mesa-utils` | 不是 noexec；debootstrap 完成；`stat rootfs/usr/bin/su` 保留 setuid；记时间与大小 | **通过**：ext4 `rw,relatime`（非 noexec / nosuid）；xterm + mesa-utils + hello 70 包 / 57 MB 下载 / 231 MB，6.8 s；`su` 仍 `root:root 4755` 且生效（等密码时 euid 0）；应用系统的 apt 自己保留 .deb（minbase 没有 docker-clean 钩子） |
| P5 | 装 `hello` + xterm，**owner 删 pod**，新 pod Ready 后跑 `~/.vibespace/sysroot/bin/hello` | 零 apt 零网络；xterm 目录行可用；time-to-Ready ±2 s | **通过**：删 pod → Ready 19 s（含 6 s RWO 多挂载等待——pod 换了节点；Started→Ready = readiness 的 10 s 初始延迟，所以 ±2 s 低于探针分辨率）；新 pod 上重装助手 + sudoers 35 ms，`hello` 首启 99 ms；零 apt（启动日志 0 行 apt，宿主 dpkg 锁是镜像时间戳），无镜像站连接；应用系统的 xterm 在镜像自带的 Xtigervnc 临时显示上出窗口 |
| P6 | 从桌面应用对话框经 keeper 的 xpra 通道起应用系统的 xterm / gedit / glxgears | 窗口在 VibeSpace 里、能打字；`fc-list :lang=zh` 有 Noto CJK；`glxinfo -B` = llvmpipe；Stop 在宽限期内结束全部 | **通过**（经 xpra 直接起，不经 keeper——测试实例的版本早于桌面应用）：xpra 6.5.4（fleet 镜像没有，临时装）；xterm 窗口 `title=xterm`，其 pid 是 xpra 的直接子进程（中间无 sudo）；xcalc 窗口出现；接上一个 xpra 客户端后打字进 xterm、命令执行（写出的文件出现在 pod 的 /tmp = /tmp rbind 生效）；`fc-list :lang=zh` 30 个 Noto CJK（字体 bind 在 /usr/share/fonts 下，无需额外 fontconfig 配置）；`glxinfo -B` = llvmpipe、GL 4.5；`xpra stop` 后两个应用 3.8 s 内退出。注：xpra 6.5 拒绝 `--bind-tcp=…:0`；没有客户端时窗口不可见（`shown=False`） |
| P7 | 装好 sudoers 片段后起一个应用，读 keeper 记录的 leader pid | `/proc/<pid>/status` 四个 Uid 全 1000，`exe` 是应用本体，资源采样对每个成员读得到 PSS；**失败 = leader 是 root 的 sudo ⇒ 先改追踪再写 keeper 代码** | **通过**：`setsid shim &` 得到的 pid 本身就是 `sleep`，四个 Uid 全 1000，exe 是应用系统里的二进制，自成会话；用户不经 sudo 读得到 `smaps_rollup`。**对照（去掉 sudoers 片段）**：leader 是 `Uid: 1000 0 0 0` 的 sudo + 一个子进程，用户读 environ / smaps 都 EACCES ⇒ 片段是承重的。用户对进程组发 SIGTERM 能结束它 ⇒ keeper 的追踪不用改 |
| P8 | 应用的 `/proc/<pid>/environ` | 有 DISPLAY/XAUTHORITY/VIBESPACE_DESKTOP_APP，**没有** VIBESPACE_SESSION_TOKEN | **通过**：有 DISPLAY / XAUTHORITY / VIBESPACE_DESKTOP_APP（助手另加 GDK_BACKEND / QT_QPA_PLATFORM），PATH 为系统 PATH，**没有** VIBESPACE_SESSION_TOKEN |
| P9 | 建好应用系统后 owner 重启 pod 两次（+ 一次故意让卷根属主不匹配的一次性 PVC） | 正常重启 `rootfs/usr/bin/su` 仍 root:root 4755；记下不匹配情形到底做了什么 | 未跑（以后） |
| P10 | 启动前有 rclone FUSE + CephFS 挂载；启动后再挂一个 | 启动前的两者在应用里可读写；启动后挂的不可见；宿主 `umount -l` 后应用里的副本活到应用退出 — 与文档所写完全一致 | 未跑（以后） |
| P11 | 槽里 `apt-get install -y libreoffice`，owner 在解包中删 pod | 启动后 Repair 横幅、`dpkg --audit` 点名、Repair exit 0、半装的行从未被当可用 | 未跑（以后） |
| P12 | rung A/B 创建时间与大小、GIMP/LibreOffice 装后大小与 inode、`df` 前后、服务器 loop-gap | rung B ≤ 6 min；minbase ≤ 300 MB；创建与安装全程 loop-gap < 100 ms | debootstrap 23 s / 206 MB / 6,768 inode（minbase ≤ 300 MB ✓，rung B ≤ 6 min ✓）；xterm + mesa + hello +231 MB；GIMP 见 P15；debootstrap 期间 pod 约 0.5 CPU / 150 MiB；应用启动开销约 75 ms（bash 参考实现：47 次外部命令、约 0.8 ms/次 + rbind；裸 sudo 5 ms）；loop-gap 未测（测试实例没有这部分产品代码） |
| P13 | 第三方源提议加 VS Code 仓库、装 `code`、起 | 窗口出现；记下是否需要 `--no-sandbox` | 未跑（以后） |
| P14 | gnome-calculator/gedit 改一个设置、退出、重开 | 设置还在（dbus autolaunch 生效） | **通过**：应用系统内装 dbus-x11 + dconf（16 包 / 24 MB / 3.1 s）；无会话总线时 `gsettings set` 经 autolaunch 写入；杀掉总线与 X、换一个新 X 后读回原值。minbase 没有 /etc/machine-id，dbus 的 postinst 建 /var/lib/dbus/machine-id |
| P15 | Layer 2：3 条清单在**禁网**（`Acquire::http::Proxy=http://127.0.0.1:9`）的新 pod 上重放；50 顶层包清单量 rung 1/2 墙钟 | exit 0、版本一致、日志无 http 抓取；rung 1 ≤ 90 s / ≤ 1 GB，超过 ~3 min 就说明重放层只能做兜底 | **两处修正后通过**：自定义 `Dir::Cache::archives` 躲得过镜像的 docker-clean 钩子；GIMP 联网 110 包 / 89 MB / 9.9 s；只用 dpkg-deb 生成索引，112 条 1.3 s（镜像没有 dpkg-scanpackages / apt-ftparchive）。新 pod 上先失败两次：`_apt` 进不了 `~/.vibespace` ⇒ `APT::Sandbox::User=root`；缓存缺 5 个包（旧 pod 上临时装 xpra 时已带进来，apt 没下载）⇒ 完整性按底座判定并补下载（§3.1）。之后**禁网离线 117 包 / 92 MB / 397 MB，8.9 s**，0 行 http |
| P16 | `sudo apt-get install flatpak && sudo chmod u+s /usr/bin/bwrap && flatpak --user install … Calculator && flatpak run …` 在 xpra 下 | 窗口出现 = flatpak 种类可开 | **按设计不通过；找到可行变体**：应用系统里 `unshare -Ur` 被拒（内核不给 chroot 中的进程建 user namespace）⇒ 非 setuid bwrap 不行；setuid bwrap 在 `capset` 失败（需要 SYS_PTRACE，pod 没有）；宿主侧 `bwrap --proc` 用户和 root 都失败（容器遮罩过的 /proc 使 userns 里挂不了 proc）。**改成 pivot_root 进入 + 挂新 proc（不 rbind 容器的 /proc）后，非特权 `bwrap --proc --unshare-all` 可用** ⇒ flatpak 要换进入方式，代价是应用系统内不再继承容器的 /proc 遮罩——待 owner 定。未装完整 flatpak 运行时 |
| P17 | `unshare -Ur true` 作为用户 + `apparmor_restrict_unprivileged_userns` | 只记录，决定将来无 root 运行 rung | 用户 `unshare -Ur`：宿主侧可用（尽管 `apparmor_restrict_unprivileged_userns=1`），应用系统（chroot）内被拒 |

**实测带来的修正（已写回 §1 / §3）**：底座与权限已定（§1）；rung B 的目录要先建成 `root:root 0755` 并清 setgid；助手的属主检查不要求组为 root；启动开销约 75 ms 而不是 20–40 ms；Layer 0 的缓存完整性按底座包表判定、`file:` 档要 `APT::Sandbox::User=root`；fleet 现役镜像没有 xpra。**P7 通过 ⇒ keeper 代码不用为子进程追踪改动**；sudoers 片段是承重的（有对照）。**待 owner**：flatpak 要不要换成 pivot_root + 新 proc 的进入方式（P16）。参考助手：`deploy/sysroot/vs-sysroot-enter`。

---

## §6 实施计划与工作量（三份方案的估算合并；不含探针与复核轮）

| 阶段 | 内容 | 门 | 估算 |
|---|---|---|---|
| P0 | §5 探针（测试 pod） | 探针记录进本文 §5 的"实测"列 | 1 d |
| P1 | Layer 0：PURE `src/app-manifest.js`（清单/校验/`apt -s` 解析/rung 判定/GC 集/Packages stanza/.desktop 解析/snap 与 service 检测/漂移差） + SHARED 机器半边（`desktop-serve.js` 的 `app-*` op；**把 xpra 的 INSTALL_LAUNCHER/RUNNER 泛化成一台机器一个包槽**，重跑它的竞态控制）+ ORCH（启动重放、槽跟随、目录动态行、cookie-only 执行路由、agent 提议路由、For you `apps` origin + `app-install` action、Refresh）+ `data/bin/vibespace-app` + `docs/agent/apps-manual.md` + AGENT_TOOLS/RULES + 对话框 + zh/ja | test-app-manifest (fast PURE) + test-app-install (heavy: 真 apt 在一次性容器里，无则 SKIP 带证据) + test-architecture 普查（第三个 `sudo -n` 站点、AGENT_TOOLS §52a、inbox origin ⑪） | 10–13 d |
| P2 | Layer 1：助手 + sudoers 片段 + 启动重装（`VIBESPACE_APP_SYSTEM` 门控）+ rung A/B + PURE `src/app-system.js`（身份/rebase 判定/行构造/export 表）+ keeper（安装/卸载/更新/修复/rebase 走同一个槽）+ 目录 `sys.` 行 + Rebase/Repair 横幅 | test-app-system (fast PURE) + test-app-system-enter（heavy：真 unshare/chroot，本机有 sudo 就跑）+ P5/P7 在 pod 上人工验收 | 12–13 d |
| P3 | 运维：镜像 base-id 戳 + `base-packages.tsv`（烤进 Dockerfile）、chart `VIBESPACE_APP_SYSTEM` + `appSystem.enabled`（强制 $sysadmin 分支）、fleet refresh 脚本、runbook | 部署仓库（私有） | 1–2 d |

顺序：**P0 → P1 → P2**。P1 单独就有价值（每个 pod 都能持久，虽然要重放）；P2 把 fleet 上的体验做成零重放。

---

## §7 待 owner 的决定（每行一个"要/不要"）

- **D1** 持久层用"应用系统"（chroot，推荐）而不是 overlay 缓存？
- **D2** fleet 上每个 pod 都允许 SYS_ADMIN + AppArmor Unconfined（今天因为 fuse/ceph 已经全员有；本方案把它变成明确的 chart 开关 `appSystem.enabled`）？
- **D3** agent 提议 → 你在 For you 一键批准 → 装；**批准即把该应用的 .desktop 变成目录行，agent 可按 id 打开**（扩展"exec 是人的"规则）？
- **D4** 允许第三方 apt 源（VS Code、浏览器厂商），每个源单独提议、显示 URL + 密钥指纹？
- **D5** 安全更新：每用户一个 "N updates / 上次刷新 N 天前" 芯片 + Refresh 按钮，运维另有 fleet 脚本；不自动升级？
- **D6** 探针 P0 在测试实例的 pod 上跑（需要你或我用 kubectl；我只读生产实例不动）？

**owner 答复（2026-09-27）**：D1 可以 · D2 没问题 · D3 修订：不给普通会话注入更多 context（低频需求）；做一个安装入口让用户自己装，不会装时从那里起一个带完整 context 的临时 agent 帮忙（已写进 §3.1"谁来装"）· D4 允许，甚至手装 .deb（§3.1"手动 .deb"）· D5 没问题 · D6 可以（在测试实例上跑；2026-09-27 已跑完必须 + 应该两档，外加 P14 / P16 / P17，结果在 §5 的"实测"列）。

**§5 探针分组（回答 D6）**：**必须**（决定方案成不成，约 2 小时，测试实例的 pod）= P1 底座与能力 · P2 私有挂载命名空间 · P3 助手进入 · P5 删 pod 后零网络存活 · P6 xpra 下的 GUI · P7 sudo 直接 exec（keeper 追踪的前提）；**应该**（决定文档里的数字与文案，约 2 小时）= P4 PVC 作根文件系统 · P8 环境 · P12 大小/时间/loop-gap · P15 重放层的离线时间；**可以以后**（边角）= P9 fsGroup · P10 挂载时序 · P11 中断安装 · P13 Electron · P14 dconf · P16 flatpak · P17 userns。

---

## §8 风险（明说）
- **两个 Linux 用户空间会让人困惑**：终端里 `sudo apt` 装到一次性底座，`vibespace-app` 才持久；IDE 装在应用系统里看到的是应用系统的工具链（没有 node/dtach）。缓解：漂移绊线 + Adopt；文档与 agent 手册第一句就是这个。
- **补丁归属**：应用系统不随镜像打补丁（§3.2）。
- **PVC 共享**：应用系统和 `data/` 同一块盘，装满了 VibeSpace 自己也写不了；底线 + 每条目大小可见。
- **重放层的启动延迟**只在没有挂载权限的 pod 上存在，且在 listen 之后；heavy 用户可能等几分钟才见到应用——P15 实测后写进对话框的那行字。
- **内核共享**：需要内核模块的东西（DKMS、VirtualBox）两层都做不了；无 GPU ⇒ GL 只有 llvmpipe。

---

## §9 落地记录（as-built）
- **第三方源的 pin（2.369.203，verify-r1 H1）**：每个批准的源一份 `/etc/apt/preferences.d/vibespace-<id>.pref`（root 的副本是 `~/.vibespace/apps/sys/sources/<id>.pref`，不是 §3.1 写的 `etc/preferences/`）：该源主机（`Pin: origin "<host>"`，不带端口）的一切包优先级 1——只有一个版本都没装时才会取；用户从它装的包优先级 500，照常拿它的更新。"从它装的包" = 安装前 `--print-uris` 归属到该源 URI 之下的包，记在 `sys/entries/<id>.pin`。每次 root 运行结束都重写（finish），两档重放在 apt 之前都还原源/密钥/pin（rung 1 也是）；清单 `sources[].pin.packages` 镜像 root 的记录。Refresh 卡片给每条更新标出来源（批准源的名字，否则主机名）。实测（Debian 12 容器，签名的 https 源 `https://vs-fixture.test:8443/repo` 另带一个更新版的 hello 2.10-99）：有 pin 时 Refresh 保留 Debian 的 2.10-3、只把从该源装的 capp-third 升到 1.1，再装 hello 也不取源里的版本；pins() 写空的对照副本把 hello 升成了 2.10-99。已知边界：2.369.203 之前从某个源装的条目没有 .pin，它在该源的更新被 pin 挡住，重装（或 Adopt）一次即补上；Refresh 新带进来的依赖不加入允许列表。 每次 root 运行都在第一个 apt-get 之前重写 pin；source 模式先写 pin、再让源生效；源的主机若是本机自己的 apt 源在用的主机，直接拒绝（`shared-host`）——`Pin: origin` 只按主机匹配，否则会把本机自己的软件仓库一起压低。
- **.deb / 密钥只读一次（H2）**：机器半边以 O_NONBLOCK 打开、在 fd 上判类型与大小、边复制边算 sha256（不会有 libuv 线程卡在 FIFO 上）；root 用 `dd iflag=nofollow,nonblock` 读进自己的副本，再校验哈希、检查、安装同一份字节。用户可写的暂存副本在"算哈希"与"dpkg-deb 检查"之间仍可被同一用户换掉——root 只装哈希对得上的字节。
- **启动重放遇到忙的槽（H3）**：每 15 s 重试同一档，最多 10 分钟；仍忙才算这一档失败（一条通知）。
- **Layer 1 — 应用系统（2.369.210，lane app-system-l1，§6 P2 原样）**：PURE `src/app-system.js`（身份 `parseIdentity` 按名拒绝 no-identity / bad-identity / contract；`rebaseVerdict` ok / rebase（照常运行）/ blocked（换架构）；`systemView` = GET /api/apps 的 `appSystem`：`canCreate` / `interrupted` / `rebase` / `canRollback` / `blocked`；`sysRows` + 导出表 + `binExports`；shim 模板带版本；`SYS_SCRIPT` = 应用系统的唯一 root 脚本；`INSTALL_SCRIPT` + `SUDOERS_TEXT`）+ 机器半边 `src/app-system-serve.js`（被 app-serve 持有：目录 `sys.<entry>` 行、`~/.vibespace/sysroot/bin` 的 shim 同步、计划、启动步骤）。**和本节写法不同的地方**：① 应用系统里的条目记录放在**用户空间内部** `rootfs/var/lib/vibespace/entries/<id>.{list,desktop,bin,deb}`（root 属主）——随用户空间走：Rebase 按它重放，Roll back 把它一起换回来；`.deb` 条目的文件留在 `rootfs/var/cache/vibespace/`。② 导出表除了 .desktop 行的 exec，还导出顶层包在 `/usr/bin`、`/usr/games` 下的可执行文件（P5 跑的 `~/.vibespace/sysroot/bin/hello`）；名字被别的目标或用户自己的文件占了就跳过，从不覆盖。③ 助手新增：身份文件的 `helperContract` 必须等于助手的 `CONTRACT`；`--root` 只跑 `apt-get/apt-cache/apt-mark/dpkg/dpkg-query`；`--root --next` = 正在建的 `rootfs.next`（Rebase）；`--cwd` 必须是绝对路径；助手自身不可被他人写。④ Roll back = **交换** `rootfs` 与 `rootfs.prev`（新的那个保留成 prev，可以再换回去）；"删除上一个应用系统"是单独的点击（`sys-drop-prev`）；`rootfs.prev` 在时 Rebase 拒绝（`prev_exists`）。⑤ Repair 的判据 = 助手跑的 `dpkg --audit` 有输出 **或** dpkg 日志目录 `var/lib/dpkg/updates/` 非空（崩溃后锁本身由内核释放，没有"残留锁文件"要清）；槽在跑时不判。⑥ 有可用应用系统时，apt / .deb 安装**进应用系统**（模拟以用户身份读用户空间自己的 apt 状态 `simOpts`，批准前不以 root 跑任何东西）；Refresh = 应用系统里的 `apt-get upgrade`。没有应用系统（未开或未建）时 Layer 0 原样。**已知边界**：建应用系统之前用 Layer 0 装在镜像底座上的条目继续走重放，不会自动迁进应用系统；有应用系统时 Refresh 只升级应用系统。⑦ debootstrap 在 `/usr/sbin`（用户 PATH 里通常没有）——rung B 的判定直接看那条路径。实测（test-app-system-enter，Debian 12 一次性容器，SYS_ADMIN + AppArmor/seccomp unconfined，docker 卷当 PVC，卷根 `root:<用户组> 2775`）：rung B 19 s、rung A（镜像 tarball）2 s；hello + xterm 装进去 1 s + 2 s；shim 起的 pid 就是 xterm 本体（四个 Uid 1000、exe 是用户空间里的 xterm、自成会话、用户读得到 PSS）；令牌不进去；pod 的命名空间里看不到应用系统的挂载（SIGKILL 之后也没有）；9 条拒绝按名；解包未配置 → Repair 横幅 → Repair 后审计干净；Rebase（tarball 建 next + 重放两个条目）4 s，Roll back / 删除；每条安全规则一条对照（打补丁的助手副本去掉该规则就出事）。
- **Layer 1 加固（2.369.210，lane app-system-harden，主人 2026-10-04 选定）**：应用系统里的文件、HOME 下的文件不是代码以为的样子时，root 路径仍只做设计说的事。① helper 对 rootfs 内的每个 bind 目标与每次 root 写（/etc/passwd·group 的 upsert、字体、/run/user、/tmp、/home）逐级检查 `inside`：任何一级是符号链接即按名拒绝（不跟随），途经目录须 root 所有且组/他人不可写，缺的目录一级一级 mkdir；锁改为 rootfs 自己的 etc 目录（只读打开），不再创建/截断锁文件。② SYS_SCRIPT 写入 userland 一律走 `put`：先 `cd` 进目录、`pwd -P` 等于规范路径且 root 所有，再以相对名 install + `mv -T`（检查的就是被写的那个对象，埋下的链接被替换而不被跟随）；用户侧的 sources / keys 先 `stage` 进 root 的私有 $T（目录作为 cwd 持有，每个文件 `dd iflag=nofollow` 读），Rebase 的复制同样（cpin）。③ 递归删除只有 `rmchild`：名字必须是 rootfs.prev / .next / .new / .swap，从规范的 sysroot 内部以相对名删，目标须是 root 自己的真实目录，保留 --one-file-system。④ shim 目录用户可写：目录行每次读取（= 每次启动）都核对其启动器——普通文件、本用户所有、组/他人不可写、字节 = shimText(target)（含模板版本）；否则行被标 `shim-not-ours`、记一条日志、启动被拒，绝不执行。⑤ helper 以 `#!/bin/bash -p` 起，在任何外部命令之前 `env -i` + 白名单重新 exec 自己（同 pid）：sudo 命令行上的 LD_*、PATH、IFS、BASH_ENV、locale 到不了 root 代码；白名单值以 VS_KEEP_<名> 只进 app 的环境，root 代码用固定 PATH 与 LC_ALL=C，--root 的 apt/dpkg 环境固定（LANG=C.UTF-8 TERM=dumb）。r2（主开发要求收掉这条残余）：drop-in 自带一条 `#<uid> ALL=(root) NOPASSWD:NOSETENV: <helper>`（安装脚本在 visudo 之前把服务用户的 uid 写进 `#VS_UID`，再核对这一行在）——用户自己的 `ALL` 规则隐含 SETENV，而 sudo 以最后匹配的规则为准，所以文件改名 `~vibespace-sysroot`，按字节序排在 boot-root.sh 以用户名命名的 drop-in 之后；于是 sudo 命令行上 env_keep 以外的变量（LD_PRELOAD、BASH_ENV、PATH…）在 sudo 处就被拒，到不了 helper 的 bash；env_keep 因此也就是命令行可设的全部，钉子要求它不含任何装载器 / shell / PATH 旋钮。⑥ 计划摘要对 sys 计划额外绑定 layer 与它实际运行的 argv（SYS_SCRIPT 及除 nonce 外的每个位置，`sysDigestPart`）；layer 与 argv 不一致的计划没有摘要、到不了槽——host 计划不能冒充 sys 计划，批准后的改变按 plan_changed 拒绝。⑦ 机器半边读 rootfs 内文件（身份、条目、.desktop、sys 图标）逐级走 `inRoot`：无链接、途经目录 root 所有；文件以 O_NOFOLLOW|O_NONBLOCK 打开、在同一 fd 上判定；Exec 目标按 chroot 后的视角在 rootfs 内解析（绝对链接以 rootfs 为根、`..` 停在顶），rootfs 外的东西从不经它们被查看。⑧ 启动安装：源在 PVC 上的检出可被用户写，所以 root 先把两份源复制进私有目录、核对本版本钉住的 `HELPER_SHA256` / `SUDOERS_SHA256` 后才 visudo / install（检查的字节就是安装的字节）；VIBESPACE_APP_SYSTEM 默认关，systemd 下（INVOCATION_ID）即使设了标志也什么都不装——本机即 systemd 用户单元。测试：test-app-system §5/§6/§8（每项一个 patched-copy 对照），test-app-system-enter 的 hardening 腿（容器里真 root / 真 sudo，各带对照）。
- **Layer 0/1/2 边界整理（2.369.211，lane app-layers-tidy，设计 019）**：边界规则——① **root 的记录是唯一依据**：重放只读底座的 `sys/entries/*.list`，应用系统的记录在它自己的 rootfs 里；索引（manifest.json）只跟随。PURE `reconcileIndex` 在每次 install / remove / 应用系统的 run 之后和 `status()` 里对账：apt / deb 条目的 `layer` 跟着 root 的记录走（两层都有同样的包 = 搬家进行中 ⇒ `sys`）；两层都读得到却都没有记录 ⇒ 删掉（`state.sys.gone`，对话框说一次「不在你换回的应用系统里」）；没有索引的记录补一条最小条目；同一个 id 两层包不同 ⇒ 点名（`collisions`），不合并；读不到的那一层不动；损坏的索引走原有的 corrupt 路径。② **搬家（Move）是用户的点击**：新请求 `move`（agent 提议即 `agent_forbidden`），每个底座条目一笔事务——先经唯一的包槽装进应用系统（同一个 id，deb 用 `~/.vibespace/apps/debs` 里 sha256 对得上的那份，对不上就按名拒绝、其余照搬），记录成功后才跑底座脚本的新模式 `forget <id>`（只删 `.list/.desktop/.pin`，不跑 apt；剩余条目不需要的缓存 .deb 按闭包清掉，apt 模拟不了就全留）；机器端 `forget` 只在应用系统已有同一组包时才计划（别的 id ⇒ `not_moved`）。装失败 ⇒ 底座条目原样重放；forget 失败 ⇒ 两份记录、一行（`dedupeRows`：应用系统有同一个包时底座那行不进目录），横幅仍提供搬家，再点一次只跑 forget。③ **同一组包 = 搬家**：往应用系统装一个底座条目恰好持有的包集合，计划就是那个条目的搬家（`forgets`，命令里写明）；只是部分重叠 ⇒ `overlap` 点名、照装。④ 漂移卡片在有可用应用系统时主按钮是「装进应用系统」，Adopt 退为「只记在底座上」。⑤ Refresh 仍只升级应用系统，计划带 `skippedHost` 点名底座上不在这次更新里的应用；结果卡片：带后台服务的包说「没有东西会启动它 — 用常驻任务」，没导出任何 bin / desktop 的应用系统安装说「没有可从外面启动的东西」。不做：两层合并的 Refresh、搬家时删除底座的包、Set up 时自动搬、应用系统的服务启动。
- **Fleet 上线（2.369.211，lane fleet-image-chart，§6 P3 的公开部分）**：公开仓库里的镜像与 chart 现在就带上 Layer 1 需要的东西，公司的取值仍只在私有运维笔记里。镜像：`sudo`（含 `visudo`）+ `debootstrap`；rung A 的 `/usr/share/vibespace/sysroot-minbase.tar.gz` 在**独立的构建阶段**里用镜像自己的 codename 跑 `debootstrap --variant=minbase`、`tar --numeric-owner` 打包（去掉 .deb 下载缓存与包列表——Set up 进去先 `apt-get update`），实测 49 MB（展开 117 MB；该阶段 45 s，层单独缓存）；base-id 戳 `image.json {version, built, codename}` + `base-packages.tsv`（最终镜像的 dpkg 表：名 / 架构 / 版本）；`/etc/os-release` 没有 `VERSION_CODENAME`、或 sudo / visudo / debootstrap / tarball 缺一样，构建按名失败。chart：`appSystem.enabled`（默认 false）→ `VIBESPACE_APP_SYSTEM=1`，并**强制** `$sysadmin` 分支（SYS_ADMIN + AppArmor Unconfined，与 fuse / cephfs 同开时只一个 SYS_ADMIN），seccomp 不设；关着时渲染与 2.369.210 的 chart 逐字节相同。**上线步骤**（deploy/README.md「App system」）：① 先只开一个测试 release（新镜像 tag + `appSystem.enabled=true`），看启动日志 `[apps] app system: helper + sudoers installed in N ms`；② 在该 pod 上做 P2 闸门的验收：Set up…（计划写着 tarball）→ 装 `hello` + `xterm` → 删 pod → Ready 后 `~/.vibespace/sysroot/bin/hello` 直接能跑（零 apt、零网络），目录里打开 `sys.xterm`；③ 再滚其余 release，留意 PVC 用量。**关掉**：`appSystem.enabled=false` → 行变灰（`not-enabled`），用户空间原样留在 PVC 上，helper / sudoers 随下一个 pod 消失。fleet 范围的无人值守 refresh 仍没有 CLI 动词（D5，另立）。
