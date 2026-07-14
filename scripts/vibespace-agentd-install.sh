#!/usr/bin/env bash
# vibespace-agentd standalone installer — run THIS machine as a VibeSpace
# device (Mac / Linux / any box with Node ≥18), so a VibeSpace server can
# reach its sessions, files and mounts. No VibeSpace server needed here.
#
#   Reachable machine (you can ssh to it): the VibeSpace UI's "Add machine"
#   already handles it — you don't need this script.
#
#   NAT'd / firewalled machine (laptop, home Mac): use DIAL-OUT — this daemon
#   dials your VibeSpace instance. In VibeSpace: ⚙ → Devices → "Pair a device"
#   gives you the exact command with a URL + token; paste it into: 
#       curl -fsSL <vibespace>/agentd-install.sh | bash -s -- \
#         --dial wss://<vibespace-host>/api/agentd-dial?device=<id> --dial-token <t>
#
# Requires: node ≥18 (brew install node / apt install nodejs), curl, unzip.
set -euo pipefail

ROOT="${VIBESPACE_AGENTD_ROOT:-$HOME/.vibespace/agentd}"
BUNDLE_URL="${VIBESPACE_AGENTD_URL:-}"   # where to fetch agentd.js (a VibeSpace serves it at /agentd.js)
DIAL_URL=""; DIAL_TOKEN=""; HOST_TOKEN=""
while [ $# -gt 0 ]; do case "$1" in
  --dial) DIAL_URL="$2"; shift 2;;
  --dial-token) DIAL_TOKEN="$2"; shift 2;;
  --host-token) HOST_TOKEN="$2"; shift 2;;
  --bundle-url) BUNDLE_URL="$2"; shift 2;;
  *) echo "unknown arg: $1"; exit 2;;
esac; done

command -v node >/dev/null || { echo "node ≥18 required (brew install node / apt install nodejs)"; exit 1; }
NODEV=$(node -e 'console.log(process.versions.node.split(".")[0])')
[ "$NODEV" -ge 18 ] || { echo "node ≥18 required (have $(node -v))"; exit 1; }

VER="${VIBESPACE_AGENTD_VERSION:-standalone}"
mkdir -p "$ROOT/$VER" "$ROOT/state"; chmod 700 "$ROOT" "$ROOT/state"
if [ -n "$BUNDLE_URL" ]; then
  echo "→ fetching agentd bundle from $BUNDLE_URL"
  curl -fsSL -o "$ROOT/$VER/agentd.js" "$BUNDLE_URL"
elif [ -f "./data/bin/vibespace-agentd.js" ]; then
  cp ./data/bin/vibespace-agentd.js "$ROOT/$VER/agentd.js"
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

# run: dial-out (NAT machine) or just the standing daemon (reachable machine)
if [ -n "$DIAL_URL" ]; then
  echo "→ starting daemon with dial-out to $DIAL_URL"
  setsid node "$ROOT/current/agentd.js" --dial "$DIAL_URL" --dial-token "$DIAL_TOKEN" </dev/null >>"$ROOT/state/agentd.out" 2>&1 &
else
  echo "→ starting standing daemon (unix socket at $ROOT/state/agentd.sock)"
  setsid node "$ROOT/current/agentd.js" </dev/null >>"$ROOT/state/agentd.out" 2>&1 &
fi
sleep 1
echo "✓ vibespace-agentd running. Log: $ROOT/state/agentd.log"
echo "  Stop: pkill -f '$ROOT/current/agentd.js'"
