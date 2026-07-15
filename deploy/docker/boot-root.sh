#!/usr/bin/env bash
# Root boot stage (image 3.5.0): personalize the container user to the
# INSTANCE NAME (user directive: prompts/paths should say walter/lengyue/…,
# not the impersonal `vibe`), then drop privileges and run the normal
# entrypoint. The app itself never runs as root (Claude blocks
# bypassPermissions as root).
#
# COUPLING GUARD: the rename happens ONLY when the home PVC is mounted at
# /home/<name> (the 3.5.0 chart templates mountPath to the user). Under the
# old chart (PVC at /home/vibe) this image boots exactly like before — safe
# with either chart generation.
#
# COMPAT: years of recorded ABSOLUTE paths say /home/vibe/… (session cwds,
# mounts, layouts, bookmarks). /home/vibe becomes a symlink to the real home
# so every old path keeps resolving.
set -euo pipefail

NAME="$(echo "${VIBESPACE_INSTANCE_NAME:-}" | tr -cd 'a-z0-9_-' | cut -c1-30)"
USER_NAME=vibe

if [ -n "$NAME" ] && [ "$NAME" != "vibe" ] && id vibe >/dev/null 2>&1 \
   && mountpoint -q "/home/$NAME" && ! mountpoint -q /home/vibe; then
  echo "[boot] personalizing container user: vibe -> $NAME"
  usermod -l "$NAME" vibe
  groupmod -n "$NAME" vibe 2>/dev/null || true
  usermod -d "/home/$NAME" "$NAME"
  echo "$NAME ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/$NAME" && chmod 0440 "/etc/sudoers.d/$NAME"
  rm -f /etc/sudoers.d/vibe
  # /home/vibe here is the image-layer skeleton dir (useradd -m), NOT the PVC
  # (guarded above) — replace it with the compat symlink
  rm -rf /home/vibe
  ln -s "/home/$NAME" /home/vibe
  USER_NAME="$NAME"
elif id "$NAME" >/dev/null 2>&1 && [ "$NAME" != "" ] && [ "$NAME" != "vibe" ]; then
  # already personalized on a previous boot of this rootfs generation
  USER_NAME="$NAME"
fi

export HOME="/home/$USER_NAME"
export PATH="/home/$USER_NAME/.local/bin:$PATH"
cd "$HOME"
# runuser -u keeps the environment (PORT, VIBESPACE_*) and sets HOME/USER/
# LOGNAME from passwd — which now points at the personalized home.
exec runuser -u "$USER_NAME" -- /usr/local/bin/vibespace-entrypoint
