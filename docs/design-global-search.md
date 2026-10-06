# Global search — as built (lane global-search, 2.369.221)

The ask (a fleet user via the owner, 2026-10-05): search what was SAID in every conversation and what was MADE (artifacts). The storage ruling (design 011, 2026-10-03): SQLite only as a REBUILDABLE INDEX on LOCAL DISK (`~/.vibespace/db/<hash>/`), node:sqlite only inside a worker, Node floor 22.16.

## Measurements

- Owner's box (node 24 `node:sqlite` FTS5): the 40 largest Claude transcripts = 2 845 MB of JSONL hold 42 MB of user/assistant text (1.5 %); an FTS5 index builds in 16–24 s (disk-bound, 119 MB/s); queries < 5 ms.
- FTS5 `trigram` cannot answer a 2-character Chinese query ("限额" → 0 rows) and its index was 862 % of the text. unicode61 + our CJK bigrams answers "限额" (175), "限额 Gmail" (8), `unresp*` (27) in ≤ 1 ms at 381 % of the text.
- Lane fixture (scripts/test-global-search.mjs §4, 3 000 messages of mixed CJK/Latin text): 0.82 MB indexed text → 1.90 MB index = **232 %** (detail=full; the bound is 6×); the worker read 2.31 MB of JSONL through the claude descriptor's reader + normalizer in 86 ms (**≈ 27 MB/s**, parse-bound: the registry's normalizer, not a raw line scan).

## As built

- `src/search-model.js` (PURE rules), `src/search-index-worker.js` (the db + every parse), `src/server/search-index.js` (ORCH: backfill / live / artifacts / routes), `src/lib/search-window.js` (the window). See docs/kb-file-structure.md for the contract of each.
- Harness-neutral: a conversation is `{sid, backend, cwd, host}`; the worker reads it through its descriptor's `store.locate` / `store.createReader` and the registry's `createMessageManager`. Card ids are `<session>:<record key>` and the record key is identical live and in history, so a live append and a later backfill of the same card are one row (UNIQUE(host, sid, mid)).
- Deviations: (1) "Clear content…" (src/server/record-clear.js) has no conversation kind (its five kinds are activity / todo / status / job / group-message), so the index is declared in test-record-clear-census's EXCEPTIONS as a transcript-class copy (delivered words stay in the transcript and the index re-derives from it); `clearConversation` exists for a gone transcript. (2) The reader's head+tail windows (32 MB each) bound what a huge transcript contributes; the elided middle is the next step. (3) `search.indexToolOutputs` is not declared (a declared-but-unbuilt row would be a lie in Settings) — the next step.
