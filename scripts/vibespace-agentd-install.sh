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
#       curl -fsSL <vibespace>/agentd-install.sh | VIBESPACE_DIAL_TOKEN=<t> VIBESPACE_HOST_TOKEN=<h> bash -s -- \
#         --dial wss://<vibespace-host>/api/agentd-dial?device=<id> --allow run,files,sessions,upgrade
#   (the tokens in the environment, never on a command line other users can read; --dial-token / --host-token still work)
#   --allow (lane device-allow-flags, design q-042 D5): what the VibeSpace may do on THIS machine — all, none, or some of
#   run, files, input, socks, lan, sessions, upgrade. It lands in <root>/state/policy.json; only running this command
#   again on this machine changes it (the VibeSpace cannot). Without --allow a re-run keeps the list it already has.
#
# Requires: curl (or wget) + tar. Node is provisioned automatically (into the
# install root, verified against nodejs.org's SHASUMS256.txt) if the machine
# has none — see the NODE RUNTIME block below.
set -euo pipefail

BUNDLE_URL="${VIBESPACE_AGENTD_URL:-}"   # where to fetch agentd.js (a VibeSpace serves it at /agentd.js)
DIAL_URL=""
# verify-r3 B-inst: the pasted command hands the two tokens in the ENVIRONMENT of this shell (`… | VIBESPACE_DIAL_TOKEN=…
# VIBESPACE_HOST_TOKEN=… bash -s -- …`), never in an argv every local user reads through /proc/<pid>/cmdline; the
# --dial-token / --host-token flags still work for commands generated before. Read once and UNSET: nothing this
# installer starts (the daemon's detached fallback inherits our environment, and every session it runs inherits the
# daemon's) ever sees them — the one child that needs the dial token gets it in ITS environment only.
DIAL_TOKEN="${VIBESPACE_DIAL_TOKEN:-}"; HOST_TOKEN="${VIBESPACE_HOST_TOKEN:-}"
unset VIBESPACE_DIAL_TOKEN VIBESPACE_HOST_TOKEN
NODE_BIN_OVERRIDE="${VIBESPACE_NODE_BIN:-}"; NODE_ONLY=""; NO_CHECK=""; ALLOW=""
HUB_ID=""; T0=$(date +%s)   # lane mac-repair-retires-stale: the hub's id (the dial check names it) + when this run began
while [ $# -gt 0 ]; do case "$1" in
  --dial) DIAL_URL="$2"; shift 2;;
  --no-check) NO_CHECK=1; shift;;             # skip the dial check below (lane-pairing ⑤ — ON by default)
  --dial-token) DIAL_TOKEN="$2"; shift 2;;
  --host-token) HOST_TOKEN="$2"; shift 2;;
  --bundle-url) BUNDLE_URL="$2"; shift 2;;
  --node) NODE_BIN_OVERRIDE="$2"; shift 2;;   # use THIS node, skip discovery
  --node-only) NODE_ONLY=1; shift;;           # resolve/provision node, print it, exit (support + tests)
  --allow) ALLOW="$2"; shift 2;;              # lane device-allow-flags: this machine's own allow list (written below)
  --allow=*) ALLOW="${1#--allow=}"; shift;;
  *) echo "unknown arg: $1"; exit 2;;
esac; done

# THE DIAL ADDRESS IS CHECKED BEFORE ANYTHING IS WRITTEN (lane-pairing ⑤, the owner's Mac 2026-09-27: a hand-typed
# address the Mac could not reach was installed anyway and the row said only "offline"). First its scheme, here,
# before anything is fetched; then — once the bundle is on disk — the daemon's OWN dial, once (--dial-check below).
case "$DIAL_URL" in
  ws://*|wss://*|"") ;;
  *) echo "✗ the dial address must start with ws:// or wss:// — got: $DIAL_URL"; exit 2;;
esac

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
# pinned LTS; bump via nodejs.org/dist/index.json — v22.23.4 = the Node.js security releases of 2026-10-21 (the hub's floor
# table, src/device-runtime.js NODE_FLOORS, names that advisory; this pin is never below its line's floor)
NODE_VERSION="${VIBESPACE_NODE_VERSION:-v22.23.4}"
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

