# vibespace-channels — reading connected channels and PROPOSING replies (Communication panel)

The user has connected external channels (Lark/Feishu chats, Gmail threads,
other agent sessions through the built-in Agents adapter) to this VibeSpace.
This tool lets you READ the conversations the user let you see and PROPOSE
replies. It never sends by itself: every reply is a proposal that the
channel's policy either sends directly or hands to the user to approve,
edit or reject. This is the opposite of `vibespace-msg send`, which DELIVERS
a message to another agent session now — one verb per authority semantics.

## Commands

```
vibespace-channels list                          # conversations visible to you
vibespace-channels read <conv> [--limit N] [--since <ms>] [--fresh]
vibespace-channels refresh <conv>                # fetch the newest messages NOW (a floor applies)
vibespace-channels reply <conv> "text" [--why "…"] [--reply-to <vendor msg id>] [--replaces <proposalId>]
vibespace-channels compose <account> --to <addr>[,<addr>] [--cc <addr>] --subject "…" "text" [--why "…"] [--replaces <proposalId>]
                                                 # PROPOSE a NEW message (needs access to the whole account)
vibespace-channels withdraw <proposalId> [--why "…"]
                                                 # take back YOUR proposal the user has not decided yet
vibespace-channels search "words" [--account <id>] [--limit N]
                                                 # messages you can see (the stored logs)
vibespace-channels status [<proposalId>]         # what you were given (access / notification) + your proposals
vibespace-channels request <conv> "why"          # ask for access (requestable rows only)
```

`<conv>` is the key `list` prints: `<adapter>/<conversation id>`.

Everything you read or draft here is shown to the user as a clickable card in the chat — you never need to tell them where.

## Freshness (how new is what I read?)

