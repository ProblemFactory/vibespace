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
by hand. Works for any Linux/macOS box with an sshd and Node ≥18.

### 2. NAT'd / firewalled machine (laptop, home Mac — no inbound ssh) → dial-out
The machine **dials out** to your VibeSpace instance over a websocket, so no
inbound access is needed.

1. In VibeSpace: **⚙ → Devices → Pair a device** → you get a device id + a dial
   token + a ready-to-run command.
2. On the machine, install Node ≥18 (`brew install node` on a Mac), then run:
   ```bash
   curl -fsSL https://<your-vibespace-host>/agentd-install.sh | bash -s -- \
     --bundle-url https://<your-vibespace-host>/agentd.js \
     --dial     wss://<your-vibespace-host>/api/agentd-dial?device=<id> \
     --dial-token <token>
   ```
   The daemon keeps a persistent outbound connection (auto-reconnect with
   backoff), so the machine stays reachable to VibeSpace even behind NAT.

To stop it: `pkill -f "$HOME/.vibespace/agentd/current/agentd.js"`.
State (including the login/host token and the node key) lives under
`~/.vibespace/agentd/` — a reboot + re-run reconnects with no re-pairing.

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