install_private_node() { # [replace] — `replace`: the pin moved past this install's own node (the headline says so)
  node_platform || return 1
  TARN="node-$NODE_VERSION-$NOS-$NARCH$NODE_FLAVOR.tar.gz"
  TMP="$ROOT/.node-dl.$$"
  rm -rf "$TMP"; mkdir -p "$TMP"
  trap 'rm -rf "$TMP"' EXIT INT TERM
  if [ "${1:-}" = replace ]; then echo "→ installing Node $NODE_VERSION in place of this install's own $PRIV_V"
  else echo "→ no usable Node ≥$NODE_MIN on this machine — installing a private one for VibeSpace only"; fi
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
# THE PIN MOVED (lane device-node-version — the Node.js security releases of 2026-10-21): this install's OWN node
# ($ROOT/node, provisioned by an earlier run of this script) older than NODE_VERSION is replaced by the pinned one,
# verified like a first provisioning (a rename inside $ROOT — the agent running on the old one keeps its inode until the
# take-over below restarts it). A failed download keeps the one it had (said, not fatal). A node this machine HAD (PATH,
# nvm, /usr/…, --node) is never touched: the hub's Machines card says when it is below the fixed release, with its upgrade
# line. The agent's self-upgrade (landBundle) lands a bundle only — re-running this command is how its node moves.
ver_lt() { # a b → true when version a is older than b (vX.Y.Z; awk, as BSD sort has no -V)
  awk -v a="$1" -v b="$2" 'BEGIN { sub(/^v/, "", a); sub(/^v/, "", b); split(a, x, "."); split(b, y, ".")
    for (i = 1; i <= 3; i++) { if (x[i] + 0 < y[i] + 0) exit 0; if (x[i] + 0 > y[i] + 0) exit 1 }; exit 1 }'
}
PRIV_V=""
if [ -z "$NODE_BIN_OVERRIDE" ] && node_ok "$PRIV_NODE"; then PRIV_V=$("$PRIV_NODE" -v 2>/dev/null || true); fi
if [ -n "$PRIV_V" ] && ver_lt "$PRIV_V" "$NODE_VERSION"; then
  echo "→ this install's own Node $PRIV_V is older than the pinned $NODE_VERSION — replacing it"
  if ! install_private_node replace; then
    echo "  ⚠ Node $NODE_VERSION could not be installed — keeping $PRIV_V for now (run this command again to retry)"
  fi
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
  fetch_quiet "$BUNDLE_URL" "$ROOT/$VER/vibespace-device.js" || { echo "✗ could not fetch $BUNDLE_URL — this device cannot reach that address. → pick an address this device can reach, in the pairing dialog"; exit 12; }
elif [ -f "./data/bin/vibespace-agentd.js" ]; then
  cp ./data/bin/vibespace-agentd.js "$ROOT/$VER/vibespace-device.js"
else
  echo "no --bundle-url and no local bundle; pass --bundle-url <vibespace>/agentd.js"; exit 1
fi
ln -sfn "$ROOT/$VER" "$ROOT/current"

# THE DIAL CHECK (lane-pairing ⑤): the daemon's own dial, ONE attempt carrying a probe header — the server checks
# the token and answers 200 WITHOUT registering the device. A failure prints its class by name + the remedy and
# exits BEFORE the host token, dial.json or the launchd / systemd unit are written (exit 10 dns · 11 tls · 12
# unreachable · 13 not a VibeSpace dial endpoint · 14 refused by the server · 15 other). --no-check skips it.
if [ -n "$DIAL_URL" ] && [ -z "$NO_CHECK" ]; then
  DHOST=$(printf '%s' "$DIAL_URL" | sed -E 's|^[a-z]+://([^/?]+).*|\1|')
  echo "→ checking that this device can dial ${DHOST}…"
  set +e
  CHECK_OUT=$(VIBESPACE_DIAL_TOKEN="$DIAL_TOKEN" VIBESPACE_DEVICE_ROOT="$ROOT" VIBESPACE_AGENTD_ROOT="$ROOT" "$NODE_BIN" "$ROOT/current/vibespace-device.js" --dial-check "$DIAL_URL" 2>&1)
  CHECK_RC=$?
  set -e
  printf '%s\n' "$CHECK_OUT" | sed 's/^/  /'
  if [ "$CHECK_RC" -ne 0 ]; then
    echo "✗ nothing was installed — the device cannot dial $DHOST: $(printf '%s' "$CHECK_OUT" | head -1)"
    exit "$CHECK_RC"
  fi
  # lane mac-repair-retires-stale: the hub names itself in its answer (an older hub does not) — kept in dial.json below
  HUB_ID=$(printf '%s\n' "$CHECK_OUT" | sed -n 's/^hub id: \(vh-[0-9a-f]\{16\}\)$/\1/p' | head -1)
fi

# THE ALLOW LIST (lane device-allow-flags, design q-042 D5): written by the agent's OWN parser (`--write-policy`, PURE
# src/device-policy.js) into state/policy.json at 0600 — BEFORE the host token, dial.json or the unit: an unknown flag
# stops here (exit 2) with nothing installed. The daemon reads it when it starts (the take-over below restarts it).
if [ -n "$ALLOW" ]; then
  if ! VIBESPACE_DEVICE_ROOT="$ROOT" VIBESPACE_AGENTD_ROOT="$ROOT" "$NODE_BIN" "$ROOT/current/vibespace-device.js" --write-policy "$ALLOW"; then
    echo "✗ nothing was installed — the --allow list was refused (above)"; exit 2
  fi