- The user's connected accounts are fetched WHOLE and all the time — every
  conversation, on its own cadence: about every 30 s while it is busy (a
  message in the last hour, or open in the user's window), every 5 min when
  it had a message in the last day, every 15 min otherwise. The user can set
  any conversation's period (30 s … 15 min, or paused). `read` prints when
  the conversation was last fetched.
- Need something newer right now? `vibespace-channels refresh <conv>` (or
  `read <conv> --fresh`) asks the channel immediately. It is NOT a polling
  tool: a conversation fetched in the last 20 s (the user's setting) is
  refused with the wait (`refresh-floor`, exit 4) — read what is there —
  and every refresh spends the account's per-minute vendor budget, which is
  refused by name when it is spent (`vendor-budget`, exit 4). Agents together
  may use only a share of each minute (25 % by default, the user's setting)
  so the user's own conversations keep refreshing — past it the refusal is
  the same `vendor-budget`, naming the share and the wait. While the vendor
  is rate-limiting the account (a 429 put it into a back-off), `refresh` is
  refused with the wait (`backoff`, exit 4) and makes no call — the account
  retries by itself. Your refresh is a request the account's own fetch loop
  judges: many refreshes of one conversation at once are ONE fetch, and more
  than 180 waiting on an account is refused (`refresh-queue-full`, exit 4;
  the last 20 slots are the user's own) — read what is there instead. Every
  answer comes the moment it exists: a refusal when it is judged, `refreshed`
  when YOUR conversation's fetch lands (never at the end of the account's
  whole poll); "still running" means the fetch itself has not happened
  within 15 s (a slow vendor) — read in a moment. Never loop on
  refresh; if you need to react to new messages, ask the user to NOTIFY you
  about the conversation (you are woken when they arrive).
- Attachments are listed under each message (name, type, size). Images and
  files are fetched only when the user opens them in the panel.

## Access and notification (what can I see, and what wakes me?)

The user gives you two DIFFERENT things, in this order:

1. **Access** — you may see and act: list, read, search, refresh, reply (and
   `compose` a new message on an account you have whole), with an
   **authority**: `drafts` (the user approves every send) or `may send`
   (directly, where the channel's policy allows it). Access alone NEVER wakes
   you — nothing is billed on your behalf; you read when you choose.
2. **Notification** — only on top of access: you are WOKEN (a billed turn)
   when new messages arrive — per batch (`wake`) or one digest per window —
   on every message or on a filter, at most N times a day.

- Everything is HIDDEN by default. Access comes at three grains: a whole
  ACCOUNT, the conversations matching a RULE (a title keyword, a person, an
  address or domain, a kind), or ONE conversation — for you or for a Task
  Group you are in — or from a hand-written grant, or by approving one of your
  requests. The finest grain that names you decides (a conversation's own row
  over a rule over the account).
- `status` prints each grain you were given: its authority, and either how you
  are notified or `not notified — nothing wakes you; read when you choose`.
  `list` shows the same two facts per row: `access via the whole account
  (drafts)` and `notifies you: wake on a filter` / `no notification`.
- A wake block says why it is here ("you are watching the whole account" /
  "by a rule: …") and names the OTHER agents on the conversation ("also on
  this conversation: B (digest, drafts), 工作 (access only, drafts)") — when
  someone else is woken too, coordinate instead of both answering. A digest
  for a whole account or rule lists several conversations in ONE block.
- A row marked `requestable` is one you may ASK for: `vibespace-channels
  request <conv> "why"` files ONE item in the user's For you tray (bottom right) with your
  reason; approval grants YOU visibility on that ONE conversation and
  touches no group default.
- Uniform errors: a conversation you cannot see and one that does not exist
  give the same `not-found` answer. You cannot widen your own reach — ask
  the user.
- The built-in Agents adapter's conversations are other agent sessions; the
  reach there is the same Task-Group ACL `vibespace-msg list` shows.

## Replying (READ THIS)

- `reply` creates a PROPOSAL. It prints the policy verdict: `sends directly`
  (the channel's policy is direct AND you hold `send` authority AND no guard
  applies) or `awaiting the user's approval`.
- Guards that ALWAYS force approval, whatever the policy: a link in the
  text, an attachment, outside the user's configured working hours. An
  assignment that gave you only `draft` authority also forces approval.
- The user may EDIT your text before sending, or REJECT it with a reason.
  A proposal nobody decides on EXPIRES after 24 h.
- Changed your mind? `withdraw <proposalId>` takes back a proposal of YOURS
  while it still awaits the user (their approval card disappears); `reply …
  --replaces <proposalId>` / `compose … --replaces <proposalId>` withdraws it
  and proposes the new text in one step — the old one goes only if the new one
  is accepted. Never leave the user a stale draft to reject. Somebody else's
  proposal answers `not-yours`; one already decided, being sent or of unknown
  outcome answers `not-withdrawable`.
- On a conversation where sending is not available (a read-only mailbox, a
  chat the user left, an adapter with no send permission yet — a Gmail account
  whose sign-in predates the drafts + sending permission answers
  `send-scope-not-granted` until the user re-authorizes it) `reply`
  answers `send-not-available` with the reason and creates NO proposal —
  do not draft again until the user changes that.
- A reply that goes DIRECTLY to another agent session (the built-in `agents/…`
  conversations) wakes that agent — a billed turn — so it is paced like your
  group wakes (one per target per 30 s, 8 per minute): past that it answers
  `rate-floor` and NOTHING is sent. Prefer `vibespace-msg send` (free on the
  receiver's next turn) unless the agent must act now.
- The `--why` reference (an alert, a task, a message id) is shown on the
  approval card so the user knows what prompted the reply. Keep the text
  final: the recipient reads exactly what the user approves.

## Composing a NEW message (`compose`)

- `compose <account> --to a@x.com[,b@y.com] [--cc c@z.com] --subject "…" "text"`
- To and Cc only: a `bcc` or a reply target on a NEW message is refused by name (`bad-proposal`, `why: bcc|replyTo`) — every recipient of a composed message is visible.
  starts a NEW conversation (a new email thread) on an account you have access
  to AS A WHOLE (`status` lists it as "the whole account"). It is a PROPOSAL
  exactly like `reply`: the account's policy decides (review by default), a
  link or an attachment always needs the user, `drafts` authority always needs
  the user. Plain addresses only (no "Name <addr>").
- An account whose channel cannot start a conversation (Lark) answers
  `compose-not-available` — reply inside an existing conversation instead. An
  account without the send permission answers `send-not-available`
  (`send-scope-not-granted`) and nothing is created. (A Gmail sign-in that was
  granted the older send-only permission can still compose but not reply —
  `status` / `list` show which; the user re-authorizes to allow both.)
- The receipt names the new thread; the conversation appears in `list` once the
  account's next pass sees it (an answer to it arrives in the inbox).

## Searching (`search`)

- `search "words" [--account <id>]` searches the stored messages of the
  conversations you can SEE — nothing else is read, and a hit in a
  conversation you cannot see simply is not there. No vendor call; at least 2
  characters.

## Receipts

- Every proposal ends with a receipt: `sent`, `edited` (the user changed
  the text — the receipt shows WHAT changed as a line diff, `-` what you
  proposed / `+` what the user sent; the whole final text is in `status
  <id>`), `rejected` (with the reason), `expired`, `failed` (with the
  adapter's reason, e.g. the conversation no longer accepts messages), or
  `withdrawn` (you took it back). An edit or a rejection with a reason is the
  user's feedback on how to write: use it for the next draft.
- The receipt says WHO the other side saw: `sentAs` (user or bot) and the
  identity marking — `none` means the recipient sees the user with no
  application marker; `marked` means the channel shows an application /
  bot marker (the exact sentence is included); `unknown` means this has
  not been verified for that channel yet. Do not claim in chat that a
  message "looks like it came from the user" unless the receipt says `none`.
- Receipts arrive in your NEXT turn as a "Channel receipt" block — unless
  the user chose "wake the agent now" on that Approve / Reject (a turn
  started for you). Poll with `status` only when you need the answer now.
- An `unknown` outcome (the adapter lost the result) is NEVER retried
  automatically; the user is asked to check the platform. Do not re-propose
  the same text — a duplicate in someone else's room is worse than waiting.
- The user can press "Check outcome" on an `unknown` card: the adapter is
  asked whether the lost send landed and the proposal settles to `sent` or
  `failed` (the receipt then carries `reconciled: true`). The machine never
  re-sends on its own; a channel without an idempotency mechanism cannot be
  checked at all and the card says so.
- The sender honesty line (a trailing "— drafted by <agent>, an AI agent,
  via VibeSpace") is OFF by default and a per-channel option. When the user
  turned it on, the approval card says so BEFORE approving and the receipt
  carries `honestyLine: true`. It applies only to text an agent drafted —
  never to the user's own drafts.

## Cost + etiquette

- A message you propose is sent under the USER's name on channels that
  allow it. Draft as the user would write; never add "drafted by an agent"
  yourself — the audit log on this instance records that you drafted it,
  the recipient's message does not.
- Reading is free; a proposal costs the user attention. Batch related
  points into one reply.
- 16 KB text cap.
