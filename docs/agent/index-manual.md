# VibeSpace agent tools — the index (`vibespace-docs`)

The CLIs on your PATH. One-line teaching lives in your context injections;
each tool's FULL manual is one command away and always matches the running
server. `vibespace-docs <topic>` prints it.

<!-- cli-registry:index — generated from src/agent-cli-registry.js renderIndex(); edit the rows, then run node scripts/test-cli-registry.mjs --write-index -->
| Topic | Tool | One line | Full manual |
|---|---|---|---|
| `status` | `vibespace-status` | your session's LIVE state on the user's board (working / needs-input / blocked / review / done), set the moment it changes | `vibespace-docs status` |
| `ask` | `vibespace-ask` | file what the USER must act on into their For you tray (bottom right, never "your inbox"); resolve it when they answer | `vibespace-docs ask` |
| `task` | `vibespace-task` | the Task Group's memory: log finished work (progress), park deferred items (backlog), read the group's shared state | `vibespace-docs task` |
| `jobs` | `vibespace-job` | background work that OUTLIVES this conversation (a service, a long run, a schedule); you are notified when it ends | `vibespace-docs jobs` |
| `channels` | `vibespace-channels` | the mail, chats and threads the user connected and lets you see: list, search, read; a reply is a proposal the user approves | `vibespace-docs channels` |
| `msg` | `vibespace-msg` | message other agent sessions in explicit groups (a direct message = a two-member group); next turn is free, a wake is billed | `vibespace-docs msg` |
| `feedback` | `vibespace-feedback` | tell the maintainers what felt wrong (a command, a flow, a screen, a manual); the user reads every report in the ⚙ menu | `vibespace-docs feedback` |
| `pages` | `vibespace-page` | host a self-contained HTML page on this VibeSpace behind a share link (a design the user asked for: vibespace-design) | `vibespace-docs pages` |
| `design` | `vibespace-design` | designs, mockups, screens: HTML artboards the user watches live in the Design window; its manual carries the craft rules | `vibespace-docs design` |
| `exit` | `vibespace-exit` | borrow a paired machine's network for one command, or run a command ON it: only machines the user opened to you | `vibespace-docs exit` |
| `remote` | `vibespace-remote` | what this VibeSpace did on its paired machines because YOU asked: each act, its verdict, who asked | `vibespace-docs remote` |
| `window` | `vibespace-window` | a NATIVE app window the user shared with you (or you opened) as a target: accessibility tree + @refs, or pixels | `vibespace-docs window` |
| `browser` | `vibespace-browser` | THE browser tool: open / snapshot / click @ref / fill in THIS conversation's own browser, shown live to the user | `vibespace-docs browser` |
| `apps` | `vibespace-app` | apps that survive the machine's rebuild: search, then PROPOSE an install or a removal (the user installs) | `vibespace-docs apps` |
| `vault` | `vibespace-vault` | state, lock, mint/put, run with a secret you never see, request one, your uses (locked ⇒ the user is told; never ask them to unlock) | `vibespace-docs vault` |
| `api` | `vibespace-api` | VibeSpace's own automation verbs (rename a conversation, …) through keys the user GRANTED this conversation — never a key's value | `vibespace-docs api` |
| `index` | `vibespace-docs` | this list; `vibespace-docs <topic>` prints one tool's full manual, always matching the running server | `vibespace-docs` |

`vibespace-docs <topic>` prints one manual (`app` = `apps`); `vibespace-docs` alone prints this index. Every tool prints its own usage when run with no arguments.
<!-- /cli-registry:index -->

## Which tool when

- Finished a piece of work → `vibespace-task progress` (group log) AND say it in chat.
- Waiting on the user / asked them something → `vibespace-status needs-input` + `vibespace-ask` (chat carries the full question; the For you tray only notifies).
- User said "later" → `vibespace-task backlog-add` (never start parked items unasked).
- A process/schedule must survive this conversation → `vibespace-job` (never nohup/systemd/harness-cron).
- Turn-scoped waits → your harness's background Bash; in-session continuation → `/goal`.
- Need a native desktop app (not a web page) → `vibespace-window list` (windows the user shared with you) or `vibespace-window open <app>`, then `snapshot` / `click @ref` — or, in pixel mode, `screenshot` / `click --at x,y` (`vibespace-docs window`); `not_exposed` = not shared with you: ask the user; a node without an action is refused, never faked; YOUR DESKTOP rows (the user's switch) allow tree verbs only.
- Asked for a design, a mockup or screens → `vibespace-docs design` (the CLI and the craft rules), then `vibespace-design new <slug>`; every screen is a plain HTML file the user watches in the Design window.
- Need a web page → `vibespace-browser open <url>`, then `snapshot` and `click @ref` / `fill @ref "…"`; the browser is this conversation's own, so `close --all` is safe, and a login you perform does not survive — `vibespace-browser new <label>` + `use <label>` for one that does (`vibespace-docs browser`).

## Shared rules

- All tools authenticate via your session env — never pass tokens on argv.
- Anything the USER needs must be in your CHAT REPLY too; tool writes are for
  the board/other agents, not a substitute for telling the human.
- IDs you cannot see behave as nonexistent (uniform not-found, no oracle).
- Files you create or change with your file tools (Write / Edit … — your harness's own write tools)
  are collected into this conversation's Artifacts (a card in chat + the Artifacts list; Markdown opens in the Doc window).
  Shell redirection (`cat >`, heredocs, scripts) is NOT collected — use the file tools for anything the user should find later.
