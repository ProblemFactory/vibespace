#!/usr/bin/env bash
# vibespace-agentd standalone installer — run THIS machine as a VibeSpace
# device (Mac / Linux / any box), so a VibeSpace server can reach its
# sessions, files and mounts. No VibeSpace server needed here.
#
#   Reachable machine (you can ssh to it): the VibeSpace UI's "Add machine"
#   already handles it — you don't need this script.
#
#   NAT'd / firewalled machine (laptop, home Mac): use DIAL-OUT — this daemon
#   dials your VibeSpace instance. Mint the pairing via POST /api/agentd/dial-pair
#   (see docs/device-agent.md) — it returns the URL + token; paste them into:
#       curl -fsSL <vibespace>/agentd-install.sh | bash -s -- \
#         --dial wss://<vibespace-host>/api/agentd-dial?device=<id> --dial-token <t>
#
# Requires: curl (or wget) + tar. Node is provisioned automatically (into the
# install root, verified against nodejs.org's SHASUMS256.txt) if the machine
# has none — see the NODE RUNTIME block below.
set -euo pipefail

BUNDLE_URL="${VIBESPACE_AGENTD_URL:-}"   # where to fetch agentd.js (a VibeSpace serves it at /agentd.js)
DIAL_URL=""; DIAL_TOKEN=""; HOST_TOKEN=""
NODE_BIN_OVERRIDE="${VIBESPACE_NODE_BIN:-}"; NODE_ONLY=""
while [ $# -gt 0 ]; do case "$1" in
  --dial) DIAL_URL="$2"; shift 2;;
  --dial-token) DIAL_TOKEN="$2"; shift 2;;
  --host-token) HOST_TOKEN="$2"; shift 2;;
  --bundle-url) BUNDLE_URL="$2"; shift 2;;
  --node) NODE_BIN_OVERRIDE="$2"; shift 2;;   # use THIS node, skip discovery
  --node-only) NODE_ONLY=1; shift;;           # resolve/provision node, print it, exit (support + tests)
  *) echo "unknown arg: $1"; exit 2;;
esac; done

# ROOT: one machine can pair to SEVERAL VibeSpace instances — a dial-out
# install keys its root (daemon + tokens + bundle, each self-upgrading from
# its own server) by the dial host, so instances never clobber each other.
# The standing daemon (ssh-reachable machine) keeps the classic shared root.
if [ -z "${VIBESPACE_DEVICE_ROOT:-}${VIBESPACE_AGENTD_ROOT:-}" ] && [ -n "$DIAL_URL" ]; then
  DIAL_HOST=$(printf '%s' "$DIAL_URL" | sed -E 's|^[a-z]+://([^/:?]+).*|\1|' | tr -cd 'A-Za-z0-9.-')
  ROOT="$HOME/.vibespace/device@${DIAL_HOST:-dial}"
else
  ROOT="${VIBESPACE_DEVICE_ROOT:-${VIBESPACE_AGENTD_ROOT:-$HOME/.vibespace/agentd}}"
fi

VER="${VIBESPACE_AGENTD_VERSION:-standalone}"
mkdir -p "$ROOT/$VER" "$ROOT/state"; chmod 700 "$ROOT" "$ROOT/state"

# ── NODE RUNTIME ─────────────────────────────────────────────────────────────
# A device needs node TWICE: as the daemon's interpreter AND for every
# `#!/usr/bin/env node` agent tool the server ships into ~/.vibespace/bin later
# (the 2.244.4 chicken-and-egg). Demanding a preinstalled node was the #1
# pairing blocker, so: use a suitable one if the machine has it, otherwise
# provision a PRIVATE one into $ROOT/node — no root, no system state, no PATH
# pollution outside this script. The daemon's spawnEnv() prepends its own node
# dir to every child's PATH, so the agent tools resolve too. `rm -rf $ROOT`
# stays a complete uninstall (daemon AND its runtime).
NODE_MIN=18
NODE_VERSION="${VIBESPACE_NODE_VERSION:-v22.22.0}"   # pinned LTS; bump via nodejs.org/dist/index.json
NODE_MIRROR="${VIBESPACE_NODE_MIRROR:-https://nodejs.org/dist}"
NODE_FLAVOR="${VIBESPACE_NODE_FLAVOR:-}"             # e.g. -musl with unofficial-builds
PRIV_NODE="$ROOT/node/bin/node"

