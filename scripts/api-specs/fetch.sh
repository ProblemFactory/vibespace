#!/bin/bash
# fetch.sh — the OWNER's refresh of the vendored API catalogues (scripts/api-specs/SOURCES.md). NEVER run in CI or a
# test: the build and every suite read the committed copies only. After it: node scripts/gen-api-call-words.mjs, then
# commit the specs + SHA256SUMS + src/api-call-words.generated.js together.
#   LARK_REF=<tag or sha of github.com/larksuite/oapi-sdk-go> scripts/api-specs/fetch.sh
set -euo pipefail
cd "$(dirname "$0")"
LARK_REF=${LARK_REF:?set LARK_REF to the oapi-sdk-go tag / sha to vendor}
curl -fsSL -o slack-web-openapi-v2.json https://api.slack.com/specs/openapi/v2/slack_web.json
curl -fsSL -o gmail-v1-discovery.json 'https://gmail.googleapis.com/$discovery/rest?version=v1'
for sv in docx/v1 im/v1 drive/v1 bitable/v1 calendar/v4 contact/v3; do
  curl -fsSL -o "lark-go/${sv%/*}-${sv#*/}.api.go" "https://raw.githubusercontent.com/larksuite/oapi-sdk-go/${LARK_REF}/service/${sv}/api.go"
done
sha256sum slack-web-openapi-v2.json gmail-v1-discovery.json lark-go/*.api.go > SHA256SUMS
cat SHA256SUMS
