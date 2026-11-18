#!/bin/bash
# Claude Code external editor for WebUI — NO terminal output.
FILE="$1"
# B-3767: a fresh random name (a pid comes back, and an old signal left under it made Ctrl+G return at once)
SIGNAL="$(mktemp -u "${TMPDIR:-/tmp}/claude-webui-edit-signal-XXXXXXXXXX")" || SIGNAL="${TMPDIR:-/tmp}/claude-webui-edit-signal-$$-$RANDOM$RANDOM"   # never empty: an empty name would wait for ever
PORT="${CLAUDE_WEBUI_PORT:-3456}"
curl -sf -X POST "http://localhost:${PORT}/api/editor/open" \
  -H "Content-Type: application/json" \
  -d "{\"file\":\"$FILE\",\"signal\":\"$SIGNAL\"}" >/dev/null 2>&1 &
while [ ! -f "$SIGNAL" ]; do sleep 0.2; done
rm -f "$SIGNAL"
