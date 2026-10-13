# Vendored API catalogues (build-time input of scripts/gen-api-call-words.mjs)

Public documents published by each vendor, copied verbatim so the tree builds the API-call words with no network.
`SHA256SUMS` pins every file; the generator refuses a file that does not match. To refresh, the OWNER runs
`scripts/api-specs/fetch.sh` (never CI, never a test), re-runs `node scripts/gen-api-call-words.mjs`, and commits the
specs, `SHA256SUMS` and `src/api-call-words.generated.js` together (test-api-call-words pins the coverage numbers and
the missing-word count, so a refresh shows what it moved).

| File | Source | Licence / terms |
|---|---|---|
| slack-web-openapi-v2.json | Slack Web API OpenAPI 2.0 — https://api.slack.com/specs/openapi/v2/slack_web.json (also github.com/slackapi/slack-api-specs) | © Slack Technologies; slack-api-specs is MIT-licensed |
| gmail-v1-discovery.json | Gmail API discovery document — https://gmail.googleapis.com/$discovery/rest?version=v1 (revision 20261005) | © Google LLC; published discovery documents (Google APIs Terms of Service) |
| lark-go/<svc>-<ver>.api.go | Lark / Feishu Go SDK generated method tables — github.com/larksuite/oapi-sdk-go `service/<svc>/<ver>/api.go` (docx v1, im v1, drive v1, bitable v1, calendar v4, contact v3) | © Lark Technologies; oapi-sdk-go is MIT-licensed |

Only method names, HTTP methods and paths are read (plus Slack's `channel` parameter); no vendor text is shown to users.
