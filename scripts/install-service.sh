#!/usr/bin/env bash
# Install VibeSpace as a systemd USER service (no root needed).
#
#   ./scripts/install-service.sh            # install + enable + start
#   ./scripts/install-service.sh --uninstall
#
# Why a user service (not system): it runs as YOUR user — the server spawns
# agent CLIs and reads ~/.claude / ~/.codex, so it must live in your user
# session anyway. Survives logout via lingering (enabled below). Manage with:
#   systemctl --user status|restart|stop vibespace
#   journalctl --user -u vibespace -f
#
# NOTE: the service does NOT build. Build at deploy time (npm run build),
# then `systemctl --user restart vibespace`. dtach sessions survive restarts.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_DIR="$(pwd -P)"
NODE_BIN="$(command -v node)"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT="$UNIT_DIR/vibespace.service"

if [ "${1:-}" = "--uninstall" ]; then
  systemctl --user disable --now vibespace 2>/dev/null || true
  rm -f "$UNIT"
  systemctl --user daemon-reload
  echo "vibespace.service removed"
  exit 0
fi

[ -n "$NODE_BIN" ] || { echo "node not found on PATH" >&2; exit 1; }
mkdir -p "$UNIT_DIR"
cat > "$UNIT" <<EOF
[Unit]
Description=VibeSpace — web workspace for coding agents
# The repo may live on a network mount that appears late — keep retrying
# forever instead of giving up (StartLimitIntervalSec=0 disables the limit).
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=$REPO_DIR
ExecStart=$NODE_BIN server.js
Restart=always
RestartSec=5
Environment=PORT=${PORT:-3456}
# systemd's minimal user env has no ~/.local/bin or nvm bin — without this the
# server (and every CLI it spawns) can't find claude/codex/node ('/usr/bin/env:
# claude: No such file or directory' on resume; real incident).
Environment=PATH=$(dirname "$NODE_BIN"):$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
# Prefer killing memory hogs (browsers, builds) over the workspace server.
OOMScoreAdjust=-500

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable vibespace >/dev/null
# Lingering keeps user services running without an active login session.
loginctl enable-linger "$USER" 2>/dev/null || true
echo "Installed $UNIT"
echo "Start with: systemctl --user start vibespace"
