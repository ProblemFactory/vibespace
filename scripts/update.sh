#!/usr/bin/env bash
# Update VibeSpace in place: pull → install deps → build → restart the service.
#
# Safe to run FROM a VibeSpace-spawned terminal: agent sessions live in dtach
# and survive the restart; this terminal reconnects when the server is back.
# (⚙ → "Update VibeSpace…" runs exactly this script in a shell terminal.)
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== VibeSpace update: $(git rev-parse --short HEAD) @ $(git rev-parse --abbrev-ref HEAD)"
git pull --ff-only
echo "== npm install"
npm install --no-audit --no-fund
echo "== build"
npm run build
echo "== now at $(git rev-parse --short HEAD) (v$(node -p "require('./package.json').version"))"
if systemctl --user is-enabled vibespace >/dev/null 2>&1; then
  echo "== restarting vibespace.service"
  systemctl --user restart vibespace
  echo "✓ Updated and restarted. Agent sessions survive (dtach); the UI reconnects momentarily."
else
  echo "✓ Updated. No systemd service found — restart your server process manually,"
  echo "  or install the service: ./scripts/install-service.sh"
fi
