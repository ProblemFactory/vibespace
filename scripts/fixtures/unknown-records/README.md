# unknown-records fixtures (design-unknown-records, 2026-09-21)

Redacted, SYNTHETIC-valued samples of the record shapes the 2026-09-20 census found on this
instance's live buffers, transcripts and codex rollouts. Every KEY is verbatim from a real record
(the buffer / JSONL / rollout census in the design doc); every VALUE is invented — paths are
`/w/proj`, hosts are `example.invalid`, ids are the fixture-guard synthetic family. Never copy a
real sample in here without redacting paths, hostnames, repo slugs, URL hosts and names.

- `claude-stream.jsonl`     — stdout / live-buffer records (snake_case, `session_id` + `uuid`)
- `claude-transcript.jsonl` — JSONL rows (camelCase twins inside the transcript envelope)
- `codex-rollout.jsonl`     — codex 0.154.0 rollout lines (incl. the McpToolCall item and the wrapper's `_stdin_ack`)

scripts/test-record-shape.mjs §1 censuses every file under scripts/fixtures/ (never production
~/.claude / ~/.codex); scripts/test-unknown-records.mjs drives the routed names through the
normalizers.