fetch_quiet() { # url dest
  if command -v curl >/dev/null 2>&1; then curl -fsSL --retry 3 --connect-timeout 20 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then wget -q -O "$2" "$1"
  else echo "need curl or wget"; return 1; fi
}
fetch_show() { # url dest (visible progress — this is a ~40MB download)
  if command -v curl >/dev/null 2>&1; then curl -fL --progress-bar --retry 3 --connect-timeout 20 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then wget -q --show-progress -O "$2" "$1"
  else echo "need curl or wget"; return 1; fi
}
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then openssl dgst -sha256 "$1" | awk '{print $NF}'
  else printf ''; fi
}

# major version of a candidate binary; empty/garbage = unusable. NEVER trips
# set -e (every call is evaluated inside an `if`, and the probe itself || true).
node_major() { "$1" -e 'process.stdout.write(process.versions.node.split(".")[0])' 2>/dev/null || true; }
node_ok() {
  [ -n "${1:-}" ] || return 1
  [ -x "$1" ] || return 1
  _m=$(node_major "$1")
  case "$_m" in ''|*[!0-9]*) return 1;; esac
  [ "$_m" -ge "$NODE_MIN" ]
}
newest_nvm() {
  _l=$(ls -1d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null || true)
  [ -n "$_l" ] || return 0
  _p=$(printf '%s\n' "$_l" | sort -V 2>/dev/null | tail -1 || true)
  [ -n "$_p" ] || _p=$(printf '%s\n' "$_l" | sort | tail -1 || true)   # BSD sort has no -V
  printf '%s' "$_p"
}
find_node() {
  # order: explicit override → OUR private copy (durable + version-pinned; an
  # nvm path baked into a launchd plist breaks at the user's next nvm upgrade)
  # → PATH → newest nvm (curl|bash is NON-login: nvm.sh is never sourced — the
  # most common "no node" report on a machine that HAS node) → usual spots.
  for c in "$NODE_BIN_OVERRIDE" "$PRIV_NODE" "$(command -v node 2>/dev/null || true)" \
           "$(newest_nvm)" /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node \
           "$HOME/.local/bin/node" /snap/bin/node; do
    if node_ok "$c"; then printf '%s' "$c"; return 0; fi
  done
  return 1
}

node_platform() {
  case "$(uname -s)" in
    Linux) NOS=linux;;
    Darwin) NOS=darwin;;
    *) echo "  ✗ no automatic Node install for $(uname -s) — install node ≥$NODE_MIN yourself"; return 1;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) NARCH=x64;;
    aarch64|arm64) NARCH=arm64;;
    armv7l|armv7|armhf) NARCH=armv7l;;
    ppc64le) NARCH=ppc64le;;
    s390x) NARCH=s390x;;
    *) echo "  ✗ no automatic Node install for CPU $(uname -m) — install node ≥$NODE_MIN yourself"; return 1;;
  esac
  # official linux builds are glibc-only; on musl they die with a baffling
  # "not found". Refuse honestly instead of shipping a broken daemon.
  if [ "$NOS" = linux ] && [ -z "$NODE_FLAVOR" ] && \
     { [ -f /etc/alpine-release ] || ldd --version 2>&1 | grep -qi musl || ls /lib/ld-musl-* >/dev/null 2>&1; }; then
    echo "  ✗ this machine uses musl libc (Alpine/OpenWrt) — official Node builds are glibc-only."
    echo "    Install node, then re-run the SAME pairing command:"
    echo "        apk add --no-cache nodejs npm"
    echo "    …or use the musl build:"
    echo "        VIBESPACE_NODE_MIRROR=https://unofficial-builds.nodejs.org/download/release \\"
    echo "        VIBESPACE_NODE_FLAVOR=-musl  <same command>"
    return 1
  fi
}

