# A Windows or Mac machine's whole desktop — the one-time setup

VibeSpace shows a paired Windows or Mac machine as ONE window of its whole screen ("Its desktop" in the Apps dialog).
Neither system can give one app a window of its own, so you see the whole desktop and run things on it.
Each machine needs one setup, done once, by you, on that machine. VibeSpace never contacts the machine for this
on its own, and never keeps the password.

## Mac: turn on Screen Sharing

1. On the Mac, open **System Settings → General → Sharing**.
2. Turn on **Screen Sharing**. (macOS asks for your password: it is an administrator setting.)
3. In VibeSpace, open **Apps…**, pick the Mac in "Run on", then **Check again**. It says "Ready".

Opening its desktop asks for **your Mac user name and password** each time. They go from your browser to the Mac
only; VibeSpace does not store them.

If VibeSpace says Screen Sharing answers "only with a sign-in this viewer cannot speak", open Screen Sharing's
settings (the ⓘ next to it) and turn on **"VNC viewers may control screen with password"**, then set that password.
The window then asks for that password instead.

## Windows: install TightVNC Server (listens on that machine only)

1. In VibeSpace, open **Apps…**, pick the Windows machine in "Run on", then **Install TightVNC Server…**.
   The dialog shows exactly what will run first: the download (tightvnc.com, version 2.8.85, checked against its
   fingerprint before it runs) and the install settings — it listens **on that machine only**, opens no port on the
   network and adds no firewall rule.
2. Press **Install**. On the Windows machine, Windows asks "Do you want to allow this app to make changes?" —
   **someone at that machine clicks Yes.** (The VibeSpace agent there runs without administrator rights, so Windows
   has to ask.)
3. A window opens there and asks you to **choose the VNC password** (up to 8 characters). Type it there.
   VibeSpace never sees it.
4. When it says "this machine only. Done", VibeSpace checks the machine again and shows "Ready".

If nobody can click Yes on that machine, the dialog says so and gives the same commands to paste into
**Windows PowerShell (Admin)** on that machine.

Opening its desktop asks for **the VNC password** each time.

## What the window does

- It shows **everything on that machine's screen**, and what you type goes to it. Only people can open it — an agent
  cannot see it, run on it, or set it up.
- The picture is scaled to the window; the machine's own screen size never changes.
- **Run on its desktop…** starts a command on that machine's desktop, as the signed-in user. It shows the exact
  command before it runs. Presets: Blender (`open -a Blender` on a Mac, `start "" blender` on Windows — if Windows
  cannot find Blender, type the full path to blender.exe). The last three commands you ran there are offered again.

---

# Windows / Mac 机器的整个桌面 — 一次性设置

VibeSpace 把配对的 Windows 或 Mac 机器显示成**一个窗口：它的整个屏幕**（应用对话框里的「它的桌面」）。这两种系统都做不到给单个应用一个独立窗口，所以你看到整个桌面，并在上面运行程序。每台机器需要你在那台机器上做**一次**设置；VibeSpace 不会为此自行连那台机器，也从不保存密码。

**Mac：打开「屏幕共享」。** 在 Mac 上打开「系统设置 → 通用 → 共享」，打开「屏幕共享」（macOS 会要你的密码，这是管理员设置）。回到 VibeSpace：「应用…」→ 在「运行于」里选这台 Mac →「再检查一次」，显示「就绪」。打开它的桌面时，每次都会要**你的 Mac 用户名和密码**——只从你的浏览器送到 Mac，VibeSpace 不保存。若提示屏幕共享「只提供本查看器不支持的登录方式」，在屏幕共享的设置里开启「VNC 显示程序可以使用密码控制屏幕」并设一个密码，之后窗口改为要这个密码。

**Windows：安装 TightVNC Server（只在那台机器本机监听）。** 「应用…」→ 选这台 Windows →「安装 TightVNC Server…」。对话框先列出要运行的全部内容：下载（tightvnc.com，2.8.85 版，运行前核对指纹）和安装设置——只在本机监听，不在网络上开端口，不加防火墙规则。按「安装」后，那台 Windows 会弹出「你要允许此应用对你的设备进行更改吗？」——**需要有人在那台机器前点「是」**（那里的 VibeSpace 代理没有管理员权限，所以 Windows 必须问）。随后那台机器上会弹出一个窗口，请你**设定 VNC 密码**（最多 8 个字符），在那里输入；VibeSpace 看不到它。显示「this machine only. Done」后，VibeSpace 会再检查一次并显示「就绪」。若那台机器前没人能点「是」，对话框会说明，并给出同样的命令，可粘贴到那台机器的「Windows PowerShell（管理员）」里运行。之后打开它的桌面，每次都会要这个 VNC 密码。

**窗口做什么。** 它显示**那台机器屏幕上的一切**，你输入的内容会发到那台机器；只有人能打开，智能体不能查看、运行或设置。画面按窗口缩放，那台机器自己的屏幕分辨率不变。「在它的桌面上运行…」以当前登录用户的身份在那台机器的桌面上启动一条命令，运行前原样显示这条命令；预设：Blender（Mac 上 `open -a Blender`，Windows 上 `start "" blender`——若 Windows 找不到 Blender，请输入 blender.exe 的完整路径）；你在那台机器上最近运行的三条命令会再次列出。
