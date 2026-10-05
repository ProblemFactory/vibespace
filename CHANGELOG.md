# Changelog

What changed for you, newest first. Engineers' notes: docs/changelog-engineering.md.

## 2.369.217 — 2026-10-05

### Fixed
- Opening a window that is already open on another desktop, like the Outbox, now takes you to that desktop.

## 2.369.216 — 2026-10-05

### Changed
- Channels: the Lark and Gmail marks are redrawn so they are recognisable at badge size.

### Fixed
- Pressing Enter to confirm an English word in a Chinese input method no longer sends the message.
- Ultracode can be chosen again as the effort for a new Claude session and in Settings.

## 2.369.215 — 2026-10-05

### Added
- Files the agent writes for you show as a card in the chat and in an Artifacts list; new documents open beside the chat (you can turn that off in Chat settings).
- A markdown document opens as a page you can edit and comment on directly; the chat that wrote it learns about your edits and comments by itself.

### Fixed
- When a site asks the agent's browser for a passkey, VibeSpace says so and you can cancel it; the agent is told to sign in another way or to ask you.

## 2.369.214 — 2026-10-05

### Changed
- Channels: each account's list reads like a chat app — picture, name and time, then the last message and who wrote it; people show their real names.

### Fixed
- Channels: a direct chat shows the other person's picture, not yours; a group shows its own; the account badge sits on top with the app's real logo.
- Two windows side by side on another desktop stay side by side after you reload the page.
- Approving Slack access in another browser profile now finishes the sign-in; that page asks for no VibeSpace login and the dialog names who connected.

## 2.369.213 — 2026-10-05

### Added
- A new Chat setting, “Enter sends the message” (on by default): turn it off and Enter adds a line, while Ctrl+Enter (⌘+Enter on a Mac) sends.

### Fixed
- With a Chinese or Japanese input method, an Enter right after it ends on Shift, Space or Esc adds a line instead of sending a half-written message.
- A storage connection still rebuilding its cache (minutes for a large OneDrive) now shows Starting and its file count, then mounts, instead of failing.
- A remote machine's desktop and port forwards no longer sometimes fail to connect; the machine's first reply was being lost.

### Removed
- The “Allow the CloakBrowser container” switch is gone from Agent browser settings (it never started anything); CloakBrowser settings no longer hide behind it.

## 2.369.212 — 2026-10-04

### Added
- Every window that shows a file — Word, PDF, pictures, video, the code editor and the rest — has a Download button, and its title-bar menu has Download too.
- Channels shows Lark and Slack people's real profile pictures (panel, conversation window, threads); people without one keep their initials.
- An agent can now send pictures and files on Lark and Slack too, after you approve them.
- Agents can call a connected account's own API (Lark, Slack, Google) once you allow it under API access…; every call is logged and changes ask you first.

### Fixed
- An account’s note no longer hides its login-expiry warning and re-login button: the warning comes first, whole, and the note is shortened instead.
- Clicking an agent's channel search on its card now shows the search results, matches marked; a result opens the conversation at that message.

## 2.369.211 — 2026-10-04

### Added
- Apps reinstalled at every rebuild can now move into the app system in one click (Desktop apps → Move…); each moves only once it is installed there.

### Fixed
- The app system can now be set up on machines where it is enabled — it previously always read as unavailable.

## 2.369.210 — 2026-10-04

### Added
- Where supported, apps you install can live in an app system on the machine’s disk: set it up once in Desktop apps and they survive a rebuild.

### Fixed
- After an update the page reloads once VibeSpace has finished starting, and a loading screen that gets no answer retries by itself, then offers Reload.

## 2.369.209 — 2026-10-04

### Fixed
- A machine's Commands list now fits its window: long commands, PowerShell scripts and output wrap, and a copy's duration sits on its result line.
- In a conversation's history, an agent's commands on your machines show as machine cards too, folded per machine — one card per command.

## 2.369.208 — 2026-10-04

### Fixed
- A published Background Work service keeps its public URL across restarts, and `vibespace-job show` prints it.

## 2.369.207 — 2026-10-03

### Changed
- Commands an agent runs on a machine now fold into one line per machine, one short line per command inside; PowerShell encoded commands show their script.
- An "exited unexpectedly" item in For you now clears itself once that conversation is running again, whoever resumed it.

### Fixed
- On a Chinese, Japanese or Korean Windows machine, command output and error messages now read as text instead of garbled characters.

## 2.369.206 — 2026-10-03

### Added
- Slack can use one app for the whole workspace: set it up once, then everyone just presses Connect and Allow.

### Changed
- Connecting Slack now takes two copies and nothing to choose inside Slack.
- Connecting Slack now asks for every permission once, so a new feature won't need a re-install.
- Lark's sign-in now asks for every permission it can use, so new features no longer ask you to re-authorize.
- In Channels, each account under Accounts shows the same badge its conversations wear; hover it for the account's name.
- VibeSpace's own agent talk in Channels wears a VibeSpace badge and is folded into one row by default; click to open it, and every device keeps your choice.
- Slack accounts in Channels have their own icon.

### Fixed
- A Windows device no longer loses its agent when it updates itself, and VibeSpace tells you if a device stops answering after an update.

## 2.369.205 — 2026-10-03

### Added
- Agents can copy a file between a paired machine and this one, with the same permission as running commands; the size limit is in Settings → Integration.

