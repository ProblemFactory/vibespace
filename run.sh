#!/usr/bin/env bash
# Supervised launcher — respawns the server if it exits (e.g. an OOM kill by
# systemd-oomd / the kernel under memory pressure). Bare `node server.js` stays
# dead after a kill; this brings it back automatically. dtach sessions survive
# the restart (the socket IS the session), so agents aren't lost.
#
#   ./run.sh                 # build once, then supervise
#   PORT=4000 ./run.sh       # custom port
#   VIBESPACE_NO_BUILD=1 ./run.sh   # skip the initial build
#
# Protect it from the OOM killer (so chrome/other hogs get killed first) with:
#   OOMScoreAdjust=-500  (systemd unit)  — or run:  choom -n -500 -- ./run.sh
set -u
cd "$(dirname "$0")"
LOG="${VIBESPACE_LOG:-/tmp/vs-server.log}"
# scripts/update.sh restarts a supervised server by killing its pid — the
# loop below respawns it on the new code (same contract as the container
# entrypoint's supervisor).
export VIBESPACE_SUPERVISED=1

if [ -z "${VIBESPACE_NO_BUILD:-}" ]; then
  echo "[run.sh] building…" | tee -a "$LOG"
  npm run build >>"$LOG" 2>&1 || { echo "[run.sh] build failed — aborting" | tee -a "$LOG"; exit 1; }
fi

backoff=1
while true; do
  echo "[run.sh] starting server $(date -Is)" | tee -a "$LOG"
  start=$(date +%s)
  node server.js >>"$LOG" 2>&1
  code=$?
  ran=$(( $(date +%s) - start ))
  echo "[run.sh] server exited code=$code after ${ran}s $(date -Is)" | tee -a "$LOG"
  # reset backoff if it stayed up a while (a real crash loop backs off; a
  # one-off OOM kill restarts fast)
  if [ "$ran" -ge 30 ]; then backoff=1; else backoff=$(( backoff < 30 ? backoff*2 : 30 )); fi
  echo "[run.sh] restarting in ${backoff}s…" | tee -a "$LOG"
  sleep "$backoff"
done
