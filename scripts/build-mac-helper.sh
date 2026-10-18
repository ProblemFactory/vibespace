#!/bin/bash
# lane stream-p3m-build: THE PREBUILT MAC SCREEN HELPER — run ON a Mac with the Command Line Tools (the release, or the
# mac-helper workflow on a macOS runner): data/bin/helpers/vibespace-screen (universal arm64 + x86_64, macOS 15+, one ad-hoc
# signature) + data/bin/helpers/vibespace-screen.version. The hub pushes it to a paired Mac whose agent cannot build its own
# (no compiler there — src/server/desktop-webrtc.js pushMacHelper). It is the SAME text and the SAME version as the agent's
# on-box build (src/agentd/mac-helper-source.js — the argvs of src/stream-plan.js macBuildPlan), so an agent takes it as its own.
#   bash scripts/build-mac-helper.sh            → data/bin/helpers/
set -euo pipefail
cd "$(dirname "$0")/.."
[ "$(uname -s)" = Darwin ] || { echo "build-mac-helper: run this on a Mac (swiftc, lipo, codesign)" >&2; exit 2; }
node scripts/mac-helper-embed.mjs --check # a stale module would ship a helper no agent asks for
VERSION=$(node -p "require('./src/agentd/mac-helper-source.js').VERSION")
OUT=data/bin/helpers
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
node -e "const S = require('./src/agentd/mac-helper-source.js'), SP = require('./src/stream-plan.js'); require('fs').writeFileSync(process.argv[1], SP.macHelperSourceFile(S.VERSION, S.SOURCE))" "$WORK/vibespace-screen.swift"
t0=$(date +%s)
pids=()
for a in arm64 x86_64; do swiftc -O -target "$a-apple-macos15.0" -o "$WORK/vibespace-screen-$a" "$WORK/vibespace-screen.swift" & pids+=($!); done
for p in "${pids[@]}"; do wait "$p"; done
lipo -create -output "$WORK/vibespace-screen" "$WORK/vibespace-screen-arm64" "$WORK/vibespace-screen-x86_64"
codesign -s - -f "$WORK/vibespace-screen"
mkdir -p "$OUT"
install -m 0755 "$WORK/vibespace-screen" "$OUT/vibespace-screen"
printf '%s\n' "$VERSION" > "$OUT/vibespace-screen.version"
[ "$("$OUT/vibespace-screen" version)" = "$VERSION" ] || { echo "build-mac-helper: the built helper reports another version" >&2; exit 1; }
echo "built $OUT/vibespace-screen $VERSION ($(lipo -archs "$OUT/vibespace-screen"), $(wc -c < "$OUT/vibespace-screen" | tr -d ' ') bytes) in $(( $(date +%s) - t0 )) s"