fi

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
if [ -n "$HOST_TOKEN" ]; then ( umask 077; printf '%s' "$HOST_TOKEN" > "$ROOT/state/token" )
elif [ ! -f "$ROOT/state/token" ]; then
  "$NODE_BIN" -e 'process.stdout.write("vsht_"+require("crypto").randomBytes(24).toString("hex"))' > "$ROOT/state/token"
fi
chmod 600 "$ROOT/state/token"
echo "→ host token at $ROOT/state/token"
# THE RELEASE-KEY PIN RESETS (design q-042 D2): a (re-)pair is the owner's own act — a new trust-on-first-use. The bundle
# just landed pins ITS release keys at its first start (src/agentd/agentd.js) — when it carries none (a build before the
# first signed release), the first validly signed update it is offered; a lost release key is recovered this way. The
# version floor resets with it (fix r2: the newest version this install ran — a re-pair may land an older hub's agent).
rm -f "$ROOT/state/trusted-keys.json" "$ROOT/state/release-floor.json"

# Persist the dial config so the daemon can start ARGLESS forever after (it
# re-dials from state/dial.json; no tokens in any unit file or argv).
export VIBESPACE_DEVICE_ROOT="$ROOT"
export VIBESPACE_AGENTD_ROOT="$ROOT" # legacy bundle compat
if [ -n "$DIAL_URL" ]; then
  # the token in the writer's ENVIRONMENT (verify-r3 B-inst — it rode this node's argv); atomic at 0600; + the hub's id
  # when the dial check learned it (lane mac-repair-retires-stale — not a secret: the address of a hub, never a key)
  VIBESPACE_DIAL_TOKEN="$DIAL_TOKEN" "$NODE_BIN" -e 'const fs=require("fs"),f=process.argv[1],t=f+".tmp-"+process.pid,h=process.argv[3]||"";try{fs.unlinkSync(t)}catch{};fs.writeFileSync(t,JSON.stringify({url:process.argv[2],token:process.env.VIBESPACE_DIAL_TOKEN||"",...(/^vh-[0-9a-f]{16}$/.test(h)?{hub:h}:{})}),{mode:0o600});fs.renameSync(t,f)' \
    "$ROOT/state/dial.json" "$DIAL_URL" "$HUB_ID"
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
          [ -n "$ALLOW" ] && echo "  (its allow list is read when it starts — it takes effect at its next start)"
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

