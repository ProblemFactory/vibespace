#!/bin/bash
# ci-remote-provision.sh — make a test box able to run the HEAVY tier for scripts/ci-remote.mjs (lane heavy-runner-aidev).
# Run ON the box, over ssh:  ssh aidev "NODE_VERSION=$(node --version) CHROME_VERSION=$(google-chrome --version | grep -o '[0-9][0-9.]*') CODEX_VERSION=$(codex --version | grep -o '[0-9][0-9.]*') bash -s" < scripts/ci-remote-provision.sh
# IDEMPOTENT: every step says FOUND (nothing done) or INSTALLED / UPDATED, with its seconds. Everything it owns lives
# under $CI_ROOT (default /var/tmp/vibespace-ci): nvm + node, the agent-browser builds, the repo clone + node_modules.
# sudo is used for apt ONLY (the test box's passwordless sudo — never run this on the hub or a production instance).
# Env: NODE_VERSION (the hub's `node --version`), CHROME_VERSION (the hub's `google-chrome --version` number), CODEX_VERSION (the hub's `codex --version` number), AB_VERSION / AB_BASE_VERSION (agent-browser on PATH / the 0.38.1
# base the stderr-pipe suite measures), REPO_URL + REPO_SHA (what to clone and check out; npm ci at that lock).
set -u
CI_ROOT=${CI_ROOT:-/var/tmp/vibespace-ci}
NODE_VERSION=${NODE_VERSION:-v24.12.0}
CHROME_VERSION=${CHROME_VERSION:-}
AB_VERSION=${AB_VERSION:-0.38.2}
AB_BASE_VERSION=${AB_BASE_VERSION:-0.38.1}
CODEX_VERSION=${CODEX_VERSION:-0.159.3}
REPO_URL=${REPO_URL:-git@github.com:ProblemFactory/vibespace.git}
REPO_SHA=${REPO_SHA:-}
mkdir -p "$CI_ROOT"/dl "$CI_ROOT"/tools "$CI_ROOT"/logs || exit 1
step() { STEP=$1; T0=$(date +%s.%N); }
done_() { printf '[provision] %-22s %-9s %5.1fs  %s\n' "$STEP" "$1" "$(echo "$(date +%s.%N) - $T0" | bc)" "${2:-}"; }
fail() { printf '[provision] %-22s FAILED   %s\n' "$STEP" "$1"; exit 1; }

# 1. apt packages — the hub's heavy-tier set (dpkg census of the hub, 2026-10-13). Chrome comes from Google's own deb.
APT_PKGS="dtach xvfb x11vnc tigervnc-standalone-server tigervnc-tools xauth xterm xdotool wmctrl dbus-x11 dbus-daemon at-spi2-core
 gir1.2-atspi-2.0 python3-gi python3-dbus libsecret-tools gnome-keyring libnotify-bin fonts-dejavu-core fonts-liberation fonts-noto-cjk
 fonts-noto-color-emoji ffmpeg espeak-ng imagemagick ghostscript poppler-utils libreoffice-writer zenity gnome-calculator xclip rclone
 fuse3 bubblewrap flatpak novnc websockify x11-utils x11-xserver-utils jq rsync bc xpra"
step apt
missing=$(dpkg-query -W -f='${Package} ${Status}\n' $APT_PKGS 2>/dev/null | awk '$4=="installed"{print $1}' | sort > "$CI_ROOT/dl/have.txt"; for p in $APT_PKGS; do grep -qx "$p" "$CI_ROOT/dl/have.txt" || echo "$p"; done | tr '\n' ' ')
if [ -z "${missing// }" ]; then done_ FOUND "all $(echo $APT_PKGS | wc -w) packages"
else
  sudo -n true 2>/dev/null || fail "no passwordless sudo (missing: $missing)"
  sudo -n env DEBIAN_FRONTEND=noninteractive apt-get update -qq > "$CI_ROOT/logs/apt-update.log" 2>&1 || fail "apt-get update (see $CI_ROOT/logs/apt-update.log)"
  sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $missing > "$CI_ROOT/logs/apt-install.log" 2>&1 || fail "apt-get install (see $CI_ROOT/logs/apt-install.log)"
  done_ INSTALLED "$missing"
fi
step google-chrome
# PINNED to the hub's build (CHROME_VERSION = the hub's `google-chrome --version` number): suites carry MEASURED rows per
# Chrome major (test-desktop-xpra-window §16's caption layout) — Google's current deb (155 on 2026-10-13) went red
# there as designed. Google's pool keeps old builds; the package is held so an apt upgrade does not move it.
have=$(google-chrome --version 2>/dev/null | grep -o '[0-9][0-9.]*')
if [ -n "$have" ] && { [ -z "$CHROME_VERSION" ] || [ "$have" = "$CHROME_VERSION" ]; }; then done_ FOUND "Google Chrome $have"
else
  deb="google-chrome-stable_${CHROME_VERSION:-current}${CHROME_VERSION:+-1}_amd64.deb"
  url=https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  [ -n "$CHROME_VERSION" ] && url=https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/$deb
  curl -fsSLo "$CI_ROOT/dl/$deb" "$url" || fail "download $url"
  sudo -n apt-mark unhold google-chrome-stable > /dev/null 2>&1
  sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --allow-downgrades "$CI_ROOT/dl/$deb" > "$CI_ROOT/logs/apt-chrome.log" 2>&1 || fail "install (see $CI_ROOT/logs/apt-chrome.log)"
  [ -n "$CHROME_VERSION" ] && sudo -n apt-mark hold google-chrome-stable > /dev/null
  done_ INSTALLED "$(google-chrome --version)${have:+ (was $have)}"
