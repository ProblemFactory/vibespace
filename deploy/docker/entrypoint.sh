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

# Chromium's profile SingletonLock (in the PVC ~/.config/chromium) records the
# hostname+pid of the last pod that ran it. After a pod recreation the lock is
# STALE — it points at a dead pod, and chromium refuses to launch ("the profile
# appears to be in use ... on another computer"), so the desktop browser is
# dead until cleared (real report). The lock is only meaningful within one pod
# lifetime; clear the stale one every boot.
rm -f "$HOME/.config/chromium/Singleton"* 2>/dev/null || true


# XFCE: seed the curated defaults into the user config ONCE (PVC-persisted).
# The /etc/xdg copies alone left panel launchers broken on fresh pods (the
# four-gears report — the documented live repair wrote ~/.config by hand);
# combined with the image's icon theme this makes a fresh desktop right.
if [ ! -d "$HOME/.config/xfce4" ]; then
  mkdir -p "$HOME/.config"
  cp -a /etc/xdg/xfce4 "$HOME/.config/xfce4" 2>/dev/null || true
fi

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

# 4. SUPERVISED run (not exec): node exiting must NOT kill the container —
#    dtach agent sessions live in this PID namespace and a pod restart kills
#    them all. The respawn loop is what makes in-place self-update work:
#    scripts/update.sh (⚙ → Update VibeSpace…) kills the server pid, the loop
#    respawns it on the new code, sessions survive. VIBESPACE_SUPERVISED=1
#    advertises this restart path to update.sh. SIGTERM (pod shutdown)
#    forwards to node and exits the loop.
export VIBESPACE_SUPERVISED=1
echo "[entrypoint] starting VibeSpace on :${PORT:-3456} (supervised)"
child=0
on_term() { [ "$child" != 0 ] && kill -TERM "$child" 2>/dev/null; wait "$child" 2>/dev/null; exit 0; }
trap on_term TERM INT
while true; do
  node server.js &
  child=$!
  rc=0; wait "$child" || rc=$?
  echo "[entrypoint] server exited rc=$rc — respawning in 2s (update restart or crash; dtach sessions survive)"
  sleep 2
done
