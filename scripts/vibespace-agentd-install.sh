#!/usr/bin/env bash
# vibespace-agentd standalone installer — run THIS machine as a VibeSpace
# device (Mac / Linux / any box with Node ≥18), so a VibeSpace server can
# reach its sessions, files and mounts. No VibeSpace server needed here.
#
#   Reachable machine (you can ssh to it): the VibeSpace UI's "Add machine"
#   already handles it — you don't need this script.
#
#   NAT'd / firewalled machine (laptop, home Mac): use DIAL-OUT — this daemon
#   dials your VibeSpace instance. Mint the pairing via POST /api/agentd/dial-pair
#   (see docs/device-agent.md) — it returns the URL + token; paste them into:
#       curl -fsSL <vibespace>/agentd-install.sh | bash -s -- \
#         --dial wss://<vibespace-host>/api/agentd-dial?device=<id> --dial-token <t>
#
# Requires: node ≥18 (brew install node / apt install nodejs), curl, unzip.
set -euo pipefail

BUNDLE_URL="${VIBESPACE_AGENTD_URL:-}"   # where to fetch agentd.js (a VibeSpace serves it at /agentd.js)
DIAL_URL=""; DIAL_TOKEN=""; HOST_TOKEN=""
while [ $# -gt 0 ]; do case "$1" in
  --dial) DIAL_URL="$2"; shift 2;;
  --dial-token) DIAL_TOKEN="$2"; shift 2;;
  --host-token) HOST_TOKEN="$2"; shift 2;;
  --bundle-url) BUNDLE_URL="$2"; shift 2;;
  *) echo "unknown arg: $1"; exit 2;;
esac; done

# ROOT: one machine can pair to SEVERAL VibeSpace instances — a dial-out
# install keys its root (daemon + tokens + bundle, each self-upgrading from
# its own server) by the dial host, so instances never clobber each other.
# The standing daemon (ssh-reachable machine) keeps the classic shared root.
if [ -z "${VIBESPACE_DEVICE_ROOT:-}${VIBESPACE_AGENTD_ROOT:-}" ] && [ -n "$DIAL_URL" ]; then
  DIAL_HOST=$(printf '%s' "$DIAL_URL" | sed -E 's|^[a-z]+://([^/:?]+).*|\1|' | tr -cd 'A-Za-z0-9.-')
  ROOT="$HOME/.vibespace/device@${DIAL_HOST:-dial}"
else
  ROOT="${VIBESPACE_DEVICE_ROOT:-${VIBESPACE_AGENTD_ROOT:-$HOME/.vibespace/agentd}}"
fi

command -v node >/dev/null || { echo "node ≥18 required (brew install node / apt install nodejs)"; exit 1; }
NODEV=$(node -e 'console.log(process.versions.node.split(".")[0])')
[ "$NODEV" -ge 18 ] || { echo "node ≥18 required (have $(node -v))"; exit 1; }

VER="${VIBESPACE_AGENTD_VERSION:-standalone}"
mkdir -p "$ROOT/$VER" "$ROOT/state"; chmod 700 "$ROOT" "$ROOT/state"
if [ -n "$BUNDLE_URL" ]; then
  echo "→ fetching agentd bundle from $BUNDLE_URL"
  curl -fsSL -o "$ROOT/$VER/vibespace-device.js" "$BUNDLE_URL"
elif [ -f "./data/bin/vibespace-agentd.js" ]; then
  cp ./data/bin/vibespace-agentd.js "$ROOT/$VER/vibespace-device.js"
else
  echo "no --bundle-url and no local bundle; pass --bundle-url <vibespace>/agentd.js"; exit 1
fi
ln -sfn "$ROOT/$VER" "$ROOT/current"

# node-pty for TERMINAL sessions (B-0d70): the daemon bundle is zero-dep, but a
# terminal-on-dial session opens a real device-side pty via node-pty. Best-
# effort install into the agentd root (node-pty ships prebuilds for mac/linux/
# win — usually just a download, no compiler). CHAT/files/mounts never need it,
# so a failure here is non-fatal (terminal shows a clear message if it's
# missing). Skip if already present.
if ! node -e "require('$ROOT/node_modules/node-pty')" >/dev/null 2>&1; then
  echo "→ installing node-pty for terminal sessions (best-effort)…"
  ( cd "$ROOT" && [ -f package.json ] || echo '{"name":"vibespace-agentd-deps","private":true}' > package.json
    npm install --no-audit --no-fund --loglevel=error node-pty >/dev/null 2>&1 ) \
    && echo "  ✓ node-pty ready" \
    || echo "  ⚠ node-pty install failed — chat/files/mounts still work; terminal will report it"
fi

