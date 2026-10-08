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
- **The card**: ONE per deliverable row (a system message, `noticeKind: 'artifact'`, id `{view id}:af:{hash of the key}`), placed at its own time (a live birth at the tail; a rebuild's card inside the loaded slab, or nowhere when the slab starts after it — the chip lists it), PATCHED IN PLACE on every later write / edit (an `edit` op with content only, never re-created): "BRIEF.md · Changed 3 times · 2min ago". One click opens it in its kind's viewer beside the chat (`from` — the Cmd+click door, no Cmd). Code rows get no card.
- **The Artifacts chip**: a keyed chip `Artifacts · N` in the chat status bar (GET /api/artifacts = the server's `view(rows)` — the whole conversation, not the loaded slab); its popover lists documents first, code folded behind "Code (n)".
- **The user's own saves**: an editor window opened from a chat (openFile keeps `fromWin`) sends ONE ws `artifact-touch {sessionId, host, path, summary}` on save; the owning conversation's row gets `by: user, edits+1`, its card is patched, and the agent hears ONE next-turn note "[Doc edit] <path>: +a −b lines" (the stash — free, never a billed wake).
- **The setting** `artifacts.autoOpenDocs` (Chat, default ON): when the agent WRITES a new doc row while the chat is on screen it opens beside the chat; an Edit never re-opens; OFF = the card only.

## The contract toward doc-window (the sibling lane)
- `ownerOf({host, path}) → {sessionId, row} | null` — the newest conversation whose registry holds the path.
- `noteEdit({sessionId, host, path, summary})` — ONE next-turn note to that conversation through the stash: "[Doc edit] <path>: <summary>".
Both live in src/server/artifact-registry.js; their PURE halves in src/artifacts.js (ownerOfIn, editNoteText, lineDelta). The Doc window (lane doc-window, wired in lane artifacts-e2e — the stub deleted) opens `.md` and calls both: a save on a registry-owned row is `touch` (by: user, edits+1, the card patched, the note), a `from`-owned file gets the note alone; the note goes through the peer-text belt (the summary names the file's section headings). Other files' raw code editor save still sends `artifact-touch` with "+a −b lines".

## The registries (as-built, lane artifacts-registries)
The three stores that already listed a conversation's things feed the ONE reducer — never a second list; the registry is a VIEW over them and each KEEPS its store and its own surface (the Pages list still reads published-pages.json, the Design window's Home still reads designs.json).
- **page** — src/server/published-pages.js `onPublished` (the ONE notify point: publish, re-publish, flags, unpublish) ⇒ server.js hands it to `artifact-registry.notePage` ⇒ a `page` row on the SOURCE file (key `host:srcPath`: a page published twice, or written by the agent and then published, is ONE row) carrying `url` = the /p/ link and `state` published | unpublished — an unpublish never deletes the row. The host is the srcKey's prefix only when the key IS `<host>:<srcPath>`.
- **design** — src/server/design-engine.js `onDesign` (its notify: registration, re-open, rename) ⇒ `noteDesign` ⇒ a `design` row per (conversation, folder), named by the registry's title.
- **upload** — the composer's attachments: chat-input → `uploadFilesBatched({sessionId})` → POST /api/upload's form names the chat ⇒ `noteUploads` ⇒ one `upload` row by: user per landed file (a file-explorer upload names no chat and feeds nothing).
- **The reducer** (src/artifacts.js): REG_OPS publish / unpublish / open / upload birth or name a row and never count as a write or an edit; KIND_RANK design › page › upload › an extension's kind (a published design stays a design; an uploaded file the agent edits stays an upload). `pageOp` / `designOp` / `uploadOp` / `storeRows` are the PURE store → op translators.
- **Replay** — a rebuild merges THREE inputs: the transcript's derivation ∪ the persisted rows ∪ `storeRows` (normalizers' store-rows seam, set by artifact-registry.configure: this conversation's pages + designs read back from their stores). The uploads have no other store: the persisted rows ARE the composer's attachment record. The merge keeps the later fact (a persisted unpublish over an older store record; a re-publish after it) and the higher-ranked kind.
- **The card** opens its kind's door through ONE function (ChatView._openArtifact — the chip's row and the card share it): a published page its /p/ link (app.openBrowser), a design the Design window (app.openDesign with this chat), everything else (an unpublished page, an upload) the file beside the chat. The meta line says Published / Unpublished / Attached by you.
- **Not done:** the view-only history of a dead conversation (ws-handler's read) derives the transcript rows only — no store rows there.

## Services (as-built, lane artifacts-services)
The owner looked for the latest page of a conversation whose site is SERVED by its own Background Work job — no published page, so the chip showed code only. A `service` row = a job this conversation OWNS (the owner-conversation lineage) that LISTENS on a TCP port:
- **The facts** — src/proc-listen.js reads the job's pid tree's listening port (/proc/net/tcp ∩ socket inodes; async, bounded, no exec) on the jobs engine's own 5 s sweep, ≤ once per job per 30 s; `job.listen` {port, firstAt, at} persists.
- **The row** — DERIVED at every read (src/artifacts.js `serviceRows`; the registry's `servicesOf`), never stored: {kind: service, jobId, name, port, url http://<instance host>:<port>/, since, state running | stopped, stoppedAt}; a stopped job's row stays 24 h greyed, then goes.
- **The card** — the jobs door (`_serviceDoor` → `noteService`) places it at the first listen and patches it in place; a click opens the Web view; ⋯ = copy URL / open in a new tab / show the job. The chip lists Services under their own head after the documents.

## Not done / next

## As built — a helper's deliverables (lane artifacts-handover, .224)
- **Subagents** — a parent record that ENDS a Task / workflow agent (its tool_result, a task-notification) names the agent's own transcript (`helperTranscriptsOf`, src/harnesses/helper-transcripts.js); its Write / Edit records go through the SAME `artifactsOf` and become the PARENT's rows with `via: {kind: subagent, name}` — card at the Task's end, the rebuild the same (replay parity). Before: 0 rows live, 0 at a rebuild (measured on a fixture).
- **Hand-over** — `vibespace-msg send <agent> "…" --artifact <path>…` (≤ 20; the message's reach; the helper's OWN rows only; same machine — never copied): the receiver's row `via: {kind: handover, from}` + its card "Handed over by …"; the helper's row `handedTo`. A design re-registers under the receiver and its Design window opens; `vibespace-design open --for <conversation>` = the same door.

## As built — the list at scale (lane artifacts-list-scale, design 021; .231)

Direction A built whole (E1–E9): the chip's popover is bounded to the room above the chip and scrolls under a sticky top bar — the filter (name · path tail · helper; `/` focuses, Esc clears then closes), group ▾ (by kind · helper · day) and sort ▾ (recently changed · name · times changed) remembered on this device, the count line ("43 artifacts · 174 code files"; "7 matches · 2 code" while filtering); the Recent band (5 newest of any kind, code included; hidden while filtering or under 8 rows); collapsible group heads (Code collapsed by default); rows "icon · name (the match marked) · kind · helper · changed N times · time · ⋯", keyed and patched in place. The ⋯: open beside · show in Files · copy path · open a hand-over's helper conversation; "open the helper's record" is absent (a subagent row names its helper but carries no transcript door). Phone: a bottom sheet. **Direction B built behind the button** (the owner: 「A思路可以，可以加上个按钮可以打开B」 — the desk's "not now" reversed): the popover's ⤢ opens the Artifacts window — a rail (all · kinds · helpers · recent, with counts) and a table (name · kind · helper · edits · last change · path) sortable by its column heads, the same filter, the same ⋯ — over the SAME PURE model (src/lib/artifacts-list-model.js), live with the conversation. C (filter only) not built.
