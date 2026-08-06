# Device Agent (vibespace-agentd) — run any machine as a VibeSpace device

The **device agent** (`vibespace-agentd`) is a small standing daemon that lets a
VibeSpace instance drive a machine's sessions, files, and mounts — the machine
becomes a **device**. VibeSpace's own host is device #0 and runs the same agent;
there is no "local special case".

This is part of the CS architecture (see `design-remote-cs.md`). All of it is
behind default-off flags — see **Enabling** below.

## Two ways a machine becomes a device

### 1. Reachable machine (you can `ssh` into it)
Just add it in the UI: **Remote tab → Machines → Add machine** (host/user/key).
VibeSpace installs the agent over ssh automatically at first use. Nothing to do
by hand. Works for any Linux/macOS box with an sshd and Node ≥18. (The ssh path
still requires a node on the machine — only the dial-out installer provisions
one; see *Node runtime* below.)

#### Keys with a passphrase

You can paste or upload a **passphrase-protected** private key. The dialog
detects it and asks for the passphrase (there is also a *"Key has a
passphrase?"* toggle if the detection is wrong about an unusual format). Get it
wrong and the dialog simply re-opens with your key still pasted, so you never
have to find the file again.

> **Be aware:** VibeSpace **removes the passphrase at import and stores an
> unlocked copy** of the key (in `data/ssh/`, mode 0600). It does not keep the
> passphrase — but it does not keep the protection either. This is unavoidable:
> every ssh VibeSpace runs is non-interactive (`BatchMode=yes`) and can never
> prompt for a passphrase. Anyone with filesystem access to the server — or to
> a config-transfer bundle exported with the "hosts" section — has a usable key.
> If that isn't acceptable, use a dedicated key for VibeSpace, or pick
> *"VibeSpace's own key"* and install the shown public key on the target.

The passphrase itself never touches disk, argv, or any log: it is passed to
`ssh-keygen` through the child process's environment for a single exec and
discarded. PuTTY `.ppk` and ssh.com/RFC4716 keys are rejected with the exact
conversion command to run. If the server has no `ssh-keygen` (or can't execute
the helper), the dialog says so and gives you the one-liner to strip the
passphrase on your own machine — it never pretends the passphrase was wrong.

Passphrase-protected keys inside an imported **config bundle** are skipped
(nothing can prompt during an unattended import); the import result names the
host so you can re-add its key here.

### 2. NAT'd / firewalled machine (laptop, home Mac — no inbound ssh) → dial-out
The machine **dials out** to your VibeSpace instance over a websocket, so no
inbound access is needed.

1. In VibeSpace: **Remote tab → "Pair a device (no ssh — it dials out)"** —
   name the device and you get the exact one-line install command (copyable).
   (Equivalent API: `POST /api/agentd/dial-pair {deviceId, serverUrl}`.)
2. On the machine, just run the command from step 1 — **nothing to install
   first** (see *Node runtime* below: the installer brings its own Node when the
   machine has none). It has this shape:
   ```bash
   curl -fsSL https://<your-vibespace-host>/agentd-install.sh | bash -s -- \
     --bundle-url https://<your-vibespace-host>/agentd.js \
     --dial     'wss://<your-vibespace-host>/api/agentd-dial?device=<id>' \
     --dial-token <token> \
     --host-token <hostToken>
   ```
   (`--host-token` matters: it's what the daemon verifies the SERVER's commands
   against — without it the device can dial in but rejects everything.)
   The daemon keeps a persistent outbound connection (auto-reconnect with
   backoff), so the machine stays reachable to VibeSpace even behind NAT.

To stop it: `pkill -f "$HOME/.vibespace/agentd/current/agentd.js"`.
State (including the login/host token and the node key) lives under
`~/.vibespace/agentd/` — a reboot + re-run reconnects with no re-pairing.

## Node runtime — the device needs nothing preinstalled

A device needs Node twice: as the daemon's interpreter, and for every
`#!/usr/bin/env node` agent tool the server later ships into `~/.vibespace/bin`.
Requiring a preinstalled Node was the single biggest pairing blocker, so the
installer resolves it in this order:

1. `--node /path/to/node` (or `VIBESPACE_NODE_BIN`) — use exactly this one.
2. **Our own private copy** at `<root>/node/bin/node`, if a previous run
   installed it. (Deliberately ahead of PATH: a launchd/systemd unit must point
   at a path that survives the user's next nvm/brew upgrade.)
3. `node` on PATH.
4. The newest `~/.nvm/versions/node/*/bin/node` — `curl … | bash` is a
   **non-login, non-interactive** shell, so `nvm.sh` is never sourced and an
   nvm-managed node is invisible to PATH. This is the most common "I have node
   but it says I don't".
5. The usual absolute spots (`/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`,
   `~/.local/bin`, `/snap/bin`).
6. Otherwise: **provision a private Node** — download the pinned official build
   from `nodejs.org/dist`, verify it against that release's `SHASUMS256.txt`,
   smoke-run it, and only then move it into `<root>/node`.

Everything lands **inside the install root** (`~/.vibespace/device@<instance>`
for a dial pairing): no root, no system packages, no PATH changes outside the
installer. `rm -rf <root>` uninstalls the agent *and* its runtime. The daemon
prepends its own node dir to every child's PATH, so the agent tools
(`vibespace-status`, `vibespace-task`, `vibespace-ask`, the claude hook) resolve
on a machine that never had node — the 2.244.x chicken-and-egg, solved
structurally. The resolved path is written to `<root>/state/node-path` for
support.

**Trade-off to know:** a device provisioned this way keeps that pinned Node
forever, even if you later install a system Node — it never picks up OS Node
security updates on its own. To move it: re-run the pairing command with
`VIBESPACE_NODE_VERSION=vX.Y.Z` (or `--node /path/to/your/node`) after removing
`<root>/node`.

| Env var | Meaning |
|---|---|
| `VIBESPACE_NODE_VERSION` | Node version to provision (default: the pinned LTS) |
| `VIBESPACE_NODE_MIRROR` | Base URL instead of `https://nodejs.org/dist` (e.g. `https://npmmirror.com/mirrors/node`) |
| `VIBESPACE_NODE_FLAVOR` | Tarball flavor suffix, e.g. `-musl` |
| `VIBESPACE_NODE_BIN` | Same as `--node` |
| `VIBESPACE_NODE_SKIP_VERIFY=1` | Accept the download without a checksum (only when the machine has no `sha256sum`/`shasum`/`openssl`) |

Diagnostics: `--node-only` resolves/provisions node, prints the path and exits
without touching the daemon — the first thing to run when a pairing fails.

**Networks that can't reach nodejs.org** (corporate egress filters, CN): the
installer automatically retries through the VibeSpace instance itself
(`GET /vibespace-node/<version>/<file>` — a read-only, allowlisted, disk-cached
mirror of the same upstream files). Note the trust anchor then becomes your
instance, which the device already trusts to serve the daemon bundle it runs.

**musl (Alpine, OpenWrt):** official Linux builds are glibc-only and fail with a
baffling "not found", so the installer refuses with instructions instead:
`apk add --no-cache nodejs npm` and re-run, or use the unofficial musl build via
`VIBESPACE_NODE_MIRROR=https://unofficial-builds.nodejs.org/download/release`
`VIBESPACE_NODE_FLAVOR=-musl`. 32-bit Windows likewise has no official build.

**Terminal sessions** additionally need `node-pty`, which the installer
best-effort installs with the npm belonging to the same node. No npm ⇒ chat,
files and mounts still work; only terminals are unavailable, and the installer
says so.

## 互挂云盘 — mount folders across machines

With the device agent in place, **mounts work in both directions**. The
mechanism differs by direction and is chosen automatically for the remote OS:

### A) VibeSpace mounts a remote machine's folder (you see the remote's files)
The existing **SFTP mount** (Remote tab → Storage → Connect → SFTP; pick the
registered machine). Works on any remote with an sftp server.

### B) A remote machine mounts THIS VibeSpace's storage (the remote sees your files)
VibeSpace serves its files over its `/dav` WebDAV bridge with a **scoped token**;
the remote mounts that URL as a normal folder. OS-aware:
- **Linux**: `rclone mount` (FUSE, needs `/dev/fuse`). Fallback: `mount.davfs`.
- **macOS**: `rclone mount` (macFUSE) if present, else the **built-in**
  `mount_webdav` (no FUSE needed).
- **Windows**: `rclone mount` to a drive letter (WinFsp) if present, else the
  **built-in** `net use` WebDAV redirector (no FUSE needed).
VibeSpace installs rclone on the remote automatically when needed.

**The remote reaches us over the device TUNNEL — no public address needed.**
When the data-plane flag is on (the default path once the device agent is set
up), the daemon binds a loopback port ON THE REMOTE and pushes every connection
back over the device link into our own `127.0.0.1:<serverPort>`. The remote
mounts `http://127.0.0.1:<port>/dav` — the bytes ride the ssh-stdio or wss
dial-out link that's already up, so this works through NAT with no public IP,
no VPN, and no Tailscale. The mount even survives a link drop: the daemon keeps
the port bound and a reconnecting server re-owns it in place (no remount).
`agentd.publicUrl` is only the FALLBACK for hosts that have no device agent.
*(Proven end-to-end with `/dav` bound to `127.0.0.1` only — an address nothing
external can reach — in `scripts/test-host-mounts-tunnel.mjs`.)*

Do it from the UI: **Remote tab → the host row → "share a folder onto this
machine"**. Active reverse-mounts appear as child rows under the host (folder →
mountpoint, a **tunnel**/**address** badge, and an unmount button).

### The powerful case: your Mac ↔ a cloud VibeSpace, both directions
Say your Mac runs the agent (dial-out) and connects to `vibe.example.com`:
- **Mount vibe.example.com's storage on your Mac** — the Mac's agent binds a
  loopback port and the cloud's `/dav` is reached back through the SAME tunnel;
  the Mac mounts `http://127.0.0.1:<port>/dav`. ✓ Works today (the tunnel is
  bidirectional — the cloud need not even be publicly reachable to the Mac).
- **Mount your Mac's folder on vibe.example.com** — the Mac is behind NAT, but it
  already holds an outbound connection to the cloud. The Mac's agent serves the
  folder over WebDAV on a loopback port, and the cloud reaches it **through the
  agent's tcp-forward channel** (no inbound to the Mac needed) — the same
  reverse-forward primitive proven above. *(The cloud-side auto-wiring of "spawn
  `rclone serve webdav` on the Mac loopback + reach it via the tunnel" ships
  incrementally; the transport primitive is acceptance-tested.)*

## Enabling (all default OFF — opt-in)

Settings → Session:
- `agentd.sessions` — local sessions run in the device agent (survive restarts).
- `agentd.remoteSessions` — remote chat runs in the remote agent (survives ssh
  drops; replaces the per-session keeper).
- `agentd.dataPlane` — remote file browsing / discovery / transcript sync / usage
  go through the agent (one persistent connection, incremental transcript sync).
- `agentd.publicUrl` — this instance's public address (for reverse mounts).

Any agent path falls back to the classic ssh path automatically on failure.
