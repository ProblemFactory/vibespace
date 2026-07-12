#!/usr/bin/env bash
# Update VibeSpace in place: pull → install deps → build → restart the service.
#
# Safe to run FROM a VibeSpace-spawned terminal: agent sessions live in dtach
# and survive the restart; this terminal reconnects when the server is back.
# (⚙ → "Update VibeSpace…" runs exactly this script in a shell terminal.)
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== VibeSpace update: $(git rev-parse --short HEAD) @ $(git rev-parse --abbrev-ref HEAD)"
# Derived/generated tracked files dirty the working tree and block the ff-only
# pull. package-lock.json: an in-container npm (different version) rewrites it.
# data/bin/vibespace-status: createStatusHelper() regenerates it every startup
# (now untracked upstream, but instances predating that still track it). Reset
# both to the committed version before pulling — upstream is authoritative.
git checkout -- package-lock.json data/bin/vibespace-status 2>/dev/null || true
# Any OTHER tracked file the server regenerated (future generated helpers) —
# discard local changes under data/bin so a stray one never wedges the update.
git ls-files -m data/bin/ | xargs -r git checkout -- 2>/dev/null || true
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
elif [ "${VIBESPACE_SUPERVISED:-}" = "1" ] && [ -f data/server.pid ] && kill -0 "$(cat data/server.pid)" 2>/dev/null; then
  # Container / run.sh path: a supervisor loop respawns the server when it
  # exits — kill the pid and it comes back on the new code. dtach agent
  # sessions share the PID namespace and survive.
  echo "== restarting supervised server (pid $(cat data/server.pid))"
  kill "$(cat data/server.pid)"
  echo "✓ Updated and restarted. The supervisor respawns the server in ~2s; the UI reconnects momentarily."
else
  echo "✓ Updated. No systemd service found — restart your server process manually,"
  echo "  or install the service: ./scripts/install-service.sh"
fi
