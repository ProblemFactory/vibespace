#!/usr/bin/env bash
# Update VibeSpace in place: pull → install deps → build → restart the service.
#
# Safe to run FROM a VibeSpace-spawned terminal: agent sessions live in dtach
# and survive the restart; this terminal reconnects when the server is back.
# (⚙ → "Update VibeSpace…" runs exactly this script in a shell terminal.)
set -euo pipefail
cd "$(dirname "$0")/.."
# Personalized-user images (3.5.0+) run the container as root and drop to the
# instance user via runuser; the admin's `kubectl exec` update path therefore
# runs git as ROOT against a uid-1000-owned repo → "dubious ownership" aborts
# every update (real regression report). Trust this repo regardless of who runs
# the update — single-user container, and the exec is already privileged.
git config --global --add safe.directory "$(pwd)" 2>/dev/null || true
# Single-flight guard: the update restarts the server, whose fresh in-memory
# pid map can't see this still-running script — a second POST /api/self-update
# (another tab / re-click) would interleave a concurrent git pull/npm install.
# flock is Linux-only (macOS lacks flock(1)) — skip the guard there.
mkdir -p data
if command -v flock >/dev/null 2>&1; then
  exec 9>data/.update.lock
  flock -n 9 || { echo "Another update is already running — aborting this one."; exit 1; }
fi
echo "== VibeSpace update: $(git rev-parse --short HEAD) @ $(git rev-parse --abbrev-ref HEAD)"
# Derived/generated tracked files dirty the working tree and block the ff-only
# pull. package-lock.json: an in-container npm (different version) rewrites it.
# RESET EACH PATH INDEPENDENTLY — the real recurring failure was a COMBINED
# `git checkout -- package-lock.json data/bin/vibespace-status`: on instances
# where data/bin/vibespace-status is UNTRACKED (it's generated + gitignored
# now), the whole checkout aborts "pathspec did not match" and resets NEITHER,
# so package-lock.json stays dirty and the pull aborts "local changes would be
# overwritten". package-lock.json is always tracked → reset it on its own.
git checkout HEAD -- package-lock.json 2>/dev/null || true
# Any tracked-and-modified generated helper under data/bin (per-path so one bad
# pathspec can't wedge the rest); untracked ones don't block a ff pull.
git ls-files -m data/bin/ 2>/dev/null | xargs -r -n1 git checkout HEAD -- 2>/dev/null || true
# Last-resort belt: if the tree is STILL dirty enough to block a ff pull, stash
# the leftover noise away (kept, not dropped) so the pull can proceed.
git pull --ff-only || { git stash push -u -m "vibespace-update-autostash" >/dev/null 2>&1 || true; git pull --ff-only; }
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