install_private_node() {
  node_platform || return 1
  TARN="node-$NODE_VERSION-$NOS-$NARCH$NODE_FLAVOR.tar.gz"
  TMP="$ROOT/.node-dl.$$"
  rm -rf "$TMP"; mkdir -p "$TMP"
  trap 'rm -rf "$TMP"' EXIT INT TERM
  echo "→ no usable Node ≥$NODE_MIN on this machine — installing a private one for VibeSpace only"
  echo "  $NODE_MIRROR/$NODE_VERSION/$TARN"
  echo "  → $ROOT/node   (~40MB download; nothing outside this folder is touched)"
  if ! fetch_show "$NODE_MIRROR/$NODE_VERSION/$TARN" "$TMP/$TARN"; then
    # a device that reaches THIS instance but not nodejs.org (corporate/CN):
    # fall back to the instance's own mirror route, derived from the bundle URL
    # we were handed (it is by definition reachable from here).
    ALT=$(printf '%s' "$BUNDLE_URL" | sed -n -E 's|^(https?://[^/]+).*|\1|p')
    if [ -n "$ALT" ] && fetch_show "$ALT/vibespace-node/$NODE_VERSION/$TARN" "$TMP/$TARN"; then
      echo "  (nodejs.org unreachable — fetched through this VibeSpace instance)"
      NODE_MIRROR="$ALT/vibespace-node"
    else
      echo "  ✗ download failed"; return 1
    fi
  fi
  if ! fetch_quiet "$NODE_MIRROR/$NODE_VERSION/SHASUMS256.txt" "$TMP/SHASUMS256.txt"; then
    echo "  ✗ could not fetch SHASUMS256.txt — refusing to install an unverified runtime"; return 1
  fi
  WANT=$(awk -v f="$TARN" '$2==f {print $1}' "$TMP/SHASUMS256.txt" | head -1 || true)
  GOT=$(sha256_of "$TMP/$TARN" || true)
  if [ -z "$WANT" ]; then echo "  ✗ $TARN is not listed in SHASUMS256.txt (bad version or platform)"; return 1; fi
  if [ -z "$GOT" ]; then
    if [ "${VIBESPACE_NODE_SKIP_VERIFY:-}" = 1 ]; then echo "  ⚠ checksum NOT verified (VIBESPACE_NODE_SKIP_VERIFY=1)"
    else
      echo "  ✗ no sha256sum / shasum / openssl here — cannot verify the download."
      echo "    Install one of them, or re-run with VIBESPACE_NODE_SKIP_VERIFY=1 to accept it unverified."
      return 1
    fi
  elif [ "$GOT" != "$WANT" ]; then
    echo "  ✗ checksum mismatch for $TARN"; echo "      expected $WANT"; echo "      got      $GOT"; return 1
  else
    echo "  ✓ checksum verified"
  fi
  tar -xzf "$TMP/$TARN" -C "$TMP" || { echo "  ✗ extract failed (corrupt download, or no tar/gzip here)"; return 1; }
  SRC="$TMP/node-$NODE_VERSION-$NOS-$NARCH$NODE_FLAVOR"
  [ -x "$SRC/bin/node" ] || { echo "  ✗ unexpected archive layout ($SRC/bin/node missing)"; return 1; }
  # smoke-run BEFORE committing: wrong arch, musl, a noexec $HOME all fail here
  "$SRC/bin/node" -e 'process.exit(0)' 2>/dev/null || {
    echo "  ✗ the downloaded node cannot run on this machine (wrong build, or \$HOME is mounted noexec)"; return 1; }
  # commit atomically: rename inside $ROOT (same filesystem) so a crash can
  # never leave a half-extracted $ROOT/node behind
  rm -rf "$ROOT/node.old"
  if [ -e "$ROOT/node" ]; then mv "$ROOT/node" "$ROOT/node.old"; fi   # NB: `[ ] && mv` would exit under set -e
  mv "$SRC" "$ROOT/node"
  rm -rf "$ROOT/node.old" "$TMP"
  trap - EXIT INT TERM
  echo "  ✓ Node $("$ROOT/node/bin/node" -v) installed at $ROOT/node"
}

# An explicit override that can't run must SAY so — falling through to another
# node silently would bill the user's debugging to the wrong hypothesis.
if [ -n "$NODE_BIN_OVERRIDE" ] && ! node_ok "$NODE_BIN_OVERRIDE"; then
  echo "⚠ --node $NODE_BIN_OVERRIDE is not a usable node ≥$NODE_MIN — ignoring it and looking elsewhere"
