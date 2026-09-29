# vibespace-channels — reading connected channels and PROPOSING replies (Communication panel)

The user has connected external channels (Lark/Feishu chats, Gmail threads,
other agent sessions through the built-in Agents adapter) to this VibeSpace.
Lark SINGLE chats appear in `list` once the account's new-message search finds
them (they are hidden from you unless the user granted you the whole account
or that chat).
This tool lets you READ the conversations the user let you see and PROPOSE
replies. It never sends by itself: every reply is a proposal that the
channel's policy either sends directly or hands to the user to approve,
edit or reject. This is the opposite of `vibespace-msg send`, which DELIVERS
a message to another agent session now — one verb per authority semantics.

## Commands

```
vibespace-channels list                          # conversations visible to you
vibespace-channels read <conv> [--limit N] [--since <ms>] [--fresh] [--thread <msg id>]
vibespace-channels refresh <conv> [--thread <msg id>]
                                                 # fetch the newest messages NOW (a floor applies); --thread loads that thread
vibespace-channels reply <conv> "text" [--why "…"] [--to <vendor msg id> [--in-thread] [--also-in-chat]] [--replaces <proposalId>]
                                                 # PROPOSE a reply; --to = the message it answers (WHERE it lands: see "Where a reply lands")
vibespace-channels react <conv> <msg id> <emoji key> [--why "…"]
vibespace-channels unreact <conv> <msg id> <emoji key> [--why "…"]
                                                 # PROPOSE a reaction (the user approves it unless the account's policy is direct)
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

## Threads and reactions (what `read` shows)

`read` prints each message's PLACE and its REACTIONS:

```
lark-1/oc_x — Weekly sync · fetched 2 min ago · 7 message(s)
[10:02] A: When is the weekly now?  (id om_x1)  [thread omt_t1 · 3 replies · last 5 min ago]
    reactions: 👍 3 · 🎉 1
[10:05] B: At three  (id om_x2)
    ↳ replying to A: "When is the weekly now?" (id om_x1) · in thread omt_t1
[10:07] C: Three works  (id om_x3)
    ↳ quotes B: "At three" (id om_x2) · in thread omt_t1
[10:09] me: Three it is  (id om_x4)
    ↳ replying to A: "When is the weekly now?" (id om_x1) · in thread omt_t1
    reactions: 👍 1 (the account owner)
[10:12] D: Agreed with the old plan  (id om_x5)
    ↳ quotes C: "Ship on Friday" (id om_x0)
