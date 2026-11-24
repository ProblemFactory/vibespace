#!/usr/bin/env bash
# scripts/ci-apt.sh [--no-update] <package…> — the Actions mirror's ONE apt door (lane mirror-flake-hardening, .270).
# rel269's heavy 2/4 died in `apt-get update` (exit 100) on a repository we never install from: the runner image ships
# packages.microsoft.com, which answered there only over IPv6 ("Network is unreachable"). So every source list that is
# not the Ubuntu archive is moved aside (each one printed), apt speaks IPv4 and retries, and only the packages named
# here are installed. test-ci-gate §2f runs the selection over a fixture directory (CI_APT_SOURCES_DIR, CI_APT_SUDO=,
# CI_APT_ECHO=1 prints the apt commands instead of running them).
# BOUNDED (lane ci-cjk-fonts, .346): .345's mirror sat 21 min in one apt fetch (azure served fonts-noto-cjk at 45.8 kB/s;
# dtach's 17 kB took 55 s there), so a stalled connection gives up after 30 s (Acquire::http(s)::Timeout) and every apt
# call runs under `timeout` — 80 s each by default, sized for dtach (update 3–8 s, install 1–55 s measured); a larger
# package sets CI_APT_BOUND. A call past its bound is a red that names it, never a silent wait for the job's limit.
# A SECOND MIRROR (B-4a3b, lane bl-ci 2026-11-17): a stalled Ubuntu mirror failed three jobs at SETUP on 10-31 and again on
# 11-06 (`update passed its 80 s bound`, exit 124, before any suite ran). A failed `update` is now tried ONCE more against
# a second mirror (CI_APT_SECOND_MIRROR, archive.ubuntu.com by default) — a list of its own for the runner's release
# (main + universe, the release and its -updates, signed by the archive keyring), every source part off — and the install
# reads that index. «Failed» includes a fetch that apt only WARNS about (`--error-on=any`: a mirror that refuses fast exits
# 0 otherwise and the install runs on missing lists). The first update is bounded tighter (CI_APT_UPDATE_BOUND, 40 s —
# measured 3–8 s). The INSTALL gets the same one more try (B-3f60): on the second mirror when the index was the runner's,
# else on the same index. Each step that calls this door is bounded for the worst path (dtach 7 min, zsh 5). The first failure is
# a ::warning::, the second a red that names it; the step says which mirror served the index either way.
# ONCE MORE AFTER A PAUSE (lane bl-ci, 主开发 r3181's small — the release mirror run 45164852385: four jobs died at «Install dtach», the
# second mirror's update past its 80 s bound, exit 124, before any suite ran, a second attempt of about an hour): a second-mirror update that
# fails or stalls is a ::warning:: and the update goes ONCE more after CI_APT_PAUSE seconds (20 by default — a stalled source often answers
# again), the same list and bound; that third try failing is the red that names it. Each dtach step's bound is 7 min: the worst path is
# 40 + 80 + 20 + 80 + 80 + 80 = 380 s.
set -euo pipefail
dir=${CI_APT_SOURCES_DIR:-/etc/apt/sources.list.d}
SECOND=${CI_APT_SECOND_MIRROR:-http://archive.ubuntu.com/ubuntu}
KEYRING=${CI_APT_KEYRING:-/usr/share/keyrings/ubuntu-archive-keyring.gpg}
# the second mirror's list, kept for a later --no-update step of the same job (it reads the same index) — only in the job's own
# RUNNER_TEMP (or a path a caller names); without one it lives for this call only, never at a guessable /tmp path
ALT=${CI_APT_STATE:-${RUNNER_TEMP:+$RUNNER_TEMP/ci-apt-second-mirror.list}}
SEV=error
SUDO=${CI_APT_SUDO-sudo}
update=1
if [ "${1:-}" = --no-update ]; then update=; shift; fi
[ "$#" -gt 0 ] || { echo "usage: ci-apt.sh [--no-update] <package…>" >&2; exit 2; }
BOUND=${CI_APT_BOUND:-80}
PAUSE=${CI_APT_PAUSE:-20}
FIRST=${CI_APT_UPDATE_BOUND:-${CI_APT_BOUND:-40}}
apt() {   # apt <bound> <apt-get args…>
  local b=$1; shift
  if [ -n "${CI_APT_ECHO:-}" ]; then echo "timeout $b apt-get $*"; return; fi
  local code=0
  timeout -k 5 "$b" $SUDO env DEBIAN_FRONTEND=noninteractive apt-get "$@" || code=$?
  if [ "$code" -eq 124 ] || [ "$code" -eq 137 ]; then echo "::$SEV::ci-apt: apt-get … ${*: -1} passed its ${b} s bound (a stalled mirror)" >&2
  elif [ "$code" -ne 0 ]; then echo "::$SEV::ci-apt: apt-get … ${*: -1} failed (exit $code)" >&2; fi
  return "$code"
}
OPTS=(-o Acquire::ForceIPv4=true -o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30)
# the Ubuntu archive is the only source the shard installs from (the runner's own mirror list or an ubuntu.com URI)
for f in "$dir"/*.list "$dir"/*.sources; do
  [ -e "$f" ] || continue
  if grep -qE 'apt-mirrors\.txt|[/.]ubuntu\.com/ubuntu' "$f"; then echo "ci-apt: kept $(basename "$f")"; continue; fi
  $SUDO mkdir -p "$dir.off"
  $SUDO mv "$f" "$dir.off/"
  echo "ci-apt: moved aside $(basename "$f") — $(grep -hoE 'https?://[^ /]+' "$dir.off/$(basename "$f")" | sort -u | tr '\n' ' ')(not a source this job installs from)"
done
second=   # set once the index is the second mirror's
use_second() {   # point OPTS at the second mirror's list for the runner's release (written fresh)
  local codename
  codename=$( . "${CI_APT_OS_RELEASE:-/etc/os-release}" 2>/dev/null; echo "${VERSION_CODENAME:-}")
  [ -n "$codename" ] || { echo "::error::ci-apt: the runner's release has no codename to ask a second mirror for" >&2; exit 100; }
  local list=${ALT:-$(mktemp)}
  printf 'deb [signed-by=%s] %s %s main universe\ndeb [signed-by=%s] %s %s-updates main universe\n' "$KEYRING" "$SECOND" "$codename" "$KEYRING" "$SECOND" "$codename" > "$list"
  OPTS+=(-o "Dir::Etc::sourcelist=$list" -o "Dir::Etc::sourceparts=-")
  second=1
  echo "ci-apt: ONCE more against $SECOND ($codename main universe)"
}
if [ -n "$update" ]; then
  [ -z "$ALT" ] || rm -f "$ALT"   # an update decides the index anew: the runner's mirror unless it fails
  SEV=warning
  if apt "$FIRST" "${OPTS[@]}" --error-on=any update; then
    echo "ci-apt: the index is the runner's mirror's"
  else
    echo "ci-apt: apt-get update failed on the runner's mirror"
    use_second
    if ! apt "$BOUND" "${OPTS[@]}" --error-on=any update; then
      SEV=error
      echo "ci-apt: the second mirror's update failed — once more in ${PAUSE} s (a stalled source often answers again)"
      sleep "$PAUSE"
      apt "$BOUND" "${OPTS[@]}" --error-on=any update
    fi
    echo "ci-apt: the index is $SECOND's"
  fi
  SEV=error
elif [ -n "$ALT" ] && [ -s "$ALT" ]; then
  OPTS+=(-o "Dir::Etc::sourcelist=$ALT" -o "Dir::Etc::sourceparts=-")
  second=1
  echo "ci-apt: the index is the second mirror's (an earlier step's update): $(head -1 "$ALT")"
else
  echo "ci-apt: the index is the runner's mirror's (an earlier step's update)"
fi
# THE INSTALL GETS ONE MORE TRY TOO (B-3f60, the coordinator 2026-11-18 00:09Z: hosted run 44202852228's fast job died at
# «Install zsh» — the install's fetch of one package passed the 80 s bound after a green update): a failed or stalled install
# goes ONCE more — on the second mirror (its own update first) when the index was the runner's, else on the same index
SEV=warning
if apt "$BOUND" "${OPTS[@]}" install -y --no-install-recommends "$@"; then exit 0; fi
SEV=error
echo "ci-apt: the install failed"
if [ -z "$second" ]; then use_second; apt "$BOUND" "${OPTS[@]}" --error-on=any update; else echo "ci-apt: ONCE more on the same index ($SECOND)"; fi
apt "$BOUND" "${OPTS[@]}" install -y --no-install-recommends "$@"
