#!/bin/bash
# lane stream-p3m-build: THE PREBUILT MAC SCREEN HELPER — run ON a Mac with the Command Line Tools (the release, or the
# mac-helper workflow on a macOS runner): data/bin/helpers/vibespace-screen (universal arm64 + x86_64, macOS 15+) +
# data/bin/helpers/vibespace-screen.version + data/bin/helpers/vibespace-screen.identity.json. The hub pushes it to a paired
# Mac whose agent cannot build its own (no compiler there — src/server/desktop-webrtc.js pushMacHelper). It is the SAME text
# and the SAME version as the agent's on-box build (src/agentd/mac-helper-source.js — the argvs of src/stream-plan.js
# macBuildPlan), so an agent takes it as its own.
#
# Lane apple-signing (docs/design-apple-signing.zh.md §2–§3): signed with the owner's DEVELOPER ID when asked — hardened runtime,
# a secure timestamp and THE fixed identifier, so macOS keys the Screen Recording grant on identifier + Team ID and every later
# build keeps it (src/mac-helper-identity.js). The certificate lives in the owner's Mac keychain only: this script runs THERE at the
# cut (主开发 through the exit road). Without --sign the helper is ad-hoc signed as before (the cut works before any certificate).
# Notarization is belt and braces (a helper the agent writes carries no quarantine attribute): a failed notarization never fails the
# build — the identity record says `notarized: false`.
#   bash scripts/build-mac-helper.sh                                                   → ad-hoc (as before)
#   bash scripts/build-mac-helper.sh --sign "Developer ID Application: <name> (TEAMID)" [--identifier com.problemfactory.vibespace.screen] [--notarize <keychain profile>]
set -euo pipefail
cd "$(dirname "$0")/.."
SIGN=""; IDENTIFIER="com.problemfactory.vibespace.screen"; NOTARIZE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --sign) SIGN="${2:-}"; shift 2 ;;
    --identifier) IDENTIFIER="${2:-}"; shift 2 ;;
    --notarize) NOTARIZE="${2:-}"; shift 2 ;;
    *) echo "build-mac-helper: unknown argument $1 (--sign <identity> | --identifier <id> | --notarize <profile>)" >&2; exit 2 ;;
  esac
done
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
if [ -n "$SIGN" ]; then
  # Developer ID: the hardened runtime + a secure timestamp + THE identifier (src/mac-helper-identity.js signArgs — the same argv)
  codesign --sign "$SIGN" --options runtime --timestamp --identifier "$IDENTIFIER" --force "$WORK/vibespace-screen"
  codesign --verify --strict --verbose=2 "$WORK/vibespace-screen"
  KIND=developer-id
else
  codesign -s - -f "$WORK/vibespace-screen"
  KIND=adhoc
fi
INFO=$(codesign -dv --verbose=4 "$WORK/vibespace-screen" 2>&1 || true)
TEAM=$(printf '%s\n' "$INFO" | sed -n 's/^TeamIdentifier=//p' | head -n 1)
IDENT=$(printf '%s\n' "$INFO" | sed -n 's/^Identifier=//p' | head -n 1)
[ "$TEAM" = "not set" ] && TEAM=""
if [ "$KIND" = developer-id ]; then
  [ -n "$TEAM" ] || { echo "build-mac-helper: the signature names no Team ID (codesign -dv: $(printf '%s' "$INFO" | tr '\n' ' ' | cut -c1-200))" >&2; exit 1; }
  [ "$IDENT" = "$IDENTIFIER" ] || { echo "build-mac-helper: the signed identifier is '$IDENT', not '$IDENTIFIER'" >&2; exit 1; }
  printf '%s\n' "$INFO" | grep -q '^Authority=Developer ID Application:' || { echo "build-mac-helper: '$SIGN' is not a Developer ID Application identity" >&2; exit 1; }
  # the designated requirement the file carries must be THE Developer ID one (src/mac-helper-identity.js designatedRequirement —
  # what tccd keys the Screen Recording grant on and what the agent reads back with the same command before taking the prebuilt)
  DR=$(codesign -dr - "$WORK/vibespace-screen" 2>/dev/null | sed -n 's/^designated => //p' | head -n 1)
  WANT="identifier \"$IDENTIFIER\" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = $TEAM"
  [ "$DR" = "$WANT" ] || { echo "build-mac-helper: the designated requirement is not the Developer ID one the agent keys the grant on (got: ${DR:-none})" >&2; exit 1; }
fi
NOTARIZED=false
if [ -n "$NOTARIZE" ]; then
  if [ "$KIND" != developer-id ]; then echo "build-mac-helper: --notarize needs --sign (Apple notarizes Developer ID signatures only)" >&2; exit 2; fi
  ditto -c -k --keepParent "$WORK/vibespace-screen" "$WORK/vibespace-screen.zip"
  if xcrun notarytool submit "$WORK/vibespace-screen.zip" --keychain-profile "$NOTARIZE" --wait; then NOTARIZED=true
  else echo "build-mac-helper: notarization did not succeed — the signed helper ships without it (the identity record says notarized: false)" >&2; fi
fi
mkdir -p "$OUT"
install -m 0755 "$WORK/vibespace-screen" "$OUT/vibespace-screen"
printf '%s\n' "$VERSION" > "$OUT/vibespace-screen.version"
[ "$("$OUT/vibespace-screen" version)" = "$VERSION" ] || { echo "build-mac-helper: the built helper reports another version" >&2; exit 1; }
SHA=$(shasum -a 256 "$OUT/vibespace-screen" | cut -c1-64)
# the identity record (public facts only — no key, no name beyond what codesign prints on any Mac): sign-agentd signs it into the release
node -e "const [v, sha, kind, team, ident, notarized] = process.argv.slice(1); require('fs').writeFileSync('$OUT/vibespace-screen.identity.json', JSON.stringify({ version: v, sha256: sha, kind, teamId: team || null, identifier: ident || null, notarized: notarized === 'true', at: new Date().toISOString() }, null, 2) + '\n')" "$VERSION" "$SHA" "$KIND" "$TEAM" "$IDENT" "$NOTARIZED"
echo "built $OUT/vibespace-screen $VERSION ($(lipo -archs "$OUT/vibespace-screen"), $(wc -c < "$OUT/vibespace-screen" | tr -d ' ') bytes, $KIND${TEAM:+ by team $TEAM}${NOTARIZED:+, notarized: $NOTARIZED}) in $(( $(date +%s) - t0 )) s — identity record $OUT/vibespace-screen.identity.json"
