# The artifacts model: a conversation's deliverables are DERIVED from what the product witnessed, never declared by the agent (lane artifacts-model, as-built)

Chinese original: docs/design-artifacts.zh.md (this is its twin).

## Why derived
- The owner's two rulings: (1) never depend on teaching the agent a tool — adoption forks the deliverables; (2) every deliverable is STORED and SHOWN one way.
- The real shape (a read-only study of a fleet user's 16 transcripts): the agent writes articles / briefs / reports as `.md` under the conversation's cwd with claude `Write`, then `Edit`s them; it names the file in its text only ~40 % of the time; 0 SendUserFile; half of all Writes are config / skills / code; the user reports her own edits by hand.
- So: the witness is the harness's WRITE RECORD, the noise is code, and the user's edit must reach the owning conversation without her typing it.

## The row (src/artifacts.js, PURE, imports only the ONE extension table src/file-type-table.js)
`{key: host+':'+path, host, path, name, kind, firstAt, lastAt, by: agent|user, writes, edits, lastOp, bytes, lastId}`.
- `kind` is closed: doc (markdown / text / rst / docx / pdf / csv) · page (html) · design · media (image / audio / video) · upload · code (source / config, and agent-steering markdown: CLAUDE.md / SKILL.md / AGENTS.md / `.claude/`…) · other (never a throw). en/zh/ja words in KIND_WORDS.
- THE reducer `apply / fold`: a Write births or re-births, an Edit bumps; the same path twice = one row; the same call twice (`lastId` — the parse and the device feed both see it) moves it once; a relative path is made absolute against the cwd; an Edit on a path never written here is still a row (by: agent).
- Bounds: ≤ 500 rows per conversation, the oldest code rows evicted first, every eviction returned and logged. `view(rows)` = the chip's order: doc › page › design › media › upload › other, newest change first, code folded behind a count.

## The hook (src/harnesses/)
Every descriptor declares `artifactsOf(record) → [{path, op: 'write'|'edit', bytes, id}] | []` (the readers: src/harnesses/artifacts-of.js):
- claude: an assistant record's tool_use Write (write) / Edit / MultiEdit / NotebookEdit (edit), `file_path` / `notebook_path`.
- codex: apply_patch — the custom_tool_call envelope (`*** Add File:` = write, `*** Update File:` = edit) or the live function_call's JSON `changes[]` (add / update); a FileChange item is the RESULT of the same call, never counted twice.
- ACP (opencode, …): a tool call's `diff` content (no oldText = a new file) and fs/write_text_file.
- shell: `null` = never produces. test-harness-contract proves each; nothing downstream branches on an id (§78's harness family does not rise).

## The registry + the replay
- The rows live on the live session (`session._artifacts`, a session-schema row, owner stdout), persist in session-meta `artifacts` (debounced 1.5 s like taskRecords) and are restored at both boot-restore sites.
- ONE writer, src/server/artifact-registry.js: `observe(session, record)`, called by every harness's stdout consumer (claude's parse AND the device feed's claudeSideEffects make the same call; codex-events; acp-events); it asks the session's descriptor hook.
- Rebuild: normalizers.convertWithCards' `opts.artifacts` (artifactDeriveOpts) derives the rows over the SAME records and places their cards (the hook has no afterRecord: the previous record folds before the next one); rebuildHistory merges with the persisted rows (the user's saves live only there) and every card says the merged counts. A history-only view (a dead session's transcript) derives them at the read. A restart loses nothing; a rebuilt chat shows the same cards.

## The surfaces
- **The card**: ONE per deliverable row (a system message, `noticeKind: 'artifact'`, id `{view id}:af:{hash of the key}`), born at the first write's position, PATCHED IN PLACE on every later write / edit (an `edit` op with content only, never re-created): "BRIEF.md · Changed 3 times · 2min ago". One click opens it in its kind's viewer beside the chat (`from` — the Cmd+click door, no Cmd). Code rows get no card.
- **The Artifacts chip**: a keyed chip `Artifacts · N` in the chat status bar (GET /api/artifacts = the server's `view(rows)` — the whole conversation, not the loaded slab); its popover lists documents first, code folded behind "Code (n)".
- **The user's own saves**: an editor window opened from a chat (openFile keeps `fromWin`) sends ONE ws `artifact-touch {sessionId, host, path, summary}` on save; the owning conversation's row gets `by: user, edits+1`, its card is patched, and the agent hears ONE next-turn note "[Doc edit] <path>: +a −b lines" (the stash — free, never a billed wake).
- **The setting** `artifacts.autoOpenDocs` (Chat, default ON): when the agent WRITES a new doc row while the chat is on screen it opens beside the chat; an Edit never re-opens; OFF = the card only.

## The contract toward doc-window (the sibling lane)
- `ownerOf({host, path}) → {sessionId, row} | null` — the newest conversation whose registry holds the path.
- `noteEdit({sessionId, host, path, summary})` — ONE next-turn note to that conversation through the stash: "[Doc edit] <path>: <summary>".
Both live in src/server/artifact-registry.js; their PURE halves in src/artifacts.js (ownerOfIn, editNoteText, lineDelta). The Doc window (lane doc-window, wired in lane artifacts-e2e — the stub deleted) opens `.md` and calls both: a save on a registry-owned row is `touch` (by: user, edits+1, the card patched, the note), a `from`-owned file gets the note alone; the note goes through the peer-text belt (the summary names the file's section headings). Other files' raw code editor save still sends `artifact-touch` with "+a −b lines".

## Not done / next
- Rows of kind published / design / upload are not yet imported from the existing registries (published-pages' onPublished, designs.json, chat uploads) through the same reducer — the reducer already takes a registry's `kind`; the Design window's Home and the Pages list are untouched.