fi
NODE_BIN="$(find_node || true)"
if [ -z "$NODE_BIN" ]; then
  if ! install_private_node; then
    echo ""
    echo "✗ no Node ≥$NODE_MIN on this machine and the automatic install failed — nothing was changed."
    echo "  Fix it one of these ways, then re-run the SAME pairing command:"
    echo "   • install node:              brew install node | apt install nodejs | apk add nodejs npm"
    echo "   • point at an existing one:  --node /path/to/bin/node"
    echo "   • use a mirror:              VIBESPACE_NODE_MIRROR=https://npmmirror.com/mirrors/node <command>"
    exit 1
  fi
  NODE_BIN="$PRIV_NODE"
  node_ok "$NODE_BIN" || { echo "✗ the installed node at $NODE_BIN is unusable"; exit 1; }
fi
NODE_DIR=$(cd "$(dirname "$NODE_BIN")" 2>/dev/null && pwd || true)
[ -n "$NODE_DIR" ] || { echo "✗ cannot resolve the directory of $NODE_BIN"; exit 1; }
NODE_BIN="$NODE_DIR/$(basename "$NODE_BIN")"
# npm and every `#!/usr/bin/env node` shebang must resolve to THE SAME node
export PATH="$NODE_DIR:$PATH"
printf '%s' "$NODE_BIN" > "$ROOT/state/node-path"     # support breadcrumb
echo "→ node: $NODE_BIN ($("$NODE_BIN" -v))"
if [ "$NODE_ONLY" = 1 ]; then exit 0; fi

if [ -n "$BUNDLE_URL" ]; then
  echo "→ fetching agentd bundle from $BUNDLE_URL"
  fetch_quiet "$BUNDLE_URL" "$ROOT/$VER/vibespace-device.js"
elif [ -f "./data/bin/vibespace-agentd.js" ]; then
  cp ./data/bin/vibespace-agentd.js "$ROOT/$VER/vibespace-device.js"
else
  echo "no --bundle-url and no local bundle; pass --bundle-url <vibespace>/agentd.js"; exit 1
fi
ln -sfn "$ROOT/$VER" "$ROOT/current"

# node-pty for TERMINAL sessions (B-0d70): the daemon bundle is zero-dep, but a
# terminal-on-dial session opens a real device-side pty via node-pty. Best-
# effort install into the agentd root (node-pty ships prebuilds for mac/linux/
# win — usually just a download, no compiler). CHAT/files/mounts never need it,
# so a failure here is non-fatal (terminal shows a clear message if it's
# missing). Skip if already present.
# the check must SPAWN a real pty, not just require() the module — a broken
# spawn-helper loads fine and then fails every terminal with 'posix_spawnp
# failed' (real Mac report on node 25 + node-pty stable); the beta line is
# what VS Code ships and carries the macOS spawn fixes.
pty_ok() {
  "$NODE_BIN" -e "const pty=require('$ROOT/node_modules/node-pty');const p=pty.spawn('sh',['-c','exit 0'],{name:'xterm',cols:8,rows:4,cwd:process.env.HOME});p.onExit(()=>process.exit(0));setTimeout(()=>process.exit(1),4000);" >/dev/null 2>&1
}
# npm from the SAME node (a provisioned runtime ships its own; a system node
# may have none at all — then terminal sessions are simply unavailable)
NPM_BIN="$NODE_DIR/npm"
[ -x "$NPM_BIN" ] || NPM_BIN="$(command -v npm 2>/dev/null || true)"
if ! pty_ok; then
  if [ -z "$NPM_BIN" ]; then
    echo "  ⚠ no npm alongside this node — terminal sessions unavailable on this device (chat/files/mounts still work)"
  else
  echo "→ installing node-pty for terminal sessions (best-effort)…"
  ( cd "$ROOT" && { [ -f package.json ] || echo '{"name":"vibespace-agentd-deps","private":true}' > package.json; }
    "$NPM_BIN" install --no-audit --no-fund --loglevel=error node-pty >/dev/null 2>&1 ) || true
  if pty_ok; then
    echo "  ✓ node-pty ready (pty spawn verified)"
  else
    echo "  ⚠ stable node-pty can't spawn a pty on this node — trying node-pty@beta…"
    ( cd "$ROOT" && "$NPM_BIN" install --no-audit --no-fund --loglevel=error node-pty@beta >/dev/null 2>&1 ) || true
    if pty_ok; then echo "  ✓ node-pty (beta) ready (pty spawn verified)"
    else echo "  ⚠ terminal sessions unavailable on this device — chat/files/mounts still work"; fi
  fi
  fi
fi