# host token: provided (from pairing) or minted locally
if [ -n "$HOST_TOKEN" ]; then printf '%s' "$HOST_TOKEN" > "$ROOT/state/token"
elif [ ! -f "$ROOT/state/token" ]; then
  node -e 'process.stdout.write("vsht_"+require("crypto").randomBytes(24).toString("hex"))' > "$ROOT/state/token"
fi
chmod 600 "$ROOT/state/token"
echo "→ host token at $ROOT/state/token"

# Persist the dial config so the daemon can start ARGLESS forever after (it
# re-dials from state/dial.json; no tokens in any unit file or argv).
export VIBESPACE_DEVICE_ROOT="$ROOT"
export VIBESPACE_AGENTD_ROOT="$ROOT" # legacy bundle compat
if [ -n "$DIAL_URL" ]; then
  node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({url:process.argv[2],token:process.argv[3]}), {mode:0o600})' \
    "$ROOT/state/dial.json" "$DIAL_URL" "$DIAL_TOKEN"
  echo "→ dial config persisted ($ROOT/state/dial.json)"
fi

# PERSISTENCE (the dead-Mac lesson: a daemon killed by a crash/reboot/upgrade
# hiccup stayed dead forever — nothing restarted it). Register a supervisor:
#   macOS  : launchd LaunchAgent (RunAtLoad + KeepAlive = restart on crash)
#   Linux  : systemd user unit (Restart=always; best-effort linger for logout)
#   neither: fall back to the old detached start (no persistence).
# Keyed by the root's basename so multi-instance pairings coexist.
KEY=$(basename "$ROOT" | tr -c 'A-Za-z0-9.-' '-' | sed 's/-*$//')
NODE_BIN=$(command -v node)
# stop any previously-started daemon for this root (flock singleton would
# otherwise block the supervised one from starting)
pkill -f "$ROOT/current/vibespace-device.js" 2>/dev/null || true
sleep 0.5

started=""
if [ "$(uname -s)" = "Darwin" ]; then
  LABEL="cc.vibespace.device.$KEY"
  PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$NODE_BIN</string>
    <string>$ROOT/current/vibespace-device.js</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>VIBESPACE_DEVICE_ROOT</key><string>$ROOT</string>
    <key>VIBESPACE_AGENTD_ROOT</key><string>$ROOT</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$ROOT/state/agentd.out</string>
  <key>StandardErrorPath</key><string>$ROOT/state/agentd.out</string>
</dict></plist>
PLIST_EOF
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  if launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load -w "$PLIST" 2>/dev/null; then
    started="launchd ($LABEL — survives reboots, auto-restarts on crash)"
  fi
elif command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
  UNIT="vibespace-device-$KEY.service"
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$HOME/.config/systemd/user/$UNIT" <<UNIT_EOF
[Unit]
Description=VibeSpace device agent ($KEY)
[Service]
Environment=VIBESPACE_DEVICE_ROOT=$ROOT
Environment=VIBESPACE_AGENTD_ROOT=$ROOT
ExecStart=$NODE_BIN $ROOT/current/vibespace-device.js
Restart=always
RestartSec=5
StandardOutput=append:$ROOT/state/agentd.out
StandardError=append:$ROOT/state/agentd.out
[Install]
WantedBy=default.target
UNIT_EOF
  systemctl --user daemon-reload
  if systemctl --user enable --now "$UNIT" >/dev/null 2>&1; then
    started="systemd user unit ($UNIT — auto-restarts; survives reboots"
    if loginctl enable-linger "$USER" 2>/dev/null; then started="$started, linger on)"; else started="$started; run 'sudo loginctl enable-linger $USER' so it survives logout)"; fi
  fi
fi

if [ -z "$started" ]; then
  # fallback: detached one-shot (no persistence — the pre-2.162 behavior).
  # macOS has NO setsid(1) (real report: silent non-start) — nohup there.
  START=(node "$ROOT/current/vibespace-device.js")
  if command -v setsid >/dev/null 2>&1; then
    setsid "${START[@]}" </dev/null >>"$ROOT/state/agentd.out" 2>&1 &
  else
    nohup "${START[@]}" </dev/null >>"$ROOT/state/agentd.out" 2>&1 &
  fi
  started="detached process (NO persistence — rerun after a reboot)"
fi

sleep 2
if pgrep -f "$ROOT/current/vibespace-device.js" >/dev/null 2>&1; then
  echo "✓ vibespace device agent running via $started"
  echo "  Output: $ROOT/state/agentd.out"
else
  echo "✗ the daemon exited immediately — last output:"
  tail -5 "$ROOT/state/agentd.out" 2>/dev/null
  exit 1
fi