### Changed
- When an app opens another window (WeChat's Moments), it opens as its own window titled "WeChat · Moments", and closing it closes only that window.
- The Agent browser panel is tidier: one aligned row per profile, its actions in a ⋯ menu and the details in a fold.

### Fixed
- Desktop apps such as WeChat now fill their window after you resize it — no more blank strip along the bottom.
- When a safety check stops the agent's reply, the chat says so in a plain notice instead of a red "Unknown event" card.
- In Channels search, "Around this message" shows each message whole: avatar beside the name, nothing cut off, no sideways scrolling, a date line per day.
- In "Around this message", a picture VibeSpace didn't save says so instead of "Not found · Retry".
- Scrolling to the end of Channels search results now always loads older matches.
- In the Design window, Changes to send keeps the newest change in view.
- Change build… says it is reading the list of Chrome builds instead of saying the list could not be read before asking for it.

## 2.369.204 — 2026-10-03

### Added
- Slack can be connected in Channels: paste your own Slack app's token, and agents read your Slack and draft replies you approve.
- Paired Windows and Mac machines open as one window of their whole desktop (Apps → the machine): set it up once, then sign in each time.
- Run on its desktop… starts a program such as Blender on a paired Windows or Mac machine.
- A browser profile saved on a paired machine can be started, browsed and deleted, with its folder there, from the Agent browser panel.
- A paired machine with no browser to run says so and shows the one command to run there.
- An email's details show the sender's address.

### Changed
- The Task log keeps every Activity entry: past the newest 500, keep scrolling to read older ones.
- In a conversation window, each handled proposal folds into one line; open it for the full card or jump to the sent message.
- Remote commands show in full: the chat card holds the whole command (folded after four lines), and the Commands list shows each with Copy.
- The Remote panel's machine row opens its Commands list in one click.
- The live view marks the agent's tab, shows each tab's real page title and whose tab it is, and lets you watch any tab of your browser.
- The Usage window's numbers are double-checked in the background against a new local index; nothing you see changes yet.

### Fixed
- The Files view works on paired Windows machines (browse, open, edit, download, copy, move, delete, folder sizes) instead of failing.
- On Windows, .zip folder downloads and archives say they are not available yet, and a too-old agent says to rerun its install command.
- Apps that fix their own window size (WeChat's login, Inkscape's welcome) open exactly that size, nothing blank or cut off, and can't be resized.
- A design comment no longer sticks on "Sending…", and a published design is one row in the chat's design list.
- A Background Work job using the agent browser shows under its own name in the live view, and its browser window closes when the job ends.
- A Background Work job can save agent browser screenshots and downloads in its own folder.
- On servers with many conversations, Channels no longer rewrites its whole index every few seconds when nothing new arrives.

## 2.369.203 — 2026-10-03

### Added
- An agent can install an app for you from a package source, its maker's website or a file: For you shows one plain card, and one click on Install installs it.
- Before drawing a new design, the agent can ask you a few questions in the Design window; answer with a tap, or let it decide.
- In the Design window you can collect several changes (retype a text, adjust a colour, size or spacing, add comments) and send them in one message.
- Designs can have Tweaks: knobs the agent adds for colours, sizes and density; move them in the Design window and see the change at once.
- Design systems: have the agent make one from your brand and new designs follow it; ⚙ Tools ▸ Designs… lists every design and design system.
- The Design window can present its artboards full screen, print one PDF page per artboard, and download the design as an HTML file or a .zip.
- An agent can open a picture or a file someone sent in a chat it may read.
- An agent can attach pictures and files to what it sends in Channels; the approval card shows each file, and exactly those files are sent.
- Channel search shows your saved matches at once, then Lark's or Gmail's own search over the whole history, each marked "not saved here".
- Gmail mail shows who it went to (To, Cc, Bcc, Reply-To, mailing list); Lark messages say when they were edited, recalled, forwarded or sent by an app.
- In Change build… you can download another Chrome version, see whether it suits your profiles first, and remove the ones you downloaded.
- The System window shows the slowest store writes of the last hour, and a stalled server is no longer mistaken for slow storage.

### Changed
- Settings opens on everyday settings; timers, budgets and operator switches wait behind "Show advanced settings", and settings that cannot apply stay hidden.
- Lark and Gmail request budgets sit under "Per vendor" in Settings → Channels and show only once an account of that service is linked.
- Closing a whole tab group (tabbed or side by side) now asks first and lists every tab; a tab's own ✕ still closes just that tab.
- Apps is easier to read: apps come first, names show in full, the window bar drops technical labels, and a search that finds nothing can go to an agent.
- Opening Channels no longer stalls on accounts with tens of thousands of conversations; All and each account keep loading as you scroll.
- On a phone or tablet, press and hold a channel message's words to select them; its actions open from a … button.
- Automatic pool placement saves Fable quota for Fable chats: other conversations start on, and when idle move to, members with less Fable left.
- A package source you added only updates the apps you installed from it; Refresh shows where each update comes from.
- In the live view you can watch a tab folded into "▾+N", and the line above the picture names the tab you watch and the agent's tab.

### Fixed
- The server no longer freezes for a few seconds every minute or two; account checks stop re-reading the login files.
- Commands on a Windows machine whose agent is too old say how to update it instead of "exit 1"; an agent that could not update itself shows in For you.
- A message VibeSpace delivers into a conversation (a group report, a wake) names who wrote it and the group.
- Agent conversations in the sidebar show the name they were given, and a rename made elsewhere shows on every device.
- Codex usage costs match OpenAI's current prices, and a forked Codex conversation no longer counts its parent's usage twice.
- Admins: a Google client or integration preset dropped from a user's release values is really removed on upgrade, so later key rotations reach that user.

### Removed
- Settings no longer shows the obsolete "VibeSpace channel (experimental)" switch or three switches that did nothing; the settings manual lists every setting.

## 2.369.202 — 2026-10-02

### Added
- A Design window shows each screen as the agent drafts it from your brief; click any part to comment, or publish the design as a link.
- A scheduled job can use the agent browser the same way its conversation does — the same profile and logins, its own window.
- Every place that asks which agents may use something now offers All agents — every conversation, now and later — as the first choice.
- An agent can ask to be told about new messages in a chat it can read; waking it needs your approval.
- An agent can see the titles of group chats it may ask you to read; you turn this on or off per account.
- Agents can take down a page they published or switch it between public and private; a removed page's link says it was taken down.
- Gmail replies can go to everyone on a mail and stay in its thread; the approval card lists every recipient and the window has a Reply all box.
- When a conversation stops unexpectedly while working, VibeSpace restarts it once by itself at no cost and tells you in For you.
- You can use a codex reset credit from the Agents list even when no chat session is open on that account.
- Session Properties lists the background jobs a conversation owns; click one to open it.
- You can give any Lark author your own name for them from the author's menu; it shows everywhere, including to your agents.
- Each conversation's picture in Channels carries a small badge coloured by its account; with two accounts of one kind, the row says which.

### Changed
- When you set up a notification, you choose whether the agent is told on its next turn or woken right away.
- Giving an agent a whole account lets you set up a notification on any of its chats without granting each one.
- Several agents and you can use one browser profile at the same time, each in its own window; taking over pauses only the window you take.
- The live view's tabs switch on a click; while you only watch, a click shows that tab without moving the agent's.
- The number of browsers allowed to run at once on this machine is a setting (Agent browser, 6 by default).
- Asked to use your logged-in browser, an agent now knows the steps: a profile, you log in once in the Agent browser window, it works there.
- Messages from other agents and jobs arrive folded to one line; press Show to read the whole message.
- The Outbox lists one row per proposal — who gets it, where, its first line, its state and Approve…; click a row to see it whole.
- A group member set to Mention now receives only the messages that @mention it.
- An @ that names nobody in an agent group is caught before the message is sent, with the members it could mean.
- Manage Agents and the usage popup say when this machine's CLI login and an account are one account with two separate sign-ins.
- When background-job notifications are dropped because 30 are already waiting, For you tells you, at most once an hour.
- In Watch mode, the copy and paste keys explain that only the window driving the app has its clipboard.

### Fixed
- A live view whose tab is hidden behind another tab says so and keeps a picture coming; a click on that tab brings it to the front.
- A VibeSpace started from a git worktree or a temporary folder no longer registers its hooks into your real Claude Code / Codex settings.
- The Desktop window no longer drops every minute on a slow link, and Paste always says what happened — it waits for a reconnect.
- A live view whose connection silently dies is noticed within a minute and no longer counts as a viewer.
- On a phone, the billing chip shows the account's name whole or a short form, never cut in the middle.
- A message you send while scrolled up in a chat always shows: the chat returns to the newest messages and lands on it.
- Scrolling up quickly through a long chat no longer stops at the top of the loaded messages; it keeps loading as you scroll.
- A second message sent while a conversation reconnects no longer goes missing, and a reconnected terminal shows what it missed without a reload.
- A session using the experimental daemon pipe is no longer ended by a slow acknowledgement.
- An agent that parks a very long Backlog item is asked to shorten it, instead of being told it failed and saving it twice.
- A page link (/p/…) in a chat message opens the page again with Cmd/Ctrl+click, and a click copies its full address.
- A web address shown as code or in a tool's output is copied whole when clicked, and Cmd/Ctrl+click opens it.
- After VibeSpace restarts, an agent typing into a window you shared in auto mode types as before instead of failing with a setup error.
- When an agent's typing into a shared window is cut off, no key is left repeating, and Chinese or accented text types on more machines.
- Channel notices, Outbox cards, For-you items and a chat's channel rows show the conversation's name, not an internal id; clicking it opens it.
- In the Outbox, a new message's envelope line no longer looks like a link that does nothing.
- A Lark one-to-one chat is named after the other person everywhere, including what agents see, instead of its internal id.
- A Lark message that got a thread after VibeSpace had read it now shows the thread; people who left a chat and bots are named.
- In an agent group an @mention shows as a name tag that opens that agent's conversation.
- You can select and copy the text of a group message, or use Copy text in its menu.
- A member removed from a group is shown by name, not by an id.
- A group message waiting for an agent reaches it with your first message after a restart; while it is busy, the strip says when.
- For you › Notifications no longer counts your own confirmations, such as Copied or Reply sent, as unread.
- A terminal session's dot in For you no longer says it is idle.
- Pooled conversations no longer move to an account in the minute before its weekly reset takes effect, where every continue was rejected.
- A reset credit that could not be sent no longer starts the ten-minute wait, and the dialog says why it was refused.
- After you use a reset credit, the chat card that offered it shows that it was used instead of its button.
- The usage menu's Codex refresh says what it read, or why it could not, and updates the numbers at once.
- A reset credit is never spent twice on the same limit, and one granted a moment ago is never counted as unused.
- Codex readings that arrive late, or from a machine whose clock runs behind, no longer undo or block a newer reading of the account.
- The minimap and message outline no longer show VibeSpace's reminders to the assistant as yours, and a new session's start-up note is folded at once.
- A background helper reopened from history shows "Helper started: …" and stays linked to its helper.
- When a model's safeguards hand a message to another model, the status bar's model chip says "refusal" instead of blaming capacity.
- A remote session's name no longer gains a copy of its folder path each time the page reloads.
- The workspace no longer stops when one background process runs out of memory.
- A folder mounted from one of your machines shows a file changed in place, such as a database, within seconds, even to a program keeping it open.
- An agent browser that closes every few minutes is no longer restarted for ever: after 10 restarts in a day it stops and you get one notice.
- 3D pages (WebGL) work in an agent browser that runs in a hidden window on a machine with no desktop.
- The live view says when the agent's tab is not responding, instead of showing a blank picture.
- On a machine with a VNC desktop, the Agent browser no longer says there is no desktop session; it says the browser is not on it.
- After a pinned profile is deleted, the browser note no longer reads "a deleted profile was deleted".
- Stopping or rescaling LibreOffice no longer loses unsaved edits — it asks in its own window first; only "Stop and lose the edits" discards them.
- Where LibreOffice is installed without Word's look-alike fonts, the file menu offers to install them.
- Closing the last document inside LibreOffice ends it instead of leaving its Start Center.
- "Open with LibreOffice" shares the window with agents the way you last shared LibreOffice.
- The Desktop starts even when a desktop app already took its usual display.
- A desktop app such as Blender opens inside its VibeSpace window instead of on the machine's own screen.

### Security
- The keys your agents use to talk to VibeSpace are checked in constant time, so response timing reveals nothing about them.
- A background job is refused when its command would read your Claude, ChatGPT or OpenCode sign-in files; calling an API with your own key works.

## 2.369.201 — 2026-10-02

### Fixed
- Opening Channel windows on an account with tens of thousands of conversations no longer stalls; each window shows its conversation right away.

## 2.369.200 — 2026-10-02

### Added
- You can create an agent-browser profile yourself from the Agent browser panel, choosing its browser and the machine it runs on.
- A browser profile can be pinned to one installed Chrome build with Change build…, and the panel says which build a browser runs.
- VibeSpace can install and use the browser CLI version it was tested with instead of whatever is on the machine.
- You can install an app on a machine from the Desktop apps dialog with Install an app…, and it is still there after the machine is rebuilt.
- An agent can propose installing an app; nothing is installed until you approve it in For you.
- You can also install a .deb file you have, or an app from a package source you add.

### Changed
- Company OAuth clients and integration keys now come from one cluster secret and update without a restart; Integrations & keys shows where they come from.
- Under a group message, a line now says which agents still wait for their next turn, which read it and when, and which are muted or left.
- In Channels, add reaction, reply in thread and quote sit in a small bar at a message's right edge when you point at it, not on a line under every message.

### Fixed
- Dragging or resizing a window, or dropping it on a desktop preview, is no longer undone when another of your pages saves that desktop at the same time.
- A tab group on another desktop is no longer broken when another of your pages saves the desktop you are on.
- When you delete a desktop, your other pages put its windows on the same desktop you see them on.
- Every drag — a window, a tab or icon, a sidebar edge, a divider — now ends where you let go, even over a desktop, browser or app window.
- A window closed while you drag it no longer leaves every window deaf to the mouse, and a PDF viewer can be made smaller again.
- On a phone, a long press on the words of a chat message now selects them; the message's menu opens from a … button on the message.
- A browser profile kept on a cluster pod stays usable after the pod is replaced, after an update, and after the profile folder is copied or restored.
- Resizing or moving the live view no longer floods the agent's action list: page-size changes fold into one dim row with a count.
- A command an agent runs on a paired Windows machine now runs under cmd.exe instead of failing at once.
- When a command on a paired machine cannot start, the chat card says why instead of a bare "exit 1".
- The chat card shows a command's output, and the machine's row lists its recent commands with their results.
- Where the Claude CLI never wrote its settings file, VibeSpace now creates it, so a new user's agents know the VibeSpace tools from the first conversation.
- A VibeSpace that updated itself at startup no longer leaves changes behind that block its next update.
- The design canvas works again with Claude Code 2.1.287, which no longer includes it; VibeSpace uses an older version's copy and says which.
- Pairing a Mac works again — the repair command no longer stops on an "unbound variable" error before the connection check.
- A Background Work notification the agent was too busy to take now arrives when its turn ends, not when you next type; the card says why.

### Security
- What is kept of a command's output hides private keys, passwords and tokens; the agent still gets the whole output.

## 2.369.199 — 2026-09-30

### Added
- When a site refuses the agent's browser, the agent proposes a switch and you approve it with one click (CloakBrowser is installed if needed).
- When a page in the agent's browser keeps reloading, the agent is told within seconds and can stop the page or close the tab instead of waiting.
- An agent can sign its browser out of one site; on a shared browser you approve it first, and the card names who gets signed out.
- The agent's browser can be resumed after it closes — its logins and open tabs are kept for the conversation.
- Where the live view says the browser stopped, a Resume button starts it again with the same logins and tabs.
- Hand back and continue hands a browser you drove back to the agent with what you left open.

### Changed
- The changelog is now written for the person using VibeSpace, one plain line per change, in English, Chinese and Japanese.
- The Update dialog shows what changed in your interface language, as a list under Added, Changed and Fixed.
- While you drive the agent's browser, a dialog you open yourself now takes Enter and Escape; a dialog that pops up on its own still does not.
- The agent's browser no longer announces itself as automated.

### Fixed
- Dragging a window onto a desktop you had not opened since the page loaded no longer removes that desktop's other windows.
- A window another of your pages moved or opened while this page was busy no longer disappears when this page saves.
- Deleting the desktop you are on keeps its windows even if you reload right after.
- A conversation brought onto the dynamic desktop from another desktop is drawn and clickable again.
- On the dynamic desktop, dragging a tab out of its group no longer makes the group's other conversation vanish.
- On a narrow screen the toolbar's buttons fold into a menu instead of overlapping other controls.
- On a phone, the billing chip follows the pool's current account instead of keeping the one from when the conversation started.
- Lark single chats now appear in Channels.
- The account name on a window's title bar follows the account the conversation actually uses within a second of the pool moving it.
- Tab strips no longer flicker every few seconds.
- After a server restart, old rate-limit messages that arrive late no longer move a conversation to another account.
- A rate limit that belongs to another account no longer marks the account a conversation is on as exhausted.
- A server crash no longer leaves a conversation's output frozen for hours — it reconnects by itself and says what it caught up.
- A save that fails because the machine ran out of file handles is retried and reported instead of stopping the server.
- Using a codex reset credit works again with the current codex CLI.

### Security
- Text written by other people or other agents (a mail, a chat message, a job's output) can no longer carry hidden instructions into an agent's context.

## 2.369.198 — 2026-09-29

### Fixed
- In a Channels conversation, a formatted mail that comes into view when a mail above it gets shorter is drawn at once instead of staying an empty box.
- On a busy server, the agent's page in a phone's live view keeps the phone's width instead of widening to 500 px.
- While you drive the agent's browser, clicking a text box's label gives that box the keyboard, just like clicking the box itself.

## 2.369.197 — 2026-09-29

### Added
- "Clear content…" on an Activity entry, For-you item, status entry, background job or group message removes its text everywhere; it keeps its place and time.
- An agent can clear an Activity entry or For-you item it wrote itself; anything else is cleared only by you.
- In a Task Group's log you can clear every entry that mentions a word: type it in Find…, press Select…, Select all shown, then Clear selected.
- Channels show threads and emoji reactions: a thread opens beside the list, a reply says what it answers and where it lands, and one click adds or removes yours.
- A thread has its own reply box that keeps a draft per thread; a group that does not allow thread replies says so and keeps your text.
- An agent's reaction waits for your approval like a reply, and Notify… can wake an agent when someone replies to or quotes its message.
- Settings → Channels sets how often reactions, threads and the Lark search are read, and each account's Edit dialog has an Agent reactions choice.
- Lark finds every new message with one search, your single chats included, and checks each chat less often once the search is proven to miss nothing.
- Pair a device lets you pick the address the device dials, replaces a command only when you ask, and the install command stops when the address is wrong.
- A paired device that is not connected says why on its row, and the Machines card shows its recent dial attempts.
- Who can use it… on a paired machine lends its network and its commands, separately, to the conversations you choose; a command can ask you in For you each time.
- Every command an agent runs on a paired machine shows as a card in its chat and as the machine row's last run.
- Pick an account in the pool submenu of a conversation's billing chip to pin the conversation to it, or give a pool your own order with Manual priority.
- In Members & placement…, Move every conversation here now moves the pool's conversations that account can serve to it; a pinned one stays.
- Browse yourself opens an agent-browser profile with its logins in your own tab of the same browser while your agents keep working in theirs.
- Your own browsing in a profile is recorded and replayable like an agent's; turn off Also record my own actions on its row to keep only the start and end.
- When a page in the agent's browser opens a dialog, the agent is told what it asks and the live view shows its buttons; an unresponsive page offers Restart.
- Settings → Agent browser lets you keep your own browsing tab after its window closes and choose headless when the machine has no desktop session.
- CloakBrowser can be installed from Manage agents on a Linux machine and used for a profile, and it reaches only the sites you list in Settings.
- A group message sent to another agent shows as a card in that agent's chat, and the notices waiting for an agent (or handed over) can be opened and read.
- Card kinds that collapse gains Group messages, off by default.

### Changed
- Gmail messages keep their formatting (remote pictures only when you ask); Lark messages no longer show raw tags, cards show their contents and bots are named.
- A formatted mail has a Formatted | Plain text switch, folds quoted history behind Show quoted text, and a wide newsletter fits a phone.
- A Lark reply shows a strip of the message it quotes above it; click the strip to jump to that message.
- An agent you gave a whole Lark account now reads your single chats too and can be woken on them; an agent given one chat works as before.
- An existing Lark account asks for one Re-authorize to read who reacted, search new messages and see single chats; the card says what it adds.
- If your Lark app has not enabled a permission the sign-in asks for, a button retries without that one and the account says what is missing.
- Pair a device says as you type when the name is already paired, refuses one that differs only in case, and says what name the device will get.
- A machine that had Allow as exit on is open to all your conversations for its network and its commands; one that had it off is open to nobody.
- Taking an account out of a pool moves its conversations off it at once; if no other account can take them, they stop after their turn and wait.
- When a pool account finishes signing in, its usage is read once and the pool decides again: a conversation pinned to it goes back, a waiting one continues.
- An agent's browser starts even when nobody is logged in to the machine's desktop, in a hidden window or headless, and it says which.
- CloakBrowser's free version needs no account or key; the key card under Integrations no longer says one is required.
- A browser already running when you update keeps answering page dialogs by itself until it restarts; its row in the Agent browser panel offers Restart.
- A drop the Stage refuses is outlined and says why, and the window goes back where the drag began.

### Fixed
- While you drive the agent's browser, a click into the chat box, a terminal, the editor or any text box lets you type there, and the app's dropdowns stay open.
- While you drive the agent's browser, a click on a desktop app's picture or the Desktop gives it your keyboard; before, what you typed there went to the page.
- The live view's "You are driving" badge and its Hand back button are readable on the light theme.
- A tab pulled diagonally out of its group tears off and follows the pointer; before, it stayed in the group.
- A tab pulled out of its group on the Stage stays on screen.
- A file saved from a preview keeps its own name instead of "raw", Chinese-named files download from remote machines, and files starting with a dot open.
- The code editor's Download button on a remote machine's file downloads that file, and a file missing on a remote machine says "not found".
- An agent can read a Chrome window you share with it again on Chrome 154, and a desktop app is drawn whole again after a minimize and a resize.
- After a profile's browser is stopped, a conversation's next browser command opens a new tab instead of failing.
- Pressing Deny on Lark's sign-in page ends the sign-in and says so instead of reporting "connected" and waiting.
- The pool row in the billing menu names the account this conversation runs on, the same one the title-bar chip shows.
- A paired machine's row shows its name again at the sidebar's default width, and a Mac paired under a long name or address now connects.
- A new command for a device that has connected is preselected for that device's system, not for the computer you are browsing on.
- Two machines dialing in with one device's pairing no longer knock each other off every second; the second is refused and the row says so.
- A device that refuses this server's key now stays connected and its row says so, with the way out; before, it reconnected every second and read Offline.
- A group message that woke an agent is no longer handed to it a second time in its next group report.
- Stop on the Public URLs or Tailscale plugin now says what it will stop before you confirm.
- Deleting a file, killing a process, installing xpra or LibreOffice, answering a job's panel or using a reset credit acts only on what the dialog showed.
- The Task Group log's dates and a disabled channel account's refusal are shown in your language; they were in English on a Chinese or Japanese page.

### Removed
- The pool's Switch target menu and its Auto-switch toggle are gone; a pool you had set by hand keeps that account first in its new order.

### Security
- A formatted mail is drawn in a sealed frame, and a hostile mail or Lark message can no longer freeze VibeSpace.
- The command shown above Allow is the one that runs, and a command with hidden or direction-changing characters is refused.
- A permission card shows every line of the command Allow will run, and Always Allow lists everything it changes.
- The agent browser's confirmation card names the file, address or script it acts on, and Hand back says how many conversations it wakes.
- A sign-in code, token or password inside a page address is cut from the browser's recorded actions, for your browsing and your agents' alike.
- Pairing secrets no longer appear in process lists on the device you pair or on the VibeSpace machine.
- Generate a new command cuts off the device holding the old command at once, unless you choose to send the new one to it.
- A machine's network lent to a conversation can be used by that conversation alone, and one that loses access loses its open connections at once.
- One conversation can no longer freeze the new tabs of other conversations, or yours, in a shared browser.
- A new conversation can never take over a stopped one's browser, and taking a conversation out of a Task Group takes a kept browser profile away at once.
- An outgoing channel message you approve is the one that is sent, and names or text from others can no longer hide characters or restyle the page.
- An agent whose access to a channel conversation you removed no longer receives what was waiting for it there, only the outcome of its own proposals.

## 2.369.196 — 2026-09-28

### Added
- While you drive the agent's browser, text you copy with Ctrl+C or ⌘C lands in your own clipboard — only on your own key or click, never by a page's script.
- When a copy cannot reach your clipboard directly, a chip on the Live view's bar puts it there with one click.
- Each run of an agent's browser shows a start card and an end card in the chat; the end card says why it ended and offers Replay when the agent did something.
- A replay window steps through a browser session's actions with screenshots; open it from the chat, the Live view, Session properties or the Agent browser panel.
- A replay of a session longer than 1 000 actions shows its last 1 000 and says so; the earlier ones are kept.
- The Agent browser panel shows, for each profile, how much of its record limit is in use.
- "Who can use it" on a browser profile now takes several conversations and Task Groups from a searchable list; a Task Group counts all its conversations.
- Before you save "Who can use it" the dialog says how many conversations will lose the profile, and a list changed meanwhile is shown again, not overwritten.

### Changed
- The dialog for switching an agent's browser speaks plainly: it names the browser, offers a switch only when one is possible, and says each step with one button.
- When a step comes first (a license key, a download of about 200 MB after you confirm), the switch dialog offers that step; nothing is shown greyed out.
- When you are driving a browser by hand, the switch dialog's card offers "Hand it back to your agent" and turns into the switch once that is done.
- Where no other browser is available, the dialog and the agent's blocked note suggest taking over in the Live view to get past the check yourself.
- When your agent reports a site blocked it, the note names the site and the reason, with the agent's evidence behind Details and a Dismiss button.
- An agent whose conversation is not on a profile's "Who can use it" list can only propose a browser switch for it; the switch itself stays yours.
- The browser is named plainly as Chromium or CloakBrowser everywhere, and Manage agents lists CloakBrowser only when this VibeSpace includes it.
- The Live view's chips say which of your windows, tabs or devices the page is sized for (Fit here moves it to this one) and whether video is recording.
- When the agent's browser has stopped, its Live view opens on the list of its past sessions, each with Replay, instead of only saying it stopped.
- Browser records are kept by size, up to 1 GB per profile (a new setting), instead of for 7 days; the oldest screenshots go first, the action list stays.
- Picking a profile for a conversation in New Session, Session properties or a session card adds that conversation to the profile's "Who can use it" list.
- A conversation taken off a profile's list loses it when you save (its tab closes); one that leaves the profile's Task Group loses it at its next command.
- Upgrading keeps every conversation that could use a profile until now in its "Who can use it" list.
- The agent's browser uses one set of Chinese and Japanese words throughout, and the Agent browser panel's row states are shown in your language.

### Fixed
- Pasted text and input-method words (such as Chinese) of four or more characters now reach the agent's browser page while you drive it.
- The key that ends an input-method word no longer reaches the page as a stray key, and a click on the Live view's bar gives the keyboard straight back.
- On a Mac, ⌘ and ⌥ shortcuts in the agent's browser now select all, copy, paste, undo and jump by word instead of typing letters.
- Dragging and double or triple clicking in the agent's browser now select text.
- Taking over fits the page to your window at once and never mid-drag, and a shared profile's page fits again as soon as you hand it back.
- Turning video on while the agent works no longer shows "recording refused" beside a recording that is running.
- A browser switch that fails now puts the profile back on its old browser and starts it again, instead of leaving it on one that cannot start.
- The CloakBrowser license-key card says a key is needed, and its Test no longer passes with an empty key.
- Session properties shows the whole browser line instead of cutting off who can use the profile.
- The Agent browser panel's head line wraps on a phone instead of being cut off.
- The popup under the Live view's browser-count chip now has a background instead of letting the bar show through.

### Security
- An agent's browser commands no longer tell it about other conversations' browsers — which they are, what runs them, or who else may use a profile.
- A conversation on another machine can no longer use or be listed on this machine's browser profiles, and New Session stops offering one there.

## 2.369.195 — 2026-09-28

### Added
- Right-click a Word file, spreadsheet or presentation → "Open with LibreOffice" opens it on the machine that holds it, and Save writes it back in place.
- The Word viewer has an "Open in LibreOffice" button, and a machine without LibreOffice offers to install it, showing every command before anything runs.
- The Desktop apps dialog lists LibreOffice Writer, Calc and Impress, with Install… beside one that is not installed on that machine.
- When LibreOffice closes after changing a document, an open code editor of that file reloads it at once, or flags it as changed on disk if you have edits.
- An agent can take back or replace a draft it proposed, so you no longer have to reject an outdated draft yourself.
- Approve ▾ and Reject ▾ let you choose whether the agent hears now (this starts a turn) or with your next message; your last choice becomes the button.
- When you edit a draft before approving it, the agent is shown what you changed, and the card says whether the agent has been told yet.
- Tool cards list each mail or Lark chat the agent read or drafted, the status bar names the last one, a click opens it, and its window names the agent.
- What is waiting for an agent's next turn is shown above its composer and on its card; Hand over now delivers it, saying if that starts a turn or joins one.
- Connecting or re-authorizing a Gmail account can reuse a storage mount's OAuth client ("From storage: …"), with no secret to copy by hand.
- After a click in a channel conversation, PageUp, Home and ↑ scroll it, and at the top they load older history like a wheel.

### Changed
- Channel conversations read like an IM: avatars with initials, one name line for messages sent close together, day labels, picture and file cards.
- The conversation list shows each conversation's avatar, its name in bold while unread, the time, its tag, the last message and the unread count.
- Lark messages show links, @mentions, pictures and cards as intended; Gmail titles lose the ticket banner, and quoted history and signatures fold away.
- A Lark system message says who did what ("Ada invited Brook to the group") instead of a raw template, and stickers and forwards are one grey line.
- A conversation's footer is one short line, and a Gmail account that cannot reply yet shows a Re-authorize button right there.
- On a phone, every button in a channel conversation and in its list is bigger and easier to tap.
- Choosing an agent or group (Grant access…, Notify…, New group, Share with agent…) is one searchable picker, grouped by Task Group, recent picks first.
- The Notify… dialog asks three plain questions (who, on which messages, how often) and says in one sentence what it will do.
- Grant access… asks who may read and act in a conversation and, per agent, whether it may draft replies for your approval or reply directly.
- The account menu's Push… dialog opens with a plain explanation of push versus polling and what Gmail and Lark each need for it.

### Fixed
- A viewer closed with its tab's ✕ in a side-by-side group no longer comes back as its own window after you switch desktops, even with a second device open.
- After you re-authorize a Gmail or Lark account, every conversation of it can reply at once, including windows that are already open.
- A Connect or Re-authorize sign-in that ends before you finish it now says so instead of waiting forever, and Re-authorize lets you sign in again.
- A new message no longer redraws a conversation window: an opened quote stays open, a reply you are typing is kept, and nothing is drawn twice.
- An approval card you are editing is no longer redrawn when another card or the Outbox changes.
- A conversation window no longer loads older history by itself when you maximize or resize it, zoom, or scroll inside a code block.
- In a channel conversation that fits its window, a wheel up or a pull down at the top now loads older history, and a resize keeps you at the newest message.
- A click in the Channels panel or the Desktop apps dialog is no longer lost when the list refreshes under the pointer.
- A session started before per-session agent browsers now gets a browser at its first browser command instead of being refused.
- Waiting notices, job results and reminders are no longer lost when a Codex session starts or when an agent's Task Group context is large.
- Right after you fork a conversation, its messages, background jobs and shared windows no longer land on — or bill — the conversation it was forked from.
- The Channels panel no longer cuts off an account's name, nor its status line, the Outbox button or a tag on the narrowest sidebar.

### Removed
- The "wake the agent with each outbox receipt" switch is gone from Notify…; the Approve ▾ and Reject ▾ buttons now make that choice.

### Security
- On an instance without sign-in, an agent's own tools can no longer read a storage mount's client secret or cancel, edit or remove a channel account.

## 2.369.194 — 2026-09-27

### Added
- The For-you inbox opens as its own window: the list on one side, the whole item at full width on the other, with a reply box and its actions below.
- In the For-you window, handling an item selects the next open one; ↑/↓ or j/k move through the list, Enter opens the reply box and Esc goes back.
- On a phone or a narrow window, the For-you window shows the list first, then the item with a back button.
- A Word document opens as paper pages with Fit width, 100%, zoom buttons and a page counter; Ctrl (⌘ on a Mac) + wheel zooms the pages.
- The zoom you pick for a Word document is remembered on this device.
- The For-you popup's tab strip and the title-bar mini inbox each have a ⤢ that opens the window on the whole inbox or on that session.

### Changed
- ⤢ on a For-you item, and ⚙ Communication ▸ For you…, open the For-you window; the small read-only viewer is gone.
- An agent's For-you question can now hold 500 characters and its detail 8,000, and the agent is told when its text was cut.
- A Word document's headings, coloured text and page colour are its own, not the workspace theme's.
- A legacy .doc tells you to open it in Word or LibreOffice and save it as .docx; a password-protected .docx or a non-Word file says so plainly.

### Fixed
- A Word document now shows its running head from page 2, the page number at the right margin and its list bullets.
- A Word document's page is centred in the window, with no grey band on top and no page cut off on the left.
- Saving Grant access… or Notify… no longer replaces a list that changed since you opened it; you are told and the dialog reopens on the current list.
- A Channels conversation window no longer shows the same messages two or three times.

### Security
- Opening a crafted Word document can no longer run a script, restyle the workspace or leave a javascript: link clickable.

## 2.369.193 — 2026-09-27

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.369.192 — 2026-09-27

### Added
- Every click and key you send from the live view is confirmed; if it does not reach the browser, the bar says "Input is not reaching the browser".
- A Gmail or Lark account card shows how many conversations its first read has covered and about how long is left.
- You can set how fast Gmail and Lark are read, per second, in Settings.

### Changed
- Taking over the agent's browser interrupts everything it was doing there and a card in the chat names what was cut; on hand back it is told to re-run it.
- Taking over a shared browser pauses every chat using it, and another live view cannot take over while you are driving.
- Handing back a shared browser wakes only the chats whose agent had something interrupted or refused; the others hear on their next turn.
- The status-bar chip, sidebar card, Session Properties, live view and the session card's profile picker name a conversation's browser in the same words.
- When a conversation's pinned profile is not the browser it is using, every surface says both names and why.
- A conversation without a browser profile is described as "no profile (temporary browser)" instead of "ephemeral".
- A Gmail or Lark rate limit is now a short wait named on the account card, not a 15-minute pause; For you hears of it only if it keeps happening.
- Re-authorize keeps a Gmail or Lark account on the same person; to read a different Google or Lark user, add it as a new account.

### Fixed
- Gmail is no longer rate-limited again and again; its messages are read at a steady pace.
- The first click after the page loads is no longer lost under the fading loading screen.
- Typing into a browser shared by all conversations now reaches the page while you drive it.
- An open live view follows its conversation's browser when the profile changes, instead of staying under a red "not attached" message.
- Reconnect in a live view whose browser is gone now finds the conversation's current browser, and a stale error clears with the next picture.
- Deleting a browser profile clears its pins, and each chat that used it says it was deleted instead of showing a raw id.
- The New Session dialog lists every browser profile, and Session Properties updates the moment you pin one.
- A sign-in finishing late, or a sign-in renewal at the same moment, no longer logs a Gmail or Lark account out or undoes a re-authorize or disconnect.
- A Gmail or Lark account no longer leaves two For-you items open for one outage; a newer failure replaces the older item.
- Once you disable, disconnect or remove a Gmail or Lark account, requests already queued for it are no longer sent.

### Security
- While you drive a shared browser, the agent can no longer land a click, move the focus or switch the tab you see; each attempt is refused and says why.
- A Gmail or Lark account can no longer be switched to another person's account by a sign-in made by someone else.

## 2.369.191 — 2026-09-27

### Added
- When a helper needs permission, its Allow / Always Allow / Deny card appears inside the helper's card in the chat and in its log.
- The "waiting for you" chip names the helper and the tool, and clicking it takes you to the card.
- A helper's permission request left unanswered for a minute is added to For you; clicking it opens the conversation at the card.
- Grant access… lets several agents and Task Groups see and act on an account, a rule's conversations or one conversation; Notify… then picks who is woken.
- An agent can propose a new Gmail message, which you approve like a reply.
- A woken agent is told which other agents are on the conversation, so two do not both answer it.

### Changed
- Access alone never wakes an agent; each notified agent has its own daily wake cap, held messages and digest window.
- An agent notified for the whole account now also hears about conversations a rule sends to another agent; a rule no longer silences it.
- The account card, the conversations it covers and the conversation window show who has access and who is notified.
- The old single-agent hand-off entry is gone; each existing hand-off becomes one access and one notification for the same agent or group.
- Connecting Gmail now asks for the permission replies and new messages need; an account signed in earlier asks you to re-authorize for replies.

### Fixed
- A permission card no longer says "Allowed" for a request that was refused, interrupted or left unanswered, and a stopped helper says it was stopped.
- A second permission request for the same page fetch now shows on its card instead of being refused unseen after five minutes.
- After a server restart, messages written just as an open chat window redrew no longer vanish from it.
- A Task Group you just created no longer disappears from the Grant access… and Reach & policy… lists on a slow page.
- A conversation whose digest window is still open is no longer shown as "held".
- Wakes on the outcome of an agent's own drafts count against its daily cap, even when several are rejected at once.
- A server crash mid-delivery no longer uses up one of an agent's daily wakes for the rest of the day.
- When VibeSpace cannot record a wake (for example on a full disk), the wake is held and says why instead of being billed past the agent's daily cap.
- One malformed message no longer drops a whole conversation's notifications.
- A channel notification queued when the server stops is no longer lost; it is delivered after the restart.
- A Task Group notification is no longer lost when the member it went to ends mid-delivery; the next wake goes to another live member.
- In Notify…, a number past its limit is flagged where you typed it instead of being changed silently.
- A digest notification can no longer be set to 0 wakes a day; one saved at 0 earlier now delivers once per window.

### Security
- Removing an agent's access drops a notification it could not take at once, instead of keeping it for its next turn.

## 2.369.190 — 2026-09-27

### Added
- A picture in a Lark message is shown as a thumbnail in the conversation window; click it to open the image viewer.
- A picture that cannot be shown says why (budget spent, forbidden, not found…) and offers Retry; one that only needs a short wait loads again by itself.
- When the agent sets its own page size, the live view keeps it, says "Agent's size W×H" and offers "Fit the page to the window" to take it back.
- A Lark picture the browser cannot show (HEIC, for one) becomes a download chip marked "no preview".

### Changed
- The Channels panel opens on the conversations that need you or an agent: a draft to approve, a hand-over, an agent's recent read or your recent reply.
- Each conversation on that list shows one small tag, such as "2 to approve", "→ Agent", "Agent read 5m ago" or "replied 3h ago".
- The header switches between "N need attention" and "All"; New group, Outbox and a Filter box sit on the row below, and the filter can search every account.
- A conversation handed over with its whole account or by a rule is listed only once a wake for it reached the agent, so a big mailbox does not flood the list.
- The live view lays the agent's page out at its pane's size so the picture fills it; turn off "Lay the agent’s page out at the live view’s size" to stop this.
- With several live views of one browser, the page is sized for the one you drive (else the largest on screen); the others say "Sized for another window".
- On a phone the live view shows the page at the phone's width, opens full screen when the chat you are reading starts browsing, and lets you pinch to zoom.

### Fixed
- A live view no longer stays white under a loaded page; with no picture it says "Waiting for a picture…" and offers Reconnect after 10 seconds.
- On a phone the status bar's "Agent browser" chip stays on screen, and notices with a button are no longer squeezed into half the screen.

## 2.369.189 — 2026-09-27

### Added
- The Agent browser window's profile row has Who can use it, Rename… and Delete…; a deleted profile's logins are kept aside until you delete them permanently.
- One conversation drives a shared browser at a time; another chat's agent is told the browser is busy, who is using it and how long to wait at most.

### Changed
- A browser profile with a name is usable by all your conversations by default; a second conversation joins its one browser in its own tab.
- Picking a profile for a conversation in New Session or Session properties makes it that conversation's browser at its next command; your latest pick wins.
- Browser profiles made by agents before this version become usable by all your conversations after the update.
- An account billing paid overage wears a small money chip beside its name instead of a sentence; hover it for the details and the period's spend.
- An account whose organization allows usage credits wears the same chip, dimmed, instead of the grey "· credits" tag, in the Agents roster and the usage popup.

### Fixed
- A login made in one conversation's browser profile can be used from another, and no second Chrome is started on the profile's folder.
- When a pinned profile cannot open, the agent is told why instead of silently browsing in a temporary browser.
- A refused browser command now names the button to press instead of a command line.
- In the Agents roster the next-usable countdown column no longer shifts, and the money chip updates in place while the roster is open.

## 2.369.188 — 2026-09-26

### Changed
- VibeSpace's reminders to the assistant show as one grey line, folded by default; Settings → Chat → "Show VibeSpace notes to the assistant" turns them off.
- The end-of-turn reminder no longer makes the assistant repeat its answer or tell you it updated its status.
- A helper's launch and a stopped task read "Helper started: …" and "Stopped: …" instead of internal text and raw JSON.
- VibeSpace's own chat cards (a browser hand-back, auto-resume, the usage limit) are titled "VibeSpace · …" instead of looking like a message from an agent.
- A new For-you item pops a toast "Added to For you (bottom right)", and assistants refer to the For you tray instead of "your inbox".

### Fixed
- After you hand the browser back, the assistant no longer believes another session is talking to it.

### Security
- An agent can no longer pass itself off as VibeSpace; one named like VibeSpace is shown as an agent calling itself "VibeSpace".

## 2.369.187 — 2026-09-26

### Fixed
- Handing a whole account, or the conversations matching a rule, to an agent with "messages matching a filter" saves again instead of being refused.
- A refused save in that dialog says what to fix, in your language, instead of an internal English message.

## 2.369.186 — 2026-09-26

### Added
- The phone's window switcher lists a minimized tab group's other tabs under Minimized.

### Fixed
- Picking a window by name (phone switcher, sidebar card, Ctrl+K, taskbar list) shows it even when it is the first tab of a tab group.
- Clicking a tab group's title bar or content keeps the tab on show, and the phone's title and close button no longer name a hidden window.
- Finding a window that sits in a tab group on another desktop no longer changes which window is active.
- The Channels panel's freshness pill ("paused", "no scan yet") is always shown whole; a long conversation title gives way instead.

## 2.369.185 — 2026-09-26

### Added
- Conversation windows show images as thumbnails and other attachments as chips with their name, size and a download button.
- Scrolling up in a Lark conversation loads older history, and ⋯ → Search messages… searches an account's stored messages.
- The row menu has Mark read, and unread counts only messages that arrived after you linked the account.
- You can hand a whole account, the conversations matching a rule, or one conversation to an agent, with an estimate of its wakes per day.
- A whole account or rule handed to an agent shares one daily wake cap, and its digest arrives once per window as one block for the whole scope.
- Agents can fetch a conversation's latest messages themselves, within a minimum interval and a share of the account's per-minute budget.
- When an account's per-minute vendor budget is spent, its card says so with the numbers and when the next refresh comes.
- Every Channels refresh period, budget and cache size (5 GB per account by default) is a setting under Settings → Channels.

### Changed
- A linked Lark or Gmail account lists every conversation it can see (Gmail: the Inbox, or labels or a search you choose); the Track step is gone.
- Each conversation refreshes by activity (every 30 s, 5 min, at most 15 min); its menu offers Refresh now and Refresh every ▸ to override that.
- While a vendor rate-limits an account, your own Refresh is tried once per wait and agents' refreshes wait it out; your press always goes before an agent's.
- Lark sign-ins renew themselves; the card warns only when renewals have actually stopped instead of counting down seven days.
- Conversations you tracked before the update refresh every 30 seconds, and their existing messages are marked read.
- When Lark push is off because the official Lark SDK is not installed, the account card says how to install it and that messages are polled meanwhile.

### Fixed
- Accounts with more than 500 conversations list them all.
- Gmail no longer re-reads every thread of the mailbox after a restart.
- When a vendor rate-limits an account, its card and your Refresh toast say "rate limited — retrying in N s" at once instead of "failed".
- A number typed out of range in Settings is kept within its bounds, and a toast says so.
- The Channels panel and conversation windows catch up on changes missed while the connection was down.

## 2.369.184 — 2026-09-26

### Fixed
- A grouped taskbar button no longer pops up its window list by itself when a window title changes under a pointer resting on it.

## 2.369.183 — 2026-09-26

### Added
- The Agent browser window's tab strip lists every browser of a session (its own, its helpers', its profiles) with who is driving and whether it runs.
- A browser that starts later becomes a tab at the end of the strip and never changes the picture you are watching, even while you have taken over.
- A helper's browser can be watched from its tab; it is named after the helper's task when that is certain, otherwise "Helper 1", "Helper 2".
- Each conversation has its own browser limit (default 3) on the strip, changed there or in Session properties; a Task Group sets its new chats' default.
- Click the limit chip on the strip to see this conversation's running browsers, helpers' included, each with a Stop button.
- A conversation's own browser is let go 3 minutes after its turn ends (Settings → Agent browser), never while you drive or watch it; its tab stays.
- Right-click a strip tab → Open in new window to pop a browser out; fold it back from its title-bar menu or by dropping its icon on the main window.
- With two grouped chats side by side, switching the chat switches its browser beside it, and clicking a browser switches its chat.
- When two chats are already side by side, a new browser arrives as a pulsing tab on the browser side instead of a third pane; nothing on screen moves.

### Changed
- When the machine's browser limit is reached, the refusal names only your conversation's own browsers, never another session's.
- A live view opened before the agent's first browser command waits with "Not started yet"; a live view never starts a browser.

## 2.369.182 — 2026-09-26

### Added
- In side by side, each side has its own half of the tab strip: you can switch the tab shown on either side, and a click inside a pane focuses it.
- Drag a tab sideways to reorder it or across the middle to move it to the other side; Ctrl+Shift+PageUp/PageDown and command mode { } move it too.
- A window dropped onto a tab group lands at the slot under the pointer.
- Settings → Window → "Dropping a window onto another" can put the two windows side by side at once, with Undo and Unsplit in the notice.
- Right-click a row in a grouped taskbar button's window list to open that window's menu.

### Changed
- A file path or local link opened from a chat opens side by side next to that chat; Settings → Window lets you pick a tab or its own window instead.
- Clicking a grouped taskbar button brings its group to the front; its window list opens on hover, on a click while the group is in front, or with Arrow Up.
- The label under a grouped taskbar button ("N windows grouped") is shown in your language.
- Claude sessions no longer ask before each VibeSpace tool step (a few, like publishing a page or starting a job, still ask); turn it off in Settings → Claude.
- Permission cards for Agent browser steps show as Agent browser and say in plain words what each step does; Background Work commands say what they do too.
- Always Allow on a command that can run anything, such as starting a background job, remembers only that exact command; a card that cannot offer it says why.
- The New Session dialog opens with an empty name, Esc closes an open list before the dialog, and permission modes are described in words.
- A window screenshot an agent takes without a file name is saved in a private temporary folder instead of the folder the agent is working in.
- Sessions started before this version save Agent browser files only under /tmp and ~/Downloads until you Terminate and Resume them.

### Fixed
- Always Allow on a permission card now really remembers the rule, and a hovered Allow button no longer looks disabled.
- Floating menus now close when you click or tap into a desktop app's picture, and the app still gets the click.
- A quick click elsewhere right after a menu opens now closes it, and on a phone scrolling outside the window list no longer closes it.
- A divider drag no longer snaps back when another device changes the tab group mid-drag, and a narrow window's tab no longer sits under its buttons.
- Dragging a tab group by its title bar onto another window keeps all its tabs, and closing a tab left of the active one keeps the same tab shown.
- After a reload a tab group is one taskbar button at once, and a tab group no longer falls apart on a device where one of its windows is still loading.
- The grouped taskbar button's window list now opens at its button at any UI scale.
- A window shared as Auto whose accessibility tree cannot be read on this machine switches to Pixels and tells the agent why.
- An Agent browser file saved to a ~/Downloads path now lands in your Downloads folder.

### Security
- Files the Agent browser saves (downloads, PDFs, screenshots, recordings) land only in the session's folder, /tmp or ~/Downloads, never in .ssh, .claude or .git.
- The Agent browser no longer uploads into a page any file from ~/.ssh, ~/.claude, ~/.codex, ~/.vibespace or VibeSpace's own account folders.
- A window screenshot an agent saves can no longer be written into ~/.ssh, ~/.claude, a .git folder or VibeSpace's own data folder.

## 2.369.181 — 2026-09-26

### Added
- Every desktop app can have its own default scale, set on its card in the Desktop apps dialog before it starts or from the window's Scale menu.
- The scale chip in a desktop app window is now a button that opens the Scale menu, which also offers 2.5× and 3×.
- Share a desktop app on this machine with chosen agents or Task Groups, before launch or later with Share with agent…; unchecking takes it back at once.
- A shared desktop app window shows a chip with how many agents it is shared with and in which mode.
- Each share uses Auto, Accessibility tree or Pixels, switchable any time; in Pixels the agent works from screenshots and clicks, as you do by hand.
- "Ask an agent to take control…" on a window sends one agent a request for its next turn, or starts it at once as a billed turn.
- A Chrome or Firefox you launch from Desktop apps can be shared with an agent, which then reads and operates the page itself.
- Several agents can each work in a different shared window at the same time.
- The Desktop apps dialog remembers who you last shared each app with, shows it on the app's card and says so in a notice when the app starts shared.

### Changed
- Agents no longer see your desktop app windows until you share them; a window an agent opened itself is shared with that agent only.
- Google Chrome as a desktop app draws its own title bar and buttons, and VibeSpace's bars fold away as they do for other apps.

### Fixed
- Switching a desktop app to 1.5× no longer leaves wide blank edges: buttons and text scale together, and the window resizes to follow the scale.
- A desktop app whose smallest size is bigger than its window now fills the window instead of showing bands of its own background beside it.
- Scrolling in a desktop app no longer leaves ghost rows behind.
- A snapped, restored or un-maximized window no longer hangs past the edge of the workspace, even after you open the sidebar.
- A browser tab that briefly lost its connection no longer wipes the per-app scale and frame choices you made on another device.
- Taking over or unsharing a window now stops an agent's typing or clicking already in progress, without leaving a key repeating.
- Screenshots an agent takes of a window are no longer black, and two clicks in a row on the same spot no longer hang.
- Chinese or accented text an agent types into a window now lands whole, whatever the server's language setting.
- A workflow window shows each agent's label and phase from the run's own files, on this or another machine, even after server restarts.
- A workflow that stopped shows Stalled with its last activity instead of running, in its window and on its chat card, and turns back if it resumes.
- A workflow agent that failed is shown as an error in the workflow window instead of running.
- A running workflow's chat card no longer reads finished while the run is still going.

## 2.369.180 — 2026-09-26

### Added
- When an agent starts its own browser while its chat is open on the desktop you are viewing, the live view opens beside the chat.
- An agent's own browser has its actions recorded from its first command, whether or not anyone is watching.
- A session card shows an "Agent browser" chip while its agent has a browser running; clicking it opens the live view.
- A chat or terminal window whose conversation has used a browser offers "Agent browser — live view" on its menu, opening the view beside it.
- Named profiles in ⚙ → Tools → Agent browser… have a Stop button; after a stop, the agent's next command starts the browser fresh.

### Changed
- The live view and a desktop app's bar keep one Take over / Hand back button and a short badge saying who is driving; what does not fit folds into one ⋯ menu.
- A profile browser that keeps closing is restarted at most 3 times in 10 minutes, then you get one For you notice; Stop on the profile starts it fresh.
- A browser that cannot start is told apart from one that keeps closing; after 10 failed starts in 5 minutes you get one For you notice, and Stop resets it.
- While you drive the agent's browser, Esc goes to the page and only Ctrl+\ and Ctrl+Alt+←/→ stay VibeSpace's; hand back with the button.
- While you drive, the bar says "Typing goes to the browser", and a chat box or terminal that takes focus gives it back with a note to press Hand back.
- Agent browser commands follow agent-browser 0.38.1: its new a11y command works, while webmcp and the certificate flags are refused with a reason.
- The chat status bar's Agent browser chip names a conversation's own browser after its session, and its tooltip says whether it is running.
- A live view beside a chat cannot be dragged narrower than its bar, so Take over / Hand back and the ⋯ menu stay reachable at any split.

### Fixed
- Clicks while you drive the agent's browser land where you click; each shows a ripple and an "input sent" count, and a marker shows where your pointer is.
- A live view beside a chat no longer shows black bands above and below the page; the picture fills the pane's width with any spare room below.
- An approval the agent queued before you took over its browser no longer runs a stale step after you hand back; the card is declined and says why.
- The agent's cursor in the live view and the click marks on recorded browser actions are drawn at their true place on the page.
- While you drive the agent's browser, your typing, pastes and input-method text go to the page instead of vanishing or landing in the chat box.
- Two conversations can share one named profile again, each in its own tab, instead of failing with "SingletonLock: File exists".
- A profile's browser comes back by itself after its window closes or Chrome crashes while a conversation is using it, and on the next command otherwise.
- A CloakBrowser profile is not restarted by itself after its window closes, since its launch settings would be lost; the command says so.
- A profile's browser starts again after its background process dies, instead of failing with "Chrome exited early".
- A Chrome left behind when the agent's browser process dies is closed instead of running on unseen and holding memory.
- A browser profile whose folder path contains a space starts again after its browser process dies, like any other.
- VibeSpace never closes a Chrome window you opened yourself on a profile's folder; it tells you to close it first instead.
- When a profile is locked by a browser on a renamed machine, the message names the lock file and says how to clear it.
- "Open live view" brings the session's existing live view forward instead of opening a new window on every click.
- A stopped browser's live view keeps its last picture greyed, says "Browser stopped", and comes back by itself when the agent's next command starts it.
- Opening a live view never starts a browser nobody is using; a closed profile's view says the agent's next command starts it.
- A helper's browser is recorded too, and when actions cannot be recorded the Browser actions row says until when and why.
- Pressing Stop on a profile while you drive it hands control back to the agent, and an agent can no longer detach a browser you have taken over.
- An agent closing all its tabs on a shared profile no longer closes that profile's browser for every other conversation.
- Changing the idle timeout no longer restarts every running conversation's browser.
- The live view and desktop-app bars no longer stack words one letter per line or spill outside the bar.
- The live view no longer shows "undefined" before the viewer count, and its Stop, Hand back and Confirm buttons have their colours again.
- In ⚙ → Tools → Agent browser…, Set aside and Delete have their colours again, and the paste box of the Desktop and desktop apps has full-size Send and Cancel.
- Choosing the profile that is already selected in the live view's menu no longer tells the agent its browser changed.
- When an agent detaches from its conversation's own browser, that browser stops at once, the agent is told so, and its next browser's actions are recorded.

## 2.369.179 — 2026-09-25

### Changed
- A window's billing chip on a tab or title bar shrinks to a short name or just its icon when space is short, so the window title stays readable.
- The shortened billing chip's tooltip still gives the full account and pool, and a click still opens the billing switcher.
- The For you chip on a title bar stays at its smallest width while keeping its number.

## 2.369.178 — 2026-09-25

### Added
- A desktop app can run on any paired Linux machine running the VibeSpace agent: pick it in the launch dialog's "Run on" row, and the window names it.
- A machine that cannot run apps is listed greyed with the reason in words, such as offline, an agent that needs an upgrade, or no X11.
- An app on another machine outlives a VibeSpace restart, and a machine that stops answering keeps its windows open until it returns.
- "Install xpra on…" in the launch dialog shows what will run, installs it with passwordless sudo and streams the log, or gives you the commands to copy.
- An xpra install keeps running through a VibeSpace restart or a lost link, and a second click follows it instead of starting another.

### Changed
- The VibeSpace container includes xpra 6.x, so desktop apps in it and on your other machines run on one xpra version.

### Fixed
- A viewer or agent connection that resets while it is being opened no longer stops the whole VibeSpace server.

### Security
- An agent whose access to a browser is withdrawn while it is still connecting is refused instead of reaching that browser.

## 2.369.177 — 2026-09-25

### Added
- Drag a desktop app's own header bar to move its window, and the app's own minimize and maximize buttons now act on the window.
- Show window frame ▸ Auto / On / Off on the taskbar item's menu sets the frame per app, and Settings → Window → Seamless desktop app windows turns it off.
- A desktop app's taskbar menu also carries Scale ▸, Keep running and Stop app, so you can reach them while its bars are hidden.

### Changed
- A desktop app that draws its own title bar shows no VibeSpace title bar or status strip; hover the top edge or hold Alt to bring them back.
- A desktop app with its own title bar keeps the VibeSpace bars while an agent drives it, in a tab group, on a phone, and while its picture is not connected.
- While an app's bars are hidden, its copy chip floats at the bottom-right for 10 seconds and the last minute before an idle stop shows as a toast.

### Fixed
- A click into a desktop app's picture now brings its window to the front.

## 2.369.176 — 2026-09-25

### Changed
- A browser desktop app such as Chrome can change its scale from Scale ▸ in its ⋯ menu; it restarts at the new scale with its logins and tabs kept.

## 2.369.175 — 2026-09-25

### Changed
- In For you, an item's buttons sit at the top-right of its row and the text runs on below them at the full width.

## 2.369.174 — 2026-09-25

### Fixed
- A long path or id in a For you item wraps instead of running out of the popover.

## 2.369.173 — 2026-09-24

### Added
- A sessions list that includes sub-agent threads says so, with a "Main conversations only" link.
- A remote list or search emptied by the agent-kind filter says how many sessions it hides, with a "Show all agent types" link.

### Fixed
- The sessions list no longer stays flooded with Codex sub-agent threads after you once chose All; that choice now lasts only for the browser tab.
- Codex sub-agent threads on a remote host are listed as sub-agents under their parent and named by their nickname.
- A fork now joins every Task Group its source conversation belongs to, except archived ones.
- A server restart no longer stops the conversation a fork was just made from.
- Two Claude sessions started together no longer swap ids, and a fork learns its own id even when its CLI is slow, in terminal mode or after a server restart.
- A session no longer takes over the id of a Claude Code that its agent ran from a tool.

## 2.369.172 — 2026-09-24

### Changed
- When a session ends, the server log names the signal that ended it.

### Fixed
- A Codex session's exit is logged with its real exit code and signal, and a CLI killed on a remote host is logged as killed instead of as a clean end.

## 2.369.171 — 2026-09-24

### Changed
- A desktop app or Agent browser using a lot of memory or CPU is no longer stopped; you get one notice with the reading and where to stop it yourself.
- Desktop apps are no longer stopped for sitting idle: the desktop app idle timeout now defaults to 0 (never), and you can still set one in Settings.
- Desktop-app windows and the Agent browser panel show memory use with how it is counted, e.g. "412 MB (PSS)".
- The OpenCode background service is still stopped when it uses too much memory; the reason now says how much, counted the same way as for apps.
- A browser opened as a desktop app keeps its profile when it stops for being idle; only your Stop, a Scale relaunch or the browser's own exit removes it.

### Fixed
- A browser opened as a desktop app, like Google Chrome, is no longer stopped seconds after it starts, its profile deleted and relaunches refused for an hour.

## 2.369.170 — 2026-09-24

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.369.169 — 2026-09-24

### Added
- An item filed by an agent has a Reply button: your text reaches that agent as your own message quoting the item (greyed out, with the reason, when it can't).
- After you reply, the item is marked done as "You replied: …" and your reply shows in the agent's chat quoting the item.
- When an agent offers choices on an item, one click on a choice sends it as your reply.
- For you shows whether each agent is working, idle, waiting on you or not running, and what it last reported (needs input, blocked, review).
- A chat or terminal window shows the number of open items from its agent beside its title; click it to see and answer just those.
- An agent with more than 5 open items shows its 5 newest and "N more…"; "Mark all seen" marks all of that agent's open items seen at once (↺ brings one back).
- Notices are grouped by who filed them (Spending, Login expiry, Account pool…) with a chip to show one source; the Inbox and Notifications tabs show counts.

### Changed
- The For-you panel updates in place, so a reply you are typing keeps its text when new items arrive or another device marks one done.
- Open items are ordered by urgency, then decisions with choices, then newest.

### Fixed
- One Escape in the item viewer no longer closes the For-you panel as well.
- Clicking the Background Work group in For you opens the Background Work panel instead of "Session not found".

## 2.369.168 — 2026-09-24

### Added
- A conversation's own browser now shows in the Agent browser window under Ephemeral browsers with a Stop button, and stops when the conversation ends.
- The phone's "+" sheet now offers Desktop app… and Agent browser.

### Changed
- Agents use the browser only through `vibespace-browser` (e.g. `vibespace-browser open <url>`); running `agent-browser` just tells them to use it.
- The three browsers have their own names: Web view (the toolbar's page viewer), Agent browser (formerly Browser profiles) and Browser app in the Apps catalog.
- Agent browsers and desktop apps share one limit of 6 running at once; a conversation that would start a seventh is told who holds them.
- A web-access skill rewritten for `vibespace-browser` comes with VibeSpace, ready for you to install for your agents.

### Security
- Through the browser tool an agent can no longer reach the browser's debugging connection, open local pages such as file: or chrome:, or change how it launches.
- An agent can no longer see or control a browser window you started from Desktop apps.

## 2.369.167 — 2026-09-24

### Changed
- A chat window opens with more of the conversation's recent text, not just its last 50 messages; when several open at once, only the first gets the larger view.
- After a lost connection, the windows you can see reconnect first; hidden or minimized chats follow within seconds, or at once when you bring one to the front.
- Reconnecting to a chat you have open is quicker and fetches only what you missed instead of downloading its recent history again.

### Fixed
- VibeSpace no longer stalls while it reads new conversation history for usage figures, such as after a restart or when you open the Usage window.
- A tool result or answer that finished while you were disconnected now appears after you reconnect.
- A browser tab that falls behind a very busy conversation now reloads to its current state instead of showing replies minutes late.
- Scrolling up in a chat window as tall as its conversation or taller (e.g. maximized) no longer loads older messages and then snaps back to the newest ones.

## 2.369.166 — 2026-09-24

### Added
- The Desktop apps launcher has a Browsers section: Chromium, Chrome or Firefox opens as your own app window, separate from the Agent browser.
- A browser app starts with a fresh profile that is removed when it closes unless you tick "Keep the profile after it closes", and can open a URL you give.
- A snap-installed browser (Ubuntu's Firefox or Chromium) is offered only when it can reach VibeSpace's data folder; otherwise its card is dimmed and says why.
- Each desktop app window has a Scale menu with Auto, 1×, 1.5× and 2×; picking one warns that unsaved work is lost, then restarts the app at that scale.
- Agents cannot start a browser app; they keep using their own Agent browser.

### Changed
- A desktop app's scale now follows both your screen and VibeSpace's UI scale, and its chip says whether it is auto, chosen or from Settings.
- Closing an xpra desktop app window (its ✕, tab or taskbar menu) asks the app to close first, so it can ask to save; a second close within 5 seconds stops it.
- On plain http, a Ctrl+C or ⌘+C copy in an xpra desktop app reaches your clipboard without a click; if one is still needed, a hint explains HTTPS.

### Fixed
- When a desktop app exits or is stopped, its window closes on every device with a notice, and never comes back on a reload as a dead picture.

## 2.369.165 — 2026-09-24

### Added
- Connect an account in Channels adds a Lark or Gmail account in one dialog: type, name, OAuth client (a preset or your own), then the sign-in.
- A Channels account card works like a storage row: a status line, its tracked conversations, and Edit, Re-authorize, Duplicate and Remove in the same places.
- Duplicate copies a Channels account's type, OAuth client, filters and push setting but not its sign-in; the copy signs in on its own.
- A Channels account's own OAuth client secret is kept encrypted and is shown only in its Edit dialog.

### Changed
- The Integrations & keys window now lists only the browser keys; the Lark and Gmail OAuth clients are chosen on each account instead.
- Choosing another OAuth client for a Channels account re-authorizes it; the old client and sign-in stay until the new sign-in succeeds.
- Disconnect only signs a Channels account out and keeps it; Remove is refused while the account is still in use and names what uses it.

### Fixed
- Changing a Drive or Gmail storage connection's OAuth client in Edit now opens Re-authorize, so the connection no longer fails at its next refresh.

### Removed
- The per-type Add account buttons and the Add account… menu row are gone; Connect an account replaces them.

## 2.369.164 — 2026-09-24

### Added
- For a Codex session started before an update, Background Work and the Queued strip suggest a restart to get notifications without a billed turn.

### Fixed
- A Background Work notification to a busy Codex session started before an update rides your next message instead of queueing a billed turn.
- If the Claude or Codex CLI is reinstalled or moved while VibeSpace runs, new sessions and resumes still start instead of failing until a restart.
- A terminal opened for an OpenCode session no longer starts blank.
- Paging through a long chat's history no longer makes freshly loaded cards on screen collapse for a moment and jump.

## 2.369.163 — 2026-09-24

### Changed
- With quota refresh set to Auto via the CLI, a pool takes one fresh reading about 10 minutes before an account is projected to reach its limit.
- A quiet pooled conversation moves to another account shortly before a projected limit and says so; a forecast alone never moves a recently active one.

### Fixed
- The Usage window now files pooled usage under the account that actually paid for it; entries that cannot be proven are set aside.
- A usage reading with an unnamed model limit can no longer make a spent Fable limit look free to the account pool.
- A Codex account with a model limit and credits no longer shows the same limit as two donuts.
- The usage ⟳ refresh says "not recorded" when a reading could not be saved, and automatic refresh no longer repeats such a read every few minutes.

## 2.369.162 — 2026-09-24

### Added
- After you group windows as tabs, one click on the tab strip's side-by-side button or on the toast that appears shows them side by side.
- The window menu offers Show side by side ▸ Beside a tab, and in command mode v turns side by side on or off and V swaps the sides.
- In side by side the tabs follow the panes' order, the button shows it is on, and clicking it offers Unsplit or Swap left and right.
- A side-by-side split you just made can be undone for 5 seconds.

### Changed
- Right-clicking a tab opens that tab's own window menu.
- The divider between side-by-side panes is easier to see, lights up on hover and offers Unsplit and Swap left and right on right-click.

### Fixed
- A window dragged to the screen edge over a snapped window now snaps there instead of landing in a side-by-side pair, sometimes on the wrong side.

### Removed
- Dragging a window onto another window's title bar no longer puts them side by side; a drag only moves, snaps or groups windows as tabs.

## 2.369.161 — 2026-09-24

### Fixed
- With Claude Code 2.1.281, a chat no longer shows a "New fields on a known record" card at every session start or after /clear.

## 2.369.160 — 2026-09-23

### Fixed
- Chat windows scrolled to the bottom no longer flicker or jump when a tool finishes, a message arrives or a workflow reports progress.
- The live Workflow card updates in place: an opened Script stays open and the working agents' dots keep pulsing.
- The Workflow card's pulsing dot and "N running" count now show the agents that are actually working.
- The View Workflow window no longer redraws itself every few seconds; rows you expanded stay expanded.
- Coming back to a browser tab after a long time away no longer files an automatic problem report.
- A problem report keeps each session's details whole, including sessions that ran workflows.

## 2.369.159 — 2026-09-23

### Added
- Channels opens on one list of your agent groups and the chats and threads of your connected accounts, newest activity first, with unread counts.
- You can start an agent group from the Channels panel, invite live sessions with an opening message, and remove members, rename or archive it.
- In a group you write as yourself, @ completes member names, and before you send you see which agents it will wake and how many billed turns that is.
- Each group member has its own notify mode (Next turn, When @mentioned, Every message or Mute), set in the group details, deciding what reaches it and when.
- Agents can create groups, invite or remove members and leave them with vibespace-msg, and a message from one agent to another lands in that pair's own group.

### Changed
- Where a connected account lets you send as yourself, your message in a Channels conversation goes out at once instead of waiting as a proposal.
- Accounts and the Message watcher now sit folded below the group list, and the fold follows you across your devices.
- Group messages reach a member as one report on the next turn you start with it; only a wake (an @mention, an invite, Every message mode) costs a billed turn.
- Agent wakes are paced per sender and per member, and an agent must confirm a message that would wake more than five agents.
- Without a password set, your own group messages are paced like an agent's: one wake per member every 30 seconds and eight a minute.

### Fixed
- A Channels data file that cannot be read is set aside and reported in For you, instead of being overwritten by the next change.

## 2.369.158 — 2026-09-23

### Added
- A new Window setting, Desktop app scale, draws an app at 1× or 2× from its next launch; Auto picks 2× on high-resolution screens; 1.5× grows only GTK text.

### Fixed
- With xpra, desktop apps on high-resolution screens are drawn at the screen's own resolution, so their text and buttons are sharp instead of blurry.
- A desktop app window can no longer be resized below the app's own minimum size, so the app's lower rows and right edge are no longer cut off.
- An app that needs more room than your workspace fits the workspace and is shown scaled to fit, instead of running off the screen.
- On a phone a desktop app is shown whole, scaled to fit, and every part of it can be clicked.

## 2.369.157 — 2026-09-23

### Added
- Manage agents shows each ChatGPT account's stored reset credits with a Use… button that spends one after a confirmation naming the account and the wait saved.
- A chat that hits a Codex usage limit offers "Use a reset credit" on its limit card.
- A new Codex setting for reset credits: Off (default) never spends one, Ask files a decision in For you at a limit, Auto spends it within your spend ceiling.

### Changed
- With Auto, a conversation mid-turn or with a warm cache uses a reset credit before switching accounts, and a cold one switches first.
- Conversations following a pool's default account move at once when that account runs low, instead of waiting for a warm conversation to stop.
- Several conversations hitting the same account's limit share one reset credit instead of each spending one.

### Fixed
- After a pool switch, a Codex conversation still running on the old account has its usage, limits, credits and billing badge counted on that account.
- A Codex conversation still on an exhausted account after a pool switch is no longer auto-continued into that account's limit.

## 2.369.156 — 2026-09-22

### Added
- With xpra installed, a desktop app's window shows only the app, fitted to the window with its own title, and accented or Chinese text can be typed.
- A new Window setting, Desktop app display backend order, chooses which display method new desktop apps try first.
- Copy and paste work both ways in desktop apps; on a plain http page, a copy in the app shows a "Copied in the app — click to copy" chip.
- Only one device at a time controls a desktop app window; the others show "Active on another client" and a Resume here button to take over.

### Changed
- A device that reloads or briefly drops keeps control of its desktop app if it is back within 5 seconds.
- While an agent drives a desktop app, every device watches it, scaled to fit.
- A device that is only watching an xpra desktop app sees it at its true size, centred, instead of enlarged to fill the pane.

### Fixed
- Desktop apps now fill their window and follow its size on the VNC display too, and an xpra app that resizes itself is fitted back to its window.
- A desktop app whose display crashes no longer leaves a hidden screen process running and using memory in the background.

### Security
- A device that is only watching a desktop app can no longer type into it or change its keyboard layout, display size or window size.
- No viewer can end a desktop app's session from the browser, and one that sends oversized data is disconnected instead of filling server memory.

## 2.369.155 — 2026-09-22

### Added
- A new Claude setting, "Let Claude Code continue by itself at a usage limit", is off by default and applies to newly started sessions.

### Changed
- Claude terminal sessions now stop at a usage limit and wait for you; chat sessions are unaffected and VibeSpace's own auto-resume still continues them when on.

## 2.369.154 — 2026-09-22

### Added
- Backlog items have a priority (High, Normal, Low), set from the Backlog tab's right-click Priority menu or the ✎ editor; High and Low show as a chip.
- Backlogs are listed by priority, newest first, and each agent is reminded of its own top items plus high-priority items nobody holds.
- A new setting, Backlog cleanup nudge, asks a session holding too many open backlog items (20 by default, 0 = off) to finish, drop or merge some.
- Agents can set a backlog item's priority with vibespace-task, and its list shows who holds each item.
- The task file in your repo marks a high backlog item with ! and a low one with ↓ after its id, and Copy as Markdown carries the same marks.

### Fixed
- Backlog item numbers now mean the list the agent was shown, so editing item 1 no longer changes a different item.
- Task context for a session in several Task Groups with long backlogs now stays within its size limit instead of being cut off.

## 2.369.153 — 2026-09-22

### Changed
- When a pool account runs low but is not exhausted, a conversation in the middle of a turn finishes that turn before moving to another account.
- Idle and cold conversations still move at once, and an exhausted account or an expired login still moves every conversation immediately.
- Conversations following a pool's default account wait for one that is mid-turn to stop, then move together; an exhausted account still moves them at once.

## 2.369.152 — 2026-09-22

### Added
- A notice in For you shows when it expires, and an expired one is marked "expired" under Recently resolved.

### Fixed
- Spending warnings in For you now expire when the hour or day they describe is over, instead of staying forever.
- Old spending warnings move from the action list to Notices on update, and those about a finished window are marked expired.

## 2.369.151 — 2026-09-22

### Fixed
- Opus 5.5 usage is priced at its own rates instead of Opus 4's, so its cost is no longer overstated.
- Mythos 5 and 5.1 usage is priced at its own rates instead of the default rate, so its cost is no longer understated.
- After /model, the chat status bar shows the new model at once, and the command card no longer shows raw backticks.
- A /loop session's scheduled runs and a few other known records no longer show red Unknown event cards in the chat.
- After an update, before the server restarts, an agent adding a backlog item is no longer told a stored item was not stored.

## 2.369.150 — 2026-09-22

### Changed
- With "Expose chat transcripts to assistive technology" on, assistive tools see only the messages within two screens of where you read, however long the chat.
- Icons, code line numbers, spinners and the minimap strip are hidden from assistive tools; the chat status bar updates its chips in place instead of redrawing.

### Fixed
- A Task Group backlog that already holds 200 items keeps each new item, instead of reporting it as added and silently losing it.

## 2.369.149 — 2026-09-22

### Changed
- The account pool waits until a conversation has been quiet 5 minutes (an hour on a [1m] model) before moving it early, since a move re-bills its whole context.

## 2.369.148 — 2026-09-22

### Changed
- A Workflow card's head shows up to 160 characters of the run's name, and hovering it shows the whole name.

## 2.369.147 — 2026-09-22

### Changed
- A running Workflow shows in the status bar's workflow chip with its phase progress, not as a background task you cannot open.
- Connecting a Channels account always offers a choice of OAuth client, including your own; if yours is not filled in yet, Continue opens it in Integrations.

### Fixed
- A running Workflow card no longer says it has finished while its agents are still working.
- Workflow rows in the status bar's task list open the View Workflow window, and a run that was stopped and resumed is listed once.
- The View Workflow window no longer says "valid runId required" after the server restarts.
- New fields from Claude Code 2.1.280 no longer raise a Harness drift card in the chat.

## 2.369.146 — 2026-09-22

### Added
- Channels can hold several Gmail or Lark accounts: "Add account…" in a section's ⋯ menu connects another, and each section is named by its account.
- When more than one OAuth client is offered, connecting a Channels account asks which one to use.

### Changed
- The OAuth client picked in the Integrations window is now only the default for new accounts; each account keeps the client it was connected with.

### Fixed
- Changing the OAuth client in the Integrations window no longer breaks the sign-in of accounts connected under the previous client.

## 2.369.145 — 2026-09-22

### Added
- Browser profiles opens from the activity rail as well as from ⚙ ▸ Tools.

### Changed
- A tool card whose browser was not started through VibeSpace now says "not traced" instead of "no recorded actions".

### Fixed
- The Browser actions row on tool cards no longer says "server unreachable" when a content blocker such as uBlock, AdGuard or Brave is on.
- Buttons in the Browser profiles window no longer stack their labels vertically in Chinese or Japanese.

## 2.369.144 — 2026-09-22

### Added
- New setting Chat ▸ "Expose chat transcripts to assistive technology": turn it off if Chrome freezes on large chats while an accessibility tool is running.

### Changed
- Windows on a desktop you are not viewing are hidden from assistive tools.

## 2.369.143 — 2026-09-22

### Changed
- A stall where the page redraws only every second or two now captures a problem report by itself, as a full freeze does.

## 2.369.142 — 2026-09-22

### Fixed
- Scrolling up in a very long chat moves as far as you scrolled, instead of jumping hundreds of messages back or to the top of a loaded block.
- Scrolling down through a long chat's history no longer snaps to the bottom before you reach the latest message.
- After jumping far back in a long chat, for example from the minimap, the mouse wheel scrolls normally again in both directions.

## 2.369.141 — 2026-09-21

### Fixed
- Switching back to the VibeSpace tab no longer captures a freeze report when nothing froze.
- The background-task chip in the chat status bar shows a Workflow's short name; hover it for the whole line.

## 2.369.140 — 2026-09-21

### Fixed
- A Workflow card keeps its phases, agents and outcome after the server restarts, for example after an Update.

## 2.369.139 — 2026-09-21

### Fixed
- A running Workflow card shows its phases and agent progress live, instead of only after you reload the page.

## 2.369.138 — 2026-09-21

### Changed
- A per-model weekly cap such as Fable's now also updates from your running sessions on Claude Code 2.1.274 or newer, not only when you press ⟳.

### Fixed
- The weekly usage donut no longer flips between red and green: a per-model weekly cap such as Fable's is no longer shown as your plan's weekly usage.
- Weekly usage readings already stored wrong this way are corrected when you update.

## 2.369.137 — 2026-09-21

### Added
- A freeze of 5 seconds or more captures a problem report by itself, at most once every 10 minutes, and a toast names the report.
- New setting Terminal ▸ WebGL renderer (on by default): turn it off to start new terminals on the plain renderer if you suspect they cause freezes.

### Changed
- The workflow chip and the status bar's task list show a short run name; hover the chip for the whole summary.

## 2.369.136 — 2026-09-21

### Changed
- The sidebar's session search and filter tabs are hidden on the rail panels and the Remote tab, where they filter nothing.
- The Channels panel's Agents section stays folded until one of its conversations is tracked, with a note on what tracking means.

### Fixed
- The desktop's Paste button says when the desktop is not connected, and opens a box to paste into when the browser won't share the clipboard.
- A Workflow launched from a script file shows the run's name on its chip instead of "Workflow".

## 2.369.135 — 2026-09-21

### Added
- The service installer now lets VibeSpace read optional settings, such as integration presets and the public address, from ~/.config/vibespace/env.

## 2.369.134 — 2026-09-21

### Added
- Agents get their own browser: pick a saved browser profile per conversation, watch it in a live view, and Take over or Hand back the controls.
- A tool call that drives the agent's browser shows a Browser actions row; each action opens before and after pictures with the click or element marked.
- Browser actions stay reviewable after a conversation has stopped, and the live view has an Actions pane listing what the agent did.
- ⚙ → Tools → Browser profiles… shows each profile's state, size and recordings, and lets you switch recording on per profile.
- In Browser profiles you can set a profile aside, adopt a browser folder VibeSpace does not know yet, and remove a set-aside one with Delete permanently.
- A browser profile can be shared by several conversations: each sees only its own tabs, and while you drive it no agent can type or navigate in it.
- The live view opens beside its session's chat as a second pane of the same window; Snap beside and Unbind move it in and out.
- Drop a window on the left or right half of another window's title bar to show both side by side in one window, with a divider you can drag.
- The live view's title bar and tab carry a badge in its session's colour, and a shared profile shows a dot for each conversation using it.
- Settings has a new Browser section under Services, where you can turn off the live view opening beside the chat by itself.
- The Integrations window has rows for the cloud browser services an agent's browser can run on.
- Agents can read and act in the windows of desktop apps VibeSpace started, and can open only apps from your Desktop apps list.
- A desktop app window an agent is using shows Watch, Take over and Hand back; while you drive it, the agent's actions are refused.
- A Settings → Browser option, off by default, lets agents use your real desktop's windows through their buttons and fields only; you can pause one per window.

## 2.369.133 — 2026-09-21

### Fixed
- On a phone, the Settings navigation shows each group on its own row with its categories beneath it, instead of mixing heads and categories in one row.

## 2.369.132 — 2026-09-21

### Changed
- The Settings window groups its categories under Appearance & layout, Sessions & chat, Harnesses, Services and Spending; on desktop each group folds.
- The Claude, Codex and OpenCode settings are split into Global rows (written to the CLI's config file), Per session rows and VibeSpace rows.

## 2.369.131 — 2026-09-21

### Changed
- In Manage agents, an account row with usage shows the name on the first line and the email on the second.
- All Settings… is a direct row in the ⚙ menu, right after Manage agents…, instead of sitting inside Appearance.

### Fixed
- Installing xpra no longer makes every desktop app launch fail.

## 2.369.130 — 2026-09-21

### Changed
- The Channels panel is redesigned as a clean list: a folding section per service with a state dot, its actions under ⋯, and aligned conversation rows.
- Channels badges use one colour per meaning (needs you, live, age, warning, failed) and merge into one when the panel is narrow.
- Connecting a channel account is a step-by-step wizard whose main button opens the consent page, with Copy link beside it.
- The Outbox groups proposals by state with Awaiting and All views, and shows the identity warning once instead of on every card.
- A channel conversation window shows day separators, groups messages by author and has a compact composer.
- The Integrations window shows a key's state as a chip with a one-line explanation, and the channel rule and reach editors use tidy two-column forms.
- Channels, Outbox and Integrations now speak Chinese and Japanese, their error messages and the For you items they file included.
- On a phone, the Channels screens have bigger tap targets and never scroll sideways.

### Fixed
- The Channels panel no longer jumps back to the top every time something in it changes.

## 2.369.129 — 2026-09-21

### Fixed
- The ⚙ menu no longer shows System twice; System monitor… and Ports… now sit inside the System group.
- Scrolling up through a long run of folded tool calls no longer jumps to the top of the previous page or freezes Chrome.
- Account names in Manage agents are no longer squeezed to one letter beside a long email.

## 2.369.128 — 2026-09-21

### Fixed
- On a phone, a long install path in the Manage agents warning now wraps instead of pushing the list sideways.

## 2.369.127 — 2026-09-21

### Changed
- The CLI's "Stop hook error" notice is hidden by default; you can show it again in Settings → Chat.

### Fixed
- VibeSpace's own bookkeeping nudge no longer raises a toast at every stop; a different Stop hook that fails still does.

## 2.369.126 — 2026-09-21

### Added
- The CLI's own notices appear in the chat as small notice cards, and urgent ones also pop up as a toast.
- Codex MCP tool calls appear as tool cards with their results.
- After a git push, the session card shows the branch, Session Properties lists the push and an open File Explorer on that folder refreshes.
- A pull request an agent publishes shows as a small card with its link, and the session card gets a PR chip.
- The chat status bar shows how many background tasks are running.
- When the CLI adds new fields to a message VibeSpace already knows, the chat shows one card about it and Diagnostics lists it under Harness drift.

### Fixed
- Old conversations show slash commands and "while you were away" recaps instead of red unknown cards, and message details show how long a turn took.
- A background task's card closes when the task ends, and a failed task's card closes at once.

## 2.369.125 — 2026-09-21

### Added
- On a phone, the For you inbox has its own button on the nav bar and opens as a full-width sheet.
- On a phone, long-press + to start an agent session, a terminal, Files, a browser or the Desktop.
- On a phone, a search chip on the chat status bar opens chat search, and long-pressing a message offers copy, open in editor, fork and details.
- The phone's file explorer shows one Name column, folds bookmarks into a strip and has a long-press Select… mode for acting on several files.
- On a phone, the window switcher lets you add, rename and delete desktops, move windows between them and restore minimized windows.
- The phone's terminal key row gains a Copy screen key, and every key now fits on screen.
- Channels, System… and Ports… open as their own windows where the sidebar rail isn't shown.

### Changed
- On a phone, buttons, chips, tabs, settings rows and terminal keys are bigger and easier to tap, and the settings navigation wraps so every category shows.

### Fixed
- On a phone, the per-message buttons no longer sit on top of the message text.
- In Manage agents, an account's name and email no longer wrap onto two lines when your system font is wide.

## 2.369.124 — 2026-09-21

### Added
- Plugins can place their ⚙ menu items under Tools, Communication, System, Help or Appearance, or add a group of their own.

### Changed
- The ⚙ menu is grouped under Appearance, Tools, Communication, System and Help, with Manage agents…, Update VibeSpace… and Sign out as direct rows.
- On desktop a ⚙ group opens as a flyout to the left and works with the keyboard; on a phone the groups open in place with bigger rows.
- Appearance shows your theme, font size and scale beside its name and holds the quick display settings, Customize UI… and Language.

## 2.369.123 — 2026-09-21

### Added
- Each Claude, Codex and OpenCode setting now says where it applies: to new sessions, read by VibeSpace, or written into the CLI config with its file and key.
- A setting written into the CLI config shows whether it reached this machine, and "Check machines…" lists its state on every registered machine.
- Manage agents → Machines shows the same CLI config status for each machine.
- A new Codex setting chooses whether Codex saves conversation history, or leaves its config.toml alone.

### Changed
- CLI config settings now reach a remote machine whenever a session starts there, not only when its agent tools are installed.
- The setting to auto-resume after a usage limit is back under Chat in Settings.

### Fixed
- A symlinked ~/.claude/settings.json or ~/.codex/config.toml is no longer replaced by a plain file; the link and the file's permissions are kept.

## 2.369.122 — 2026-09-20

### Fixed
- The View Workflow window now follows a running workflow live, as its chat card does, instead of showing placeholder "(agent)" rows.

## 2.369.121 — 2026-09-20

### Added
- In Background Work, a session's header now folds all its jobs with one click; the fold is remembered.
- "Mark all seen (N)" on each session header and on the toolbar marks every finished job you have not looked at as seen, in one click.

## 2.369.120 — 2026-09-20

### Changed
- Every Claude or Codex event VibeSpace does not recognize shows in the chat as a red-bordered "Unknown event" card, with the whole record under "Full record".
- A new fold option lets you fold unknown events like other runs of cards; it is off by default.

### Fixed
- Three Integration settings were missing from Settings when the interface was in Chinese or Japanese.

## 2.369.119 — 2026-09-20

### Added
- A record from Claude or Codex that VibeSpace does not understand yet now shows as a card in the chat, a hint that the CLI may have a new feature.

### Changed
- After a connection drop, open tabs reconnect at slightly different moments instead of all at once.

### Fixed
- The View Workflow window of a running workflow shows its phases, agent labels, states and each agent's last tool, like its chat card.

## 2.369.118 — 2026-09-20

### Added
- A running Workflow's chat card shows its phases and agents live, with each agent's state, last tool and usage.
- For you shows notices, such as spending notices, in their own section below the items that need you, counted in grey on the badge.
- An agent can file a notice with vibespace-ask --notice; it lands in the Notices section of For you, not among the items that need you.
- Claude Code is now told to keep conversations for 100 years instead of deleting them after 30 days; a new Claude setting changes this.

### Changed
- A problem report now records your UI scale and the recent output of every open terminal.

### Fixed
- Selecting text in a terminal at a UI scale other than 100% now selects the lines under the pointer.
- The Desktop window no longer sits on "Disconnected": its connection is kept alive and reconnects by itself.

## 2.369.117 — 2026-09-18

### Changed
- The auto-resume card names when the usage reset is and says the conversation continues about a minute after it.

### Fixed
- Auto-resume and pool switches now wait about a minute after a stated usage reset, so the continue is no longer rejected for being too early.

## 2.369.116 — 2026-09-17

### Fixed
- A newly added account's reset window is now set by readings from its own sessions, not by a /usage panel check alone.

## 2.369.115 — 2026-09-17

### Fixed
- The Agents panel and Manage agents now update their usage numbers while open, instead of keeping the numbers from when you opened them.

## 2.369.114 — 2026-09-17

### Fixed
- The ⟳ quota refresh no longer reports success when its reading was discarded; it tries the account's own /usage panel instead.
- An account whose saved reset window from an older version was wrong now corrects it from its own /usage panel, so its 5h usage updates again.
- Usage readings of an account that only serves conversations the pool moved onto it are no longer discarded as unconfirmed.

## 2.369.113 — 2026-09-17

### Fixed
- In Manage agents, the highlight on the two accounts that reset soonest no longer lands on a pool row.

## 2.369.112 — 2026-09-17

### Fixed
- A message from another agent now shows in the receiving chat as soon as its turn starts, not only when the turn ends.
- Switching conversations on a phone lands on the latest message instead of scrolling into history; tabbed and minimized windows no longer drift either.
- After a successful compaction, earlier "Prompt is too long" cards drop their Compact now button and say the conversation was compacted.

## 2.369.111 — 2026-09-17

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.369.110 — 2026-09-17

### Added
- Manage agents shows a credits chip on an account that would bill usage credits, and the pool uses such an account only as a last resort.
- When the pool has to rely on an account's usage credits, it tells you, at most once every 6 hours.
- "Exclude from pool" is now on each pool member's own menu.
- The ⟳ quota refresh says which source it used and whether the account's identity was confirmed.

### Changed
- If you set On-demand quota refresh to "Manual only" as a workaround, you can set it back to "Auto via the CLI" now.

### Fixed
- A /usage panel check no longer shows another account's numbers; each account is checked in its own separate config.
- Usage numbers filed under the wrong account, such as Fable at 100% on every account, are repaired at every start and again every hour.
- Another way the Fable limit marked an account's whole weekly limit as spent is fixed.

## 2.369.109 — 2026-09-17

### Added
- Every /usage quota check is now logged with its raw answer and what VibeSpace made of it, so wrong usage numbers can be traced.

## 2.369.108 — 2026-09-17

### Changed
- The auto-resume card and its status bar chip name which account and limit the wait is for, and why the account that stopped you is not it.

## 2.369.107 — 2026-09-16

### Fixed
- The Manage agents account list lines up again: every usage donut sits at the same height and the next-usable column has a fixed width.

## 2.369.106 — 2026-09-16

### Added
- Channels can now connect your Lark and Gmail accounts and read their conversations inside VibeSpace.
- When you connect an account you pick which of its conversations Channels follows, and its row says when you will need to re-authorize it.
- ⚙ → Integrations… holds the keys for services such as Lark and Gmail, with a Test button on each row.
- Connecting Gmail reuses the Google sign-in client that Drive storage already uses.
- New Lark and Gmail messages can arrive by push; if push misses messages, VibeSpace goes back to checking on its own and says why.
- You can assign a channel conversation to an agent, with filters that decide which messages wake it; each wake counts toward your spending limits.
- Messages an agent proposes wait in an Outbox for your approval, with a card in the chat and a pointer in For you.
- Approved messages are sent as you on Lark and through a draft on Gmail; a send whose outcome is unknown waits for you to check it.
- Agents read the channels you let them see and propose messages through a new command-line tool.
- A new Channels setting sets how many seconds pushed messages are gathered before one wake lists them all; 0 wakes an agent per message.
- An optional Channels setting appends a "drafted by <agent>" line to messages an agent drafted; it is off by default.

### Security
- Keys the cluster provides to VibeSpace no longer reach the sessions and commands it starts on this machine.

## 2.369.105 — 2026-09-16

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.369.104 — 2026-09-16

### Fixed
- After the pool switches a conversation to another account, the auto-resume card says so instead of claiming a usage limit was hit.

## 2.369.103 — 2026-09-16

### Added
- Finished one-shot jobs move to an archive after 24 hours, failed ones 7 days after you have seen them; both times are settings under Background Work.
- Notifications that were held back, for example by a spending limit, show with their reason in Background Work, its rail tooltip and the chat's status bar.
- Archived jobs can still be listed with vibespace-job list --archived, and an archived job still answers show, poll and logs, marked archived.

### Changed
- The Background Work red badge counts only jobs waiting for you and failures nobody has seen yet; the rest show as a grey "N seen".
- One-shot jobs fold by the session that started them and by name; only running, waiting or unseen ones start expanded.
- A failed job shows its exit code and the last line of its log.
- Spending-limit notices now name what started the most turns in that window.

## 2.369.102 — 2026-09-15

### Added
- Every account in Manage agents shows when it is next usable, such as 2d21h38m, and the two soonest are highlighted.

## 2.369.101 — 2026-09-15

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.369.100 — 2026-09-15

### Added
- Every quota donut in the account list shows its own reset countdown under it, such as 65m, 15h or 3d; a donut with nothing used yet shows none.

### Changed
- The Desktop apps launcher opens on a catalog: click an app to launch it, running apps have Open and Stop, and any command sits under Advanced.

### Fixed
- The Desktop apps dialog no longer shows empty boxes or scrolls its title out of view.
- Your recent desktop apps now survive a page reload.

## 2.369.99 — 2026-09-15

### Fixed
- A newly added account at 1% Fable usage is no longer read as 100%, so the pool stops moving conversations off it.

## 2.369.98 — 2026-09-15

### Changed
- By default, VibeSpace may now start 30 turns per hour and 200 per day per account by itself, 800 per day in total, so Background Work notifications wait less.

## 2.369.97 — 2026-09-14

### Fixed
- Each auto-resume shows one card in the chat, naming why it continued, instead of two.
- The status bar keeps the context % and cache figures while a conversation waits out a usage limit.
- The toolbar Desktop button no longer disappears on page load, and showing or hiding it in Customize is now saved.

## 2.369.96 — 2026-09-14

### Added
- ⚙ → Desktop apps… runs a desktop application on this machine in a VibeSpace window: pick one from the list, run a command or reopen a recent one.
- A desktop app's window names the display method it runs on, counts down to its idle stop and has a Stop button.

## 2.369.95 — 2026-09-14

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.369.94 — 2026-09-14

### Added
- The sidebar rail has a new Channels panel with a conversation list and window; no mail or chat account can be connected yet.

## 2.369.93 — 2026-09-13

### Fixed
- A conversation that asks for Fable stays on an account with Fable left, even when Fable's safeguards answer a reply with another model.
- Hitting the Fable limit no longer marks an account's whole weekly limit as spent.
- The pool no longer warns every ten minutes that no account can serve a conversation while its current account is fine.
- When the pool truly has no usable account, its warning names which limits are spent or nearly spent.

## 2.369.92 — 2026-09-10

### Added
- The Usage window shows cost by origin — main conversation, subagents or workflows — in a new "By origin" group and in "By session".
- The default Usage overview includes a cost-by-origin chart and a session-by-origin panel.
- A custom Usage dashboard panel can group or split its figures by origin.

### Changed
- Your existing usage history is labelled by origin on the first start after updating.

### Fixed
- Usage from agents working in their own git worktree now counts under the project they worked for in "By project".
- A project whose folder was renamed no longer shows part of its agents' cost under the old path.

## 2.369.91 — 2026-09-10

### Fixed
- Usage costs use the right prices for Fable 5.1 and Sonnet 5, so Fable 5.1 cache reads are no longer overstated; prices you edited are kept.

## 2.369.90 — 2026-09-10

### Changed
- While the For you popup is open, a resolved item stays in its place, dimmed and struck through; the usual order returns when you open it again.

### Fixed
- Clicking ✓ in the For you popup no longer slides the next item under your pointer, so quick clicks resolve the items you meant.

## 2.369.89 — 2026-09-10

### Fixed
- A file path in a chat now ends at Chinese or Japanese punctuation, so clicking it opens the file; paths with Chinese or Japanese file names still link.
- A web link in a chat no longer takes Chinese or Japanese punctuation right after it into the link.

## 2.369.88 — 2026-09-09

### Fixed
- On a busy machine with many sessions, creating or closing a session no longer freezes the whole of VibeSpace for 10 to 20 seconds.
- After "Restart now to apply" (Terminate + Resume), the chat window no longer stays blank for about half a minute.

## 2.369.87 — 2026-09-09

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.369.86 — 2026-09-09

### Changed
- Each limit of an account (the plan, a model's own limit, premium) is tracked on its own, so one limit's update no longer overwrites another's.
- A reading shows its source and time only on the limit it measured; a 5-hour update no longer relabels the Fable limit as just read.

### Fixed
- The quota panel no longer shows 0 % for a Codex account that has already used part of its limit.
- A usage-limit refusal is filed on the account that refused, so the pool no longer moves a conversation onto the account that just turned it away.
- The pool no longer keeps a conversation on an account that refused it when that limit shows no reset time, and an account at 0 % is treated as usable.

## 2.369.85 — 2026-09-09

### Fixed
- VibeSpace's own tests no longer leave a fake conversation in your sidebar or fake Fable usage in the Usage window; any already recorded is removed on update.

## 2.369.84 — 2026-09-09

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.369.83 — 2026-09-09

### Fixed
- After a server restart, the queue strip no longer keeps showing a message that already ran, painted red as "no longer queued".
- A message that is still queued when the server restarts no longer disappears from the queue strip of a window that stayed open.

## 2.369.82 — 2026-09-09

### Fixed
- A session restored after a server restart streams again on its own instead of showing "running" with no output until somebody types.
- If a restored session stays silent, VibeSpace checks its connection and re-attaches it by itself when it turns out to be dead.

## 2.369.81 — 2026-09-09

### Added
- Automatic turns — auto-resume, Background Work notices, agent messages, the Stop nudge, Codex reset credits — now have a ceiling per account and per instance.
- A new Spending settings category sets the ceiling (12 per account per hour, 60 per day, 200 per instance per day) and warns in For you at 80 %.
- While an account bills paid overage, no automatic turn runs on it and both quota panels show how much overage is used; turns you type still run.
- A setting, off by default, keeps the pool from switching conversations onto an account that bills paid overage.
- The Stop nudge gives up after 3 unanswered nudges, and its cooldown survives a restart.

### Changed
- The pool keeps a 15 % reserve of an account's weekly limit when it picks an account to move a conversation to.
- A Codex account that reached its spend control is shown as spent on both quota panels.

### Fixed
- An automatic turn is no longer delivered twice when something fails during its delivery.
- Three OpenCode settings that never appeared in Settings are now shown.

## 2.369.80 — 2026-09-09

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.369.79 — 2026-09-09

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.369.78 — 2026-09-08

### Added
- Auto-resume after a usage limit now works in Codex chats, which used to sit idle past the reset, and on the machine's own login without a pool.

### Changed
- When a new reading shows that the limit a conversation waits on is open again, auto-resume continues it right away, once per limit reached.

## 2.369.77 — 2026-09-08

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.369.76 — 2026-09-08

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.369.75 — 2026-09-08

### Fixed
- When you add an account or log in again, its usage is read at once and conversations waiting for a usable account continue right away.
- A ⟳ refresh that finds room on an account also wakes the pool and continues the conversations waiting for it.
- A newly added account no longer shows "no usage data" for many minutes after you log in.

## 2.369.74 — 2026-09-08

### Fixed
- Past quota readings that were filed under the wrong pool account after a switch are moved to the right account (or set aside) when you update.

## 2.369.73 — 2026-09-08

### Fixed
- After the pool switches accounts, a late reading from the previous account is no longer filed under the new one, so its usage no longer jumps up by mistake.
- The pool no longer makes false account switches because of such misfiled readings.

## 2.369.72 — 2026-09-08

### Fixed
- The process list no longer comes up empty on a machine running thousands of processes.

## 2.369.71 — 2026-09-08

### Fixed
- The account-switch notice now shows a conversation's name as you renamed it, not its first message.

## 2.369.70 — 2026-09-07

### Fixed
- When your only conversations are stopped OpenCode ones hidden because its background service is off, the sidebar now shows that row with its Enable action.

## 2.369.69 — 2026-09-07

### Added
- You can run a Claude session in its own git worktree ("Run in a git worktree"); a badge and Session Properties show its path.
- With Claude's brief mode on (a new setting, off by default), messages and files the agent sends you appear as their own cards.
- A read-only Permission rules view shows each Claude, Codex or OpenCode permission rule and where it comes from.
- Beside Permission rules, local checks (Claude's login status and agents, Codex's doctor) run only when you click and make no network request.
- The start card of a Claude chat shows MCP server health, plugin errors, skills and the output style.
- New Claude settings for the prompt cache (System prompt snapshot, per-machine prompt sections, Auto-compact window size) are off by default.

### Changed
- A Claude chat shows a "waiting for you" chip when the turn is paused on you, and compaction, automatic ones included, shows its real stage and outcome.
- A Codex turn you roll back is shown as rolled back in the chat, live and after a reload.
- Slash commands that only work in a terminal no longer appear in the chat's command picker, and status-bar menus stay on screen on a phone.

### Fixed
- A chat whose session ended no longer keeps showing a working chip, a compaction stage or in-progress dots.
- A plain folder inside a checkout on a remote host is no longer shown as an isolated git worktree.
- Turning the OpenCode background service off stops it fully, and a stuck service is stopped before a new one starts instead of being left running.

## 2.369.68 — 2026-09-07

### Changed
- Resuming, forking or restarting a conversation keeps its own model and effort; the instance default applies only to new sessions.
- Session Properties says whether the model and effort shown were your choice, the conversation's own, the instance default or the agent's default.
- Each account's quota panel names where its latest reading came from; a signed-out account's panel says since when it is stale.

### Fixed
- Usage readings are filed under the account a session actually uses after a pool switch, so a signed-out account no longer receives others' numbers.
- Readings filed under the wrong account in the past are moved to the right one or set aside when you update.
- Logging in again clears that account's login warnings in For you at once.

## 2.369.67 — 2026-09-07

### Added
- Manage Agents shows when an account's login expires or has signed out, next to its login button.
- For you warns 24 hours and 1 hour before an account's login expires, and again when it has expired; logging in again silences it.

### Changed
- The pool no longer moves conversations onto an account whose login has expired, signed out or is about to expire.

### Fixed
- An expired or signed-out login is named as such in notices, with a pointer to re-login in Manage Agents, instead of being reported as out of quota.

## 2.369.66 — 2026-09-07

### Changed
- Auto-resume writes fewer cards into the chat: retries and waits are not announced, and a switch card appears once per account it switches to.

### Fixed
- Auto-resume no longer fires again and again into a usage limit, adding a switch card each time; if you turned it off for that, you can turn it back on.
- A usage-limit refusal now marks the account that actually refused, so the pool no longer switches straight back to it.
- After a refused try, auto-resume waits longer each time and stops after three quick tries an hour, even across a restart.

## 2.369.65 — 2026-09-07

### Changed
- Your own message shows its text above a pasted image, live and after a reload.

### Fixed
- In a Codex chat, Steer all now shows a bubble for every message it sends into the turn, not just one.
- Reloading a Codex chat no longer deletes messages you sent more than once with the same text.
- A Codex message with an image no longer shows up twice after a reload.

## 2.369.64 — 2026-09-07

### Added
- In a Codex chat you can drag a queued message to reorder it, edit it in place, run one item now or run the whole queue.

### Changed
- A VibeSpace notice that arrives while Codex is working goes into the running turn instead of waiting in the queue; messages from other agents still queue.
- In OpenCode and other ACP agents, a VibeSpace notice that arrives mid-turn is queued and says it could not be steered in.

## 2.369.63 — 2026-09-07

### Fixed
- After Stop on an OpenCode or other ACP agent, the notice no longer asks you to re-send messages you never sent.
- Resuming a conversation no longer stops unrelated programs that only read its transcript, such as a tail -f of it.
- A remote conversation's cached history is no longer damaged by two updates at once, and a damaged copy is detected and repaired.

## 2.369.62 — 2026-09-07

### Changed
- Codex's ultra effort is shown as "ultra (multi-agent · reasoning xhigh)" when the model names its reasoning level.

### Fixed
- A Codex message's details now show the effort the turn really ran at, for example ultra, instead of the instance default.
- Changing effort in a Codex chat updates the status bar at once, and an effort you set with /effort survives the next resume.

## 2.369.61 — 2026-09-07

### Added
- While a Codex turn runs, Alt+Enter sends your message into the turn as a steer; Enter still queues it.
- A hint under the message box says what Enter and Alt+Enter do, shown only for agents that support them.
- On a phone, a bolt button beside Send steers your message while a turn runs.

### Fixed
- A message that could not be steered into a running Codex turn is now reported even if you answered a permission or reconnected during that turn.
- Session Properties no longer shows two "Config overrides" headers.

## 2.369.60 — 2026-09-07

### Changed
- With more than 8 queued messages the queue strip starts collapsed to one line with Steer all and a chevron to expand; your choice is remembered.

### Fixed
- A long message queue no longer covers the chat: it scrolls in its own box, so the messages and the message box stay on screen.

## 2.369.59 — 2026-09-06

### Changed
- The OpenCode background service is now a plugin under ⚙ → Plugins, off by default; Disable stops it and nothing starts it again.
- The first time you create, fork or open an OpenCode conversation, one dialog offers to enable the service; your answer is remembered on every device.
- While the service is off, the sidebar says stopped OpenCode conversations are hidden and offers Enable.

### Removed
- The setting that started the OpenCode background service automatically is gone; the plugin's switch replaces it.

## 2.369.58 — 2026-09-06

### Added
- A question from a Codex MCP server shows as a question card you can answer.
- Images that Codex generates show in the chat, and a Codex sleep shows a live countdown.
- Session Properties shows the response style in effect and whether it was your choice or a default.

### Changed
- A response style you pick in a Codex chat applies to the running conversation.

### Fixed
- Codex no longer silently replaces the personality set in your own Codex config with "pragmatic".
- A Codex turn no longer hangs on a request VibeSpace could not answer; an unsupported request is named in the chat.
- A session's response style survives a server restart.

## 2.369.57 — 2026-09-06

### Added
- When Codex sub-agents talk to each other, the chat shows a live count of messages and agents and how long ago the last one was.

### Changed
- The lock on an encrypted sub-agent message now explains that OpenAI encrypts it and that it cannot be read on this machine.

## 2.369.56 — 2026-09-06

### Fixed
- Update VibeSpace no longer fails at the install step when a stray link sits inside node_modules.

## 2.369.55 — 2026-09-06

### Changed
- Stop in a Codex chat now also drops every queued message, each marked "Removed (stopped)"; a queued agent or job message is delivered next turn.
- A queued message that was already running when you pressed Stop is marked as already run instead of removed.
- After you press Stop the button reads "Stopping…" until the turn ends, and a second Stop, from you or another device, simply waits for the first.

## 2.369.54 — 2026-09-06

### Fixed
- Scrolling up in a chat right after you switch back to its desktop no longer snaps back to the latest message.

## 2.369.53 — 2026-09-06

### Fixed
- Opening a Codex sub-agent's conversation no longer offers "Resume this session"; a note explains that it is read-only.

## 2.369.52 — 2026-09-06

### Added
- In a Codex chat, a message sent while a turn runs is queued and listed above the message box with Steer now, Remove and Steer all.
- When a queued message cannot be steered, VibeSpace says why and what happens to it next.
- In OpenCode and other ACP agents you can remove a queued message, and Stop marks dropped queued messages "Removed".

## 2.369.51 — 2026-09-06

### Fixed
- Switching desktops no longer makes a chat window that showed the latest messages jump into older history.
- The reason the OpenCode background service was stopped is shown once when you open VibeSpace, not on every check.
- When the OpenCode background service is unavailable, VibeSpace says plainly why.

## 2.369.50 — 2026-09-06

### Added
- A setting lets you turn off starting the OpenCode background service automatically.

### Changed
- An OpenCode background service that runs away is stopped, and you are shown why.
- The Codex sub-agent wait row now says what it is waiting for.

### Fixed
- The OpenCode background service no longer uses lots of CPU, memory and disk by indexing a whole folder such as /tmp.

## 2.369.49 — 2026-09-06

### Added
- Click a Codex sub-agent's name to open its conversation read-only; fold headers list the sub-agents involved and their message count.

### Changed
- Messages between Codex sub-agents show as compact one-line rows.

### Fixed
- Codex sub-agent reports show as their own sub-agent report cards instead of ordinary assistant messages, and no longer appear twice.
- A Codex sub-agent's error shows on its own row and no longer fails the main task.

## 2.369.48 — 2026-09-06

### Added
- Every image a tool looked at (Claude Read, Codex view_image and others) shows as a thumbnail you can expand and click to zoom.

### Changed
- Image cards stay visible when the tool cards around them fold, and a missing image says it is not available on this machine.

### Fixed
- Image thumbnails in Claude's Read cards now appear; they never showed before.

## 2.369.47 — 2026-09-06

### Fixed
- Some compressed Codex conversations no longer vanish from the sidebar, and one started in the same second as another is no longer missing.
- A Codex conversation keeps its name and folder when both a compressed and a plain copy of it exist.
- A remote Codex conversation's history is no longer damaged when its file on the host is compressed; damaged copies are repaired.
- Stop on an OpenCode or other ACP agent no longer sends a prompt it was still preparing, and Stop always clears the queued prompts.
- An ACP agent that exits before it starts is reported instead of leaving a blank window.

### Security
- Denying a permission request from an OpenCode or other ACP agent no longer lets the tool run.
- Text inside a plugin can no longer inject code into the tools VibeSpace gives agents, and a plugin's agent tools now need your consent.
- A plugin's file-access paths can no longer get around the protected folders, and reinstalling a different plugin under a trusted name asks again.

## 2.369.46 — 2026-09-06

### Fixed
- After you change a model's price or an account discount, usage costs and estimates for past periods use the new prices.
- A chat window whose folded messages do not fill the screen loads earlier history by itself instead of stopping short.

## 2.369.45 — 2026-09-06

### Added
- An expanded run of cards keeps a bar at the top of the chat while you scroll through it, with jump-to-start and Collapse.
- An expanded run is marked by a line down its side and ends with a Collapse line, so you can close it from the bottom.

### Fixed
- A folded run no longer counts a tool lookup as an MCP call; it says "tool lookups" instead.

## 2.369.44 — 2026-09-06

### Added
- Every web search and page fetch card shows its query in the card header, with the full text on hover.

### Changed
- Codex search and fetch cards are titled "Web search" and "Fetch page".

### Fixed
- Codex web search cards show the query and its results instead of an empty card.
- Web searches in conversations from the newest Codex versions appear in the chat instead of being missing.
- Finished Codex sub-agent activity shows as a Sub-agent card.

## 2.369.43 — 2026-09-06

### Added
- The message info popup in a Codex conversation shows the model, effort, token usage including reasoning tokens, and the billing account.

### Fixed
- The message info popup names the billing account (pool member, ChatGPT login, subscription or API key) when a message has no record of its own.
- A Codex sub-agent's messages and usage are listed under the sub-agent, with its parent named correctly, instead of under the parent.

## 2.369.42 — 2026-09-05

### Added
- Stopped OpenCode conversations on this machine appear in the sidebar and open with their history.
- You can fork an OpenCode conversation.

### Fixed
- A conversation whose history cannot be read shows an error with Retry instead of loading forever.
- Resuming an OpenCode conversation that is already running no longer starts a second copy of it.

## 2.369.41 — 2026-09-05

### Added
- Codex's "ultra" effort appears in the effort pickers when the model supports it, labelled as delegating to sub-agents at extra usage.
- A stopped Codex conversation whose history file is missing still opens read-only.
- Report a problem now also captures the history of Codex conversations.

### Fixed
- A forked Codex conversation shows the part of its parent's history it was forked from.
- Codex agent messages and sub-agent activity show as cards that fold with their neighbours instead of splitting folded runs.
- A Codex record VibeSpace does not recognise no longer breaks a folded run or drops the turn it belongs to.
- Web searches, shell commands and generated images in older Codex conversations now appear in the chat.
- A resumed Codex conversation keeps its reasoning effort instead of switching to another one.

## 2.369.40 — 2026-09-05

### Fixed
- When a pooled session hits a usage limit, the pool moves it to a usable account and auto-resume continues it at once, not minutes later.
- The pool judges a session by the account it is actually running on, not only the one it was last switched to.

## 2.369.39 — 2026-09-05

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.369.38 — 2026-09-05

### Added
- Plugins can add commands, menu items and keyboard shortcuts.

## 2.369.37 — 2026-09-05

### Fixed
- Updating or reinstalling a plugin starts its new version right away instead of after a delay.

## 2.369.36 — 2026-09-05

### Fixed
- VibeSpace no longer stalls for up to a minute while it computes usage estimates, which left windows stuck opening or loading.
- A chat window following the latest messages no longer jumps up into older history after a reconnect.

## 2.369.35 — 2026-09-05

### Changed
- A tool card for an image the agent read shows the image itself, or its size when there is no file to show.

### Fixed
- Conversations in which the agent reads many images no longer freeze the page or leave other windows stuck opening.

## 2.369.34 — 2026-09-05

### Added
- Images the agent looks at fold into runs like file reads, and the run summary counts them as image reads.

### Fixed
- A folded run's summary counts web searches instead of leaving them out.

## 2.369.33 — 2026-09-05

### Added
- Web searches and page fetches fold into runs; if you customised the card kinds that collapse, tick the new kind once.
- When a usage reading has no weekly reset time, the last known one is carried forward and marked ≈.

### Fixed
- Grep, Glob and LS cards fold with file reads instead of breaking the run around them.

## 2.369.32 — 2026-09-05

### Changed
- The sidebar hides sub-agent threads by default; showing all of them is a choice it remembers.
- Auto-resume's continue message appears as a labelled VibeSpace card instead of as your own message.

### Fixed
- A resumed Codex conversation keeps the model it last ran on, and a model you picked is no longer switched back.
- The Codex ⟳ button refreshes the Codex quota instead of Claude's.
- An account that has just reset shows its reset time as "not started" instead of "?".

## 2.369.31 — 2026-09-05

### Added
- Codex conversations stored compressed by newer Codex versions appear in the sidebar, open, and count in usage.
- Codex conversations on remote machines show their names and whether they are running, and Resume won't start a second copy of a running one.

### Fixed
- Having many Codex conversations no longer slows VibeSpace down every few seconds.

## 2.369.30 — 2026-09-05

### Added
- Install plugin… installs a plugin from a folder, a git URL, a .vsp file or a GitHub release.
- A plugin's ⋯ menu offers Show capabilities…, Update and Uninstall; a removed or replaced plugin goes to a trash folder instead of being deleted.
- Plugins can add their own settings and themes, and a trusted plugin can extend the interface directly.
- Tools that plugins give your agents also work on ssh hosts and paired devices.

### Security
- Turning on a plugin that asks for access first lists what it can reach in plain words, and asks again when that list changes.
- A plugin's server part can reach only the files it declared and start other programs only if it declared that; its network use is listed, not blocked.

## 2.369.29 — 2026-09-05

### Added
- OpenCode is a new agent you can start from New Session when it is installed here, with its build and plan modes and its own models.
- Settings has an OpenCode section for its default model, permission mode and extra arguments.
- Permission cards show the choices an agent offers, in its own order.

## 2.369.28 — 2026-09-05

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.369.27 — 2026-09-05

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.369.26 — 2026-09-05

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.369.25 — 2026-09-05

### Added
- The Plugins panel lists your plugins with their state and any errors, and lets you enable, disable, rescan and open their windows.

## 2.369.24 — 2026-09-05

### Added
- VibeSpace can load plugins: a plugin can add windows to the ⚙ menu, run its own server part and give your agents new tools.
- Plugin windows run sealed off from VibeSpace, and plugin tools never see your agents' credentials.

## 2.369.23 — 2026-09-05

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.369.22 — 2026-09-05

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.369.21 — 2026-09-05

### Added
- You can fork a Codex conversation.
- The billing switcher shows the quota of each Codex account.

### Fixed
- First-run setup counts your named and pooled Codex accounts, and offers Accounts & pool… for Codex too.
- The permission mode menu of a new Codex chat no longer offers Claude's modes.

## 2.369.20 — 2026-09-05

### Added
- Codex chats offer /compact, /review, /model and /effort, and show when the context is being compacted.

### Fixed
- A message you send to a busy Codex chat is queued to run after the current turn instead of being lost or mixed into it.
- Codex MCP tool calls, web searches and image views show while the turn runs instead of only after you reopen the chat.

## 2.369.19 — 2026-09-05

### Fixed
- Refreshing a Codex account's quota asks a running Codex session instead of running Claude's usage check.

## 2.369.18 — 2026-09-05

### Changed
- gpt-6-astra is first in the Codex model lists.

### Fixed
- Pasting images or large text into a Codex chat works, and what you type is no longer applied twice.
- Background Work notifications, agent messages and auto-resume notices show as cards in Codex chats.
- Codex account pools show their current account and members in Manage agents, and switch accounts automatically.
- Resuming a Codex conversation that is already running no longer opens a second copy of it.
- A Codex conversation is no longer named after the plugin suggestions Codex adds to the first message.

## 2.369.17 — 2026-09-05

### Changed
- Sandboxed Codex sessions now have network access, which the VibeSpace tools need; the file sandbox is unchanged.

### Fixed
- Codex sessions in default, safe or read-only mode can now use the VibeSpace tools for status, tasks, questions, jobs and messages.

### Security
- Codex terminal sessions in default mode run sandboxed instead of silently getting full access.

## 2.369.16 — 2026-09-04

### Fixed
- After an update or restart, reopening many chat windows no longer freezes VibeSpace for minutes; windows open one after another.
- A short server stall no longer disconnects your browser and leaves windows blank.
- Terminate always takes effect, even if the connection drops right after you press it.
- A session that ends while its window is opening says so instead of looking live.
- Notifications and messages that arrive while a window loads its history appear at the end, not in the middle of it.

## 2.369.15 — 2026-09-03

### Fixed
- A storage that had files written into its folder while disconnected reconnects; the files are moved to a ".stranded" folder and you are told where.
- Files, the editor and uploads refuse to write into the folder of a disconnected storage instead of writing onto the bare disk.
- A Task Group's context file is written once its storage is connected again instead of into the empty folder.

## 2.369.14 — 2026-09-03

### Fixed
- /design works again with Claude Code 2.1.257 and newer.

## 2.369.13 — 2026-09-03

### Fixed
- On a phone, the Task Groups tab shows small icons instead of one giant icon per screen.

## 2.369.12 — 2026-09-03

### Changed
- A Mac mounts a shared folder without macFUSE, falling back to macFUSE and then WebDAV.
- The rclone VibeSpace installed on a paired Mac is updated to 1.69; an rclone you installed yourself is left alone.

### Fixed
- When sharing a folder to a Mac fails, you see the real reason instead of only "daemon exited with error code 1".
- A mount point typed as ~/folder or with a trailing slash now works.

## 2.369.11 — 2026-09-01

### Added
- Published pages open without a connection, showing the last copy you loaded, with a brief "offline ready" badge.
- Published pages can store large data such as map tiles on your device.

## 2.369.10 — 2026-08-30

### Fixed
- On a phone, the desktop switcher shows each desktop's windows and counts right after a reload, including desktops you have not opened yet.

## 2.369.9 — 2026-08-30

### Fixed
- On a phone, switching desktops returns a chat window to its latest messages instead of an old position.

## 2.369.8 — 2026-08-30

### Added
- After you pick a style for the next resume, the style menu offers Restart now to apply it.
- Right-clicking a window's title offers Restart, Terminate, Resume, Locate in sidebar and Session properties.
- The sidebar card menu has Restart for live sessions, and Locate in sidebar opens, scrolls to and highlights the session.

## 2.369.7 — 2026-08-29

### Added
- Published pages can use your location (the browser still asks) and keep their own saved data across reloads.

## 2.369.6 — 2026-08-28

### Fixed
- When a session hits a limit, the account's usage is checked once more, so an outdated reading no longer makes it wait days for a reset.

## 2.369.5 — 2026-08-28

### Fixed
- In the Desktop window the pointer lands where you click at any UI scale, and the picture is sharper.

## 2.369.4 — 2026-08-28

### Fixed
- Sessions that hit a usage limit are again switched to a usable account and continued automatically, as they were before 2.369.0.

## 2.369.3 — 2026-08-28

### Fixed
- Switching desktops with many chat windows open no longer stutters while the windows are redrawn.

## 2.369.2 — 2026-08-28

### Fixed
- The page no longer freezes for seconds when it reconnects to the server with many chat windows open.

## 2.369.1 — 2026-08-28

### Fixed
- Selecting text in a dialog and letting go of the mouse outside it no longer closes the dialog and loses what you typed.
- Switching desktops with several chat windows open no longer freezes the page for a long time.

## 2.369.0 — 2026-08-27

### Changed
- Auto-resume waits until the account can really be used again; when the reset time is unknown, it checks usage instead of guessing.
- Just before continuing, auto-resume checks again and holds off if the account is still at its limit.
- A turn that finishes normally cancels a pending auto-resume.

## 2.368.34 — 2026-08-27

### Changed
- The auto-resume notice in the chat appears after 90 seconds, so a limit that clears itself right away is not announced.

### Fixed
- A session that hits a usage limit after a pool switch is waited on and continued again instead of being left stopped.
- Auto-resume uses the exact reset time from the limit message instead of guessing five hours ahead.

## 2.368.33 — 2026-08-27

### Fixed
- A session the pool already moved to a working account no longer announces a scheduled auto-resume.
- A pending auto-resume is cancelled as soon as the session produces output again, so no stray continue message is sent.

## 2.368.32 — 2026-08-27

### Fixed
- Auto-resume waits until all of an account's exhausted limits have reset, instead of continuing at the first reset and hitting the limit again.
- A limit message in the chat now schedules an auto-resume too.

## 2.368.31 — 2026-08-26

### Fixed
- Background tasks that finished while the agent was busy no longer show as running forever.
- A task result delivered while the agent was busy shows as a notification card, not as your own message full of markup.
- A Workflow resumed from an earlier run no longer leaves the original card running.
- The status bar's task list no longer drops most tasks while one is live.

## 2.368.30 — 2026-08-26

### Added
- Agent and Workflow cards show whether they are running or failed, and show the summary when they finish.
- Several running Workflows share one status bar chip with a row per run that opens its live view.

### Fixed
- Background agents, Workflows and background commands are still tracked after a restart or resume.
- Tasks from an earlier run of the agent no longer show as running forever.

## 2.368.29 — 2026-08-26

### Fixed
- Scrolling up in a conversation with many folded runs no longer shows a blank screen and jumps far back.

## 2.368.28 — 2026-08-26

### Fixed
- A pooled session waiting at a limit continues as soon as the pool moves it to a usable account.
- Auto-resume also counts the resets of the other accounts in a session's pool, not only the current one.
- Right before a scheduled auto-resume, the pool moves the session to whichever account is usable at that moment.

## 2.368.27 — 2026-08-26

### Fixed
- Auto-resume still waits for a nearer known reset when a limit message names one days away.
- When a reset is too far away to wait for, the chat says the session will not be continued automatically.

## 2.368.26 — 2026-08-25

### Added
- Messages from other agents reach Codex sessions right away: an idle one replies, a busy one reads them after its current turn.

### Fixed
- Codex usage limits are tracked again, so Codex pools switch away from exhausted accounts and reset credits update.

## 2.368.25 — 2026-08-25

### Added
- The usage popup shows each Codex account's reset credits, with ⟳ to re-read them from a running Codex session.

## 2.368.24 — 2026-08-24

### Changed
- The auto-resume chip now appears in Codex chats.

## 2.368.23 — 2026-08-24

### Fixed
- Codex fold summaries now name the files a patch touches in live sessions too, not only in history.
- Codex sub-agent cards no longer break folding when you have saved fold choices; Sub-agent orchestration is added to your saved choices by itself.
- Codex plugin and browser tool calls are shown as cards and fold as external tools instead of breaking a run of folded cards.

## 2.368.22 — 2026-08-24

### Fixed
- Codex fold summaries now list the files each patch writes, every file of a multi-file patch included.

## 2.368.21 — 2026-08-24

### Added
- A new Codex setting lets a session that hits its ChatGPT limit spend a stored reset credit before switching accounts or waiting; it is off by default.
- A successful reset continues the session on the same account; with no credit to use, the account switch or auto-continue wait follows as before.

## 2.368.20 — 2026-08-24

### Added
- In Manage Agents, the ChatGPT section has "+ Add pooled account…" to group several Codex logins into one account.
- When a Codex session on a pooled account hits a usage limit, it restarts on another member; if none can serve it, auto-continue waits for the reset.
- Codex usage readings now update live for the pool member in use.

## 2.368.19 — 2026-08-24

### Changed
- Card folding now works by kind for every backend: Codex command runs and patch writes fold like Claude's, under one set of checkboxes.
- A new Sub-agent orchestration kind, on by default, folds Codex agent cards and Claude's Agent and Task cards; a saved fold selection needs it ticked once.
- Codex command cards are shown like Bash cards, and a Codex session never lists Claude models when the model list cannot be loaded.

## 2.368.18 — 2026-08-24

### Added
- The usage popup shows the same estimated-now overlay for Codex accounts as for Claude accounts.

### Fixed
- Codex weekly usage is no longer shown as the 5-hour window, and a Codex limit that was hit now shows as used up.
- A Codex account's quota stays visible while the account is idle instead of disappearing after about two weeks.
- Usage from the Codex CLI login is no longer counted into your Claude login's cost.
- The cache-efficiency bar no longer shows a cache-write segment on views that hold only Codex usage.

## 2.368.17 — 2026-08-24

### Changed
- The output style and auto-continue settings now live in the Claude category of Settings.

### Fixed
- The Default output style dropdown no longer shows blank options.

## 2.368.16 — 2026-08-24

### Fixed
- Codex messages from sub-agent turns no longer break into garbled fragments; each message is shown whole.
- A Codex session's account row says ChatGPT login and no longer shows the Claude login's quota chips.

## 2.368.15 — 2026-08-24

### Added
- A Codex session announces each sub-agent it starts with a line naming the agent.

### Fixed
- Background tasks that finished no longer show as running forever; cards already stuck heal when the chat is reopened.
- Codex tool cards no longer stay stuck on pending; their output is shown.
- The context percentage of a Codex session started here is shown live instead of an unknown window size.

## 2.368.14 — 2026-08-24

### Fixed
- Spend on an account you use is no longer booked to a deleted account's leftover data, so it counts toward that account's quota estimate.

## 2.368.13 — 2026-08-24

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.368.12 — 2026-08-24

### Fixed
- Quota readings from a session just moved to another pool account are credited to the account actually billed, so an account's weekly usage no longer jumps.
- Limit banners and used-up marks from such a session also go to the account actually billed.

## 2.368.11 — 2026-08-24

### Fixed
- The Update dialog now runs the newest update script, so an install made before the history rewrite updates again instead of stopping.

## 2.368.10 — 2026-08-24

### Changed
- A fresh install downloads about 8 MB instead of 56 MB, because two large rclone files were removed from the repository's history.
- The update script recovers from this history rewrite by itself; if you update by hand, run git fetch origin && git reset --hard origin/master once.

## 2.368.9 — 2026-08-24

### Changed
- VibeSpace installs rclone at start-up when a storage mount needs it and none is on your PATH; your own rclone is never replaced.

## 2.368.8 — 2026-08-24

### Fixed
- Files in a OneDrive mount open again instead of failing with an IO error; existing installs update their rclone copy at start-up.
- A storage mount whose listings work but whose downloads are refused now says so and tells you to reconnect, instead of looking healthy.

## 2.368.7 — 2026-08-24

### Fixed
- Unmounting or re-authorizing a storage mount now really stops its old mount process, so a re-authorized mount no longer keeps failing reads.

## 2.368.6 — 2026-08-24

### Fixed
- A Drive, OneDrive or Dropbox mount whose sign-in has expired now shows a message and a Re-authorize button instead of looking healthy while files fail.

## 2.368.5 — 2026-08-22

### Changed
- The auto-continue chip clearly shows when it is on, with the accent color and an "auto" label, and has its own clock icon instead of an hourglass.

## 2.368.4 — 2026-08-22

### Fixed
- A resumed chat window's status bar now shows the output style and auto-continue state the session is really running.

## 2.368.3 — 2026-08-22

### Fixed
- The output style chip no longer shows your pick as pending for a session that is already running it.

## 2.368.2 — 2026-08-22

### Changed
- The pending output style chip uses an icon instead of an emoji, and auto-continue notices in the chat are plain text.

## 2.368.1 — 2026-08-22

### Added
- A picked output style that is not running yet shows as pending on its chip, with a tooltip naming the saved style and the running one.

### Fixed
- The output style you pick for a session now survives a resume, and a session's auto-continue set to off stays off.
- The chip names the style a session really started with, including one that came from your default.

## 2.368.0 — 2026-08-22

### Added
- Pick a chat session's output style (Concise, Explanatory, Learning or Proactive) from a chip in the status bar; it takes effect on the next resume.
- A new setting picks the output style for new sessions.
- Auto-continue: a chat session stopped by a usage limit can continue by itself when the limit resets; it is off by default, with a toggle in the status bar.
- Auto-continue tries switching pool accounts first, keeps waiting through a server restart and says in the chat when it is armed and when it fires.
- Auto-continue stands down when the session recovers first (a pool switch, a fresh reading or your own prompt) and never fires while the session is working.

## 2.367.3 — 2026-08-21

### Fixed
- When your VibeSpace is mapped to a public address, every link the UI gives you uses that address and follows at once when you map or unmap it.
- The design popover, the Publish page… dialog, published-page links in chat and the Ports panel service paths all hand out the mapped address.
- The device-pairing install command now uses the relay or public address, which the other machine can reach.

## 2.367.2 — 2026-08-21

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.367.1 — 2026-08-21

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.367.0 — 2026-08-21

### Added
- The Ports panel has a This VibeSpace row that publishes your whole VibeSpace at a public address through the relay, and unmaps it with one click.
- While mapped, share links, reverse mounts and remote agent installs use that address; unmapping returns to your setting, which is never overwritten.
- The row shows which address is in effect, and a mapping you asked for is restored when the server restarts.
- Publishing your VibeSpace at a public address is refused while sign-in is turned off, and the refusal says how to fix it.

## 2.366.1 — 2026-08-21

### Fixed
- Published design pages open over a plain http address such as a LAN name or IP, instead of hanging on "Loading artboard…".
- Share links given by an agent now work at whatever address you use to open VibeSpace, instead of naming this machine's hostname.
- The design chip's list of published pages is no longer empty.

## 2.366.0 — 2026-08-21

### Added
- A design chip in the chat status bar asks the agent to build a design canvas from your brief and publish it to your own VibeSpace instead of claude.ai.
- The design chip lists the session's published pages with Open, Copy link and Public or Private; a canvas there can be viewed and exported as PNG or PDF.
- Agents can publish an HTML page to your VibeSpace with the new vibespace-page tool, on remote hosts too; publishing the same file again keeps its link.
- The design popover has a public-link switch for the page the agent will publish, and offers Retry when the design kit is not ready yet.

## 2.365.0 — 2026-08-21

### Added
- When a conversation grows too long for the model, the chat shows a card explaining it with a Compact now button.

### Changed
- While a compaction runs, every device shows that it takes 1–2 minutes, and Stop asks you to confirm before canceling it.

## 2.364.1 — 2026-08-21

### Fixed
- Pasting a large image (over 1 MB) into a chat works again in every session instead of being refused with a request to terminate and resume.
- A refused paste now gives its real reason, such as the size or that the session is still starting.

## 2.364.0 — 2026-08-21

### Added
- Right-click an HTML file and choose Publish page… to host it on your VibeSpace at a stable link; it is private unless you make it public.
- Publishing the same file again keeps its link, and the same dialog republishes, unpublishes, copies the link or opens the page.
- A published page runs sealed off from VibeSpace, so it cannot reach your login or your workspace.

### Fixed
- A "Background Work" sender name in a message card now opens the Background Work panel instead of doing nothing.

## 2.363.2 — 2026-08-20

### Fixed
- Buttons and forms on pages opened through the web view's Proxy mode work again instead of hanging.

## 2.363.1 — 2026-08-20

### Changed
- A Background Work reminder no longer copies its text into your For you inbox unless the agent adds --notify-user; by default it wakes the owning agent.

### Fixed
- A message the server refuses to send, such as a paste that is too large, shows as a notice in the chat instead of turning the window into a Resume bar.

## 2.363.0 — 2026-08-20

### Fixed
- A Background Work reminder or an agent message now shows its card in the receiving chat as soon as it is delivered, naming the sender.
- A message held until an agent's next turn now shows its card when the agent receives it, instead of reaching the agent unseen.
- Message cards name the sender after a reload and no longer show the reply hint or boilerplate notes.

## 2.362.2 — 2026-08-20

### Fixed
- A message from another session now shows in the receiving chat while it is open, at the end of that turn, not only after a reload.

## 2.362.1 — 2026-08-20

### Changed
- In the Chinese interface, a session name quoted in a message card uses corner brackets instead of wide curly quotes.

## 2.362.0 — 2026-08-20

### Added
- Agents can message each other with vibespace-msg: list the sessions they can reach and send text into another session's conversation, on any machine.
- Agents in the same Task Group reach each other; in a Task Group's details you choose whether other groups can see or message it.
- A message for an agent that cannot be reached right now is kept and handed over at its next turn; a message to an idle agent starts a billed turn.
- In a message card the sender's name opens that session and right-click offers Open, Properties and Copy; a sender that is gone shows a notice.

## 2.361.6 — 2026-08-20

### Fixed
- A message card from another session names the sender instead of showing a socket path, and has its border again.

## 2.361.5 — 2026-08-20

### Added
- Each Background Work job has a Delivery log under Auto-notify showing where each notification went and whether it arrived.

### Fixed
- A Background Work reminder an agent scheduled for itself now wakes that agent's conversation, not only your inbox.

## 2.361.4 — 2026-08-20

### Changed
- A scheduled Background Work job that only prints a message now notifies on every run, so a simple reminder is no longer silent.

## 2.361.3 — 2026-08-20

### Changed
- Background Work jobs can be scheduled a relative time ahead, such as +2m, and a new job states when it will first run.

## 2.361.2 — 2026-08-19

### Fixed
- An account that hit its monthly spend limit shows its weekly usage as used up until the stated reset, so the pool no longer keeps picking it.

## 2.361.1 — 2026-08-19

### Fixed
- Image pastes into a chat session started before the last update are no longer lost; a very large one asks you to terminate and resume first.

## 2.361.0 — 2026-08-19

### Added
- A new setting, on by default, lets local Claude sessions report which account billed each request; turn it off to credit usage the old way.

### Changed
- Usage is now credited to the account each request was really billed to, so it stays right after a pool switch.

## 2.360.1 — 2026-08-19

### Fixed
- Setting the stop nudge to every stop (0 and 0) in Manage Agents' Agent instructions no longer turns back into 10 and 30 when you save.

## 2.360.0 — 2026-08-19

### Added
- A stopped session's right-click menu has Rescue transcript…, which repairs a conversation broken by an oversized message and keeps a backup.

### Fixed
- Pasting several large images into a chat no longer breaks the session and blanks its history.
- An oversized message is refused with a visible error instead of being written into the conversation.

## 2.359.1 — 2026-08-19

### Fixed
- The Ctrl+G external editor works again instead of freezing.

## 2.359.0 — 2026-08-18

### Added
- A path mount can be made public with the lock on its address row; you confirm the full URL first, and public mounts show an amber "public" chip.

## 2.358.0 — 2026-08-18

### Added
- When you publish a service through the relay you can choose a fixed subdomain; leaving it blank keeps the previous one, and it survives restarts.
- A "/" button on each Active forwards row serves an app that accepts a URL prefix under your VibeSpace address, behind your login, remote machines included.

## 2.357.0 — 2026-08-18

### Changed
- Background Work lives in the sidebar panel: job cards open in place with details, runs, the log and a form to answer a question, without opening a window.
- Background Work questions and notices in For you are grouped under the agent session that owns the job.

## 2.356.0 — 2026-08-18

### Added
- The process list has a PID column and a pause button for auto-refresh, so a row you are reading stays still.

### Changed
- The history charts sit above the process list, and the memory chart scales to your usage instead of the machine's total.

## 2.355.1 — 2026-08-18

### Fixed
- The process list no longer shows the ps command that refreshes it at the top of the CPU sort at 200%.

## 2.355.0 — 2026-08-18

### Fixed
- After a restart, resuming all stopped sessions includes the ones on your other desktops, not only the current one.
- Changing a pooled account's target now moves its running sessions too, not only new ones.

## 2.354.0 — 2026-08-18

### Added
- The System panel's process list is a full process manager: live CPU % per process, sorting by CPU, memory, PID, name or tree, and a filter.
- Expanding a process shows its command line and details with Terminate, Force kill, Pause, Resume and Copy; the result says if it is still running.
- The process manager works for paired machines and ssh hosts too; where CPU % can only be an average, the panel says so.

## 2.353.0 — 2026-08-18

### Changed
- Port scans label a port whose process belongs to another user, such as user:root, when the process itself cannot be read.

### Fixed
- Port scan results stay in the Ports panel when a notice arrives, and a new-port notice adds its ports to the list.
- A port that disappears and comes back no longer shows the new-port notice again and again.

## 2.352.0 — 2026-08-18

### Added
- Port scans name ports published by Docker containers.
- Active forwards rows show the tag of the Background Work service that created them.

## 2.351.2 — 2026-08-18

### Fixed
- A message from another session that arrives while the agent is busy now shows as a message card when you reopen the chat.

## 2.351.1 — 2026-08-17

### Fixed
- A Background Work job card shows the public link of a port you published from the Ports panel.

## 2.351.0 — 2026-08-17

### Added
- Agents can read the full manual of every VibeSpace agent tool with vibespace-docs.

## 2.350.0 — 2026-08-17

### Added
- Agents can read the full Background Work manual on demand, always matching your running version.

### Changed
- In For you, Background Work items have their own section after the session groups.
- A message card from another session has its own color bar, distinct from the agent's and notices.

### Fixed
- Answering a Background Work question clears its For you item, and removing a job clears all of its items.
- Stopping a Background Work job just as it starts no longer leaves it running.
- A scanned port that already has a forward shows a forwarded or published chip.

## 2.349.0 — 2026-08-17

### Added
- A scanned port that already has an active forward shows a forwarded or published chip with its public link, instead of another forward arrow.

### Fixed
- A message from another session or a Background Work reminder now shows in the chat as a card, instead of the agent starting a turn from nothing.

## 2.348.1 — 2026-08-17

### Fixed
- A For you item from a Background Work job shows the job's name, and clicking it opens that job's panel directly.

## 2.348.0 — 2026-08-17

### Changed
- A Background Work job that announces often now takes one line in an agent's updates, so finished and failed jobs are not crowded out.

## 2.347.0 — 2026-08-17

### Added
- Agents can subscribe to a Background Work job with a filter, so only matching notifications reach them.
- Agents can see a job's full setup and list the jobs they own or subscribe to.

## 2.346.0 — 2026-08-17

### Added
- A scheduled Background Work job can be set to notify on its successful runs too; by default a successful scheduled run stays silent.
- A job can announce that it found something worth telling, such as a news monitor spotting news, and the message reaches its conversation and subscribers.

### Changed
- When a conversation missed many job notifications, the shortened summary it receives now points to a file holding the full history.

## 2.345.0 — 2026-08-17

### Added
- Any conversation that can see a Background Work job can subscribe to its notifications, which covers every run of a scheduled job.

### Fixed
- The brief given to a job when it was created now appears in its completion and failure messages instead of being dropped.

## 2.344.2 — 2026-08-17

### Added
- An agent can switch a job's automatic notifications on, off or back to the default without recreating the job.

## 2.344.1 — 2026-08-17

### Fixed
- Local chat sessions started before 2.344.0 now receive Background Work notifications instead of losing them in a dialog nobody sees.
- A one-time job whose time was missed no longer repeats its missed-time message forever; it stops and can be started again.
- A failure reported right after a completion is no longer dropped; it reaches the conversation at its next turn.
- A job's detail no longer says "nothing sent yet" after a notification was delivered through the VibeSpace channel.
- Sessions on remote machines no longer start with the job notification settings meant for local sessions only.
- A second server started against the same data no longer overwrites your jobs when it shuts down.

### Security
- The sockets that carry notifications into sessions are now private to your user, and stale ones are removed at startup.

## 2.344.0 — 2026-08-17

### Added
- Background Work jobs now message the conversation that created them when they finish, fail, are parked, miss their time, ask you something or get your answer.
- An idle agent starts a new turn for such a message, billed like a prompt you typed; routine successful scheduled runs stay silent.
- Notifications are on by default; turn them off in Settings → Integration, per Task Group in the Task Group window, or per job.
- If the conversation is closed, its notifications wait and are handed to the agent when you resume it.
- Session Properties has a Background Work section showing whether notifications are on and why, and each job shows its last notification result.
- An experimental setting, VibeSpace channel (off by default), delivers job notifications to new local Claude sessions as channel events.

## 2.343.4 — 2026-08-17

### Fixed
- An agent polling an old run id of a scheduled job whose runs were merged now gets the merged record's id instead of "not found".

## 2.343.3 — 2026-08-17

### Changed
- Successful scheduled runs are now silent, for you and for the agents in the job's Task Group; only failures and runs waiting for you are reported.

### Fixed
- A scheduled job no longer adds a new card for every run; it keeps one card with a count of its runs.
- Existing piles of per-run cards are merged into one at startup, keeping the newest.

## 2.343.2 — 2026-08-17

### Fixed
- The reason a session ended is shown again, and model lock, stop-on-fallback and quota refresh from a live session work again.
- The model list refreshes again when an API key is set, and usage of workflow runs is counted again.
- SSH machines now move themselves to a WebSocket link when a public URL is set, which before this version never happened.
- Problem reports include your window layouts and their history again.
- A machine's exit-node toggle shows its real state, and a second click no longer sends the opposite value.
- Background Work items in For you open the Background Work window instead of a "session not found" message.

## 2.343.1 — 2026-08-17

### Fixed
- Plugin status updates and publishing a port no longer fail with an internal error.

## 2.343.0 — 2026-08-17

### Added
- The Ports panel recognizes a port opened by a registered Background Work service, names it, and skips the new-port message.
- A service started with --publish gets a port forward and, when frp is set up, a public URL on its job card; both go away when it stops.

### Fixed
- Publishing a port to a public URL works again instead of failing with "public URLs are not available on this instance".

## 2.342.2 — 2026-08-17

### Fixed
- Agents in a Task Group are now told about Background Work, so they can create jobs too.

## 2.342.1 — 2026-08-17

### Added
- Background Work has its own item in the activity rail, with a badge counting failed, waiting and running jobs.
- You can create a job yourself with + New in the Background Work window.

### Changed
- The Background Work window is redesigned, with cards colored by state, counts per section, a summary line and a clearer detail view.

### Fixed
- A resumed session now finds its Background Work jobs in its starting context, and each message carries only new job updates.

## 2.342.0 — 2026-08-17

### Added
- Background Work: agents can run long tasks, keep services up and schedule jobs that outlive the conversation, on this machine for now.
- Kept-up services come back after a server restart, restart after a crash and are parked after repeated crashes.
- Scheduled jobs run at an interval, on a cron schedule or at a set time; a missed run is reported, never silently skipped.
- A job can ask you something in a small form window and read your answers.
- Each job has view and control access by session, Task Group or everyone, and you can lock a job so agents cannot change its access.
- The Background Work window (⚙ → Background Work) lists jobs with run history, their brief, access controls and log tails with secrets hidden.
- The window also lists, read-only, any systemd or crontab entries an agent set up by hand.
- Jobs run without your login credentials, and commands aimed at AI vendor endpoints or credential files are refused.

## 2.341.1 — 2026-08-17

### Fixed
- Mounts, terminals and checks on paired devices, and installing the device agent over SSH, work again instead of failing with "Cannot find module".

## 2.341.0 — 2026-08-16

### Added
- The code editor has a reload button and watches the file: an unedited file reloads itself, an edited one shows "File changed on disk".
- Reloading an edited file always asks before discarding your changes; a file on an SSH machine is checked when you return to its tab.
- Viewer windows for images, video, PDFs, spreadsheets and documents have a floating reload button that shows the file's current contents.

## 2.340.3 — 2026-08-16

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.340.2 — 2026-08-15

### Fixed
- Quota readings from Claude's own rate-limit messages are captured again, so pool switching and quota estimates use them.

## 2.340.1 — 2026-08-15

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.340.0 — 2026-08-15

### Fixed
- Estimated quota use between readings is more accurate during bursts of heavy use, where it read too low.
- Model-specific weekly caps such as Fable are now updated from Claude's own rate-limit messages.
- Usage made with the machine's own Claude login now counts toward the estimate for the subscription it belongs to.

## 2.339.4 — 2026-08-15

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.339.3 — 2026-08-15

### Fixed
- Moving or overlapping windows no longer redraws every large chat underneath them, easing the page freezes seen on Windows.
- Problem reports now include the version of the page that sent them.

## 2.339.2 — 2026-08-15

### Fixed
- A chat no longer shows "thinking" forever after a server restart when its turn had already ended.
- Some sessions now keep their goal, to-do list, running agents and output across server restarts instead of losing them each time.

## 2.339.1 — 2026-08-15

### Fixed
- Moving or resizing the browser window no longer freezes the page or pages a chat through its history.

## 2.339.0 — 2026-08-15

### Changed
- The For you badge shows separate counts for urgent, high and other items, each in its own color.

## 2.338.0 — 2026-08-15

### Fixed
- Typing past three lines in the chat box no longer freezes the page or pages the chat back through its history.
- A long chat no longer freezes for seconds when new messages arrive or stream in.
- Very long code output is drawn up to 3000 lines, with a note for the rest, instead of building it all at once.
- After a server update, chat windows reload one after another instead of all at once.
- With many terminals open, only 12 use graphics acceleration, so opening more no longer stalls the page or slows older terminals.

## 2.337.3 — 2026-08-15

### Changed
- The usage popup's note about the machine's Claude login no longer tells you to run /login; it explains the quota is merged and nothing is needed.

## 2.337.2 — 2026-08-13

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.337.1 — 2026-08-13

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.337.0 — 2026-08-13

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.336.1 — 2026-08-13

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.336.0 — 2026-08-13

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.335.1 — 2026-08-13

### Fixed
- The server starts again after updating; the previous version crashed at startup.
- When a pool member fails to sign in, every conversation on it moves away promptly instead of waiting a minute each.
- When a pool's default account moves, every session using the default restarts on the new one, not only the one that hit the problem.
- A pool member marked as failing to sign in is cleared only by a real re-login.
- Removing the last chosen member of a pool no longer opens the pool to all your logged-in accounts.
- A tool's output that mentions an authentication error no longer takes an account out of the pool.

## 2.335.0 — 2026-08-13

### Changed
- A pool now moves off a member that is banned, out of credit or whose login expired, even with automatic switching off, and tells you.

### Fixed
- Deleting an account now removes it from its pools at once and moves the sessions billing to it onto another member.
- Resuming a conversation whose account was deleted uses the machine's own login with a notice instead of failing.

## 2.334.1 — 2026-08-13

### Fixed
- Recent and History no longer stay broken when the machine picked there was removed; they switch back to Local and tell you.

## 2.334.0 — 2026-08-13

### Changed
- With quota refresh set to Auto via the CLI, idle accounts are also refreshed after 30 to 60 minutes, and unread accounts get a first reading.
- An account whose quota refresh keeps failing is retried less and less often.

## 2.333.0 — 2026-08-13

### Changed
- If you re-login an account as a different login, the login moves to the account it belongs to or to a new entry, and the old account keeps its history.

### Fixed
- Manage Agents shows the hook status again instead of saying it cannot read it.

## 2.332.0 — 2026-08-13

### Added
- An account's ⋯ menu has "Re-login on this machine…" (or "Log in on this machine…" when signed out), keeping its place in pools.
- The login reports success only once the sign-in has finished, and shows the error if it fails.

## 2.331.0 — 2026-08-13

### Fixed
- After a restart, the offer to resume interrupted sessions covers every desktop, and each session returns to its own desktop.

## 2.330.2 — 2026-08-13

### Fixed
- A pool whose chosen member is logged out now starts sessions on another logged-in member instead of failing every resume.
- When every member of a pool is logged out, the error says so and points you to Manage Agents.

## 2.330.1 — 2026-08-13

### Fixed
- The app starts again instead of staying on a blank loading screen; the previous fix was incomplete.

## 2.330.0 — 2026-08-13

### Fixed
- The app no longer stops on a blank loading screen, a problem since 2.327.0; the fix is completed in 2.330.1.
- The device daemon no longer retries its self-upgrade every few seconds forever, which could use a lot of memory.

## 2.329.0 — 2026-08-12

### Added
- A new quota refresh mode, Auto via the CLI, keeps quotas current by running Claude's own /usage in the background; the default stays manual.
- It refreshes within minutes during heavy use, less often when use is slow, and never touches idle accounts.

## 2.328.1 — 2026-08-12

### Changed
- The usage popup's notice that the machine's Claude login expired now says this is normal with pooled accounts and warns against /logout.

## 2.328.0 — 2026-08-11

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.327.0 — 2026-08-11

### Changed
- The quota ⟳ refresh can now use Claude's own /usage panel, so accounts without a live session refresh too, model caps like Fable included.

### Fixed
- A chat following the latest messages no longer pages up into history on its own.
- A chat you are reading back through no longer jumps toward the latest messages without you scrolling.

## 2.326.0 — 2026-08-11

### Fixed
- Building a fresh install no longer fails the first time.

## 2.325.0 — 2026-08-11

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.324.0 — 2026-08-11

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.323.0 — 2026-08-11

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.322.0 — 2026-08-11

### Fixed
- A chat that shows the agent replying but receives nothing for two minutes now reconnects and catches up, instead of waiting until you type.

## 2.321.0 — 2026-08-11

### Added
- When the browser suspended the page, VibeSpace notices on wake, catches up and tells you how long the page was suspended.

## 2.320.0 — 2026-08-11

### Fixed
- After a server restart, remote machine lists show their last known sessions at once instead of staying empty for up to a minute.

## 2.319.0 — 2026-08-11

### Added
- Claude terminal sessions on remote machines now report their quota readings, like local ones.
- An optional setting, Local session discovery via device daemon (off by default), keeps a slow home folder from stalling the server.

## 2.318.0 — 2026-08-11

### Added
- An optional setting, Local sessions via device daemon (off by default), runs new local chat sessions under the device daemon instead of dtach.

## 2.317.0 — 2026-08-11

### Changed
- Sessions run by the device daemon keep updating their model, usage and to-do list when the link to the session drops for a moment.

## 2.316.0 — 2026-08-11

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.315.0 — 2026-08-11

### Added
- Conversations in one pool can now bill different members, each placed on an account with quota for the model it runs.
- When one model's cap is spent, only the conversations running that model move; the others in the pool stay put.
- Usage is attributed per conversation, and the billing badge shows the account this conversation actually uses.

## 2.314.0 — 2026-08-11

### Fixed
- The System panel shows a containerized remote machine's own memory limit instead of its host's, and a Mac's memory in use like this machine's.

## 2.313.0 — 2026-08-11

### Fixed
- A pool with no usable member now always tells you, whichever way it got stuck, and tells you again an hour later if it still is.
- The notice names what is spent and what is still available, such as one model's weekly cap against the 5-hour and 7-day quota.

## 2.312.0 — 2026-08-11

### Fixed
- A pool whose current account is out of quota now switches to a member that still has quota instead of staying on the spent one.
- A pool with no usable member now tells you, naming the best remaining member, instead of staying silent until you hit a limit.
- The System panel no longer shows memory stuck at 100%; it shows memory in use, with the total and the cache listed underneath.
- Memory history recorded before this version keeps its old, inflated values; only new readings use the corrected measure.

## 2.311.0 — 2026-08-11

### Changed
- Once its agent answers, an SSH machine moves itself to a WebSocket link when a public URL is set; this is on by default in Settings → Integration.
- A failed move is reported and leaves the machine on SSH, and each machine can opt out.

## 2.310.0 — 2026-08-11

### Changed
- Remote session lists update themselves when they change, and an unreachable machine shows an error while keeping its last known list.

## 2.309.0 — 2026-08-11

### Fixed
- Terminating a session on a remote machine now updates its Recent list at once instead of showing it as live until you refresh.

## 2.308.0 — 2026-08-11

### Fixed
- Paging through chat history with touch, the scrollbar or the keyboard no longer bounces back toward the latest messages.

## 2.307.0 — 2026-08-11

### Fixed
- Scrolling up through chat history no longer jumps back toward the latest messages after a page loads.
- A limit hit by a session outside a pool no longer moves the pool off its account.

## 2.306.0 — 2026-08-11

### Fixed
- Scrolling up through a chat's history no longer yanks the view back to the latest messages about once a second.

## 2.305.0 — 2026-08-11

### Fixed
- A pool now sees when an account's Opus or other model's weekly cap is spent and switches away from it.
- With several pools, a limit hit in one pool no longer switches another pool's account.
- A pool set to manual is no longer switched automatically, and deleting a pool stops its automatic switching.
- Some requests from remote machines are no longer counted twice in live usage.

## 2.304.0 — 2026-08-11

### Fixed
- Two sessions started at the same moment can no longer share their saved session data.

## 2.303.0 — 2026-08-11

### Fixed
- Sessions restarted together, such as after a pool account switch, no longer take on another session's name, folder, account or conversation.

## 2.302.0 — 2026-08-11

### Fixed
- Sessions created at the same moment, as multi-agent tools do, no longer overwrite each other's name, conversation or billing account.

## 2.301.0 — 2026-08-10

### Fixed
- Paging up in a busy chat window no longer bounces back to the newest messages every second.
- Loading older messages while scrolled to the very top of a chat keeps the message you were reading in place.

## 2.300.0 — 2026-08-10

### Fixed
- A usage limit hit while the VibeSpace server is down or restarting no longer leaves pooled sessions stuck on the spent account; the pool still switches.

## 2.299.0 — 2026-08-10

### Changed
- Usage on a remote machine, including sessions started outside VibeSpace and workflow runs, now reaches the Usage window and the pool within seconds.

## 2.298.0 — 2026-08-10

### Changed
- A quota refresh for an account logged in on another machine now runs on that machine, so its login token is never used from the server.

### Security
- A credential sent to a paired device is private to your user from the moment it is written, with no moment when others on that machine could read it.

## 2.297.0 — 2026-08-10

### Changed
- When a machine that was using an account goes offline, the pool treats that account as more used and switches away sooner rather than too late.
- Resuming a conversation finds the machine it belongs to even when its history was never opened from this server before.

### Fixed
- Usage an account spends on another machine now counts toward that account's usage estimate.
- A remote session using that machine's own login no longer raises this machine's login estimate for a while and then drops back.

## 2.296.0 — 2026-08-10

### Added
- ⚙ → Restore a previous layout… puts your windows back on the desktops they were on before something moved them; the restore itself can be undone.
- A Report a problem capture now records which windows were moved between desktops and which desktop each window was on.

## 2.295.0 — 2026-08-10

### Fixed
- Switching a pool's account no longer piles every restarted session onto the desktop you are looking at; each window returns to its own desktop.

## 2.294.0 — 2026-08-10

### Changed
- The billing row in a remote reply's message details now names the account it was billed to as well as the machine.

### Fixed
- Per-account cost now includes what ran under that account on other machines instead of leaving it out.
- Message details no longer say remote usage is collected every 15 minutes; it now arrives within about a minute.

## 2.293.0 — 2026-08-10

### Changed
- Scrolling far back in a very large remote conversation now fetches only what you see, and searching all of it fetches only the matches.

## 2.292.0 — 2026-08-10

### Changed
- Opening, paging and searching a remote session's history now runs on the machine that holds it, sending only what is shown instead of the whole file.
- Remote machines now work out their own session lists; a machine that cannot be reached shows a warning instead of failing silently.

## 2.291.0 — 2026-08-10

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.290.0 — 2026-08-10

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.289.0 — 2026-08-10

### Changed
- Chat sessions now update their quota readings from the CLI's own replies instead of only showing the last known value.
- When a chat session hits a usage limit, the pool now marks that limit as spent and reacts at once.

### Fixed
- A limit hit by a remote session under that machine's own login is now recorded for that login instead of this machine's.

## 2.288.0 — 2026-08-10

### Fixed
- Sessions on a busy paired machine with a slow disk no longer stall each time its session list is refreshed.

## 2.287.0 — 2026-08-10

### Changed
- Usage on a remote machine, including Codex turns and terminals started outside VibeSpace, reaches the Usage window and message details within a minute.
- A paired machine's session list now refreshes when something changes there.

### Fixed
- Codex usage on remote machines is now recorded in the usage history instead of vanishing.

## 2.286.1 — 2026-08-10

### Fixed
- Clicking the minimap in a tool-heavy chat now lands on the message you clicked instead of about 20 messages earlier.
- Jumping to a search result in such a chat lands on the right message too.

## 2.286.0 — 2026-08-10

### Fixed
- Usage from a paired machine is no longer lost when the connection drops while it is being collected.

## 2.285.0 — 2026-08-10

### Fixed
- The message details of a past tool call now show when it actually ran instead of when the chat was reloaded.

## 2.284.4 — 2026-08-10

### Fixed
- Forking a conversation that is still running, here or on a remote machine, no longer stops the original session mid-turn.

## 2.284.3 — 2026-08-10

### Changed
- Usage from remote sessions reaches the Usage window and message details about a minute after each turn instead of up to 15 minutes later.

## 2.284.2 — 2026-08-10

### Added
- When the API is failing and the CLI retries, the chat spinner says so with the attempt and error, such as API retrying (3/10, HTTP 500).

### Fixed
- Resuming a conversation on this machine now first stops any other process still writing it, so two sessions cannot write one conversation.

## 2.284.1 — 2026-08-10

### Changed
- The model menu's built-in entries no longer show a context size that may be wrong; the status bar shows the real one.

### Fixed
- Message details now name the billing account for every reply, including replies shown live and remote ones, not only replies loaded from history.

## 2.284.0 — 2026-08-10

### Changed
- The account switcher now says clearly whether an account uses its own login held on a machine or is that machine's own login.
- UI scale now ranges from 60% to 200% and UI font size from 75% to 175%.

### Fixed
- Message details now name a remote reply's machine login, or the session's account when nothing better is known, instead of a stuck or missing billing row.
- The model menu now always lists Fable 5, Opus 5, Sonnet 5 and Haiku 4.5, not only models that once ran in a local terminal.
- In Customize mode the workspace dims visibly on dark themes, and the taskbar's pill stays visible with the taskbar docked at the top.
- Right-clicking an extra toolbar row now opens its bar menu instead of the browser's own menu.
- Items in the bottom extra row no longer resize with the taskbar and match the same items in the top row.

## 2.283.0 — 2026-08-10

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.282.0 — 2026-08-10

### Fixed
- A hung disk path on a paired machine no longer freezes that machine's sessions; the stuck operation fails after a few seconds instead.

## 2.281.0 — 2026-08-10

### Changed
- Manage agents now reads a paired machine's agent CLIs and logins the same way as this machine's, so the two can no longer be reported differently.

## 2.280.0 — 2026-08-10

### Fixed
- A tool call that arrives both live and from saved history now shows as one card instead of two.

## 2.279.2 — 2026-08-10

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.279.1 — 2026-08-10

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.279.0 — 2026-08-10

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.278.0 — 2026-08-10

### Fixed
- A session gets the same name on every machine, and one whose first message was cut off is no longer left without a name.
- A paired machine no longer shows a running session that is not there when an old process id was reused by another program.

## 2.277.0 — 2026-08-10

### Added
- A context file too large to sync now shows a notice naming the file and the machine it will not reach.

### Fixed
- Context folder files up to 16 MB (1,000 files) now reach paired devices, which silently stopped at 2 MB or 400 files before.

## 2.276.1 — 2026-08-10

### Fixed
- The refresh button in the usage popup now spins only its icon instead of the whole button.

## 2.276.0 — 2026-08-10

### Added
- When resuming a conversation stops another process that was still writing it, a message now tells you how many it stopped.

## 2.275.0 — 2026-08-10

### Fixed
- Typing a backend name such as codex in the session filter now matches remote sessions too, not only local ones.
- File Properties shows the size of a folder on a remote machine again.
- Opening a relative file path from a conversation on a remote machine now says it cannot be looked up there instead of file not found.

## 2.274.0 — 2026-08-10

### Fixed
- On remote machines with a dash shell, VibeSpace's agent tools no longer fail to start because Node was not found.

## 2.273.0 — 2026-08-10

### Changed
- Sessions of an unreachable machine are labelled last known with their age instead of looking like a fresh scan.
- Opening a session, picking an account or browsing files on a slow machine now shows it is loading, or that the machine could not be reached.
- When a session on a slow machine takes too long to open, the message says it may still be loading instead of telling you to reload the page.
- The interface is now fully translated into Chinese and Japanese.

### Fixed
- A machine picker that failed to load when the page opened now retries instead of staying empty until you reload.
- Actions that fail on the network now show an error instead of silently looking as if they worked.
- The session list no longer empties when one refresh fails; after repeated failures it says it may be out of date and since when.
- Terminating several sessions at once now also stops marked remote sessions and says how many it skipped, instead of claiming all stopped.
- A remote machine that cannot be scanned keeps its cached sessions instead of showing Scanning sessions over ssh… forever.
- In the file explorer, a slow remote listing no longer replaces the folder you moved on to, and drag-copying files shows progress.
- Scrolling far back, the minimap and full search in a large remote conversation now read that conversation instead of coming back empty.
- A failed remote View Log now says why, and a failed Task Group load is reported instead of leaving the board empty.

## 2.272.0 — 2026-08-10

### Added
- If VibeSpace cannot check that no other process is writing a conversation before resuming it, you now get a warning.

### Fixed
- Resuming a conversation on a slow remote machine no longer kills the conversation still running there; you get an error you can retry instead.
- Terminating a session on another machine now tells you when the stop could not be confirmed, instead of implying it stopped.
- A brief connection drop to a paired device no longer stops usage collection from all machines until a restart.
- A chat or terminal on a paired device no longer stays blank forever when the connection drops while it opens.
- The quota refresh now says a machine is unreachable instead of claiming it has no login token.

## 2.271.0 — 2026-08-10

### Fixed
- Starting or stopping a session on a slow remote machine no longer freezes the whole VibeSpace server for up to 20 seconds.
- Usage from workflow agents on remote machines is now counted in the usage history and estimates.

## 2.270.0 — 2026-08-10

### Fixed
- The usage estimate now rises within seconds while a workflow runs instead of lagging minutes behind the real usage.

## 2.269.0 — 2026-08-10

### Changed
- A macOS subscription kept in the Keychain is marked this machine only: it is never exported or sent to another machine, and says why.

### Fixed
- Adding a named Claude subscription on macOS now completes its login instead of staying not logged in forever.

## 2.268.9 — 2026-08-10

### Added
- In Manage agents → Machines, a folded machine shows its connection (paired devices) and its login's tightest quota at a glance.

### Fixed
- The theme editor no longer copies your unsaved edits into another base theme's defaults when you switch base theme and save.

## 2.268.8 — 2026-08-10

### Fixed
- Adding a new OneDrive mount now works instead of failing with a confusing rclone error.
- Re-authorizing a OneDrive or other non-Google mount now names the right provider and actually saves the new sign-in.

## 2.268.7 — 2026-08-09

### Added
- Rows in the Agents roster show when their tightest quota resets, and each usage donut's tooltip shows its own reset time.

## 2.268.6 — 2026-08-09

### Added
- Reset times in the quota popup now carry a live countdown, such as Tomorrow 3:00 · in 1d10h50m.

## 2.268.5 — 2026-08-09

### Changed
- Account lists show pools first, then subscriptions, then API keys, by name, in Manage agents, the billing switcher and New Session.

## 2.268.4 — 2026-08-09

### Changed
- With named or pooled accounts in use, the machine-wide Log in button moves into the Add account menu so it no longer looks like the main action.

## 2.268.3 — 2026-08-09

### Removed
- The Set up both… entry is gone from the Anthropic Add account menu.

## 2.268.2 — 2026-08-09

### Changed
- The pool now switches away from a weekly limit only when 5% is left (3% at the latest), keeping 10% for the 5-hour limit, so weekly quota is used more fully.

## 2.268.1 — 2026-08-09

### Changed
- The 5-hour usage estimate now treats cache reads as nearly free, which brings it much closer to the real reading.

## 2.268.0 — 2026-08-09

### Changed
- The 5-hour usage estimate is more accurate: it now learns that cache writes use up the limit more slowly than other usage.

## 2.267.4 — 2026-08-09

### Changed
- The first-run setup's Claude card has an Accounts & pool… button, and named or pooled accounts count as ready without the machine-wide login.

### Fixed
- Manage agents says a machine login has expired or was never set up, instead of always blaming idleness.

## 2.267.3 — 2026-08-09

### Fixed
- The live usage estimate no longer counts an active conversation's requests twice, which could show about double the real usage and mislead the pool.

## 2.267.2 — 2026-08-09

### Fixed
- New sessions get VibeSpace's agent tools, status line and hooks again after a recent update moved them to the wrong place.

## 2.267.1 — 2026-08-09

### Changed
- Manage agents no longer says Claude Code is not logged in while named or pooled accounts carry your sessions; it says how many are in use.

### Fixed
- The billing switcher and New Session show a pool with its current account instead of API or API key undefined, and disable it for remote machines.
- On a phone, the quota chip includes model weekly limits, and the window switcher names the pool and its current account.

## 2.267.0 — 2026-08-09

### Fixed
- Quota estimates no longer run high after a limit message; they are recomputed from every earlier reading.
- The quota preview beside each account in the Switch billing menu shows the current estimate instead of an old reading that disagreed with other displays.
- A chat on a paired device no longer freezes for good after the device's connection drops; it recovers once the device dials back in.
- A tab keeps receiving settings changed in other tabs after you change a setting in it, instead of ignoring them until you reload.
- A stale tab no longer undoes stars, renames or session settings made in your other tabs; it can only overwrite what it changed itself.
- Resuming with an account you picked bills that account, instead of reattaching a remote session still billed to its old account.
- With a pool as your default account, a new session on a remote machine uses that machine's own login.
- A chat that reconnects after a long retry shows the live conversation again instead of a stale view.
- A session in a remote folder now shows under the same Task Group on the task board as everywhere else.
- Excel, CSV and Word files and archives now open on remote machines too.
- Agents on a paired device now get the context folder synced there, instead of being pointed to files that do not exist on it.
- A login token set in a remote machine's shell profile no longer silently bills your remote sessions to that login.
- Terminate now stops an ssh session that was reattached to a claude still running on its machine.
- A terminal session on an unreachable ssh machine no longer retries the connection every second forever.
- Running `code file.txt` in a local terminal opens VS Code again instead of hanging.

## 2.266.2 — 2026-08-09

### Fixed
- The signed-out warning for the machine's own CLI login now says it expired from disuse and that named accounts keep working.

## 2.266.1 — 2026-08-09

### Added
- The Message metadata popup (right-click a message's left strip) names the account that billed the message and the pool it went through.

### Fixed
- ⟳ quota refresh works for an account linked to the machine login, and says "No valid token" only when the account truly has none.
- The account pool no longer flips between two accounts on every check, losing both prompt caches; after a switch it stays three minutes unless it runs out.

## 2.266.0 — 2026-08-09

### Changed
- The account pool now sees usage within seconds as sessions, subagents and workflow agents spend it, so a fast burn no longer outruns it.

### Fixed
- The pool reads the freshest quota of an account linked to the machine login, instead of a reading frozen hours earlier.
- A limit message that names a model, such as Fable, now marks that model's weekly quota as spent, not the 5-hour one.

## 2.265.0 — 2026-08-09

### Fixed
- The Usage window now counts what workflow and subagent runs spend, including runs from before this update.
- Quota estimates no longer run several times too high.

## 2.264.0 — 2026-08-09

### Changed
- Report a problem now includes each open chat window's recent scroll movements (never message content), so a jumping view can be diagnosed.

## 2.263.0 — 2026-08-09

### Added
- Quota displays show an estimate of current use between readings: a hatched span in the usage popup, a light arc on the taskbar pies and Agents donuts.

### Changed
- The account pool now switches on estimated use, and a pool with Hot switch on leaves an account below 10% left so a long workflow is not cut off.
- A pool with Auto-switch on re-checks every 60 seconds, not only when a turn ends.

### Fixed
- The account pool now switches on a limit message worded "You've hit your…" or raised by a workflow agent, instead of missing both.
- A pooled account shows in Agents with its own icon and its current account's usage, instead of looking like an API key.
- Two nearly empty accounts no longer make the pool switch back and forth on every check.

## 2.262.0 — 2026-08-09

### Changed
- Manage agents has three tabs, Accounts, Machines and Instructions; each machine is a collapsed card that is only checked when you open it.

## 2.261.0 — 2026-08-09

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.260.0 — 2026-08-09

### Added
- In chat sessions, Claude's limit message now marks that quota as spent, so a pool with Auto-switch on moves off that account at once.

### Changed
- ⟳ quota refresh asks a running chat session billed to that account for its usage when there is one, instead of calling the usage service directly.

## 2.259.0 — 2026-08-08

### Changed
- The account pool first uses the account whose weekly quota resets soonest; with Hot switch on it moves to a sooner reset ahead of time.

## 2.258.0 — 2026-08-08

### Changed
- The Switch billing menu keeps a steady width, with each account's usage lined up in one right-hand column.

## 2.257.1 — 2026-08-08

### Fixed
- Adding a subscription opens its login terminal again instead of doing nothing.

## 2.257.0 — 2026-08-08

### Added
- A pooled account's ⋯ menu has Members… to choose its subscriptions; All subscriptions also includes ones you add later.
- The ⚙ quick settings gain UI scale and UI font size, each set separately on every device.

### Changed
- Locking a conversation's model no longer turns fallback off; after a fallback turn, your next message tries the locked model again.
- The locked-model badge shows its lock as an icon in the badge's own colors.

### Fixed
- Unlocking a conversation's model in one tab now shows in your other tabs too.

## 2.256.0 — 2026-08-08

### Added
- The model badge's menu can lock a Claude conversation to its model, refusing a silent fallback to another model; the lock survives resume and restarts.
- The Usage window shows how much went through each pooled account (By pool), while the spend stays on the real account.

## 2.255.0 — 2026-08-08

### Added
- + Add account offers Add subscription via long-lived token… to add a subscription straight from a token.

### Fixed
- A pooled account shows as a pool chip naming the account it currently bills, instead of looking like an API key.
- Adding an account updates Manage agents at once, without reopening it.

## 2.254.0 — 2026-08-08

### Changed
- The top bar fits its rows with no empty band, and dragging its edge now scales its contents: drag up for a compact bar and a larger desktop.

### Fixed
- Resetting the top bar's size now reaches your other devices too.

## 2.253.1 — 2026-08-08

### Changed
- The long-lived token dialog explains plainly what the token is meant for and that it still bills your subscription.

## 2.253.0 — 2026-08-08

### Added
- A Claude subscription can hold a long-lived token (⋯ → Long-lived token…), making it usable on remote machines and paired devices without copying its login.
- Accounts with a long-lived token are tagged, turn amber under 30 days left, and an expired token is refused with how to renew it.
- ⟳ quota refresh cannot read usage through a long-lived token; usage captured from that account's own sessions still shows.

### Security
- Long-lived tokens are stored encrypted, and a stray one in the environment is removed from every session so it cannot bill silently.

## 2.252.2 — 2026-08-07

### Fixed
- A top bar or taskbar resize is no longer undone when a client viewing another desktop switches desktops.

## 2.252.1 — 2026-08-07

### Fixed
- A resized top bar keeps its height after you release the mouse, reload the page or switch themes.

## 2.252.0 — 2026-08-07

### Added
- A pool can switch by itself to the member with the most left when its account is under 5% (⋯ → Auto-switch when nearly exhausted).
- Hot switch (no restart) lets a pool change accounts without restarting the conversations on it.

## 2.251.0 — 2026-08-07

### Added
- Pooled accounts: one switchable billing identity over your signed-in Claude subscriptions (+ Add account… → Add pooled account…, Linux only).
- ⋯ → Switch target moves a pool to another member and restarts its conversations; usage is always counted on the real account.
- A pooled account bills sessions on this machine only; the Switch billing menu and New Session dialog say so for a remote session.

## 2.250.1 — 2026-08-07

### Added
- The top bar can be resized by dragging its bottom edge (double-click to reset), and its height syncs to your other devices.

### Fixed
- Right-clicking a desktop preview that you moved into the top bar shows its Rename and Delete menu again.

## 2.250.0 — 2026-08-07

### Added
- After a restart, one popup offers to resume all the interrupted sessions at once.
- Drag a desktop preview onto another to reorder your desktops.

### Fixed
- The desktop right-click menu no longer opens off the screen when the taskbar is at the top.
- Stage desktop previews now show a window's attention blink and the flash that points it out.

## 2.249.1 — 2026-08-07

### Fixed
- Ctrl+K finds a session by several words of its name, and a better-matching stopped session is no longer pushed off the list by live ones.

## 2.249.0 — 2026-08-07

### Fixed
- Adding a subscription that is already on the list no longer merges the two while either has a running session, which could switch its billing mid-turn.
- Refreshing the session list no longer briefly stalls the server on machines running many sessions.

## 2.248.0 — 2026-08-06

### Added
- An ssh machine can be upgraded to dial-out with one click, so it connects to VibeSpace itself and avoids ssh hangs; ssh stays as the fallback.
- The upgrade is refused if the machine cannot reach VibeSpace, and removing dial-out takes its installed service off the machine again.

## 2.247.4 — 2026-08-06

### Fixed
- Clicking a session card flashes its window's desktop preview when the window is on another desktop.

## 2.247.3 — 2026-08-06

### Fixed
- Resuming a remote session finds a claude still running there, including one started fresh rather than resumed, and reattaches to it.

## 2.247.2 — 2026-08-06

### Fixed
- Resuming an ssh session with its machine selected reattaches the claude still running there instead of killing and restarting it.

## 2.247.1 — 2026-08-06

### Fixed
- Resuming an ssh session reattaches a claude that survived there, instead of killing it along with its work in progress.

## 2.247.0 — 2026-08-06

### Fixed
- On a device with a flaky link, file browsing, autocomplete, mounts and port forwards give up or fall back within seconds instead of hanging for minutes.
- A connection timeout to such a device no longer risks crashing the server.

## 2.246.2 — 2026-08-06

### Fixed
- The sidebar's remote session scan no longer hangs for minutes on a flaky link; it falls back to the last known sessions within seconds.

## 2.246.1 — 2026-08-06

### Added
- The Helm chart can set a priority class so a VibeSpace pod is not the first one evicted on a busy cluster.

## 2.246.0 — 2026-08-05

### Added
- Remote → Add machine accepts ssh keys with a passphrase, unlocking them once on import and storing them without it, instead of failing to connect later.
- Pairing a device no longer needs Node installed: the installer downloads and checks its own copy when the machine has none.
- A device that cannot reach nodejs.org downloads Node through your VibeSpace instead.
- The device installer says why when it cannot provide Node, for example on Alpine or 32-bit Windows, and never installs a download that fails its checksum.

### Changed
- A wrong passphrase reopens the key dialog with your key still pasted, and .ppk keys or truncated pastes get clear instructions.

### Fixed
- The device installer finds a Node installed with nvm instead of saying Node is missing.
- Agent tools and hooks work on a paired device that has no Node of its own.
- Windows devices reconnect after a reboot.
- A device paired through the relay gets an install command it can actually reach.
- An error while adding a machine now shows a message, and a passphrase key in an imported config is skipped with the reason.

## 2.245.2 — 2026-08-05

### Changed
- The Switch billing menu also shows model quotas such as Fable, colored like the quota donuts.
- A machine's ⟳, Log in on host… and Import its key actions now sit in its row's ⋯ menu.

### Fixed
- Quota donuts in the Agents list line up in one column again, and a refresh error shows as a single line.

## 2.245.1 — 2026-08-05

### Added
- Each account in the Switch billing menu shows its 5-hour and weekly quota use, and how old the reading is.

## 2.245.0 — 2026-08-05

### Added
- Refresh all in Manage agents refreshes the quota of every account and machine login at once, with any failure shown on its row.

### Changed
- Manage agents shows this machine's full account list and one section per remote machine listing only the accounts usable there, with their quota.
- The usage popup's Remote hosts section moved into Manage agents; Full overview → opens it.

### Fixed
- An unreachable machine is shown as unreachable instead of offering Install, and Codex accounts show on remote machine views again.

## 2.244.4 — 2026-08-05

### Fixed
- Agent hooks and tools work on remote machines where Node is installed with nvm.

## 2.244.3 — 2026-08-05

### Fixed
- An account signed in on another machine now says where it is signed in, instead of "never finished signing in".

## 2.244.2 — 2026-08-05

### Changed
- Testing an account held on a machine explains that /status shows the machine's own identity while the tested account is the one billed.

### Fixed
- Agent hooks on remote machines no longer fail with "node: not found".

## 2.244.1 — 2026-08-05

### Fixed
- Account rows name the machine a login is on instead of showing its internal id.

## 2.244.0 — 2026-08-05

### Fixed
- The Switch billing menu, New Session dialog and Manage agents agree on which accounts can run on each machine, matching what a session really uses.
- A session's account for later resumes is saved from the account it actually started with, not the one requested.

## 2.243.2 — 2026-08-05

### Fixed
- A remote session started for a specific account bills that account even after the machine signs in with a different login.
- Testing an account on a remote machine no longer says "not signed in" from out-of-date information.

## 2.243.1 — 2026-08-05

### Fixed
- Test in Manage agents runs the account it names, even after the machine's own login has changed.

## 2.243.0 — 2026-08-05

### Added
- The System panel adds a Loop lag chart next to Memory and CPU.

### Fixed
- A billing switch that fails no longer saves that account for later resumes, so resuming the session by hand works again.

## 2.242.0 — 2026-08-05

### Fixed
- The whole server no longer freezes for seconds at a time while the session list refreshes.

## 2.241.2 — 2026-08-05

### Fixed
- Busy machines no longer stall briefly every 30 seconds while local ports are checked.

## 2.241.1 — 2026-08-05

### Fixed
- A dying connection to a remote machine no longer crashes the whole server.

## 2.241.0 — 2026-08-05

### Fixed
- Switching billing no longer leaves a session stuck on terminated without restarting it.
- Picking an account that is the machine's own login keeps its name on the badge and in the Switch billing menu, instead of showing CLI login.

## 2.240.3 — 2026-08-05

### Fixed
- Every open tab reloads itself after a server update, not only the first one.

## 2.240.2 — 2026-08-05

### Fixed
- Picking an account that is the remote machine's own login in the Switch billing menu now works instead of failing as not logged in.

## 2.240.1 — 2026-08-05

### Fixed
- The Switch billing menu and Manage agents agree on which account a machine is logged in as after it signs in with a new one.

## 2.240.0 — 2026-08-05

### Fixed
- The Switch billing menu disables accounts that never finished signing in and says why.
- Switching billing on a remote session waits for it to stop before resuming, so the window no longer just dies.
- The Report a problem Capture button shows progress and explains a failure instead of looking frozen.

## 2.239.2 — 2026-08-05

### Fixed
- The billing switcher no longer greys out every subscription right after a page reload; the open menu updates once it has checked the machine.

## 2.239.1 — 2026-08-05

### Fixed
- The Report a problem dialog now shows its Capture button, so you can actually send a report.

## 2.239.0 — 2026-08-01

### Changed
- Report a problem… also saves the running processes and the state of every conversation on this machine and on each remote machine your sessions use.
- The dialog asks you to capture before you try to fix things, so resuming, killing or restarting afterwards no longer destroys the evidence.

## 2.238.1 — 2026-08-01

### Changed
- A problem report also records which conversations are briefly blocked from resuming and which sessions each remote machine was last seen to have.

## 2.238.0 — 2026-08-01

### Added
- ⚙ → Report a problem… saves what the page and the server were doing in the last few minutes, takes a note from you and gives you a short id to pass on.
- Typed text and message contents are never recorded, and a second snapshot is added two minutes later for a problem that is still happening.

## 2.237.3 — 2026-08-01

### Fixed
- Manage agents → Test no longer says a linked subscription isn't signed in on a machine whose own login is that account.

## 2.237.2 — 2026-08-01

### Fixed
- Connecting a CephFS mount no longer fails with "/sbin/modprobe: not found" on the newer container image.

## 2.237.1 — 2026-07-31

### Fixed
- Update works again; since 2.235.1 it refused to run on healthy installs and told you to change file ownership.
- If you are on 2.235.1 to 2.237.0, run git pull once in the VibeSpace folder, after which Update works from the app again.

## 2.237.0 — 2026-07-31

### Changed
- When a resume is held back by the retry cooldown but the conversation still exists, a dialog offers to retry now instead of a quiet bar at the bottom.

## 2.236.1 — 2026-07-31

### Fixed
- Conversations started before your container's user name changed resume again instead of failing with "No conversation found".

## 2.236.0 — 2026-07-31

### Fixed
- Picking a subscription now works on machines whose Claude settings use apiKeyHelper, instead of silently staying on API billing.

## 2.235.1 — 2026-07-31

### Fixed
- Update no longer fails with a bare "Permission denied" when files were left owned by root; it tells you the command that fixes it.

## 2.235.0 — 2026-07-31

### Added
- When the server falls behind for minutes, a notice says it is slow and that your sessions are not dead.

### Changed
- Opening and scrolling very large conversations no longer slows the whole server down.

## 2.234.1 — 2026-07-31

### Fixed
- When the server is slow, open windows keep reconnecting instead of turning read-only with "The session no longer exists on the server".
- If a window does give up after about two minutes, its message says whether the server is just slow or may have restarted.

## 2.234.0 — 2026-07-30

### Added
- Settings → Chat → Enter sends on touch devices brings back Enter-to-send on phones and tablets.

### Changed
- On phones and tablets, the keyboard's Enter key adds a new line; send with the ▶ button.

## 2.233.2 — 2026-07-30

### Fixed
- A subagent's View Log no longer shows the parent conversation's messages above the agent's own.

## 2.233.1 — 2026-07-30

### Fixed
- A finished background agent's card says it finished, with its message count, instead of "responding" forever.

## 2.233.0 — 2026-07-30

### Fixed
- The background-task popup no longer piles up finished tasks: its chip counts running ones, and finished ones show under Recently finished.

## 2.232.4 — 2026-07-30

### Fixed
- The task board's Import button now actually shows its icon instead of an empty space.

## 2.232.3 — 2026-07-30

### Fixed
- The task board's Import button is now an icon button with a tooltip instead of an empty dashed square.

## 2.232.2 — 2026-07-30

### Changed
- Changing Task Group auto-style order also updates an open Task Group detail window right away.

## 2.232.1 — 2026-07-30

### Added
- Settings → Sidebar → Task Group auto-style order picks whether textures appear from the first groups or only after the solid colors run out.

## 2.232.0 — 2026-07-30

### Changed
- Automatic Task Group styles vary lightness and line texture from the first groups, so nearby groups look clearly different; existing auto colors change once.

## 2.231.3 — 2026-07-30

### Fixed
- Creating a Task Group no longer shows "Task Group not found".

## 2.231.2 — 2026-07-30

### Fixed
- Automatic Task Group colors no longer start repeating after many groups, and colors already assigned stay the same.

## 2.231.1 — 2026-07-30

### Changed
- A Task Group's automatic color never changes during its life, and even three groups get clearly different colors.
- A new group reuses a deleted group's color, and automatic colors stay away from colors you picked by hand.
- Existing automatic colors change once at the next server start, when every group gets its place in the new color order.

## 2.231.0 — 2026-07-30

### Added
- A Task Group's detail window lets you pick a texture (Auto, Solid, Dashed, Dotted, Diagonal) as well as a color.

### Changed
- Task Group textures also show on the task board's left strip.

## 2.230.2 — 2026-07-30

### Changed
- Automatic Task Group colors gain dashed, dotted and diagonal line textures on the flat view's color bars once you have many groups.

## 2.230.1 — 2026-07-30

### Changed
- Automatic Task Group colors now differ clearly in hue or lightness, and adding a group rarely changes the colors of the others.

## 2.230.0 — 2026-07-30

### Added
- A Task Group without a chosen color gets its own automatic color, the same on every device.
- You can pick any color for a Task Group, the preset palette grows to 18 colors, and choosing no color keeps a group grey.

## 2.229.3 — 2026-07-30

### Changed
- The background-task wakeup card shows a clock icon that matches the rest of the interface.

## 2.229.2 — 2026-07-30

### Fixed
- When a background task wakes an agent, the chat shows a card naming the task instead of a "You" message full of raw markup.

## 2.229.1 — 2026-07-29

### Fixed
- Scrolling up or down through a long chat's history no longer jumps by a big chunk.

## 2.229.0 — 2026-07-29

### Added
- Manage agents warns when a container rebuild would undo claude's updates and offers Install persistent copy, which new sessions use after the next restart.

### Changed
- A container starting without a persistent claude installs one in the background, so a rebuild no longer silently reverts claude or what its model aliases mean.

## 2.228.3 — 2026-07-29

### Fixed
- The sidebar no longer jumps back to the top when you expand a card after scrolling.
- One broken session record no longer leaves whole folders in the sidebar empty.

## 2.228.2 — 2026-07-29

### Added
- Click a pasted image's chip in the chat input to see it full-screen before you send it.

## 2.228.1 — 2026-07-29

### Added
- The "host reconnecting" chip's tooltip shows the last connection error, such as a timeout.

### Fixed
- A remote machine's row no longer shows Ready while new connections to it fail; it says the network path changed.

## 2.228.0 — 2026-07-29

### Added
- Settings → Claude → Disable model fallback makes a flagged message stop the turn instead of silently switching to another model.
- A turn stopped this way shows a notice with the reason, and you can rephrase and resend to continue.
- In sessions started before you turned it on, a fallback is interrupted and a message names both models.

## 2.227.12 — 2026-07-29

### Fixed
- An agent's npm install no longer skips dev dependencies, and a dev server it starts no longer takes VibeSpace's own port.
- "Task Group operation failed" now says what failed, with the server's status.

### Security
- Agent sessions no longer see the instance password, storage credentials and other server secrets in their environment.

## 2.227.11 — 2026-07-29

### Fixed
- Update no longer stops with "local changes would be overwritten" on an instance that had built VibeSpace before.

## 2.227.10 — 2026-07-28

### Fixed
- When the relay is not set up, its panel names the missing field, such as the relay token, instead of only "relay not configured".

## 2.227.9 — 2026-07-28

### Changed
- Launching skill cards now fold with the working cards around them instead of breaking the fold; you can turn this off in Card kinds that collapse.

### Fixed
- Foldable cards no longer flash at full size before folding while a reply streams in.

## 2.227.8 — 2026-07-28

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.227.7 — 2026-07-28

### Fixed
- A long-running Bash card no longer shows a message count and an empty View Log; it shows how long the command has been running.

## 2.227.6 — 2026-07-28

### Fixed
- The notice for a safety-check model switch names both models instead of "? → ?", and its details start with the reason.

## 2.227.5 — 2026-07-27

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.227.4 — 2026-07-27

### Fixed
- When a flagged message is retried on another model, the chat shows a notice naming both models and why; your model setting stays the same.
- The notice for a model switch after an overload is shown in your language.

## 2.227.3 — 2026-07-27

### Added
- A failed resume keeps the conversation's history readable and offers Try resuming anyway.

### Fixed
- A resume failing with "No conversation found" no longer tells you to close a conversation whose transcript still exists; it says it is not lost.

## 2.227.2 — 2026-07-25

### Changed
- Creating a mount point that needs more permissions uses passwordless sudo when available, and otherwise shows the commands to run.

### Fixed
- Empty folders left behind after unmounting or removing a storage mount are now removed.
- Moving a mount to a folder you cannot write fails in the dialog with the reason, and the mount keeps running as before.
- A CephFS mount point that cannot be created now says why.

## 2.227.1 — 2026-07-25

### Fixed
- Resume in a read-only window with incomplete session details now explains why instead of doing nothing.

## 2.227.0 — 2026-07-25

### Added
- If a resumed conversation's folder was deleted, you can recreate it empty and resume; the agent is told its earlier files are gone.

## 2.226.3 — 2026-07-24

### Added
- The System panel has a machine picker showing the memory, disk, load and top processes of your remote machines.

### Fixed
- The System panel's history charts appear again, with values on hover and 1h, 24h and 7d ranges.
- Leaving the System panel no longer stops the other sidebar panels from opening.

## 2.226.2 — 2026-07-24

### Added
- Google Drive, Gmail and other cloud sign-ins show a link you can copy into another browser where the account is signed in.

### Fixed
- A blocked sign-in popup now says it was blocked instead of claiming a page opened.

## 2.226.1 — 2026-07-23

### Changed
- Stopped, tmux and external session cards show a mode badge too; on a stopped card, the dimmed badge is the mode Resume will use.

## 2.226.0 — 2026-07-23

### Changed
- Starting an agent session in a folder that doesn't exist fails with the reason instead of silently starting in your home folder; terminals still open there.
- When an agent CLI exits with a known error, such as not being logged in, the window says why the session ended.
- Problems found by the server's background checks show as notifications on every open VibeSpace page.

### Fixed
- Broken agent hooks repair themselves within six hours and tell you; running sessions pick up the fix after a restart.

## 2.225.2 — 2026-07-23

### Fixed
- Resuming a remote session no longer fails with "No conversation found" because the machine's name ended up in its folder path.

## 2.225.1 — 2026-07-23

### Fixed
- A second VibeSpace started from a temporary folder no longer takes over your agent hooks, which stopped working once that folder was gone.

## 2.225.0 — 2026-07-23

### Added
- Hovering a session card's icon opens a legend that explains each corner badge: backend, mode, connection and custom settings.

### Changed
- Stopped session cards no longer show a dim connection dot.

## 2.224.1 — 2026-07-23

### Changed
- A session's custom settings show as a small purple dot at its icon's bottom-left instead of a gear pill; hover it for the details.

## 2.224.0 — 2026-07-23

### Changed
- Session cards fit narrow sidebars better: connection status is a dot on the icon, and star and archive stack in a small column.
- In a very narrow sidebar, chips shrink to icons and less important badges hide so the title stays readable.

## 2.223.4 — 2026-07-22

### Fixed
- Stars, renames and archives no longer vanish from a tab opened while the server restarted, and a later change can no longer erase them.

## 2.223.3 — 2026-07-22

### Fixed
- Manage agents' Update and login buttons no longer fail with "command not found" when your login shell's PATH misses the CLI's folder.

## 2.223.2 — 2026-07-21

### Fixed
- After a refresh, the sidebar highlights the panel that is actually shown, with its matching title.

## 2.223.1 — 2026-07-21

### Added
- Click a top-process row in the System panel to see its full command.

### Changed
- The System panel's history charts show values on hover and are no longer redrawn under your cursor.

## 2.223.0 — 2026-07-21

### Added
- The System panel shows memory and CPU history charts for the last hour, day or week, kept across restarts.

### Removed
- The daily cost chart added to the System panel in the previous version is removed again.

## 2.222.0 — 2026-07-21

### Added
- The System panel shows a 14-day daily cost chart with totals, and Open Usage… opens the full Usage window.

## 2.221.0 — 2026-07-21

### Fixed
- Resuming a conversation on a paired device reuses its still-running agent instead of starting a second one.
- A paired device's terminal that reconnects after a restart says it is a new session instead of looking like a continuation.
- Forwarded ports' public addresses, folders shared with paired machines and agents' tools on a paired device reconnect by themselves after a restart or failure.
- A copy or move cut off by a restart never leaves a half-written file under the final name, and an interrupted extraction or transfer says so.
- A chat message sent while the connection is down keeps its draft and warns you, and a failed image paste shows a message.
- Permission answers, pending Ctrl+G editor requests and live subagent logs survive a server restart.

## 2.220.0 — 2026-07-21

### Fixed
- Your other devices follow the Stage's main window even when it was staged before its session had fully started.
- After the container's user name changes, conversations, mounts, layouts and Task Groups move to the new home folder by themselves.
- Remote chat sessions whose agent kept running through a server restart are reconnected automatically at startup.

## 2.219.1 — 2026-07-21

### Added
- A remote session whose machine can't be reached shows a host unreachable chip; messages you send are delivered when it comes back.

## 2.219.0 — 2026-07-21

### Fixed
- Sessions on paired devices now survive a server restart.
- Resuming a conversation that another agent still has open no longer loses the new turns from its history.
- A failed resume no longer makes the window vanish on refresh; it shows the history with a Resume button.
- Terminating a restored remote session now also stops the agent on the remote machine.
- After a restart, an agent's todo list and a resumed /goal come back, and settings are refreshed when you reconnect.
- After a reconnect, an open chat no longer silently misses the messages that arrived while it was away, even in a very large conversation.

## 2.218.0 — 2026-07-21

### Fixed
- Resuming a remote conversation from an old window now runs it on its machine instead of failing with "No conversation found".
- If the conversation's agent is still running on that machine, the resume attaches to it instead of starting a second copy.
- When a session's machine is down, only the first window waits for the connection to time out; the others show the saved history at once.

## 2.217.1 — 2026-07-21

### Fixed
- A "Create failed" window now shows which conversation it was for, with its full id and folder.

## 2.217.0 — 2026-07-21

### Fixed
- After the server loses its sessions, saved chat windows show their history with a Resume bar instead of opening blank.
- A remote session's saved history shows even while its machine is down.

## 2.216.0 — 2026-07-21

### Added
- A System panel in the sidebar shows memory, disk, load and the biggest processes, and its icon warns when memory runs high.
- At 80% container memory every open page gets a warning naming the biggest consumer, so you can act before the whole container is killed.

### Fixed
- A run of cards you expanded no longer stays expanded forever as new cards join it while you follow the live chat.

## 2.215.3 — 2026-07-21

### Added
- MCP tool calls fold with the other working cards (on by default in Card kinds that collapse), and the fold summary counts them and names the server.

## 2.215.2 — 2026-07-21

### Changed
- MCP tool cards show a short tool name with a server label instead of the raw identifier, which stays in the tooltip.

## 2.215.1 — 2026-07-20

### Changed
- Sharing a folder onto a machine refuses a folder that already mirrors that same machine and tells you to open it there directly.

### Fixed
- Sharing a folder from a stalled storage mount onto a machine no longer freezes the server; it asks you to reconnect the storage first.

## 2.215.0 — 2026-07-20

### Added
- Copying or moving files in the file explorer shows live progress with a Cancel button, also between machines.

## 2.214.1 — 2026-07-20

### Fixed
- Sharing folders to or from a paired machine no longer ends in a bare "HTTP 502"; a stalled link gives a clear error after a time limit.

## 2.214.0 — 2026-07-20

### Changed
- Reading or writing an agent's memory file shows as a Memory read or Memory update card with just the file name.

## 2.213.3 — 2026-07-20

### Changed
- Codex memory files are recognized as memory too, so they fold with the memory kind.

## 2.213.2 — 2026-07-20

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.213.1 — 2026-07-20

### Added
- Reading and writing an agent's memory files is its own choice in Card kinds that collapse, folded by default.

### Changed
- Built-in tool cards such as TaskCreate or web search show readable, translated names; the raw name stays in the tooltip.

## 2.213.0 — 2026-07-20

### Added
- Settings → Chat → Card kinds that collapse picks which cards fold (thinking, Bash, file reads, file writes), and open chats re-fold at once.

### Changed
- A folded group's header shows counts per kind, the files touched and how many steps failed.

### Fixed
- Show hook cards in chat now also hides the Stop-hook reminder card.
- Switching compact mode re-renders open chats, so cards no longer look broken after the switch.

## 2.212.1 — 2026-07-20

### Fixed
- The Write and Read labels on file cards are translated like Edit's.

## 2.212.0 — 2026-07-20

### Added
- Right-clicking a title bar opens a full window menu: Switch window, Move, Minimize, Move to Desktop and Close, plus Rename… and Task Groups for sessions.
- Title-bar "Switch window" scope chooses whether that submenu lists overlapping windows, this desktop's windows or all windows.
- Taskbar window menus also offer Rename… and Task Groups.

### Fixed
- Disabled entries in a submenu no longer run when clicked.
- The Chinese labels for vendor and machine show their intended translation, and window menus are fully translated.

## 2.211.0 — 2026-07-20

### Added
- Settings → Integration can turn off Inject Task Group context and each agent tool (vibespace-status, vibespace-ask, vibespace-task) on its own.

### Changed
- Agents are not taught a tool you turned off, and turning off vibespace-status also stops its end-of-turn reminder.

## 2.210.0 — 2026-07-20

### Changed
- When an agent logs progress with vibespace-task, it is reminded to also put anything you need in its chat reply.
- Setting the Stop nudge's staleness and cooldown minutes to 0 makes the bookkeeping reminder run after every turn.

## 2.209.0 — 2026-07-20

### Fixed
- Going from the Stage to a normal desktop and back no longer piles sessions on top of each other.
- A window opened while on the Stage gets a place of its own on the desktop when you leave, instead of sitting at the Stage's slot.
- Adding, renaming or deleting a desktop on another device no longer pulls your Stage windows onto a normal desktop.
- Switching desktops while on the Stage now leaves the Stage cleanly instead of mixing its windows into a desktop.

## 2.208.0 — 2026-07-20

### Changed
- With a remote machine chosen, New Session lists your subscriptions, marking those using that machine's login and greying out unusable ones.

### Fixed
- A subscription logged in on a paired device can now be used for sessions on that device.

## 2.207.1 — 2026-07-20

### Fixed
- A session that ended before it saved any transcript is no longer resumed again and again; VibeSpace says there is nothing to resume.

## 2.207.0 — 2026-07-20

### Added
- ⚙ Diagnostics now records when sessions start, exit or are killed, and flags a conversation started three times within ten minutes.
- Diagnostics also records usage-limit hits, model fallbacks, refused permission-mode switches and failed connection checks to your machines.

## 2.206.2 — 2026-07-20

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.206.1 — 2026-07-20

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.206.0 — 2026-07-20

### Fixed
- A terminal whose program exits no longer leaves a black window; it says "Session ended" and, for an agent session, offers Resume this session.

## 2.205.0 — 2026-07-20

### Added
- Logging in to an account whose email matches one already in Manage agents merges it into that account instead of adding a duplicate.

### Fixed
- Duplicate entries of the same account merge by themselves the next time you open that machine in Manage agents.

## 2.204.0 — 2026-07-20

### Changed
- With a machine selected, "+ Add account…" offers your existing subscriptions first, so logging one in there never creates a duplicate.

### Fixed
- An account logged in only on a remote machine shows "logged in on <machine>" in the local view instead of "not logged in".

## 2.203.0 — 2026-07-20

### Fixed
- An account logged in on a remote machine can now run sessions there, instead of failing with "subscription not logged in".
- Such an account no longer shows "not logged in" next to "logged in on <machine>", and Test works for it.

## 2.202.1 — 2026-07-20

### Changed
- The API-key tag reads "master held by VibeSpace", so it no longer looks as if every machine holds its own master copy.

## 2.202.0 — 2026-07-20

### Added
- An account's ⋯ menu has "Show key…", which reveals its API key with a Copy button so you can save it elsewhere.

### Changed
- In Manage agents, an account's origin and note tags sit on their own line, and API-key accounts carry a "master copy" tag.

## 2.201.2 — 2026-07-20

### Fixed
- The confirmation for removing an API-key account is translated and says clearly what is deleted: the master copy and the copies on machines.

## 2.201.1 — 2026-07-20

### Changed
- Removing an API-key account warns that the key is deleted everywhere and the Anthropic Console cannot show it again, so save it elsewhere first.

## 2.201.0 — 2026-07-20

### Added
- A key imported from a machine shows a "from <machine>" tag; it is an independent copy you can use anywhere.
- Every account can have a short note (⋯ → Set note…), shown as a tag on its row.

## 2.200.0 — 2026-07-20

### Fixed
- With a machine selected, "Add subscription" now logs in on that machine instead of this one, and the account shows "logged in on <machine>".

## 2.199.0 — 2026-07-20

### Added
- A subscription's ⋯ menu offers "Log in on <machine> as this account…", so several accounts can be logged in on one machine side by side.
- Once logged in, the account is tagged "logged in on <machine>" and can be picked for sessions there; its login never leaves that machine.

## 2.198.0 — 2026-07-20

### Fixed
- An account that is a machine's own login is tagged "= <machine>'s own login" and can be picked for sessions there, instead of "this machine only".

## 2.197.0 — 2026-07-20

### Fixed
- Manage agents now shows the login email, API key and Codex plan of remote machines where it showed none, so "Import its key" appears for a Console login.

## 2.196.0 — 2026-07-20

### Changed
- "Log in on <machine>…" now asks before replacing the machine's current login, and first imports any Console API key it holds so it isn't lost.

### Fixed
- The command a helper terminal types for you, such as the login command, is no longer cut short by the shell's update prompt.

## 2.195.0 — 2026-07-20

### Changed
- The billing switcher and Manage agents explain how to use an account logged in on a machine: pick "CLI login @ <machine>".

### Fixed
- Switching the permission mode mid-session shows whether it took; when a switch to bypassPermissions is refused, one click restarts the session in it.
- Manage agents no longer jumps to another machine while you use it, remembers the machine you picked and keeps unsaved Agent instructions.
- After you log an account in on a remote machine, Manage agents shows that machine and marks the row "login changed" with a ⟳ to confirm.
- The Ports panel updates when you pair or unpair a machine while it is open.

## 2.194.0 — 2026-07-20

### Fixed
- Reading a PDF no longer fills the chat with one empty notification card per page; the pages show as one expandable "Attached pages (N)" card.

## 2.193.0 — 2026-07-19

### Added
- Ctrl+G opens the split-pane editor in terminal sessions on remote machines too.
- Codex sessions on remote machines are listed, and stopped ones can be viewed and resumed.

### Fixed
- Pasting an image into a terminal on a remote machine no longer does nothing; the image is saved on that machine and its path is typed in.
- After a server restart, cleaning up duplicate copies of a remote conversation keeps the live one instead of possibly closing it.

## 2.192.0 — 2026-07-19

### Changed
- Dragging a file from one machine's explorer into another machine's terminal is refused with a message instead of typing a path that isn't there.
- Setting up a Mac machine installs what it needs with Homebrew.

### Fixed
- Resume and Fork of a remote session, from the Resume bar, Ctrl+K, Resume all, a folder menu or a restored layout, run on its own machine again.
- The chat Stop button no longer risks cutting a remote session's connection.
- Machines running macOS now show session history, folder contents, file sizes and binary files correctly.
- Retrying a failed upload to a remote folder, or uploading to a ~/ folder there, puts the files in the right place.
- File links in stopped or view-only remote chats open the file on the right machine.
- Agent steps in Session Properties and /goal completion now work for remote sessions.

## 2.191.0 — 2026-07-19

### Changed
- When a machine's settings have an apiKeyHelper, Manage agents and the billing switcher warn that it overrides the login and say how to remove it.

### Fixed
- View Workflow and each agent's View Log now work for sessions on remote machines.
- Terminate now stops an external session running on a remote machine, and its card turns to stopped.

## 2.190.1 — 2026-07-19

### Changed
- The Integration master switch no longer turns off the usage meters; it only removes what the agent itself can see or use.

## 2.190.0 — 2026-07-19

### Added
- Settings has a new Integration section whose master switch turns off VibeSpace's hooks, agent tools and injected context, for plain Claude Code or Codex.
- Turning the switch off applies to running sessions too, and turning it back on restores the hooks.

### Changed
- The agent settings moved into the Integration section, and with the switch off Manage agents shows the integration as disabled.

## 2.189.1 — 2026-07-18

### Added
- The maintenance banner shows the latest progress as the work goes on and stays up while updates keep coming; a button opens the full timeline.

## 2.189.0 — 2026-07-18

### Added
- While someone is troubleshooting your instance, an amber maintenance banner across the top says so; it goes away by itself after the set time.

## 2.188.3 — 2026-07-18

### Fixed
- A remote session card always shows its machine's name before the path, and the path shortens to fit when you resize the sidebar.
- A chat window whose session vanished during a server restart turns read-only with a Resume bar instead of looking live.
- Command echoes in the chat, such as Set model, no longer show raw escape codes.
- The Usage window's "By billing type" panel shows remote-host usage with a proper label.

## 2.188.2 — 2026-07-18

### Fixed
- Scrolling down through chat history no longer stalls at the edge of what is loaded; newer messages keep loading.

## 2.188.1 — 2026-07-18

### Fixed
- A stopped remote session whose chat history was stuck at an old snapshot now loads its full history.

## 2.188.0 — 2026-07-18

### Changed
- A remote session's billing badge names the machine whose login it uses, such as "CLI login @ <machine>".
- Emails in Manage agents come from the login itself where known, so an outdated email from a config file no longer shows.

### Fixed
- Remote terminal sessions no longer show KEY? as their billing badge forever.
- The billing switcher and Session Properties no longer offer accounts that cannot run on the session's machine; they show why instead.
- Manage agents shows the right login state and email for API-key logins and for paired devices, instead of "not installed" or "unreachable".
- With a paired device selected in Manage agents, the usage ⟳ works, and the machine's own login shows its usage donuts.
- Starring a this-machine-only subscription while a machine is selected now explains that the machine cannot use it.

## 2.187.1 — 2026-07-18

### Fixed
- The Set-up dialog's "All done" button now closes the dialog, and a failed setup offers Retry.

## 2.187.0 — 2026-07-18

### Fixed
- Chat history of a large remote session is no longer stuck at an old snapshot of the conversation's beginning.
- Large files read from or saved to a paired device are no longer cut short, and downloads from it arrive whole.

## 2.186.8 — 2026-07-18

### Fixed
- A new instance with no local sessions shows the machine switchers, so you can reach your remote machines' sessions.

## 2.186.7 — 2026-07-18

### Fixed
- Manage agents recognizes Claude logins by API key or apiKeyHelper and shows the method, instead of "not logged in".

## 2.186.6 — 2026-07-18

### Changed
- A remote machine that cannot be reached shows why under its row, such as "Couldn't connect: Connection timed out".

## 2.186.5 — 2026-07-18

### Fixed
- Links clicked in a Web view page opened through the proxy stay inside the proxy instead of failing with an embedding error.

## 2.186.4 — 2026-07-18

### Fixed
- Forwarding a port on "This machine" to a LAN or Tailscale address now works instead of opening a blank page.

## 2.186.3 — 2026-07-18

### Added
- Port forwarding accepts ip:port or host:port, so you can reach a service on a paired machine's local network through that machine.

## 2.186.2 — 2026-07-17

### Fixed
- File links in a remote session's chat open the file on that machine, with right-click → Open or Ctrl+click.

## 2.186.1 — 2026-07-17

### Fixed
- Dragging a window onto a desktop preview puts it on that desktop, not the one to its right, when the Stage is on.

## 2.186.0 — 2026-07-17

### Added
- Agents can borrow a paired machine's network for a single command with the new vibespace-exit tool, without routing the whole session through it.
- An agent can also run one command directly on that machine when a proxy cannot carry it, such as ping.
- Each machine's ↗ Exit node toggle in the Remote tab allows this; it is off until you turn it on.

## 2.185.3 — 2026-07-17

### Fixed
- Two cards for one conversation are merged into one when the server restarts, keeping the live session.

## 2.185.2 — 2026-07-16

### Fixed
- A paired device no longer stays offline after VibeSpace updates.

## 2.185.1 — 2026-07-16

### Changed
- The port forwarding button on machine rows shows a plug icon instead of a power symbol.

## 2.185.0 — 2026-07-16

### Added
- Ports show their detected protocol (http, https or tcp), and the Publish button says what link publishing will give you.
- Click a port's protocol chip to force HTTP, HTTPS or TCP when detection guesses wrong; a published port switches over.

### Fixed
- View Workflow no longer shows a resumed run as Killed, even in a window already open; it shows the live run, marked as resumed.

## 2.184.1 — 2026-07-16

### Fixed
- Server updates no longer end remote chat sessions while their agent keeps running on the machine.
- Terminate stops such a session again, and one that ends by itself is shown as ended.

## 2.184.0 — 2026-07-16

### Changed
- Publishing a port detects its protocol: an HTTP server gets a trusted https:// link, HTTPS keeps its certificate, and other services get tcp://.
- Pairing a device through the public relay uses a trusted certificate.

## 2.183.0 — 2026-07-16

### Added
- A published port gets a clean https:// subdomain link instead of an address and port.
- The Pair a device dialog can have the device reach this instance through the public relay, so both sides can be behind NAT.

## 2.182.0 — 2026-07-16

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.181.1 — 2026-07-16

### Fixed
- View Workflow marks an agent attempt that was retried as "retried — replaced by a newer attempt" instead of "interrupted by user".

## 2.181.0 — 2026-07-16

### Added
- Usage dashboard panels have a Sort option: default, axis or name order, value high to low, or value low to high.

### Fixed
- The usage ⟳ no longer fails for an account whose saved login is briefly stale when the machine's own login is the same account.

## 2.180.2 — 2026-07-16

### Fixed
- The Usage dashboard's hour and weekday charts are in order again, show empty hours and days, and name the weekdays.

## 2.180.1 — 2026-07-16

### Fixed
- Agent steps no longer show long-finished tasks as in progress in very long or compacted sessions.
- An old TodoWrite list no longer hides a newer task list.

## 2.180.0 — 2026-07-16

### Added
- Ports marks a dev server whose folder was deleted as orphan, tells you about it, and offers Kill to free it.

## 2.179.1 — 2026-07-16

### Changed
- In the sidebar, the Agents panel is laid out as flat sections with small headings; the Manage agents dialog keeps its card layout.
- At narrow widths, each account in the Agents panel shows its tightest quota as one pill instead of the usage donuts.

### Fixed
- The Agents panel in the sidebar no longer overflows sideways.

## 2.179.0 — 2026-07-16

### Fixed
- Resuming a conversation that is already running opens the running session instead of starting a second copy.
- Switching a session's billing account no longer leaves the old session running beside the new one.

## 2.178.0 — 2026-07-16

### Added
- A published forward in the Ports panel shows its public address as a link with a Copy button.

### Changed
- Manage agents is redesigned: one row per account with usage donuts, ★ and a ⋯ menu holding Test, Rename, set email and Remove.
- The four Add… buttons are now one "+ Add account…" menu.

### Fixed
- Account rows no longer crush in the narrow sidebar, and Chinese or Japanese button labels no longer wrap into a vertical pile.

## 2.177.0 — 2026-07-15

### Added
- Collapsing the sidebar leaves the icon rail on screen; click an icon to reopen that panel, or turn this off in Settings.

### Changed
- Port scans show which program is listening and fold system services behind a "+N system listeners" expander.
- The Ports panel's action buttons use line icons that match the rest of the interface instead of a coloured globe emoji.

### Fixed
- The sidebar header names the open panel, and the Agents panel no longer overflows.
- Publish in the Ports panel explains why when no public relay is set up, and every Ports action reports its errors.

## 2.176.0 — 2026-07-15

### Added
- The sidebar has an icon rail instead of three tabs: Folders, Task Groups, Remote, Ports, Agents, Plugins, Diagnostics, Settings; a setting restores the tabs.
- A new Ports panel lists active forwards on all machines and scans each machine's ports so you can forward, open or publish them.
- Rail icons show badges for Task Groups needing attention, offline machines, active forwards and recent errors; click the active icon to collapse the sidebar.

### Changed
- With the rail on, ⚙ → Agents and ⚙ → Plugins open in the sidebar panel instead of a dialog.

### Fixed
- Turning a setting off and back on quickly no longer reverts it.

## 2.175.1 — 2026-07-15

### Fixed
- A terminal whose session died with the server shows "Session ended while disconnected" instead of looking alive.

## 2.175.0 — 2026-07-15

### Changed
- On cluster deployments, the public address setting defaults to the instance's own address; a value you set still wins.

### Removed
- Three device-connection switches are gone from Settings; the device connection is always used for sessions and remote machines.
- The PostHog integration is removed; local Diagnostics are unaffected.

## 2.174.2 — 2026-07-15

### Fixed
- Shell terminals no longer go blank after a server restart or when you open them again later.
- Desktop previews in the toolbar follow the desktop preview size setting again.

## 2.174.1 — 2026-07-15

### Fixed
- The new-port notification now appears even if you never opened the Remote tab, on cluster instances too.

## 2.174.0 — 2026-07-15

### Fixed
- Local terminals no longer freeze or go blank when VibeSpace updates; they reconnect and redraw their content.

## 2.173.3 — 2026-07-15

### Changed
- Machine mount rows show both ends labelled, such as Mac:/path → here:/path, with arrows for the direction.

### Fixed
- The pairing installer no longer reports a healthy device as "exited immediately".

## 2.173.2 — 2026-07-15

### Fixed
- Shell terminals on a paired device use that device's own login shell, such as zsh on a Mac.

## 2.173.1 — 2026-07-15

### Fixed
- In machine mount dialogs, the mount point field suggests folders from the right machine.
- The pairing installer checks that terminals can start on the device and fixes the "posix_spawnp failed" error on Macs.

## 2.173.0 — 2026-07-15

### Added
- Dev servers started on this instance are announced too, and "This machine" gets a ports dialog to open or publish them.

### Fixed
- A folder pushed to a machine and unmounted there turns amber "gone on machine" with a ↻ to mount it again, instead of staying green.
- Re-pairing a device no longer fights the device software already running on it, or reports "already running" when the new pairing took.

## 2.172.0 — 2026-07-15

### Added
- When a service starts listening on a linked machine, a notification names the port so you can forward or publish it; a setting turns this off.

## 2.171.1 — 2026-07-15

### Fixed
- The first action on a paired device right after it reconnects no longer fails once before working.

## 2.171.0 — 2026-07-15

### Added
- Every paired device has a ↻ Re-pair button that renews its pairing and keeps its mounts, forwards and history.

### Changed
- If the device is online, the new pairing reaches it by itself with nothing to run; the dialog shows a fresh installer command either way.

## 2.170.0 — 2026-07-15

### Changed
- The pairing dialog explains that running the command again replaces the pairing, and that one device can pair with several instances.

### Fixed
- Re-pairing a device takes effect within about 30 seconds, without restarting it or cleaning up old processes.
- On a Mac, a device no longer stays stuck at "already running" after its earlier copy is gone; the message names the process and what to do.

## 2.169.0 — 2026-07-15

### Changed
- The device software is called vibespace-device everywhere you see it, instead of agentd.

### Fixed
- A paired device no longer shows as offline or fails every action while it is actually connected.
- Terminating a chat session on a paired device stops the agent on that device too.
- Downloading files and viewing images or PDFs from a paired device works instead of hanging.
- Port forwards on a paired device survive a reconnect, and a port published again after a restart keeps its public link.
- Unpairing a machine removes its public links, and removing an ssh machine removes its forwards.
- Public URLs no longer stay down after a relay hiccup at startup, and a relay token you set can be cleared again.
- A terminal on a paired device whose folder was deleted starts in the home folder instead of failing.
- Mounting a machine's root folder works, and mounting a folder a second time no longer leaves two entries that break each other.
- The Public URLs "relay not configured" hint is shown in Chinese and Japanese too.

## 2.168.0 — 2026-07-15

### Fixed
- Mounting a folder from a machine works when its path ends in a slash, instead of failing with 403 Forbidden on every file.

## 2.167.0 — 2026-07-15

### Added
- Public URLs (⚙ → Plugins) lets you set the relay's address, port and token yourself; your cluster's values are the defaults.
- With a Subdomain host set, a published port gets a random https:// subdomain link instead of an address and port.

### Changed
- On clusters that provide a relay, Public URLs is on by default; you can turn it off.
- The device software's own messages call it vibespace-device instead of agentd.

## 2.166.0 — 2026-07-15

### Added
- A new Public URLs plugin (⚙ → Plugins) publishes a forwarded port to the internet as a shareable link.

## 2.165.0 — 2026-07-15

### Added
- Machine rows in the Remote tab have a ports action: scan the machine's listening ports and forward one to open it in your browser.
- Forwards are private, come back after a restart or reconnect, and are removed when you unpair the machine.

## 2.164.1 — 2026-07-15

### Fixed
- Terminal sessions on a paired device no longer leave the agent running on the device after reconnects or Terminate.
- A terminal on a paired device whose program exits ends and shows why, instead of restarting it again and again.
- A terminal on a paired device refuses a subscription account it cannot use there, instead of silently billing the device's own login.
- File Properties works for files on a Mac paired device, and a terminal resized while it opens keeps its size.
- New Session no longer shows another machine's home folder or recent folders after you switch machines.

## 2.164.0 — 2026-07-15

### Added
- You can now open a terminal on a paired device; keystrokes, full-screen programs and window resizing all reach the device.

### Changed
- Pairing a device now also installs terminal support; if that install fails, only terminals are affected and they say why.

### Fixed
- Starting a Codex chat on a paired device now fails at once with a clear message instead of a blank window; Codex in a terminal there works.

## 2.163.0 — 2026-07-15

### Changed
- A session on a remote machine or paired device with no folder chosen now starts in that machine's home folder, and the New Session dialog shows it.

### Fixed
- Chat on a paired device no longer goes blank when started in a folder only the server has, and a bad folder no longer knocks the device's agent offline.
- The New Session dialog no longer says an existing folder on a paired device is missing, and offers to create one that really is.
- File details, rename, copy, move and archive operations now work on the files of a paired device.

## 2.162.7 — 2026-07-15

### Fixed
- Updating a VibeSpace set up to run under your personal user name no longer fails with a git "dubious ownership" error.

## 2.162.6 — 2026-07-15

### Fixed
- Chat on a paired device no longer stays blank because none of its output was passed back to VibeSpace.

## 2.162.5 — 2026-07-15

### Fixed
- Opening a terminal on a paired device no longer shows a blank window; it says terminals are not available there yet and points you to chat.

## 2.162.4 — 2026-07-15

### Fixed
- Sessions on a paired device no longer stay blank because the device's agent could not find node or claude; the device gets the fix when it updates itself.

## 2.162.3 — 2026-07-15

### Fixed
- Files, mounts and sessions on a paired device no longer go blank while it shows online after the device updated itself.
- A device that connects right after VibeSpace starts no longer fails to reconnect its mounts.

## 2.162.2 — 2026-07-15

### Fixed
- A share token can no longer be mistaken for a machine's reverse-mount token, whatever name you give it.

## 2.162.1 — 2026-07-15

### Fixed
- A failed attempt to share a folder onto a machine no longer leaves an extra reverse-mount token behind; old leftovers are cleared at the next restart.

## 2.162.0 — 2026-07-15

### Changed
- A paired device's agent now starts by itself after a reboot and restarts after a crash (macOS and Linux); re-run the pairing command once to switch over.

### Security
- A paired device's pairing tokens no longer appear in its process list or in any service file; the device keeps them in a file instead.

## 2.161.3 — 2026-07-15

### Fixed
- Actions on a paired device that is offline now fail within a second with "device offline — rerun the install command" instead of hanging.
- A folder shared onto a paired device now shows the device's real connection state instead of always green.
- Installing rclone on a paired device with a slow connection is no longer cut off in the middle of the download.

## 2.161.2 — 2026-07-15

### Fixed
- The workspace no longer gets stuck scrolled down, pushing every window out of place, after focus lands in a window that reaches past the bottom edge.

## 2.161.1 — 2026-07-15

### Changed
- Mount tooltips, dialog titles and labels now all say "this VibeSpace" for both directions of mounting.

### Fixed
- The file explorer's right-click menus now stay on screen, tall menus scroll, submenus flip at the edges, and Escape closes them.

## 2.161.0 — 2026-07-15

### Changed
- Mount button tooltips now name the machine, e.g. Mount a folder from "Mac" into this workspace.
- A window whose request gets no reply within about 15 seconds now shows a message instead of staying blank.

### Fixed
- The device pairing command no longer fails with 401 on a VibeSpace that requires sign-in.
- Terminate in the sidebar on a session running on a remote machine now really stops it and tells you whether it worked.
- Submenus near the screen edge and menus taller than the screen now stay on screen; a long menu scrolls.

## 2.160.1 — 2026-07-15

### Fixed
- A browser tab left open across an update now reloads itself once, instead of showing every session as blank or dead.
- On macOS, a folder shared onto the Mac shows in Finder as "VibeSpace <folder>" instead of a cryptic volume name.

## 2.160.0 — 2026-07-14

### Changed
- Paired devices and ssh machines are now one list of machines in the Remote tab, with This machine shown first.
- Mounting in both directions now works the same on ssh machines and paired devices.
- Test on a paired device now also reports which tools its agent has, and unpairing takes down its mounts.
- Pairings now travel with config export and import, and importing an older bundle keeps your paired devices.
- A folder mount from a machine that never came up is now retried by itself every 5 minutes.

### Fixed
- Folder suggestions when mounting from a paired device now list the device's own folders instead of local ones.
- Manage agents names paired devices in its machine list instead of showing "undefined@undefined".
- Sharing a folder onto a Mac now works, uses the Mac's built-in mount when macFUSE is missing, and shows rclone's real error.

## 2.159.0 — 2026-07-14

### Added
- A paired device now has both mount directions and a New session on this device button, like an ssh machine.

### Fixed
- The New Session dialog labels a paired device "(device)" instead of "undefined@undefined".

## 2.158.1 — 2026-07-14

### Fixed
- A folder mounted from a paired device no longer hangs after the device updates itself; a stuck mount reconnects by itself shortly after.

## 2.158.0 — 2026-07-14

### Added
- A session on a paired device can use a selected API-key account; a subscription login is refused with a clear message instead of using the device's own.

### Changed
- The device agent is now on by default, so local and remote sessions run through it and keep running across a server restart.
- Remote files, session lists, transcripts and usage now share one lasting connection to the machine, with ssh as the fallback.

## 2.157.0 — 2026-07-14

### Added
- Chat sessions on a paired device now get the VibeSpace agent tools (status, task, ask), which reach VibeSpace without any inbound access to the device.

## 2.156.2 — 2026-07-14

### Fixed
- A remote session started in the same folder as a local one is no longer mistaken for the local session's conversation.

## 2.156.1 — 2026-07-14

### Fixed
- A remote chat session no longer goes permanently blank when reopened while its agent keeps running.

## 2.156.0 — 2026-07-14

### Added
- You can now start a chat session on a paired device; it keeps running across server restarts and, for now, uses the device's own Claude login.

## 2.155.1 — 2026-07-14

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.155.0 — 2026-07-14

### Added
- A paired device now appears wherever machines are listed, you can browse its files, and its sessions show in the session list.

### Changed
- Creating a session on a paired device now says plainly that it is not supported yet, instead of failing with a cryptic error.

## 2.154.1 — 2026-07-14

### Changed
- The device agent is now called vibespace-device and the pairing dialog shows the new commands; old pairing commands and links keep working.

## 2.154.0 — 2026-07-14

### Added
- Every machine row now also offers mounting a folder from that machine into this workspace, prefilled with its address, user, port and key.

### Changed
- A reverse-mount token now says which machine uses it for which folder and that revoking it breaks that mount; tokens of removed machines say so.

## 2.153.4 — 2026-07-14

### Fixed
- Sharing a folder onto a bare Debian machine no longer fails to install rclone for want of unzip.
- The folder field when sharing onto a machine accepts ~ and names a missing folder clearly.
- A machine using an imported ssh key now says "using imported key" instead of "using VibeSpace key".

## 2.153.3 — 2026-07-14

### Changed
- The three folder icons on machine rows now look different: share onto the machine, mount from the device, and open in Files.

### Fixed
- A folder mounted from a device now reconnects after a server restart instead of staying grey, and a stuck mount has a Remount button.

## 2.153.2 — 2026-07-14

### Changed
- A paired device's row now matches an ssh machine's row, with its buttons on the top line and a connected or offline status line.
- The device agent shows as vibespace-device in the device's process list.

## 2.153.1 — 2026-07-14

### Fixed
- A folder mounted from a device now shows as an indented row under its device, instead of looking like another machine.

## 2.153.0 — 2026-07-14

### Added
- Paired devices now show in the Remote tab's machine list with Test, Unpair, and a read-only mount of a device folder into this workspace without ssh.
- The pairing dialog gives commands for macOS, Linux and (experimental) Windows.
- One machine can now be paired with several VibeSpace instances at once.

## 2.152.1 — 2026-07-14

### Added
- The Remote tab has a Paired devices section showing whether each device is connected, with an Unpair button.

### Fixed
- Pairing a Mac now actually starts its device agent, and the install command reports a failure instead of claiming success.

## 2.152.0 — 2026-07-14

### Added
- Remote tab → Pair a device (no ssh — it dials out) gives a one-line install command, with a copy button, for a machine you cannot reach by ssh.

### Changed
- A Group manager session can now show and update any Task Group, not just its own, and is told what it may do when it starts.

### Fixed
- A closed window no longer comes back after you switch to another desktop and back.
- The Group manager toggle in Session Properties now saves.

## 2.151.0 — 2026-07-14

### Fixed
- A window borrowed onto the Stage no longer leaves a ghost at the wrong place on its home desktop's preview.
- Leaving the Stage for a desktop no longer leaves that desktop's preview blank.
- A Gmail sync no longer freezes for good when a message is deleted before it is downloaded, or when a connection hangs.

## 2.150.0 — 2026-07-14

### Fixed
- Files on a remote machine now open in every viewer, the editor and the hex viewer instead of failing; the window title names the machine.

## 2.149.0 — 2026-07-14

### Added
- Right-click a folder → Share this folder… now offers Create share link or mounting the folder onto one of your machines.

### Changed
- Folders shared onto a machine that was since removed show in their own section, where you can unmount them.

### Fixed
- Resuming a remote chat no longer leaves an older copy of the agent writing the same conversation, which made resume seem to do nothing.
- SMB/NAS mounts no longer falsely warn "access denied"; the revoked-share warning now shows only for an imported share.
- Files uploaded in a remote session's chat now land on that machine instead of the local server.
- A Web view opened from a layout preset keeps its proxy mode.

## 2.148.0 — 2026-07-14

### Added
- A machine row now has "share a folder onto this machine", which works with no public address, Tailscale or VPN; active shares show under the machine.
- A new setting chooses where files dropped or attached in chat are saved: the session's folder by default, or a folder you set.

### Fixed
- Web view windows now keep their proxy mode and current page across a refresh and on your other devices.
- A Usage window that appeared from another device now keeps syncing and closes when you close it there.

## 2.147.0 — 2026-07-14

### Added
- A remote machine can now mount a folder of this VibeSpace on Linux, macOS or Windows; rclone is installed there when missing.
- You can run a Mac or Linux machine as a VibeSpace device with an install script, even one behind NAT that connects out to VibeSpace.

## 2.146.0 — 2026-07-14

### Added
- An opt-in setting makes remote files, session lists, transcripts and usage use one lasting connection to the machine, falling back to ssh.

## 2.145.0 — 2026-07-14

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.144.0 — 2026-07-14

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.143.0 — 2026-07-14

### Added
- An opt-in setting runs remote chat sessions inside the VibeSpace device agent on that machine; the default way is unchanged.

## 2.142.2 — 2026-07-14

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.142.1 — 2026-07-14

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.142.0 — 2026-07-14

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.141.3 — 2026-07-14

### Fixed
- The Tailscale card no longer says "managed by the system" and hides its controls while VibeSpace's own Tailscale runs in kernel mode.

## 2.141.2 — 2026-07-14

### Added
- The Tailscale plugin has a Networking choice (Auto, Kernel, Userspace), switchable while it runs, and a field for extra tailscale up flags.

### Changed
- In the Helm chart, tun.enabled now mounts the host's tun device directly by default, with no cluster device plugin needed.

## 2.141.1 — 2026-07-13

### Fixed
- The Tailscale login link no longer disappears right after you click Log in….
- Switching virtual desktops quickly no longer drops a switch or makes windows vanish.

## 2.141.0 — 2026-07-13

### Added
- An opt-in setting (Session category, restart to apply) runs local terminal sessions through the VibeSpace device agent; it is off by default.

## 2.140.0 — 2026-07-13

### Added
- ⚙ → Plugins… adds host capabilities that keep their state across container rebuilds; the first plugin is Tailscale.
- Tailscale runs in kernel or userspace mode, logs in through a link you open, and reconnects after a container rebuild without logging in again.
- The Helm chart can give the pod a tun device (tun.enabled) for full Tailscale networking.

## 2.139.0 — 2026-07-13

### Added
- Codex chat sessions can now run on remote machines and keep going across ssh drops, approval requests included.

## 2.138.0 — 2026-07-13

### Added
- A remote chat created before disconnect protection existed shows an amber "no disconnect protection" chip with advice to recreate it.

### Fixed
- A remote chat now survives its helper process being killed, and one that really crashed ends plainly so Resume recovers it, instead of restarting blank.
- After a container rebuild, remote sessions still running show as resumable, and Resume picks up the running agent without stopping it.
- Resuming a remote session first stops any leftover copy writing the same conversation, so resume no longer does nothing.

## 2.137.1 — 2026-07-13

### Added
- Dropbox, Box, pCloud, Yandex Disk, Jottacloud and HiDrive are now an "Other cloud" storage type with guided sign-in instead of raw rclone settings.

### Changed
- Existing rclone mounts of those providers switch to the new type by themselves, and an expired sign-in offers Fix.

## 2.137.0 — 2026-07-13

### Changed
- Gmail "Messages to sync" 0 now means the whole mailbox with no 200,000 limit, and a number you set is followed exactly.

### Fixed
- Terminal fonts now load where Google Fonts is blocked, because they ship with VibeSpace.

## 2.136.6 — 2026-07-13

### Changed
- Backlog rows in the log viewer are quieter: the status circle leads, who parked or claimed it is plain text, and the row buttons appear on hover.

## 2.136.5 — 2026-07-13

### Fixed
- Backlog rows no longer squeeze long text into a narrow column; the buttons sit on the right and who parked or claimed it goes on a second line.

## 2.136.4 — 2026-07-13

### Fixed
- Gmail sync shows "N / total" with a real progress bar again, also after a restart.

## 2.136.3 — 2026-07-13

### Changed
- The Gmail card shows "Downloading · N so far…" during a large download instead of "Checking for new mail…".

## 2.136.2 — 2026-07-13

### Fixed
- A Gmail first sync resumed after a restart no longer skips older mail when new mail arrived in between.
- The Gmail progress bar no longer stutters in its first third.

## 2.136.1 — 2026-07-13

### Fixed
- A server restart during a Gmail first sync now continues where it stopped instead of scanning the whole mailbox again.

## 2.136.0 — 2026-07-13

### Added
- OneDrive is a storage type with guided sign-in: Personal, Work/School or SharePoint, an optional folder and drive ID, and your own Azure app if you like.

### Changed
- Existing rclone OneDrive mounts become OneDrive mounts by themselves, with their settings kept.

## 2.135.4 — 2026-07-13

### Changed
- Google Drive mounts added through rclone are now ordinary Google Drive mounts, converted by themselves with their settings kept.

## 2.135.3 — 2026-07-13

### Fixed
- A Google Drive added through rclone now has the full Drive controls when editing and in New submount: OAuth client, scope, shared drives, folder ID.

## 2.135.2 — 2026-07-13

### Fixed
- The Gmail edit dialog now shows 0 for "Messages to sync" after you saved 0, instead of a blank.

## 2.135.1 — 2026-07-13

### Fixed
- Edit dialogs now show the stored Drive and Gmail settings, such as the OAuth client, scope and labels, instead of defaults.
- Changing a Gmail mount's labels, query or message count now fetches older mail that just came into scope.

## 2.135.0 — 2026-07-13

### Added
- A "By label, then month/day" layout files mail under Inbox, Archive, Sent, Spam, Trash and Drafts; it is the default for new Gmail mounts.
- List labels in the Gmail add and edit dialogs lets you pick labels instead of typing their ids.

### Changed
- Gmail now syncs the whole mailbox by default, archived mail, spam and trash included, and "Messages to sync" 0 means everything, up to 200,000 messages.
- Storage edit dialogs use dropdowns for the OAuth client and Gmail grouping, and a WebDAV vendor can now be changed.

## 2.134.4 — 2026-07-13

### Added
- New submount under a Google Drive can pick a shared drive with List shared drives or one shared folder by ID, using the parent's sign-in.

## 2.134.3 — 2026-07-13

### Fixed
- Clicking a drive in the shared-drive list now selects it.
- Editing an existing Google Drive mount can now change its cloud-side scope from a dropdown, with List shared drives.

## 2.134.2 — 2026-07-13

### Added
- Gmail mounts can file mail into month or day folders (new mounts use month folders, existing ones stay flat), and switching re-downloads nothing.

### Fixed
- .eml files no longer show "undefined" over their name in the file explorer; they get an envelope icon.
- The Gmail sync count is no longer cut off.

## 2.134.1 — 2026-07-13

### Changed
- Gmail storage cards show a live progress bar while syncing and "Synced — N emails" when idle, and say that stopping keeps your emails.

## 2.134.0 — 2026-07-13

### Added
- Gmail as a folder: a Gmail account's mail syncs into a folder as read-only .eml files, filtered by labels or a search; unmounting keeps the files.
- A built-in email viewer opens .eml files with subject, sender and date, text or sandboxed HTML, and attachment downloads.

### Fixed
- Bringing a window onto the Stage no longer draws a phantom copy on its home desktop's preview.
- GoTo on a session card while the Stage is active now brings the window onto the Stage instead of switching desktops.

## 2.133.0 — 2026-07-13

### Added
- An admin can preset Google OAuth clients for a VibeSpace and the Drive add dialog lets you pick one; the secret is never stored in your mount.

## 2.132.0 — 2026-07-13

### Added
- A session you mark Group manager in Session Properties can create and set up Task Groups, when "Allow agents to manage Task Groups" is also on.
- A Group manager can organize only (no deleting or starting sessions), and each of its actions appears in the group's activity log.

## 2.131.0 — 2026-07-13

### Added
- Google Drive mounts and submounts can target My Drive, Shared with me or a Shared drive (List shared drives), or one shared folder by ID.
- An admin can set a default Google OAuth client for Drive, so you no longer need your own.

## 2.130.0 — 2026-07-13

### Added
- Agents can now edit a backlog item in place with vibespace-task backlog-edit, keeping its id.

### Fixed
- The guided login terminal in onboarding and Manage agents is no longer cut off on the right.

## 2.129.1 — 2026-07-13

### Fixed
- Creating a Codex chat on a remote machine now fails at once with a clear error instead of starting a broken session.

## 2.129.0 — 2026-07-13

### Added
- Manage agents shows what VibeSpace has installed on a selected remote machine (tools, hooks, node) with Install/Reinstall and Remove.

## 2.128.0 — 2026-07-13

### Changed
- The Usage window filters by device (All, This machine or a remote machine) in its own row, instead of mixing machines into the account chips.

## 2.127.0 — 2026-07-13

### Added
- The Usage window now includes usage from Claude sessions on your remote machines, each machine as its own entry.
- The quota popup has a Remote hosts section with each machine's own 5-hour and 7-day quota, refreshed only when you press ⟳.

## 2.126.0 — 2026-07-13

### Fixed
- The update log no longer fills with duplicate-key warnings.

### Security
- Remote sessions no longer put the session token or tool files on the remote machine's command line, where other users there could read them.

## 2.125.1 — 2026-07-13

### Fixed
- Searching for a remote session by its id no longer shows "No sessions" when nothing local matches.

## 2.125.0 — 2026-07-13

### Added
- While a remote chat session's connection is down, the chat status bar shows a pulsing "reconnecting" chip; the session keeps running on the host.

### Changed
- Browsing files, listing sessions and loading history on an ssh host is much faster, because one ssh connection is reused for about ten minutes.

## 2.124.0 — 2026-07-13

### Added
- Remote chat sessions keep running on their host when ssh drops, reconnect by themselves and show the output you missed; what you type meanwhile is sent after.
- Remote terminal sessions reconnect by themselves after the connection drops and say so in the terminal.

### Changed
- A silently dropped connection to a host is noticed within about a minute, so remote sessions start reconnecting sooner.
- After a reload or while a host is unreachable, the sidebar shows that host's last known sessions, marked stale, instead of an empty list.

### Fixed
- Ending a remote chat session now also stops it on the host.
- A remote session you create or end shows up in the sidebar at its next refresh instead of after a delay.
- Sidebar search finds every session on the selected host, including ones older than seven days.

## 2.123.1 — 2026-07-13

### Changed
- An agent that claims a backlog item is told which other sessions already hold it, so they can share the work instead of doing it twice.

## 2.123.0 — 2026-07-13

### Added
- Every backlog item has a short id: click it to copy, paste it to any agent in the Task Group and that agent can look the item up or claim it.
- The Backlog shows which sessions claimed each item, and you can remove a claim with ×.

### Changed
- A backlog change is told only to the sessions that created or claimed that item, not to every session in the Task Group.
- Rewording a backlog item reaches agents as a rewording, not as one item removed and another added.

## 2.122.0 — 2026-07-13

### Added
- A Task Group has a Backlog for decisions and work you put off for later; each item is open, done or dropped and shows who parked or resolved it.
- Agents park what you defer in the Backlog, never start a parked item unasked, and remind you of the open items they parked.
- The task detail has a Backlog section and the log viewer a Backlog tab, where you can mark items done, drop, filter, edit and reopen them.
- The Backlog travels with the Task Group when you export it to a repo task file or import it back.

### Changed
- Unchecked items from the removed checklist come back as open Backlog items.

## 2.121.0 — 2026-07-13

### Removed
- The Task Group checklist is gone from the task detail, the log viewer, agent commands and the task file; each agent's own steps stay on its session card.

## 2.120.0 — 2026-07-13

### Changed
- The activity log an agent receives shows more entries, because one very long progress note is shortened instead of crowding out the rest.

## 2.119.0 — 2026-07-13

### Fixed
- An agent's Task Group context always stays in its prompt; a long activity log is shortened instead of the context being moved to a file the agent had to open.

## 2.118.0 — 2026-07-13

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.117.0 — 2026-07-13

### Added
- Sidebar search finds sessions on every remote host, in a "Remote matches" section, not only on the host you selected.
- The Ctrl+K palette also matches a session's id.

### Fixed
- A session that began with injected context is named after your first real message instead of its folder, locally and on remote hosts.

## 2.116.0 — 2026-07-13

### Added
- The Ctrl+K palette finds stopped sessions on remote hosts too, and resumes them on the right machine.

### Fixed
- A resumed remote session no longer shows twice in the sidebar, once running and once stopped.

## 2.115.0 — 2026-07-13

### Added
- A deployment can keep the server's log in daily files, optionally on a shared CephFS folder, for 30 days by default; a stuck write never blocks VibeSpace.

## 2.114.1 — 2026-07-12

### Fixed
- After switching accounts with /login, the usage popup names the account the login really belongs to and warns when the config file says otherwise.

## 2.114.0 — 2026-07-12

### Added
- A deployment can turn on PostHog product analytics, with all text and inputs masked in session recordings; it stays off while diagnostics are off.
- A deployment can turn on a Prometheus metrics port, separate from the web port.

## 2.113.1 — 2026-07-12

### Changed
- When several Task Groups change on one turn, an agent gets one combined update that first names every group that changed.

## 2.113.0 — 2026-07-12

### Added
- Settings → Session → "Task Group updates as diffs" (on by default) lets you go back to sending agents the full context on every change.

### Changed
- Task Group changes reach a running agent as a short list of what changed, not the whole context again; an edit that changes nothing sends nothing.
- A session that receives several Task Groups at once gets one combined context instead of the tools repeated for each group.

### Fixed
- Checking one of two checklist items with the same text now reaches the agent, and remote sessions are no longer pointed at a task file they cannot read.

## 2.112.7 — 2026-07-12

### Fixed
- Update VibeSpace no longer fails with "package-lock.json local changes would be overwritten".

## 2.112.6 — 2026-07-12

### Changed
- The window on the Stage is shared across your devices: a device left on the Stage follows what you open on another, and entering the Stage picks it up.

### Fixed
- Closing the window on the Stage no longer brings back a hidden earlier one on every device.

## 2.112.5 — 2026-07-12

### Changed
- Moving the Stage slot, changing its grid and opening or closing helper windows there show on your other devices on the Stage at once.

### Fixed
- Bringing a session onto the Stage on a device with no window for it no longer closes that window on all your devices.
- A maximized window taken onto the Stage later un-maximizes to its own size, not the slot's.

## 2.112.4 — 2026-07-12

### Changed
- Windows can no longer be dragged between the Stage and normal desktops, and the Stage's placeholder never ends up on a normal desktop.
- Turning the dynamic desktop on or off and changing session-card settings take effect at once, without a page refresh.

### Fixed
- Leaving the Stage puts the window back on its desktop at its own size, not the slot's.
- A grid you set while on the Stage is kept.

## 2.112.3 — 2026-07-11

### Fixed
- The Stage slot stays where you drag it, across page loads, instead of jumping back to the top left.

## 2.112.2 — 2026-07-11

### Fixed
- An editor with unsaved changes is never closed to make room on the Stage.
- When the Stage brings back a session's windows, it skips those whose file, Task Group or workflow is gone instead of opening them broken.

## 2.112.1 — 2026-07-11

### Fixed
- A file you opened from inside an archive is extracted again when the Stage brings its window back.
- Windows the Stage cannot restore are skipped with one message instead of opening as broken viewers.

## 2.112.0 — 2026-07-11

### Added
- Dynamic desktop (Stage), off by default: switching to a session brings it into one movable slot together with its own helper windows, restored when you return.
- Ctrl+Alt+Left from the leftmost desktop enters the Stage; Ctrl+Alt+Right leaves it.
- A setting chooses how many sessions' helper windows the Stage keeps open (3 by default); older ones close and reopen when needed.

### Fixed
- The Update dialog no longer says "Latest version" above the changelog of a newer one.

## 2.111.30 — 2026-07-11

### Fixed
- A new version is noticed within minutes instead of hours, and opening the gear menu or the Update dialog always checks again.

## 2.111.29 — 2026-07-11

### Fixed
- Agents can report their status again; from 2.111.24 to 2.111.28 the vibespace-status command failed every time.

## 2.111.28 — 2026-07-11

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.111.27 — 2026-07-11

### Changed
- With SSO sign-in, the welcome wizard skips the password step, and a password in an imported configuration is ignored.

## 2.111.26 — 2026-07-11

### Fixed
- Update VibeSpace no longer fails with "local changes to vibespace-status would be overwritten".

## 2.111.25 — 2026-07-11

### Changed
- Agents are shown complete, ready-to-copy status commands, so their first report is accepted instead of rejected.

## 2.111.24 — 2026-07-11

### Changed
- An agent that says it is blocked, needs input or wants a review must give both a one-line reason and the full details.

## 2.111.23 — 2026-07-11

### Changed
- An agent can no longer mark itself blocked, needing input or waiting for review without saying why.

## 2.111.22 — 2026-07-11

### Changed
- Agents get a shorter list of VibeSpace tools, each of which explains itself in detail when run.
- An agent that marks itself as waiting on you is reminded to say so in the chat too.

### Fixed
- The Update dialog reloads the page by itself once the server restarts, even when you were already up to date, and always offers "Reload now".

## 2.111.21 — 2026-07-11

### Changed
- Signing in to or installing an agent CLI during setup runs in a terminal inside the wizard, which closes by itself once it succeeds.
- Update VibeSpace shows its progress in a dialog, reloads the page when the new version is up, and shows the log if it fails.
- Unmounting, moving or removing a mount also removes its leftover folder when that folder is empty.
- An agent that files a question for you is reminded to ask it in the chat too.

## 2.111.20 — 2026-07-11

### Added
- A setting makes the layout buttons arrange windows once and then return to free-form.
- The Settings window highlights the category you have scrolled to.

### Changed
- The gear menu is regrouped by kind, and Diagnostics has its own icon.

### Fixed
- Usage meters show grey "no data yet" donuts, and say where the numbers come from, instead of vanishing on an instance with no usage data yet.

## 2.111.19 — 2026-07-11

### Fixed
- The Desktop button comes back by itself, without a reload, when the page was loaded while the server was restarting.

## 2.111.18 — 2026-07-11

### Added
- Extracting an archive shows a progress bar with a live file count and a cancel button, in the file list and the upload menu.

### Fixed
- Extracting with existing files skipped no longer reports success as an error.

## 2.111.17 — 2026-07-11

### Fixed
- Dragging a folder onto the file explorer uploads it with its whole structure instead of failing.

## 2.111.16 — 2026-07-11

### Added
- The share dialog also gives a ready-to-paste rclone configuration.

### Fixed
- A Mac can now write into a share mounted in Finder; read-only shares still show as read-only.

## 2.111.15 — 2026-07-11

### Added
- "Share a local folder" also shows the address and token to mount the share directly in Finder or Explorer.

## 2.111.14 — 2026-07-11

### Added
- Finder (Cmd+K) and Windows Explorer can mount a shared folder: any user name, with the share's token as the password.

### Fixed
- The storage dialogs (Share a local folder, Import rclone config, Import share link, Connect storage) are translated into Chinese and Japanese.

## 2.111.13 — 2026-07-11

### Fixed
- The Desktop button no longer disappears for the whole visit when the page loaded during a server restart.

## 2.111.12 — 2026-07-11

### Fixed
- A terminal no longer stays stuck with too-wide letter spacing when its web font arrives slowly.

## 2.111.11 — 2026-07-11

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.111.10 — 2026-07-11

### Fixed
- Code blocks in the chat no longer paint lines on top of each other or squeeze a line into a narrow column.

## 2.111.9 — 2026-07-11

### Fixed
- Android Chrome no longer enlarges VibeSpace's text on its own, such as the small code font in chat.

## 2.111.8 — 2026-07-11

### Fixed
- A chat message with a code block no longer keeps the height it had in a wider window, so its lines have room when the window gets narrower.

## 2.111.7 — 2026-07-11

### Added
- Sharing a folder from a CephFS My storage can give a link the receiver mounts directly at full speed; Revoke removes its access.

## 2.111.6 — 2026-07-11

### Added
- Every For-you item has a ⤢ viewer that shows its text and detail formatted and selectable, with a Copy button.

### Changed
- Text in the For-you popup can be selected without jumping away.
- Agents are told to put the full content in the chat, never only in For you.

## 2.111.5 — 2026-07-11

### Fixed
- Scrolling up through a long chat no longer jumps around or slams to the very top.

## 2.111.4 — 2026-07-11

### Changed
- Storage rows read "[Type] /path", without the arrow.

### Fixed
- The sidebar's Folders and Remote tabs, including their section headers, empty states and action rows, are translated into Chinese and Japanese.

## 2.111.3 — 2026-07-11

### Changed
- When you are on the latest version, the Update dialog shows what is in this version.
- The Helm chart's default pod limits are 8 CPUs and 32 GiB of memory.

### Fixed
- Chromium in the in-container Desktop starts again after the pod is recreated.
- The in-container Desktop's panel buttons open the terminal, file manager, Chromium and settings directly.

## 2.111.2 — 2026-07-11

### Fixed
- On a new in-container Desktop, the panel's Settings, Terminal, Files and Browser buttons open their apps instead of doing nothing.

## 2.111.1 — 2026-07-11

### Fixed
- The in-container Desktop no longer refuses to open with "Too many security failures".
- The Update confirmation dialog no longer cuts off its buttons.

## 2.111.0 — 2026-07-11

### Added
- Settings has a notification popup duration (6 seconds by default).
- The For-you popup has a Notifications page listing recent popups.

### Changed
- Notifications, errors and confirmations show as cards next to the For-you button, with a colored edge and a close button.
- Update VibeSpace… first lists every changelog entry between your version and the latest, and updates only after you confirm.
- Storage rows show the connection type in the detail line, a Connect chip only on disconnected rows, and Remove inside the Edit dialog.

### Fixed
- Notifications no longer have a see-through background that made them easy to miss.
- Creating, renaming or deleting a file in a read-only mount says the mount is read-only instead of just "failed".

### Removed
- The duplicate-mount button is gone; use a submount instead.

## 2.110.1 — 2026-07-11

### Changed
- The gear menu's Update VibeSpace… row shows your version on a second line, and the newer one when an update is available.

## 2.110.0 — 2026-07-11

### Added
- The gear menu's Update VibeSpace… row shows the running version and highlights a newer release.
- In a container, Update VibeSpace updates and restarts in place and your agent sessions keep running (after one new image).
- A setting limits how much disk the rclone mount cache may use (10 GB by default).

### Changed
- rclone mounts cache reads and writes on local disk, so they are faster and writes not yet uploaded survive a crash.
- A mount whose connection dies or hangs reconnects by itself, showing "auto-reconnecting"; an expired sign-in still asks you, and Unmount stops it.

### Fixed
- Starting an rclone mount no longer takes about 22 seconds when VibeSpace runs from a network drive.

## 2.109.5 — 2026-07-11

### Fixed
- Scrolling up through a chat with collapsed Bash runs no longer jumps or keeps loading in a loop.
- A tool card waiting for your Allow or Deny no longer hides inside a collapsed run.
- An answered question or permission card no longer comes back as waiting for your answer after a restart.
- A tool you allowed that then fails shows Allowed, not Denied.
- A run you opened no longer snaps shut when its tool finishes, and chat windows stop redrawing their runs in the background.

## 2.109.4 — 2026-07-11

### Fixed
- A My storage set up by the deployment is mounted on the first start instead of staying unmounted.
- Upgrading a Helm deployment that has no S3 settings no longer fails.

## 2.109.3 — 2026-07-11

### Fixed
- A CephFS My storage set up by the deployment mounts itself on every start instead of sometimes staying unmounted.

## 2.109.2 — 2026-07-11

### Changed
- A CephFS My storage gets more time to answer and is disconnected only after two hangs in a row, not after a single slow response.

## 2.109.1 — 2026-07-11

### Added
- My storage can be a fast CephFS folder mounted directly, with your quota shown as its size; it replaces S3 when a deployment sets both.

## 2.109.0 — 2026-07-11

### Changed
- Saving the storage Edit dialog changes only what you edited, and clearing an rclone parameter removes it.

### Fixed
- A mounted share that was revoked or expired says so on its row instead of looking healthy while every file fails, and clears when access returns.
- A storage mount that stops responding no longer slows file browsing or sign-in elsewhere in VibeSpace.

## 2.108.8 — 2026-07-11

### Changed
- Closing a session window keeps the session running in the sidebar by default, for every kind of session.
- The storage Edit dialog shows the current connection values, tokens and keys included, instead of blank "keep" fields.

## 2.108.7 — 2026-07-11

### Changed
- A plain terminal stays alive in the sidebar when you close its window, unless you have set the close behaviour yourself.

## 2.108.6 — 2026-07-11

### Changed
- When file access gets stuck, VibeSpace checks the storage mounts at once instead of waiting up to a minute.
- A Kubernetes deployment that stops responding for about five minutes restarts itself.

## 2.108.5 — 2026-07-11

### Fixed
- Importing a share of this same instance no longer freezes it; you are told to open the folder directly instead.

## 2.108.4 — 2026-07-11

### Fixed
- Files in a mount that is still connecting or not responding fail at once with a message instead of slowing the whole server down.

## 2.108.3 — 2026-07-11

### Fixed
- A mount whose host cannot be reached no longer makes VibeSpace unreachable; it is disconnected with a message saying why.
- A mount that stops responding later is disconnected automatically, with a message, so VibeSpace stays responsive.

## 2.108.2 — 2026-07-11

### Added
- Every top-level storage row can hold submounts, with + on S3, rclone, Drive and SFTP rows.
- In the container image you can use sudo in a terminal without a password.

### Changed
- A connection whose sign-in can't open its root shows a key icon instead of Connect and mounts through its submounts; once it can, it mounts normally.

## 2.108.1 — 2026-07-11

### Added
- A setting, "Hide empty thinking blocks" (on by default), hides thinking cards that have no text.

### Fixed
- Several sessions started in the same folder are no longer mixed up, so ending or resuming one acts on the right session.
- A remote session started outside VibeSpace no longer opens blank in chat, and its View History pages and searches again.
- Thinking cards collapse into runs again, and hidden cards no longer break thinking or Bash runs.

## 2.108.0 — 2026-07-11

### Added
- A storage connection can hold several mount points, listed as remote:path rows, and refreshing its token or keys fixes all of them at once.
- When Google Drive reports its sign-in revoked or expired, "Re-authorize Google Drive…" signs you in again and reconnects the mount.
- The Edit dialog lets you change every connection field of a mount, except those provided by the deployment.

### Changed
- Mounting with a bucket-scoped S3 or R2 token turns the entry into a connection and says what to do, instead of mounting a folder where every file fails.
- A storage connection can't be removed while mount points are still under it; remove them first.

### Fixed
- A wrong S3 bucket name fails at once with a hint (lowercase letters, digits and hyphens) instead of mounting a broken folder.
- Codex chats no longer show each assistant message twice after reattaching or a restart.
- The Import rclone config dialog no longer squeezes its rows into columns.

## 2.107.1 — 2026-07-11

### Added
- The storage Edit dialog lets you choose a custom mount point for any mount.

### Changed
- A storage connection provided by the deployment cannot be edited in the app; you can still change its name and mount point.

### Fixed
- Settings, Desktop, Usage, task detail and workflow windows come back after a page refresh instead of vanishing.

## 2.107.0 — 2026-07-11

### Added
- ✎ Edit on every mount row changes its name and connection settings, and a connected mount reconnects with them.
- ⧉ New mount from this connection makes another mount with the same credentials and a different bucket, path or prefix.

### Changed
- A My storage provided by the deployment can no longer be deleted in the app, only edited, renamed or unmounted.
- A mount can't be renamed while a folder you shared points into it.

## 2.106.5 — 2026-07-11

### Changed
- Thinking and Bash cards collapse together into one group, any Bash card starts one, and a running command shows "running…" on the group's header.
- Two thinking messages in a row now collapse, and the newest message collapses like the others.
- Your own role bar in the chat is now blue, so it never looks like the assistant's, whatever the theme.

## 2.106.4 — 2026-07-11

### Fixed
- On an instance with no sessions yet, the Remote tab shows machines and storage instead of "No sessions".

## 2.106.3 — 2026-07-11

### Fixed
- A My storage added to a deployment after its first start now appears at the next restart, and one you deleted stays deleted.

## 2.106.2 — 2026-07-11

### Fixed
- Creating or resuming a remote session without choosing an account uses the host's own CLI login instead of failing.
- The Manage Agents dialog no longer stretches sideways.
- Collapsed runs of thinking and Bash cards are really hidden in the chat.

## 2.106.1 — 2026-07-11

### Added
- Double-click the taskbar's resize handle to reset its size.

### Fixed
- The sidebar keeps its scroll position when agents update their status or tasks.
- Resizing the bottom taskbar no longer resizes the top bars.

## 2.106.0 — 2026-07-11

### Added
- Runs of thinking messages or Bash cards collapse behind a clickable "N × …" line, like in the Claude Code terminal (a setting, on by default).
- A setting keeps the activity spinner turning when your system asks for reduced motion, instead of pulsing.

### Changed
- The Settings window now opens on your other devices too, like other windows.

### Fixed
- Log in or Install in the welcome wizard pauses the tour, and "Back to setup" returns you to the same step.
- In the welcome wizard, an agent's name and version stay on one line and its buttons are no longer squeezed.
- Chromium starts in the container image's desktop.

## 2.105.2 — 2026-07-11

### Fixed
- A remote session opened on another device shows the live chat instead of a blank window.
- The history of a remote session that has ended is loaded from its host.
- A new session that is refused shows the reason in its window and in a toast instead of staying blank.

## 2.105.1 — 2026-07-11

### Changed
- Codex login always uses a link and a one-time code, which works on remote hosts and in containers.

### Fixed
- A terminal opened before the font list has loaded switches to your font once it arrives.

## 2.105.0 — 2026-07-11

### Added
- The welcome wizard's first step lets you pick a theme, applied at once.

### Fixed
- On a first visit, a terminal repaints in its real font once the font arrives instead of staying on a fallback.

## 2.104.1 — 2026-07-11

### Fixed
- Signing in with Clerk no longer fails with "window.Clerk is not a constructor".
- A container instance set up from a specific release commit can now update itself.

## 2.104.0 — 2026-07-11

### Added
- A Desktop window shows the container's own desktop in your browser, with no second password; the gear menu offers it where available.
- The container image includes a desktop with Chromium and Chinese, Japanese and Korean fonts.

### Fixed
- Websites that use WebSockets now work through the Web view's proxy.

## 2.103.0 — 2026-07-10

### Added
- Optional Clerk single sign-on: the login page offers "Sign in with SSO", open only to the emails or domains the deployment allows.
- If you are already signed in with Clerk you go straight in, and a wrong account is offered "Switch account".

## 2.102.0 — 2026-07-10

### Added
- The welcome wizard's first step lets you pick the language.
- An Install button in the wizard and in Manage Agents installs a missing Claude Code or Codex CLI.
- When the instance already has a password, the wizard offers "Change password…" so you can set your own.
- The container image comes with Codex, and CLIs installed into your home folder are kept across image updates.

### Fixed
- Updating a CLI or installing a global npm package in the container no longer fails with a permission error.

## 2.101.0 — 2026-07-10

### Added
- One instance can collect the diagnostics of a whole deployment and show them in a Fleet section of the Diagnostics report, never any content.
- Diagnostics forwarding can carry a token and can be set for a whole deployment.

### Fixed
- A terminal with several browsers attached no longer prints junk such as "^[]11;rgb:ffff/ffff/ffff" at the prompt.

## 2.100.6 — 2026-07-10

### Fixed
- A terminal repaints in its real font once web fonts finish loading, instead of keeping a fallback until you switch fonts.

## 2.100.5 — 2026-07-10

### Fixed
- A markdown link to a local file in the chat opens it in the file viewer instead of a broken web address.

## 2.100.4 — 2026-07-10

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.100.3 — 2026-07-10

### Fixed
- With the sidebar open, dragging a snapped or maximized window, or pulling out a tab, keeps it under the pointer instead of a sidebar-width away.

## 2.100.2 — 2026-07-10

### Fixed
- A desktop's preview is no longer blank after you switch desktops.
- A desktop preview updates after you drag a window back into the same snap zone.
- A snapped or maximized window no longer drifts away from the pointer while you drag it.

## 2.100.1 — 2026-07-10

### Fixed
- The Backup & migrate dialog shows each checkbox beside its label in two columns (one on phones), so it fits without scrolling.
- Wide dialogs no longer run off the edge of a phone screen.

## 2.100.0 — 2026-07-10

### Added
- Backup & migrate can carry your billing accounts — API keys and logged-in Claude and Codex subscriptions — protected by your passphrase.
- Backup & migrate has a new section for the usage pricing table: model rates and per-account discounts.

### Changed
- Backup & migrate also carries your language, your usage-view account choices and whether onboarding is done.
- An import never overwrites an account that already exists on the new machine.

### Fixed
- Task Groups can be exported and imported in Backup & migrate; the section was missing from both dialogs.

## 2.99.3 — 2026-07-10

### Added
- A Usage dashboard panel can split its series by a second dimension ("Split series by"), such as tokens per day per account, as lines or stacked bars.

### Changed
- The Account reconciliation preset now starts with tokens and cost per day for each account.

## 2.99.2 — 2026-07-10

### Fixed
- On phones, opening a window (Properties, task details, files, viewers…) or a dialog closes the sidebar, so the window no longer opens behind it.
- On phones, tapping a billing chip in the window switcher keeps the window list open under its menu.
- The Usage window no longer shows horizontal scrollbars at any width; panels, numbers and tables fit their space.

## 2.99.1 — 2026-07-10

### Added
- On phones, the chat status bar shows which account the session bills to; tap it to switch accounts.
- On phones, each session in the window switcher shows its account, and tapping the account lets you switch it.

### Changed
- The Usage dashboard follows its window's width, folding to one column in a narrow window even on a wide screen.

## 2.99.0 — 2026-07-10

### Added
- The phone navigation bar has a ⚙ menu (Usage, Manage agents, Diagnostics report, Settings, Backup…) and a quota chip that opens the usage popup.
- Right-click or long-press a session card and choose "Switch billing…" to change its account without opening its window.

### Changed
- On phones, the usage popup and the ⚙ menu open as full-width sheets below the navigation bar.

### Fixed
- On phones, the Usage dashboard shows one panel per row instead of pushing its right column off the screen.

## 2.98.0 — 2026-07-10

### Changed
- Every Usage dashboard chart — line, bar and donut — has the same hover tooltips, legends you click to hide a series, and your theme's colors.
- Bars for hours, weekdays and days stand upright, bars for models, accounts and projects lie flat, and bars with mixed units get two axes.
- The dashboard has five presets, including a new Model comparison and fuller Cost overview, Token throughput and Account reconciliation.

### Fixed
- Usage dashboard charts no longer render black.

## 2.97.0 — 2026-07-10

### Added
- A Usage dashboard panel can show several metrics at once; a line chart mixing units, such as cost and requests, gets a second axis by itself.
- Line charts have a legend with values on hover, and you can turn each series on or off.
- Bar, big-number and table panels show every selected metric side by side.

## 2.96.0 — 2026-07-10

### Added
- The Usage window is a dashboard of panels you build: pick a metric (cost, requests, tokens, cache hit ratio, sessions), a breakdown and a chart type.
- Each panel has a ✎ editor and a ⋯ menu to move, resize or remove it; "Add panel" adds one and the Panels… menu offers four presets.
- Your dashboard layout is saved with your settings and is the same in every browser you use.

### Changed
- The previous fixed layout of the Usage window is still there as "Classic view".

## 2.95.0 — 2026-07-10

### Added
- The Diagnostics report tracks more performance numbers: reconnect outages, chat load and search times, session start time, upload speed and server load.
- Slow server requests are recorded for the Diagnostics report without your file paths.

## 2.94.0 — 2026-07-10

### Added
- The Diagnostics report has a Performance metrics table: load time, page memory, open windows, UI stalls, and server memory and responsiveness.

## 2.93.0 — 2026-07-10

### Maintenance
- Test and release tooling only; nothing changes for you.

## 2.92.0 — 2026-07-10

### Changed
- The file explorer, the file and hex viewers and the Workflow detail window are fully translated into Chinese and Japanese.
- Menu labels use sentence case everywhere, and every "Custom..." item now reads "Custom…".
- The CSV, Excel and PowerPoint viewers follow your theme's colors, and the code editor's light theme takes its accent from your theme.

### Fixed
- Scrolling up through a very long chat no longer fails with an error while it loads older messages.

## 2.91.0 — 2026-07-10

### Changed
- Long chats scroll more smoothly, and the chat minimap keeps up as new turns arrive.
- Moving a window in the taskbar's Move mode is smoother, and the sidebar refreshes faster when you have thousands of sessions.

### Fixed
- Closing the code editor, the host setup dialog or the Google Drive sign-in no longer leaves it working in the background.
- Mounted storage no longer fills its log with routine messages, so the real cause of a mount failure is easier to see.
- Removing a remote machine also deletes its cached transcripts, and leftovers are cleaned up after 30 days.

## 2.90.1 — 2026-07-10

### Fixed
- With VibeSpace open in several browsers, window moves reach the others again and an idle tab no longer puts old window positions back.

## 2.90.0 — 2026-07-10

### Fixed
- Deleting the desktop you are on no longer wipes the layout of the desktop you land on.

## 2.89.3 — 2026-07-10

### Changed
- Manage agents → Agent instructions is a collapsed section next to the VibeSpace integration row, marked "customized" once you set anything.
- Each agent instruction has its own labelled field, and the stop-nudge conditions read as sentences with the numbers inline.

## 2.89.2 — 2026-07-10

### Fixed
- After a server restart, chat history no longer stops partway with later replies and tool cards missing; affected chats show in full again.
- A single unreadable record in a chat's history is skipped instead of cutting off everything after it.

## 2.89.1 — 2026-07-10

### Fixed
- A session still running through a server restart no longer loses its saved output, so its history stays complete after later restarts.

## 2.89.0 — 2026-07-10

### Added
- In Manage agents → Agent instructions you can set when the stop nudge fires: minutes without a status update (default 10) and the gap to the next (default 30).

### Fixed
- Tab groups no longer show a stray billing badge left of the tabs, and the last window gets its own badge back when a group breaks up.

## 2.88.1 — 2026-07-10

### Fixed
- Billing badges no longer vanish from windows in a tab group or from a window you pull out of one.

## 2.88.0 — 2026-07-10

### Added
- Manage agents → Agent instructions also lets you add your own text to every prompt and to the stop nudge, each in its own field.

### Fixed
- Messages you send while the agent is working no longer disappear from the history after a restart, a resume or in a read-only view.

## 2.87.0 — 2026-07-10

### Added
- Manage agents → Agent instructions lets you give every agent your own instructions (reply language, house rules), sent once per session and again on edit.

### Fixed
- Server-side settings (quota refresh, usage polling, subscriptions on remote machines, agent reminders, telemetry, hiding empty hook cards) now take effect.
- Switching billing or resuming a session keeps the window's place and size instead of opening a default centered window.
- A message you send that starts like a hook notice (such as pasted "Stop hook feedback: …") shows as your message, not a dim notification card.
- Stop hook reasons and other notification cards are no longer cut at 80 characters; the full text is behind the expander.
- VibeSpace uses less memory and CPU with many Codex sessions and after a sub-agent's turn is interrupted.

## 2.86.0 — 2026-07-10

### Added
- A Task Group checklist item can carry a longer detail (acceptance criteria, paths, background) beside its one-line text.
- In the log viewer's Checklist tab, details expand in place, every item can be edited inline, and new items can get a detail.
- Agents can add and read checklist details too, and details travel with repo exports and the Markdown copy.

## 2.85.0 — 2026-07-10

### Added
- A Task Group log viewer opens in its own window with Checklist and Activity log tabs, search, a session filter and "Copy as Markdown".
- Activity entries show which session filed them (click the chip to filter), and checklist items show who added and who ticked them.
- Open the log viewer from the ⧉ buttons in the task detail window or from "Checklist & activity…" in the board header's menu.

## 2.84.0 — 2026-07-10

### Added
- VibeSpace records errors and feature use (names only, never content) on your machine only; in Settings you can turn it off or set a forward address.
- ⚙ → Diagnostics report… shows recent errors, events per day, and tables by event and by version.

### Fixed
- A newly added subscription no longer shows usage from before you added it, and its past usage figures are corrected.
- blob: and data: links open in the Web view again, and so does the chat's HTML Preview button.