# host token: provided (from pairing) or minted locally
if [ -n "$HOST_TOKEN" ]; then printf '%s' "$HOST_TOKEN" > "$ROOT/state/token"
elif [ ! -f "$ROOT/state/token" ]; then
  "$NODE_BIN" -e 'process.stdout.write("vsht_"+require("crypto").randomBytes(24).toString("hex"))' > "$ROOT/state/token"
fi
chmod 600 "$ROOT/state/token"
echo "→ host token at $ROOT/state/token"

# Persist the dial config so the daemon can start ARGLESS forever after (it
# re-dials from state/dial.json; no tokens in any unit file or argv).
export VIBESPACE_DEVICE_ROOT="$ROOT"
export VIBESPACE_AGENTD_ROOT="$ROOT" # legacy bundle compat
if [ -n "$DIAL_URL" ]; then
  "$NODE_BIN" -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({url:process.argv[2],token:process.argv[3]}), {mode:0o600})' \
    "$ROOT/state/dial.json" "$DIAL_URL" "$DIAL_TOKEN"
  echo "→ dial config persisted ($ROOT/state/dial.json)"
fi

# TAKE OVER from a daemon already running for THIS root (re-pair / identity
# rotation): an OLD daemon keeps its old in-memory identity and holds the
# singleton, so the new pairing never took effect ("already running" forever —
# real incident). New daemons adopt a rewritten dial.json by themselves, but
# an old bundle predating that must be replaced here. Verify the lock pid's
# command line before killing (a recycled pid must not hit an innocent process).
if [ -f "$ROOT/state/agentd.lock" ]; then
  OLDPID=$(cat "$ROOT/state/agentd.lock" 2>/dev/null || true)
  if [ -n "$OLDPID" ] && kill -0 "$OLDPID" 2>/dev/null; then
    OLDCMD=$(ps -p "$OLDPID" -o command= 2>/dev/null || true)
    case "$OLDCMD" in
      *vibespace-device*|*agentd*)
        echo "→ replacing the running daemon for this root (pid $OLDPID)"
        # silence the supervisor FIRST — killing a KeepAlive/Restart-managed
        # daemon otherwise just respawns it into a fight with our new one
        KEY0=$(basename "$ROOT" | tr -c 'A-Za-z0-9.-' '-' | sed 's/-*$//')
        launchctl bootout "gui/$(id -u)/cc.vibespace.device.$KEY0" 2>/dev/null || true
        command -v systemctl >/dev/null 2>&1 && systemctl --user stop "vibespace-device-$KEY0.service" 2>/dev/null || true
        kill "$OLDPID" 2>/dev/null || true
        i=0; while [ $i -lt 5 ] && kill -0 "$OLDPID" 2>/dev/null; do sleep 1; i=$((i+1)); done
        kill -9 "$OLDPID" 2>/dev/null || true
        sleep 1
        if kill -0 "$OLDPID" 2>/dev/null; then
          # unkillable (usually wedged in an uninterruptible syscall — a dead
          # network mount). Not fatal: the new pairing is already ON DISK and a
          # 2.170+ daemon re-reads it every dial attempt — it adopts by itself.
          echo "→ pid $OLDPID won't die (often: stuck on a dead network mount) — that's OK:"
          echo "  the new pairing is saved and the running daemon adopts it within ~30s."
          echo "  If the machine stays offline, clear the stuck mount (or reboot) and re-run this command."
          exit 0
        fi
        rm -f "$ROOT/state/agentd.lock"
        ;;
      "")
        # can't verify — leave it alone (the new daemon's ps check handles a
        # stale/recycled pid by itself)
        ;;
      *)
        echo "→ stale lock (pid $OLDPID is not our daemon) — clearing"
        rm -f "$ROOT/state/agentd.lock"
        ;;
    esac
  else
    rm -f "$ROOT/state/agentd.lock"
  fi
fi

# PERSISTENCE (the dead-Mac lesson: a daemon killed by a crash/reboot/upgrade
# hiccup stayed dead forever — nothing restarted it). Register a supervisor:
#   macOS  : launchd LaunchAgent (RunAtLoad + KeepAlive = restart on crash)
#   Linux  : systemd user unit (Restart=always; best-effort linger for logout)
#   neither: fall back to the old detached start (no persistence).
# Keyed by the root's basename so multi-instance pairings coexist.
KEY=$(basename "$ROOT" | tr -c 'A-Za-z0-9.-' '-' | sed 's/-*$//')
# $NODE_BIN is already an ABSOLUTE path (resolved/provisioned above) — launchd
# and systemd get no PATH of ours, so it must never be a bare `node`.
# stop any previously-started daemon for this root (flock singleton would
# otherwise block the supervised one from starting)
pkill -f "$ROOT/current/vibespace-device.js" 2>/dev/null || true
sleep 0.5