# RETIRE THE OLDER INSTALLS OF THIS HUB (lane mac-repair-retires-stale, B-06e9 — the owner's Macbook 2026-10-18: FOUR
# installs, one per hub address ever paired, three re-dialing with old tokens every 30 s for ever). Each pairing installs
# its own root keyed by the dial ADDRESS (ROOT above); installs of DIFFERENT hubs coexist by design. A sibling root whose
# state/dial.json names the SAME hub (`hub` — learned by the dial check above, or by that install at its own accepted
# dial) — or, when neither knows its hub, the same device id — is this machine's older pairing of this hub: its
# supervisor is stopped, its launch item moved to ~/.vibespace/disabled-launchagents/ (never deleted; the root and its
# state stay on disk), and the DETACHED agent holding its state/agentd.lock is stopped only when that pid's command line
# names vibespace-device (the take-over's rule — never a recycled pid). Only once THIS install is live: the dial check
# passed and the new daemon dialed in (its state/dial-status.json `connectedAt` falls in this run) — never before. A
# sibling of another hub is kept; one whose hub is unknown (an install older than this rule that never learned it) is
# LISTED with its exact stop command and not touched.
siblings_of() { # → "<retire|other|unknown><TAB><dir name>" per sibling root
  "$NODE_BIN" -e 'const fs=require("fs"),p=require("path"),[b,me]=process.argv.slice(1),H=/^vh-[0-9a-f]{16}$/;const rd=(n)=>{try{const j=JSON.parse(fs.readFileSync(p.join(b,n,"state","dial.json"),"utf8"));let d="";try{d=new URL(j.url).searchParams.get("device")||""}catch{}return{hub:H.test(j.hub||"")?j.hub:"",dev:d}}catch{return{hub:"",dev:""}}};const o=rd(me);for(const n of fs.readdirSync(b).sort()){if(n===me||!/^device@[A-Za-z0-9.-]+$/.test(n))continue;const s=rd(n);console.log((s.hub&&o.hub?(s.hub===o.hub?"retire":"other"):(!s.hub&&!o.hub&&s.dev&&s.dev===o.dev?"retire":"unknown"))+"\t"+n)}' \
    "$HOME/.vibespace" "$(basename "$ROOT")" 2>/dev/null || true
}
dialed_in() { # the new daemon's own record: connected since this run began
  "$NODE_BIN" -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(Number(j.connectedAt)>=Number(process.argv[2])*1000?0:1)}catch{process.exit(1)}' "$ROOT/state/dial-status.json" "$T0" 2>/dev/null
}
retire_siblings() {
  [ -n "$DIAL_URL" ] && [ -z "$NO_CHECK" ] && [ "$(dirname "$ROOT")" = "$HOME/.vibespace" ] || return 0
  SIBS=$(siblings_of)
  [ -n "$SIBS" ] || return 0
  i=0; while [ $i -lt 20 ] && ! dialed_in; do sleep 1; i=$((i+1)); done
  if ! dialed_in; then
    echo "→ older installs on this machine were NOT retired: this install has not dialed in yet — run this command again once its row reads connected"
    return 0
  fi
  SIBS=$(siblings_of)   # again, now that the daemon may have learned its hub at its first accepted dial
  DIS="$HOME/.vibespace/disabled-launchagents"; TAB=$(printf '\t'); RETIRED=""; NR=0; OTHER=""; UNKNOWN=""
  while IFS="$TAB" read -r V N; do
    [ -n "$N" ] || continue
    K=$(printf '%s' "$N" | tr -c 'A-Za-z0-9.-' '-' | sed 's/-*$//')
    P="$HOME/Library/LaunchAgents/cc.vibespace.device.$K.plist"; U="$HOME/.config/systemd/user/vibespace-device-$K.service"
    case "$V" in
      retire)
        # the supervisor FIRST (a KeepAlive / Restart= one respawns the agent stopped next), its launch item set aside
        if [ -f "$P" ]; then
          if command -v launchctl >/dev/null 2>&1; then launchctl bootout "gui/$(id -u)/cc.vibespace.device.$K" 2>/dev/null || true; fi
          mkdir -p "$DIS"; D="$DIS/$(basename "$P")"; if [ -e "$D" ]; then D="$D.$(date +%s)"; fi; mv "$P" "$D" || echo "  ⚠ could not move $P aside"
        fi
        if [ -f "$U" ]; then
          if command -v systemctl >/dev/null 2>&1; then systemctl --user disable --now "vibespace-device-$K.service" >/dev/null 2>&1 || true; fi
          mkdir -p "$DIS"; D="$DIS/$(basename "$U")"; if [ -e "$D" ]; then D="$D.$(date +%s)"; fi; mv "$U" "$D" || echo "  ⚠ could not move $U aside"
          if command -v systemctl >/dev/null 2>&1; then systemctl --user daemon-reload >/dev/null 2>&1 || true; fi
        fi
        # the detached agent (ppid 1) holding the sibling's lock — only when its command line names vibespace-device
        SP=$(cat "$HOME/.vibespace/$N/state/agentd.lock" 2>/dev/null || true)
        case "$SP" in ''|*[!0-9]*) SP="";; esac
        if [ -n "$SP" ] && kill -0 "$SP" 2>/dev/null; then
          case "$(ps -p "$SP" -o command= 2>/dev/null || true)" in
            *vibespace-device*)
              kill "$SP" 2>/dev/null || true
              j=0; while [ $j -lt 5 ] && kill -0 "$SP" 2>/dev/null; do sleep 1; j=$((j+1)); done
              if kill -0 "$SP" 2>/dev/null; then kill -9 "$SP" 2>/dev/null || true; fi
              ;;
          esac
        fi
        RETIRED="$RETIRED${RETIRED:+, }$N"; NR=$((NR+1))
        ;;
      other) OTHER="$OTHER${OTHER:+, }$N" ;;
      *)
        if [ -f "$P" ]; then STOPW="launchctl bootout gui/\$(id -u)/cc.vibespace.device.$K; "
        elif [ -f "$U" ]; then STOPW="systemctl --user disable --now vibespace-device-$K.service; "
        else STOPW=""; fi
        UNKNOWN="$UNKNOWN    $N — stop it with: ${STOPW}kill \$(cat ~/.vibespace/$N/state/agentd.lock)
"
        ;;
    esac
  done <<SIBS_EOF
$SIBS
SIBS_EOF
  if [ "$NR" -gt 0 ]; then
    if [ "$NR" -eq 1 ]; then W1="1 older install"; else W1="$NR older installs"; fi
    echo "→ retired $W1 of this hub: $RETIRED (kept under ~/.vibespace; their launch items moved to ~/.vibespace/disabled-launchagents/)"
  fi
  if [ -n "$UNKNOWN" ]; then printf '%s\n%s' "→ older installs I cannot attribute, not touched:" "$UNKNOWN"; fi
  if [ -n "$OTHER" ]; then echo "→ kept: $OTHER (another VibeSpace's install on this machine)"; fi
  return 0
}
retire_siblings