fi
step xpra
done_ FOUND "$(xpra --version 2>/dev/null | head -1) (the hub: v6.5.4-r0)"

# 2. node via nvm, NVM_DIR under CI_ROOT (never the user's ~/.nvm)
export NVM_DIR="$CI_ROOT/nvm"
step nvm
if [ -s "$NVM_DIR/nvm.sh" ]; then done_ FOUND "$NVM_DIR"
else git clone -q --depth 1 https://github.com/nvm-sh/nvm.git "$NVM_DIR" > "$CI_ROOT/logs/nvm.log" 2>&1 || fail "git clone nvm"; done_ INSTALLED "$NVM_DIR"; fi
. "$NVM_DIR/nvm.sh"
step node
if [ -x "$NVM_DIR/versions/node/$NODE_VERSION/bin/node" ]; then done_ FOUND "$NODE_VERSION"
else nvm install "$NODE_VERSION" > "$CI_ROOT/logs/node.log" 2>&1 || fail "nvm install $NODE_VERSION"; done_ INSTALLED "$NODE_VERSION"; fi
NODE_BIN="$NVM_DIR/versions/node/$NODE_VERSION/bin"
export PATH="$NODE_BIN:$PATH"
ln -sfn "$NODE_BIN" "$CI_ROOT/node-bin"

# 3. agent-browser: the PATH build (package.json's install line) + the base the stderr-pipe suite measures
for v in "$AB_VERSION" "$AB_BASE_VERSION"; do
  step "agent-browser $v"
  d="$CI_ROOT/tools/ab-$v"
  if [ -x "$d/node_modules/agent-browser/bin/agent-browser-linux-x64" ]; then done_ FOUND "$d"
  else npm install -s --no-audit --no-fund --prefix "$d" "agent-browser@$v" > "$CI_ROOT/logs/ab-$v.log" 2>&1 || fail "npm install agent-browser@$v"; done_ INSTALLED "$d"; fi
done
# codex at the hub's version, FIRST on the run's PATH: a box's own older codex (AIDev: /usr/bin/codex 0.96.0, no
# thread/queue/*) ran test-queue-steer's real app-server legs into a red the hub never sees (no codex on its heavy PATH)
step "codex $CODEX_VERSION"
d="$CI_ROOT/tools/codex-$CODEX_VERSION"
if [ -x "$d/node_modules/.bin/codex" ]; then done_ FOUND "$d"
else npm install -s --no-audit --no-fund --prefix "$d" "@openai/codex@$CODEX_VERSION" > "$CI_ROOT/logs/codex.log" 2>&1 || fail "npm install @openai/codex@$CODEX_VERSION"; done_ INSTALLED "$d"; fi
mkdir -p "$CI_ROOT/bin"
ln -sfn "$CI_ROOT/tools/ab-$AB_VERSION/node_modules/agent-browser/bin/agent-browser-linux-x64" "$CI_ROOT/bin/agent-browser"
ln -sfn "$d/node_modules/.bin/codex" "$CI_ROOT/bin/codex"
for b in node npm npx; do ln -sfn "$NODE_BIN/$b" "$CI_ROOT/bin/$b"; done

# 4. the repo: a clone of the origin at REPO_SHA (or its default branch), npm ci at that lock
step repo
if [ -d "$CI_ROOT/repo/.git" ]; then
  git -C "$CI_ROOT/repo" fetch -q origin > "$CI_ROOT/logs/git.log" 2>&1 || fail "git fetch"
  how=UPDATED
else
  git clone -q "$REPO_URL" "$CI_ROOT/repo" > "$CI_ROOT/logs/git.log" 2>&1 || fail "git clone $REPO_URL"
  how=INSTALLED
fi
[ -n "$REPO_SHA" ] && { git -C "$CI_ROOT/repo" checkout -q --detach "$REPO_SHA" 2>>"$CI_ROOT/logs/git.log" || fail "checkout $REPO_SHA"; }
done_ $how "$(git -C "$CI_ROOT/repo" rev-parse --short HEAD)"
step "npm ci"
lock=$(sha256sum "$CI_ROOT/repo/package-lock.json" | cut -c1-16)
if [ -d "$CI_ROOT/repo/node_modules" ] && [ "$(cat "$CI_ROOT/repo/.lock-sha" 2>/dev/null)" = "$lock" ]; then done_ FOUND "lock $lock"
else
  (cd "$CI_ROOT/repo" && npm ci --no-audit --no-fund > "$CI_ROOT/logs/npm-ci.log" 2>&1) || fail "npm ci (see $CI_ROOT/logs/npm-ci.log)"
  echo "$lock" > "$CI_ROOT/repo/.lock-sha"; done_ INSTALLED "lock $lock"
fi
echo "[provision] ready: node $(node --version) · $(google-chrome --version) · $(xpra --version 2>/dev/null | head -1) · $(Xvnc -version 2>&1 | grep -m1 -o 'TigerVNC[^ ]* [0-9.]*') · agent-browser $("$CI_ROOT/bin/agent-browser" --version 2>/dev/null) · $("$CI_ROOT/bin/codex" --version 2>/dev/null) · $(free -g | awk '/Mem:/{print $7}') GB available · $(nproc) cpus"
