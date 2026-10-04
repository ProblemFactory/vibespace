# VibeSpace agent tools — the index (`vibespace-docs`)

The CLIs on your PATH. One-line teaching lives in your context injections;
each tool's FULL manual is one command away and always matches the running
server. `vibespace-docs <topic>` prints it.

| Topic | Tool | One line | Full manual |
|---|---|---|---|
| `status` | `vibespace-status` | your session's LIVE state on the board (working/needs-input/blocked/review/done) — set it the moment it changes | `vibespace-docs status` |
| `ask` | `vibespace-ask` | file things the USER must act on (decision/input/review) into their For you tray (bottom right of their screen — call it that, never "your inbox"); resolve when answered | `vibespace-docs ask` |
| `task` | `vibespace-task` | the Task Group memory: log finished work (progress), park deferred items (backlog), read shared group state | `vibespace-docs task` |
| `jobs` | `vibespace-job` | background work that OUTLIVES this conversation: services/long tasks/cron, auto-notify, subscriptions, panels | `vibespace-docs jobs` |
| `pages` | `vibespace-page` | host self-contained HTML on this VibeSpace with a share link (a design the user asked for: `vibespace-design`, below) | `vibespace-docs pages` |
| `design` | `vibespace-design` | designs, mockups, screens: plain-HTML artboards in a folder of this conversation, shown live in the user's Design window; their comments reach you as `[Design comment]` messages, a batch of their edits as ONE `[Design changes]` message; `publish` makes one shareable page (asks first) — the manual carries the craft rules too | `vibespace-docs design` |
| `exit` | `vibespace-exit` | borrow a paired machine's network for a single command (region/VPN/fixed-IP egress), or run a command ON it (as the machine's user, ≤ 30 s; the MACHINE picks the shell — cmd.exe on Windows, sh elsewhere) — only machines the user opened to THIS conversation (`list` says network yes/no · commands yes/ask/no; "ask" waits ≤ 60 s for the user's Allow); a refusal names what is missing and that the user can allow it under "Who can use it"; a command that could not start says why; `runs` lists your own runs with their output heads; `pull` / `push` copy ONE file between it and here under the same grant (no shell, sha256-checked, ≤ the user's bound, default 1 GiB); Background Work jobs cannot use exits | `vibespace-docs exit` |
| `window` | `vibespace-window` | a NATIVE app as a target: only the windows the user SHARED with you (or you opened with `open`) — the user's shared browser included; each shared in TREE mode (accessibility tree + @refs) or PIXEL mode (screenshot + click --at / type / key / scroll); plus, behind the user's real-desktop switch, their own desktop's applications (marked YOUR DESKTOP, tree verbs only) | `vibespace-docs window` |
| `browser` | `vibespace-browser` | THE browser tool: every page verb (`open` / `snapshot` / `click @ref` / `fill` …) runs in THIS conversation's own browser (ephemeral, watched, shown live to the user); named profiles + handles for logins that survive; raw CDP / identity flags refused by name | `vibespace-docs browser` |
| `apps` | `vibespace-app` | apps that survive the machine's rebuild: search / plan, then PROPOSE an install or a removal (one For-you item — the user installs; never `sudo apt install` an app to keep); `wait` reads the decision, an installed app opens with `vibespace-window open app.<entry>` | `vibespace-docs apps` |

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

- **vibespace-msg** — message other agent sessions in explicit GROUPS (a direct message = the pair's two-member group; each member's notify mode decides next-turn report vs a billed wake; Task-Group scoped reach; `vibespace-docs msg`).
- **vibespace-channels** — read the external channels (Lark, Gmail, other agents) the user let you see and PROPOSE replies the user approves (`vibespace-docs channels`).
