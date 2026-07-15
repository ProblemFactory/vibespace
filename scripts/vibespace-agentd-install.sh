#!/usr/bin/env bash
# vibespace-agentd standalone installer — run THIS machine as a VibeSpace
# device (Mac / Linux / any box with Node ≥18), so a VibeSpace server can
# reach its sessions, files and mounts. No VibeSpace server needed here.
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
# Requires: node ≥18 (brew install node / apt install nodejs), curl, unzip.
set -euo pipefail

BUNDLE_URL="${VIBESPACE_AGENTD_URL:-}"   # where to fetch agentd.js (a VibeSpace serves it at /agentd.js)
DIAL_URL=""; DIAL_TOKEN=""; HOST_TOKEN=""
while [ $# -gt 0 ]; do case "$1" in
  --dial) DIAL_URL="$2"; shift 2;;
  --dial-token) DIAL_TOKEN="$2"; shift 2;;
  --host-token) HOST_TOKEN="$2"; shift 2;;
  --bundle-url) BUNDLE_URL="$2"; shift 2;;
  *) echo "unknown arg: $1"; exit 2;;
esac; done

# ROOT: one machine can pair to SEVERAL VibeSpace instances — a dial-out
# install keys its root (daemon + tokens + bundle, each self-upgrading from
# its own server) by the dial host, so instances never clobber each other.
# The standing daemon (ssh-reachable machine) keeps the classic shared root.
if [ -z "${VIBESPACE_AGENTD_ROOT:-}" ] && [ -n "$DIAL_URL" ]; then
  DIAL_HOST=$(printf '%s' "$DIAL_URL" | sed -E 's|^[a-z]+://([^/:?]+).*|\1|' | tr -cd 'A-Za-z0-9.-')
  ROOT="$HOME/.vibespace/device@${DIAL_HOST:-dial}"
else
  ROOT="${VIBESPACE_AGENTD_ROOT:-$HOME/.vibespace/agentd}"
fi

command -v node >/dev/null || { echo "node ≥18 required (brew install node / apt install nodejs)"; exit 1; }
NODEV=$(node -e 'console.log(process.versions.node.split(".")[0])')
[ "$NODEV" -ge 18 ] || { echo "node ≥18 required (have $(node -v))"; exit 1; }

VER="${VIBESPACE_AGENTD_VERSION:-standalone}"
mkdir -p "$ROOT/$VER" "$ROOT/state"; chmod 700 "$ROOT" "$ROOT/state"
if [ -n "$BUNDLE_URL" ]; then
  echo "→ fetching agentd bundle from $BUNDLE_URL"
  curl -fsSL -o "$ROOT/$VER/vibespace-device.js" "$BUNDLE_URL"
elif [ -f "./data/bin/vibespace-agentd.js" ]; then
  cp ./data/bin/vibespace-agentd.js "$ROOT/$VER/vibespace-device.js"
else
  echo "no --bundle-url and no local bundle; pass --bundle-url <vibespace>/agentd.js"; exit 1
fi
ln -sfn "$ROOT/$VER" "$ROOT/current"

# host token: provided (from pairing) or minted locally
if [ -n "$HOST_TOKEN" ]; then printf '%s' "$HOST_TOKEN" > "$ROOT/state/token"
elif [ ! -f "$ROOT/state/token" ]; then
  node -e 'process.stdout.write("vsht_"+require("crypto").randomBytes(24).toString("hex"))' > "$ROOT/state/token"
fi
chmod 600 "$ROOT/state/token"
echo "→ host token at $ROOT/state/token"

# run: dial-out (NAT machine) or just the standing daemon (reachable machine).
# macOS has NO setsid(1) — the old unconditional `setsid node …` silently
# started NOTHING on a Mac (the "command not found" went into agentd.out and
# the ✓ printed anyway; real report). nohup+& detaches well enough for a login
# shell; and ALWAYS verify the process actually survived before claiming ✓.
# the daemon derives its root from this env (default would be the shared root)
export VIBESPACE_AGENTD_ROOT="$ROOT"
START=(node "$ROOT/current/vibespace-device.js")
if [ -n "$DIAL_URL" ]; then
  echo "→ starting daemon with dial-out to $DIAL_URL"
  START+=(--dial "$DIAL_URL" --dial-token "$DIAL_TOKEN")
else
  echo "→ starting standing daemon (unix socket at $ROOT/state/agentd.sock)"
fi
if command -v setsid >/dev/null 2>&1; then
  setsid "${START[@]}" </dev/null >>"$ROOT/state/agentd.out" 2>&1 &
else
  nohup "${START[@]}" </dev/null >>"$ROOT/state/agentd.out" 2>&1 &
fi
PID=$!
sleep 2
if kill -0 "$PID" 2>/dev/null || pgrep -f "$ROOT/current/vibespace-device.js" >/dev/null 2>&1; then
  echo "✓ vibespace-agentd running (pid $PID). Log: $ROOT/state/agentd.log  Output: $ROOT/state/agentd.out"
  echo "  Stop: pkill -f '$ROOT/current/vibespace-device.js'"
else
  echo "✗ the daemon exited immediately — last output:"
  tail -5 "$ROOT/state/agentd.out" 2>/dev/null
  exit 1
fi
