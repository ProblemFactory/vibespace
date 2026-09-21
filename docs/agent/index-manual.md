# VibeSpace agent tools — the index (`vibespace-docs`)

Six CLIs on your PATH. One-line teaching lives in your context injections;
each tool's FULL manual is one command away and always matches the running
server. `vibespace-docs <topic>` prints it.

| Topic | Tool | One line | Full manual |
|---|---|---|---|
| `status` | `vibespace-status` | your session's LIVE state on the board (working/needs-input/blocked/review/done) — set it the moment it changes | `vibespace-docs status` |
| `ask` | `vibespace-ask` | file things the USER must act on (decision/input/review) into their global For-you inbox; resolve when answered | `vibespace-docs ask` |
| `task` | `vibespace-task` | the Task Group memory: log finished work (progress), park deferred items (backlog), read shared group state | `vibespace-docs task` |
| `jobs` | `vibespace-job` | background work that OUTLIVES this conversation: services/long tasks/cron, auto-notify, subscriptions, panels | `vibespace-docs jobs` |
| `pages` | `vibespace-page` | host self-contained HTML on this VibeSpace with a share link; `kit` prepares the design-canvas kit (design requests from the chat status bar) | `vibespace-docs pages` |
| `exit` | `vibespace-exit` | borrow a paired machine's network for a single command (region/VPN/fixed-IP egress) | run `vibespace-exit` with no args |
| `window` | `vibespace-window` | a NATIVE app as a target: start it on a private display, read its accessibility tree with @refs, act on a node through its own declared action; only windows VibeSpace started — plus, behind the user's real-desktop switch, their own desktop's applications (marked YOUR DESKTOP, tree verbs only) | `vibespace-docs window` |
| `browser` | `agent-browser` (not ours) + `vibespace-browser` (named profiles, handles) | THIS session already has its own browser — its own tabs, its own daemon, ephemeral by default; never pass `--profile`/`--session`/`--namespace` | `vibespace-docs browser` |

## Which tool when

- Finished a piece of work → `vibespace-task progress` (group log) AND say it in chat.
- Waiting on the user / asked them something → `vibespace-status needs-input` + `vibespace-ask` (chat carries the full question; the inbox only notifies).
- User said "later" → `vibespace-task backlog-add` (never start parked items unasked).
- A process/schedule must survive this conversation → `vibespace-job` (never nohup/systemd/harness-cron).
- Turn-scoped waits → your harness's background Bash; in-session continuation → `/goal`.
- Need a native desktop app (not a web page) → `vibespace-window open <app>` then `snapshot` / `click @ref` (`vibespace-docs window`); pixels are the fallback, a node without an action is refused, never faked; YOUR DESKTOP rows (the user's switch) allow tree verbs only.
- Need a web page → `agent-browser` as usual; it is already isolated to this session, so `close --all` is safe and a login you perform does not survive (`vibespace-docs browser`).

## Shared rules

- All tools authenticate via your session env — never pass tokens on argv.
- Anything the USER needs must be in your CHAT REPLY too; tool writes are for
  the board/other agents, not a substitute for telling the human.
- IDs you cannot see behave as nonexistent (uniform not-found, no oracle).

- **vibespace-msg** — message other agent sessions (Task-Group scoped reach; `vibespace-docs msg`).
- **vibespace-channels** — read the external channels (Lark, Gmail, other agents) the user let you see and PROPOSE replies the user approves (`vibespace-docs channels`).