started=""
if [ "$(uname -s)" = "Darwin" ]; then
  LABEL="cc.vibespace.device.$KEY"
  PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$NODE_BIN</string>
    <string>$ROOT/current/vibespace-device.js</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>VIBESPACE_DEVICE_ROOT</key><string>$ROOT</string>
    <key>VIBESPACE_AGENTD_ROOT</key><string>$ROOT</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$ROOT/state/agentd.out</string>
  <key>StandardErrorPath</key><string>$ROOT/state/agentd.out</string>
</dict></plist>
PLIST_EOF
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  if launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load -w "$PLIST" 2>/dev/null; then
    started="launchd ($LABEL — survives reboots, auto-restarts on crash)"
  fi
elif command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
  UNIT="vibespace-device-$KEY.service"
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$HOME/.config/systemd/user/$UNIT" <<UNIT_EOF
[Unit]
Description=VibeSpace device agent ($KEY)
[Service]
Environment=VIBESPACE_DEVICE_ROOT=$ROOT
Environment=VIBESPACE_AGENTD_ROOT=$ROOT
ExecStart=$NODE_BIN $ROOT/current/vibespace-device.js
Restart=always
RestartSec=5
StandardOutput=append:$ROOT/state/agentd.out
StandardError=append:$ROOT/state/agentd.out
[Install]
WantedBy=default.target
UNIT_EOF
  systemctl --user daemon-reload
  if systemctl --user enable --now "$UNIT" >/dev/null 2>&1; then
    started="systemd user unit ($UNIT — auto-restarts; survives reboots"
    if loginctl enable-linger "$USER" 2>/dev/null; then started="$started, linger on)"; else started="$started; run 'sudo loginctl enable-linger $USER' so it survives logout)"; fi
  fi
fi

# remember where the (append-only) log ends — a failure report must show THIS
# run's output, not hours-old history (real report: stale 'already running'
# lines from dead pids read as a fresh failure)
# (the redirect is INSIDE the group: `wc < missing 2>/dev/null` still prints the
# shell's own "No such file" — redirections apply left to right, and on a FIRST
# install the log never exists yet)
LOG_OFF=$( { wc -c < "$ROOT/state/agentd.out"; } 2>/dev/null || echo 0)

if [ -z "$started" ]; then
  # fallback: detached one-shot (no persistence — the pre-2.162 behavior).
  # macOS has NO setsid(1) (real report: silent non-start) — nohup there.
  START=("$NODE_BIN" "$ROOT/current/vibespace-device.js")
  if command -v setsid >/dev/null 2>&1; then
    setsid "${START[@]}" </dev/null >>"$ROOT/state/agentd.out" 2>&1 &
  else
    nohup "${START[@]}" </dev/null >>"$ROOT/state/agentd.out" 2>&1 &
  fi
  started="detached process (NO persistence — rerun after a reboot)"
fi

# verify by the LOCK pid, not pgrep-by-path: the daemon rewrites its process
# title to 'vibespace-device' (no path in ps), so a path pgrep never matches a
# HEALTHY daemon and reported success as 'exited immediately' (real report)
daemon_up() {
  P=$(cat "$ROOT/state/agentd.lock" 2>/dev/null)
  [ -n "$P" ] || return 1
  kill -0 "$P" 2>/dev/null || return 1
  case "$(ps -p "$P" -o command= 2>/dev/null)" in *vibespace-device*|*agentd*|"") return 0;; *) return 1;; esac
}
i=0; while [ $i -lt 8 ] && ! daemon_up; do sleep 1; i=$((i+1)); done
if daemon_up; then
  echo "✓ vibespace device agent running via $started (pid $(cat "$ROOT/state/agentd.lock" 2>/dev/null))"
  echo "  Output: $ROOT/state/agentd.out"
else
  echo "✗ the daemon did not stay up — output from THIS run:"
  tail -c +"$((LOG_OFF + 1))" "$ROOT/state/agentd.out" 2>/dev/null | tail -20
  exit 1
fi
