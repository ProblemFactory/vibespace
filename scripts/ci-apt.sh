#!/usr/bin/env bash
# scripts/ci-apt.sh [--no-update] <package…> — the Actions mirror's ONE apt door (lane mirror-flake-hardening, .270).
# rel269's heavy 2/4 died in `apt-get update` (exit 100) on a repository we never install from: the runner image ships
# packages.microsoft.com, which answered there only over IPv6 ("Network is unreachable"). So every source list that is
# not the Ubuntu archive is moved aside (each one printed), apt speaks IPv4 and retries, and only the packages named
# here are installed. test-ci-gate §2d runs the selection over a fixture directory (CI_APT_SOURCES_DIR, CI_APT_SUDO=,
# CI_APT_ECHO=1 prints the apt commands instead of running them).
set -euo pipefail
dir=${CI_APT_SOURCES_DIR:-/etc/apt/sources.list.d}
SUDO=${CI_APT_SUDO-sudo}
update=1
if [ "${1:-}" = --no-update ]; then update=; shift; fi
[ "$#" -gt 0 ] || { echo "usage: ci-apt.sh [--no-update] <package…>" >&2; exit 2; }
apt() { if [ -n "${CI_APT_ECHO:-}" ]; then echo "apt-get $*"; else $SUDO env DEBIAN_FRONTEND=noninteractive apt-get "$@"; fi; }
OPTS=(-o Acquire::ForceIPv4=true -o Acquire::Retries=3)
# the Ubuntu archive is the only source the shard installs from (the runner's own mirror list or an ubuntu.com URI)
for f in "$dir"/*.list "$dir"/*.sources; do
  [ -e "$f" ] || continue
  if grep -qE 'apt-mirrors\.txt|[/.]ubuntu\.com/ubuntu' "$f"; then echo "ci-apt: kept $(basename "$f")"; continue; fi
  $SUDO mkdir -p "$dir.off"
  $SUDO mv "$f" "$dir.off/"
  echo "ci-apt: moved aside $(basename "$f") — $(grep -hoE 'https?://[^ /]+' "$dir.off/$(basename "$f")" | sort -u | tr '\n' ' ')(not a source this job installs from)"
done
if [ -n "$update" ]; then apt "${OPTS[@]}" update; fi
apt "${OPTS[@]}" install -y --no-install-recommends "$@"