```

- A message sits in one of two places. Inside a THREAD (a Lark topic — a
  topic group's message, or a reply made in the thread; a Slack thread): its
  line ends `· in thread <key>`, and the thread's ROOT carries `[thread <key> ·
  N replies · last …]` on its own line. Or in the conversation itself — and a
  message there that answers another is a QUOTE (a Lark reply made without
  "reply in thread", a Telegram reply): `↳ quotes <author>: "<quote>" (id …)`,
  never "in thread". A quote has no thread to read or load.
- `↳ replying to <author>: "<quote>" (id …) · in thread <key>` = a reply
  inside a thread (to its root); `↳ quotes … · in thread <key>` = a reply
  inside a thread that answers another of its replies. `… a message not
  loaded (id …)` when the answered message is older than what is stored.
- `read <conv> --thread <msg id>` = that thread only: its root and replies,
  from what is stored. It NEVER asks the channel: a thread whose replies are
  not listed with the conversation (a Lark topic) and was never loaded here
  answers `walked: false` and the line `(thread not loaded here — the user's
  window loads it; ask again after)`. `refresh <conv> --thread <msg id>` is
  the ONLY way you load one — its per-thread floor (60 s), the agents' share
  of the account's budget and the vendor back-off refuse by name (exit 4).
  Asked about a QUOTE, both answer `not-a-thread` ("that message is not in a
  thread — a quoted reply and the message it quotes are both shown in the
  conversation itself"): `read <conv>` shows it, and nothing is fetched.
- **You never see WHO reacted** — only how many, per emoji, and whether one
  of them is the user's own (`(the account owner)`). An emoji the channel's
  vocabulary has no picture for is written `:key:`.
- A reply to a message YOU sent, or a message in a thread you are in, reaches
  you like any other message: on your next read, or — only if the user added a
  `replies to or quotes a message of mine` / `is in a thread I am in, or quotes
  a message of mine` rule to a Notify… of yours — as a wake. A "thread" there
  is a real thread (a Lark topic): a chain of quotes never wakes you as a
  thread, but a QUOTE of your message (or the user's) does — the wake says
  `quoted your message`; a reply inside a thread says `in a thread you are in`
  or `a reply to a message of yours`. Reactions NEVER wake you: reactions on a message you sent
  arrive as ONE line in your next turn (`👍 ×3 · 🎉 ×1 on your reply in
  <conversation>`, at most one per message per hour).

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
- `--reply-to <id>` must be a message OF THAT conversation, as `read <conv>`
  lists it — an id of any other conversation (or one not stored yet) is
  refused (`bad-proposal`, `why: reply-anchor`) and nothing is created. The
  card shows the user which message the reply answers.
- Mail: who a reply goes to (To / Cc / Subject) is fixed WHEN YOU PROPOSE —
  from the message it answers (`--reply-to`, else the thread's newest stored
  message) — shown on the card and sent to exactly those; a message arriving
  later never re-targets it.
- Invisible direction / zero-width characters (U+202A–E, U+2066–9, U+200E/F,
  U+061C, U+200B, U+2060, U+FEFF) are refused in a recipient, a subject and
  `--reply-to` (`bad-proposal`, named); in the text they are shown to the
  user as visible marks.

## Where a reply lands (`--to` / `--in-thread` / `--also-in-chat`)

A reply's PLACEMENT is one of four, and each channel offers only some:

| placement | what the other side sees | flags |
|---|---|---|
| chat | a plain message in the conversation | (no `--to`) |
| quote | an answer to that message, shown in the main list | `--to <id>` where it is the channel's norm |
| thread | an answer inside that message's thread (a message in no thread yet — a plain one, a quote — gets a new thread started on it) | `--to <id> --in-thread` |
| thread+chat | inside the thread AND shown in the conversation | `--to <id> --also-in-chat` |

- `--to <id>` ALONE follows the channel's own habit: a message that is
  already inside a thread is answered in that thread (it cannot be quoted
  from the main list); a message outside any thread is answered the channel's
  usual way — Lark, Telegram and Gmail QUOTE it, Slack puts it in a thread.
  The CLI prints where it landed and why: `(lands in a thread, answering om_x2
  — thread omt_t1 — the default: that message is already in a thread)`.
- Lark offers chat, quote and thread (no thread+chat); Gmail chat and quote
  (the mail thread IS the conversation); the built-in agents conversations
  chat only (no `--to`).
- A placement the channel does not offer is REFUSED before anything is drafted
  — `placement-not-offered`, with what the channel does offer ("…is not offered
  on this channel — offered here: chat, quote, thread") and, on the next line, the
  flags that ask for each ("ask for what is offered with: chat: leave out --to ·
  quote: --to <msg id> · thread: --to <msg id> --in-thread"); quoting a message
  that sits inside a thread is refused the same way (`why: parent-in-thread`).
  Nothing waits for the user: pick an offered placement and reply again.
- The approval card says the placement ("Quoted reply — to <author>: …",
  "Reply in thread — under <author>: …"), and the receipt in your next turn
  names it ("placed in a thread (thread omt_…)").
- A group that forbids replies in threads answers `topic-forbidden` — reply
  in the conversation instead. `--reply-to <id>` is the old name of `--to`,
  and `--in-thread <id>` without `--to` still names the message.

## Reacting (`react` / `unreact`)

- A reaction is proposed like a reply — the user approves it, unless the
  account's reaction policy is direct (then the channel's own verdict
  applies: direct only where the channel's policy is direct AND you hold
  `send` authority). It speaks in the USER's name on someone else's message.
- `react <conv> <msg id> <emoji key>` — the key is the channel's own name for
  the emoji (Lark: `THUMBSUP`, `OK`, `DONE`, …; the ones `read` shows as
  `:key:` are keys too). `unreact` removes the USER's reaction with that key.
- Refusals (exit 4, nothing is created): `react-not-available` with a why —
  `policy-off` (the user turned agent reactions off for this account),
  `not-a-member`, `read-only-adapter`, `no-reactions`; `bad-emoji` (a key the
  channel does not allow); `already-reacted` (the user already reacted with
  it); `reaction-not-mine` (there is no reaction of the user's with that key to
  remove). The same reaction already awaiting the user answers that proposal
  again (`already proposed`).
- No text, no edit, never a wake: the receipt is ONE line in your next turn —
  `reaction 👍 on om_x1: sent` / `rejected`. Never propose the same reaction
  twice.

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
- If the user removes your access to a conversation, a proposal you made there
  still ends with a receipt — but it says only its fate (`SENT`, `REJECTED`, …)
  and that you no longer have access; `status` shows those proposals the same
  way. Nothing else from that conversation reaches you after the removal —
  a request of yours that was still waiting (a refresh, a thread load, a draft)
  gets the same "not found" as a conversation you cannot see.
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
