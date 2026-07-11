#!/usr/bin/env bash
# VibeSpace pod entrypoint — PETS model (see docs/design-k8s-deployment.md §4).
# The container is a thin runtime; VibeSpace itself lives in the PVC (~/vibespace)
# so users can fork/modify it and it survives pod rebuilds. First boot seeds the
# PVC from the baked known-good copy (offline, no network).
set -euo pipefail

APP="$HOME/vibespace"
DIST="/opt/vibespace-dist"

# 1. Seed the app into the PVC on first boot (from the image, offline).
if [ ! -e "$APP/server.js" ]; then
  echo "[entrypoint] first boot — seeding VibeSpace into $APP"
  mkdir -p "$APP"
  cp -a "$DIST/." "$APP/"
  # https origin so a user without ssh keys can self-update (⚙ → Update VibeSpace)
  git -C "$APP" remote set-url origin https://github.com/ProblemFactory/vibespace.git 2>/dev/null || true
fi
mkdir -p "$APP/data"


# 2. User boot hook — persistent customization (apt installs, env, dotfiles) that
#    the ephemeral rootfs can't keep across pod rebuilds. Runs every boot.
if [ -f "$HOME/.vibespace-init.sh" ]; then
  echo "[entrypoint] running ~/.vibespace-init.sh"
  bash "$HOME/.vibespace-init.sh" || echo "[entrypoint] init hook failed (continuing)"
fi

# 3. Run from the PVC. Build only if the bundle is missing (a fresh git pull that
#    the user hasn't rebuilt yet); a normal boot finds the baked bundle → no-op.
cd "$APP"
if [ ! -f public/bundle.js ]; then
  echo "[entrypoint] building bundle"
  npm run build
fi

echo "[entrypoint] starting VibeSpace on :${PORT:-3456}"
exec node server.js
