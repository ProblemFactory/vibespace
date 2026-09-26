# Several browsers in one session / two tabbed chat windows each with its browser — how to show them

**Date** 2026-09-26 · **Status** design draft, awaiting the owner's answers to §0 (answered: §0.1) · **Base** master 69720f2b (2.369.178) + lane F (split tabs v2, not merged) · read-only forensics, zero code

(English twin of `docs/design-browser-multiview.zh.md`; the Chinese file is the authoritative text. The owner's words are quoted in the original language with a translation.)

> The owner's words: "确实 得考虑一个会话里可能有多个并行浏览器，怎么展示的问题，你来设计实现一下吧。另外也得考虑如果两个tabbed窗口每个都打开了各自的浏览器，怎么展示的问题，这个你先思考下设计再和我确认。" — "Right, we have to think about how to show a session that may run several browsers in parallel — design and build it. We also have to think about how to show two tabbed windows that each opened their own browser; think that design through first and confirm it with me."

## §0 The conclusion in one sentence + the confirmation list

**Conclusion:** however many browsers a session has, there is still **one** "Agent browser" window — the tab strip at its top grows from "only the named profiles" to "every browser of this session" (the agent's own, its helpers', an agent-opened Chrome app); click one to watch it, and to watch two at once pop a tab out into a second ordinary window. When two chat windows are grouped and each has a browser, lane F's "a strip per side" is used: switch the chat on the left and the right follows to its browser. No 3×3 grid, no new window type, no new drag logic.

Please answer each (yes/no, or A/B):

1. A session with several browsers still shows **one** browser window, with a strip at the top listing each of its browsers; clicking a tab switches the picture. **No** same-screen grid. — yes/no?
2. Every tab says **who is driving**: `agent` / the helper's name / `you` (while you have taken over); a new browser only **adds one tab** to the strip and never takes away the pane you are watching. — yes/no?
3. To watch two at once: right-click a tab → "Open in new window"; the second is an ordinary window that can sit side by side or go to another desktop. — yes/no?
4. A `4/6` count at the right end of the strip; red when full; clicking it lists **only your own session's idle browsers**, each stoppable in one click, never anybody else's. — yes/no?
5. Two chat windows grouped, each with a browser open: the left half of the title bar holds the two chat tabs, the right half the two browser tabs. **A**: switch the chat on the left and the right follows to its browser (and clicking a browser switches the chat over too); **B**: each side switches on its own, told apart only by the tabs' colours and names. — A or B? (I recommend A)
6. Phone unchanged: one pane at a time, all four windows in the switcher. — yes/no?
7. The agent-opened real Chrome app: it appears as a tab on the strip too; clicking it = open/focus that app's window beside, **without** embedding the app's picture in the browser window. — yes/no?
8. Helper browser names: the helper's task description when it can be matched ("Helper: check prices"), else "Helper 1 / Helper 2". — yes/no?

---

## §1 Today (facts, by file:line)

**How many browsers a session can hold today.** Four kinds, all in the registry, but only the first enters the "attachment set":

| Kind | What it is | Where it is recorded | Visible in the live view today? |
|---|---|---|---|
| A named profile's lease | `vibespace-browser use <label>`, one lease per (session, profile), alias + default | `attachmentsFor` `src/browser-profiles.js:1454-1493` (children **excluded**, listed separately under `children`) | yes; a strip appears at ≥2 |
| The session's own ephemeral browser | the managed ephemeral record the keeper builds at the first page verb, `kind:'none'`, not an attachment, no handle | `ensureEphemeral` `src/server/browser-keeper.js:634`; `ephemerals()` `:277-287` with a `child:` flag | only as the fallback target when the set is empty |
| A helper's child browser | `vibespace-browser new-child` mints `bk-<parent>.N`, the lease belongs to the parent by prefix | `CHILD_KEY_RE` `src/browser-profiles.js:1236`, `childHandleFor` `:1431`; `newChild` `browser-keeper.js:1263-1269`; route `src/routes/browser.js:603` | **no** (research 2 S9) |
| Chrome inside a desktop app | the human's browser, per-window through xpra; the agent is refused `browser_is_human` | `src/desktop-apps.js:543-560`; `src/server/window-targets-engine.js:273`; **counted** toward the browser ceiling (`othersNow` `browser-keeper.js:202/292/563`) | not in the browser window — it is a `desktop-app` window |

The ceiling `CONCURRENT_CAP = 6` `src/keeper-limits.js:74`; at the top `ceilingVerdict` `src/browser-profiles.js:1322-1345` refuses a start and **names every holder (other sessions' included)** — the very sentence research 2 S8/S11/S12 complained about. The digest already carries `cap:{used, cap}` (`browser-keeper.js:301`).

**What the live view shows today, and how it switches.** `streamTargetFor` `src/browser-stream.js:110-133`: a named attachment > the default > the only one > the first one > the ephemeral browser; `profileRef` is looked up only among `set.attachments` aliases/ids, **a child handle falls to `not_attached`**, and the bridge's `envPairs` are always the parent session's own (`src/server/browser-stream.js:89,111`) — so a helper's browser is invisible by construction. The strip `src/lib/browser-live-window.js:297-315` appears only at `attachments.length >= 2` (`:299`), fed by `GET /api/browser/session/:id` (`:369-376`) — whose answer **already has** `children` (`statusFor` `browser-keeper.js:1197-1209`) and `ephemeral`, which the client does not read. One live-view window per session (`syncId = 'win-blive-' + sessionId`, `:609`); `openSpec {action:'openBrowserLive', sessionId, profileId}` can name the profile to show (`:100-106, :621-625`) — i.e. "one window per browser" is possible today, it just has no entry point. Title = `<profile> · <session name>` (`src/browser-stream.js:298-301`); the owner dots on a tab come from `leases` (`ownerDots` `src/lib/chain-layout.js:187-202`).

**Binding = side by side with the chat window.** "Snap beside X" = `bindSplit(chat window, live view, side:'right')` (`browser-live-window.js:285-292`); auto-bind: a **new lease** appearing in the digest while its chat window is open ⇒ the live view is **born** inside that chain (`:597-615`, `createWindow({intoChain})` `src/lib/window.js:70-79,138`). `bindSplit` **overwrites** `chain.split.pair` each time (`src/lib/tab-group.js:359-360`); clicking a third tab replaces the non-anchor pane (D19(a) `chain-layout.js:99-106`).

**What happens today to two tabbed chat windows.** Chain `[chat A, chat B]`, B's browser starts first ⇒ pair `[chat B, view B]`; A's starts next ⇒ the pair is overwritten to `[chat A, view A]` and view B falls back to a hidden tab; clicking the "chat B" tab then goes through D19(a): view A is replaced ⇒ the screen becomes `chat A | chat B` and both browsers are gone. — That is the hole the owner asked about. Lane F (commit "split tabs v2", not merged) changes the model so that **every tab belongs to a side** (`split.left/right`, `chain.order`, a tab shows on its own side, ≤768 one strip), which solves "each side switchable", but has **no** "switch the chat and the browser follows" link. Phone: ≤768 shows only the focused pane (`public/style.css:4748-4753`); research 2 S10's blank chat is the focused pane landing on the browser.

**Sizes (lane I's audit, `/tmp/vibespace-lanes/audit-i/analysis.txt:290-299`).** At 1400 px the toolbar's natural width is zh 995 / ja 1133 / en 1149 px (Watch), +140 to +210 while taken over; after lane I: the URL has a 120 px minimum, the never-folded floor is 71–99 px, the rest folds by priority into `⋯` (`barLayout`, `src/lib/live-bar-layout.js`). The strip itself has **no** fold rule: the verifier measured two 40-character tabs at 480 px as 267+230 px, scrolling sideways, the strip growing 27→42 px tall.

---

## §2 (A) One session, several browsers

**Common ground.** The list = `attachments ∪ {ephemeral} ∪ children ∪ {agent-opened desktop Chrome}`, computed by a PURE `browserListFor(status)` from the existing `GET /api/browser/session/:id` answer; every row `{ref, kind: attachment|ephemeral|child|desktop-app, label, state: running|idle|released|ended, driver: agent|<helper name>|you|<another session>, isDefault, owners}`. `driver` comes from the keeper's existing `inputs` (`statusFor:1207`) and the leases.

**A1 the tab strip (recommended)** — today's strip becomes "one tab per browser":

```
┌ Work · VibeSpace main dev ─────────────────────────────── ⫿ ─ □ ✕ ┐
│ ● Work (default) agent │ ○ Personal you │ ◐ Helper: check prices │ ○ Chrome app ↗ │ ▾+1 │ 4/6 │
│ agent is driving │ Take over │ https://portal.example/orders… │ ⋯                          │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │                        (JPEG frames, net zoom 1)                   │ │
```
- A tab = a state dot + a name (≤16 characters, an ellipsis past that; CJK widest ≈ 34+176 px, Latin ≈ 130 px) + who is driving + the owner dots; the `↗` one is a link: clicking it focuses/opens the corresponding `desktop-app` window (§4).
- The strip uses lane I's `barLayout` rule: the tab **being watched** never folds (priority 0), one running a command 1, the rest 2, folded right to left into `▾+N`; six tabs ≈ 780–1260 px, so at 600–900 px width it must fold — the rule is not optional.
- A new browser = **one more tab at the tail** of the strip (a digest event), never a switch of the pane being watched; above all not during a takeover (a new target = a new relay, and `lease.input` would belong to the wrong one).
- `4/6` read straight from `digest.cap`; red at 6/6; clicking it = **only this session's (helpers included) idle browsers** + a "Stop" per row (where B-325a lands). The 7th: the keeper refuses the agent's start as before (`browser_cap`), **no** "queued" tab appears on the strip (the keeper says outright "nothing of yours is queued"); the refusal card in the chat and the red `6/6` are two faces of the same sentence.
- State dots: green pulse = running a command (today only the current relay knows; other tabs would use the digest's `lastVerbAt` merged every 2 s, never a per-command broadcast), grey = idle, hollow = released/ended ("a view never starts a browser" — research 2, item H).

**A2 grid** — 2×2 on one screen in one window:

```
│ ┌────────────────┬────────────────┐
│ │ Work · agent    │ Personal · you  │
│ ├────────────────┼────────────────┤
│ │ Helper: prices  │ Chrome app ↗    │
```
D19 already measured three panes as unusable at common widths; each cell is also held to the 320 px pane floor; N cells = N JPEG streams per client.

**A3 pop-out** — one ordinary window per browser (`openBrowserLive({sessionId, profileId})` supports it today, `:100-106`), entry point = the tab's right-click "Open in new window". Many windows are told apart by owner colour and title; it is **not exclusive** with A1.

| Item | Cut | Cost | Risk | Do? |
|---|---|---|---|---|
| A1 the strip lists all four kinds | no new window type; the strip's DOM/CSS already exists (`style.css:4522-4526`) | low: one PURE list + the client reads `children/ephemeral` | low | **do** |
| A1 folding + 16-char ellipsis + `▾+N` | reuse `barLayout`, no second rule | low | low | **do** |
| A1 the "who is driving" column | draw only the keeper's recorded `inputs`/leases, no new data | low | low | **do** |
| A1 `4/6` + only your own idle ones | narrow the refusal text (never list others) | low–medium (the refusal sentence + a stop action on the existing stop) | low | **do** (= half of B-325a) |
| A1 activity pulses on the other tabs | only a 2 s-merged "last action", no per-command push | medium (one more digest field) | medium: digest churn | **not yet** — only the current tab pulses + the other tabs' title says "last action 12 s ago" |
| A2 grid | — | high (N streams, layout, pane floor) | high: D19 measured it unusable | **don't** |
| A3 pop-out | reuse the openSpec | very low (one menu item) | low | **do** |

---

## §3 (B) Two tabbed chat windows, each with its browser

Three options, all on top of lane F's "a strip per side" (without it, (B) has no solution in the v1 model — end of §1).

**(a) One live view "following the current tab", bound to the chain**

```
┌ [chat A][chat B]        ⫿        [Agent browser (follows the current chat)] ─ □ ✕ ┐
```
One window whose target session changes with the left side's active tab. Needs a new openSpec (`follow:'chain'`), a view that changes session (takeover state, Actions pane, recording indicator all reset per session), and a lifecycle for "where does it go when the chain is gone".

**(b) Each with its own live view + a link (recommended)**

```
┌ [chat A][chat B]    ⫿    [A's browser][B's browser] ─ □ ✕ ┐
│  A's conversation        ┃  A's browser · agent is driving    │
```
Each chat keeps its own live view as today (auto-bind is already `side:'right'`, `:611`), chain = left `[chat A, chat B]`, right `[view A, view B]`. **One** new PURE rule `partnerFor(chain, tabId)`: a tab's partner = the tab on the other side with the same `sessionId` (a chat ↔ its live view); after a `switchTab`, if the partner is on the **other side**, switch that side to the partner too (symmetric: clicking "B's browser" on the right also switches the left to chat B). A partner on the same side (e.g. mergeDropLayout=split put the two chats left and right) moves nothing; you see what you click.

**(c) One live view listing both sessions' browsers, grouped by session**

```
│ A: ● default │ ○ Work ‖ B: ● default │ 3/6 │
```
= (a)'s window + §2's strip with a per-session grouping layer; a longer strip, and takeover/recording/Actions all need per-session isolation.

**What you see at four moments:**

| Moment | (a) the follow view | (b) each + the link | (c) the grouped strip |
|---|---|---|---|
| Switch a tab | the right pane changes session: picture, mode, URL all reconnect and redraw (one visible blank) | the right pane switches to the partner tab: it is already connected, **zero reconnects** | switch group within the strip |
| Side by side (⫿) | only "current chat \| the follow view" | each side chooses: default `chat A \| view A`; to compare = pop out a second browser window (§2 A3) | same as (a) |
| Phone ≤768 | one pane; the switcher has a single "Agent browser" entry, not saying whose | one pane; the switcher has four entries, each named with its session (lane F R6, one strip) | one pane |
| Reconnect / reload | the view must resolve "the current tab" before connecting | each view reconnects on its own (`:402-405`), the chain restores from layouts (sides persisted by lane F) | same as (a) |
| A session ends | the follow view shows "ended" on that tab, recovers when you switch away | its browser tab turns hollow "ended", stays on the right; closing it goes through the existing `_detachFromChain`; the partner rule finds no partner and **switches nothing** | that group's tabs hollow |
| Two clients | a new sync meaning ("follow" enters the sync key) | the link runs **on the client that clicked**, the other client receives the result (`active` already syncs with the window state), the sync key is unchanged | same as (a) |

| Item | Cut | Cost | Risk | Do? |
|---|---|---|---|---|
| (b) `partnerFor` + one hook in `switchTab` | zero new window types, zero new openSpecs, zero persisted fields (the partner is derived from sessionId) | low (a PURE function + one line of hook + lane F's sides) | low; depends on lane F landing first | **do** |
| (b) an on/off switch for the link (one boolean per chain) | — | low | whoever wants "A's chat with B's browser" uses pop-out today | **don't** (add when asked; reason: a boolean needs a use case) |
| (a) the follow view | — | medium–high (new openSpec, session switching, lifecycle) | medium: takeover across sessions is money and permissions | **don't** |
| (c) the grouped strip | — | high | high (as (a), plus a more crowded strip) | **don't** |
| With lane F's two settings | with `window.mergeDropLayout=split` the two chats split left and right ⇒ the partner rule degrades to "same side, no move", the browser still arrives on the right as a tab; a file opened with `window.openLinkPlacement=split` lands on the right as another tab beside the browser tabs, no interference | 0 | low | written into the same PURE table as (b) |
| The phone's blank chat (research 2 S10) | the focused pane must be the one the switcher named | belongs to lane F R6 / naive #4 | — | lane F fixes it, this design does not redo it |

---

## §4 How it meets E2 / B-325a / B-89d0

**E2 (the agent-opened desktop Chrome, B-830d, queued).** It is the lowest rung of the browser tool and by default opens beside the agent's current window — already a `desktop-app` window (the window-live shape: agent chip, tree/pixel mode, the pinned 1080p, the scale chip; the audit measured its toolbar at zh 739 / ja 937 / en 848 px), its picture is xpra, not JPEG. So on §2's strip it is a **link tab** (`kind:'desktop-app'`, `↗`): clicking it = focus that window (not open ⇒ open it beside, E2's default), **without** embedding the xpra client in `browser-live` — merging the two picture shells (`picture-shell.js` vs `browser-live`) is another lane outside E2, and the keeper's count seam already counts it in `4/6`, so the strip's count agrees by construction. The "who is driving" column reads the window-live lease: agent holds it = `agent`, you took over = `you`.

**B-325a (idle release).** Today an ephemeral browser holds its lease for as long as the session lives, and `browserIdle` (`src/browser-profiles.js:1307-1313`, `browser.idleTimeoutMs` `settings-schema.js:423`, default 15 min) never fires — that is where "a finished session occupies a slot for 15 minutes" comes from. B-325a changes it to **release the ephemeral browser a few minutes after the turn ends**: the tab on the strip **does not disappear**, its dot turns hollow "released (the next command starts it again)", `4/6` drops by one; when the next page verb restarts it through `ensureEphemeral`, the tab is solid again. The refusal sentence is narrowed: it names only **this session's** holders, everything else is "N more browsers are in other sessions"; `6/6`'s "Stop" acts only on your own. These two are B-325a's acceptance; this design only says what they look like on the strip.

**B-89d0 (a helper's browser is watchable).** Three places: ① `streamTargetFor` gains a `child` rung: a `profileRef` hitting a handle in `set.children` ⇒ `{kind:'child', ns:'vs-'+handle}`; ② for a child target the bridge uses **that child browser's own** env pairs (kept in the keeper's ephemeral record; `browserView` only strips them from the outside view, `:271`), no longer the parent session's; ③ the strip lists the children as in §2. **The name is an honest boundary:** `new-child` is called by the sub-agent with the parent session's own token, the server cannot tell who it is (`routes/browser.js:143` only knows "a sidechain is open right now"). What it can do is **name by witness**: the stdout consumer already sees the Bash tool_use in the sidechain containing `vibespace-browser new-child`, and its parent Task record carries `description`/`agentType` (`src/session-store.js:586`, the same source as 2.369.173's sidebar helper rows) — exactly one unpaired witness ⇒ the tab says "Helper: <description>"; two helpers calling at once, or a codex helper (no stdout signal) ⇒ "Helper 1 / Helper 2". Never guessed by time.

---

## §5 The minimal set

Ship in order, each with its gate; the first three do not depend on lane F, the last two do.

1. **The strip lists all four kinds + who is driving + state dots** (§2 A1): PURE `browserListFor` in `src/browser-stream.js`, the client reads `children`/`ephemeral`; the strip shows at ≥2 in the list (the single-browser look unchanged). Gate: `test-browser-handles` (fast, the list's truth table + a negative control: a record outside the four kinds must not appear) + `test-browser-live-ui` (heavy, one tab of each of the four kinds rendered + a new tab does not switch the current pane + not during a takeover).
2. **Helpers watchable** (§4 B-89d0): the `child` rung in `streamTargetFor` + the bridge's env swap + naming by witness. Gate: `test-browser-handles` (fast, the child rung + the three naming outcomes: one hit / two at once / codex) + `test-browser-live` (heavy, a child relay over the fake upstream draws a picture).
3. **The strip's fold + `4/6` + only your own idle ones** (§2): reuse `barLayout`; narrow the refusal. Gate: `test-live-bar-layout` (fast, six tabs' fold rows at 600/900/1400 + the watched one never folds) + `test-browser-ephemeral` (fast, the negative control that the refusal carries no other session's name/lease id).
4. **Pop-out** (§2 A3): the tab's right-click "Open in new window". Gate: `test-contributions` (the menu item exists and calls `openBrowserLive({profileId})`).
5. **The link** (§3 (b), after lane F): `partnerFor` + the `switchTab` hook + "same side, no move". Gate: `test-chain-layout` (fast, the partner table: other side / same side / no partner / session ended) + one `test-split-ux` leg (heavy, two chats each start a browser, a real click on the left tab, the right pane switches to the partner, zero reconnects — assert the relay ws was not rebuilt).
6. **The E2 link tab** (§4, after E2): the `kind:'desktop-app'` tab = focus/open. Gate: one `test-desktop-app-window` leg (clicking the tab focuses the open window; not open ⇒ opened beside, E2's default).

**Explicitly not done:** a same-screen grid; a new "follow the current tab" view / openSpec; embedding xpra in the browser window; switching the watched pane whenever the agent moves; queueing the 7th browser; a per-chain on/off switch for the link; per-command broadcasts of the other tabs' activity; any new drag-time logic.

**lane P verify lows (not fixed) — 2026-09-26:** none. All three lows the verifier raised (helper naming by order, the Task Group cap read live, the hollow own-browser tab's promise) were fixed in the verify round (§6.1); nothing is carried.

**Not verified:** after lane F lands, exactly how `intoChain:{split:true, side:'right'}` behaves on a chain that is already split (by lane F's commit message, inferred as "inserted on the right and shown" — to be measured first in item 5's leg); the multi-client churn of a merged `lastVerbAt` broadcast in the digest was not measured (hence "not yet" in row 5 of the table).

---

## §0.1 The owner's replies and the decisions (2026-09-26 01:05Z)

The owner, item by item: 1 fine · 2 fine · 3 "那得考虑重新合并的操作逻辑，比如拖回去？还是可以直接在界面上操作合并回去？" ("then the logic for merging back has to be designed — drag it back? or merge it back directly in the UI?") · 4 "没问题，这个上限应该是一个属于对话属性的东西，可以调整" ("fine — the cap should be a property of the conversation, adjustable") · 5 "可以，但是如果我已经开了并排展示俩 agent 对话呢？变成四列？你这个引入了第二种并排模式就得考虑这种交互复杂度。" ("ok, but what if I already show two agent conversations side by side? four columns? if you introduce a second side-by-side mode you have to think about that interaction complexity") · 6 ok · 7 "没太理解，总之原则是尽量不要引入更多的窗口类型增加复杂度和心智负担，尽可能复用" ("didn't quite get it; the principle anyway is to avoid more window types that add complexity and mental load — reuse as much as possible") · 8 ok.

**Decisions (build on these):**

- **D3 pop-out and fold-back.** What pops out is not a new window type: a session can have N `browser-live` windows, **each showing the same strip**, only with a different tab selected; "Open in new window" = open one more window preselecting that tab. Two ways back: ① the window's ⋯ menu / a title-bar item "Fold back into the Agent browser window" = close this window and let the other window select that tab; ② the existing one drag exception (dropping an icon onto an icon merges), when **both windows are live views of the same session**, does not build a tab chain but folds back (the dragged one closes, the target selects its tab). When the main window is closed, the one remaining is naturally the main window — no orphan state.
- **D4 the cap is a conversation property.** The machine-level `CONCURRENT_CAP=6` stays as the resource's hard top (a refusal only says "machine ceiling reached", never listing others); new: **a per-conversation cap** `browserCap` (session metadata, kept across resume; default from the setting `browser.defaultPerConversationCap`=3, a Task Group may give a default). The strip's count chip shows `this session used/this session's cap` (e.g. 2/3), clicking the chip adjusts it directly (a 1…6 stepper), the same field in Session Properties; when the agent's N+1th is refused with `browser_cap`, the card explains it is **this conversation's** cap and where to change it.
- **D5 always two panes, never four columns.** A browser is always a tab, never a third pane. Rules: (a) a new browser **never changes the two panes you are watching** — only one more pulsing tab on the strip; (b) auto "snap beside the chat" happens only when that chat is **not yet side by side** (one chat pane ⇒ chat | browser); when it is already chat A | chat B, the browser becomes a tab (on the right if the right is already the "browser side", else on its own chat's side), the screen does not move; (c) the link (5 = A) only applies when **the other side currently shows a live view of a session in this chain**: switch the chat on the left ⇒ the right follows to its browser (and the reverse); when the other side shows another chat the user placed there, **nothing follows**; (d) to see a third thing at once ⇒ pop it out into its own window (D3). This is not a second side-by-side mode: side by side is still lane F's one (a strip per side); the only addition is the PURE rule (c), `partnerFor`.
- **D7 in plain words.** No new window type. The real Chrome app an agent opens stays the existing "desktop app" window; later (after E2) the tab on the strip is only a jump: clicking it = focus that existing window. Not built before E2.
- The rest (1/2/6/8) as written in §0.

**The minimal set, adjusted:** §5 items 1–5 are built now (item 5 sits on lane F, so lane P builds directly on lane-split-tabs), plus D3's two ways back and D4's per-conversation cap; item 6 waits for E2.

---

## §6 Implementation record (lane P, 2026-09-26)

What was built, and where it departs from the text above (each with its reason):

- **The list** is `browserListFor(status)` in `src/browser-stream.js` over the keeper's own status answer: `attachments ∪ ephemeral ∪ children` (the desktop-app kind waits for E2). Row states are `running` (a command in flight — only the current relay knows, the client passes it in), `idle` (the process is live), `released` (not live: released after the turn, idled out, stopped, never started) and `ended` (failed). `driver` is `agent` / `helper` / `you` (the helper's NAME rides the row's `helper` field and is the tab's label).
- **The fold** is PURE `stripFold` in `src/lib/live-strip-layout.js` (lane I's `barLayout` is not on this base; the module says so and is shaped to be merged with it). The strip also shows with ONE browser when the conversation is AT its cap, so the red chip the agent's refusal points at is there.
- **Refs.** A strip tab / a pop-out names the session's own browser by `~ephemeral` (never a valid alias or id) and a helper by its handle.
- **The per-conversation cap** lives in the keeper's registry per conversation (`caps`, keyed by the browser key like `pins` — that is what makes a resume keep it) with the session meta's copy `browserCap`; the Task Group default is the group's `browserCap`, STAMPED into the conversation's entry when it starts (verify round, §6.1) — never read live off the group. The conversation's own cap is checked before the machine ceiling; helpers' browsers count toward their parent.
- **The narrowed ceiling** names only the asking conversation's own holders; everything else — another conversation's browser AND a desktop app — is a count ("N are in other conversations or desktop apps").
- **Release after the turn** (setting `browser.idleReleaseAfterTurnMs`, default 3 min, 0 = never, 30 s floor) applies to CHAT sessions — the only mode that publishes a turn (verify r2, §6.2: a terminal session's browser is kept until the CLI's own idle timeout): never while the user drives it and — beyond the design — **never while a live view is watching it** (the owner's law: never take away the browser the user is looking at). A view never starts a browser — a released ephemeral or helper browser, and (verify round, §6.1) a stopped ATTACHMENT too (`browser_stopped` — lane H's code; this design's first cut spelled it `browser_released`, unified at the 2.369.183 integration); a conversation that has not opened its browser yet is `no-browser` / not-started, asked only through the launch-free `session info`.
- **Helper naming** (verify round, §6.1) is judged at the witness's CLOSE: a helper is named only when exactly one mint arrived inside that witness's window (its Bash tool_use … tool_result), no other witness was open in it, and the result's own text names that handle; a mint with no open witness is "Helper N" for good — never by order, never resolved later by elimination.
- **Fold-back by drop** is detected in the ONE merge-drop body (`tab-group.js _mergeDrop`, shared by the icon, tab and title-bar merge drops) through PURE `foldBackTarget`; a drop onto a group holding a live view of the same session folds back too.
- **The follow** never runs on a narrow layout (the phone shows one pane; following there would move the desktop's other side).
- Not built: §5 item 6 (the E2 link tab); the 2 s `lastVerbAt` activity on other tabs ("not yet", as decided).

### §6.1 The verify round (lane P verify r1, 2026-09-26)

The adversarial verifier's six findings, each reproduced red first and fixed at the cause:

1. **A view started a stopped attachment's browser** (minor): P2's "viewing a held lease starts it" contradicted the owner's law and the hollow dot's own words. Now a stopped attachment is `browser_stopped` ("the next command on it (or Attach) starts it again"), the lease kept; the view picks it up by itself when the next command starts it.
2. **A live view opened before the first command spawned a daemon** (minor): with no ephemeral record the keeper ran `stream status` under the session's pairs, which SPAWNS a background daemon on the real 0.38.1 (measured). Now only the launch-free `session info` is asked: a daemon already running there is shown, none ⇒ `no-browser` / not-started ("Not started yet — the next command starts it").
3. **Folding back a window the user drives handed the browser to the agent** (minor): the pop-out's close ran the viewer-left handback. Now the control moves with it — a viewer verb `pass {to}` (only the holder, only to a view of the same browser) before the close; nothing handed back, nothing announced; driving in both windows is refused in plain words.
4. **Helper naming by order** (low): see §6 — judged at the witness's close.
5. **A Task Group's cap changed running conversations** (low): decided NEW-ONLY, like the group's default browser profile — stamped when a conversation starts; the Task Group tooltip and the setting's description say so.
6. **A released own browser beside an attachment promised a restart** (low): its tab says "Released — used again only when no profile is attached" (a bare command lands on the attachment).

### §6.2 The closing verify (lane P verify r2, 2026-09-26)

1. **A terminal session's browser was released mid-work** (MAJOR): the release clock asked the session's turn through `turnOf`, which reads fields only a CHAT session writes — a terminal-mode `claude` / `codex` read "idle" forever, so its browser and its helpers' were stopped 3 minutes after the last browser command while the agent was still working. Now the turn is answered only where the mode publishes one (PURE `turnKnown`: chat); anywhere else it is unknown and nothing is released — a terminal session's browser ends by the CLI's own idle timeout, as before this lane. Pinned on the wiring (test-architecture §61) and on the real keeper driven by the wiring's own function (a chat session's ended turn still releases — the positive control).
2. **A view picked the browser up mid-launch** (minor): the record reads `starting` before the launch, the strip draws it idle and a hollow view reconnects at once; the keeper then asked `stream status` while `open` was still launching. Now every `streamPortFor` branch (own / helper / attachment) waits for the launch in flight first; a launch that fails is the view's answer (a `stream status` under the pairs of a browser that never came up would spawn a daemon — a view starting a browser). **Measured on the real 0.38.1 while fixing it:** the binary serializes that `stream status` behind `open`; the daemon RESTART the verifier saw comes from a client whose idle timeout differs from the one the daemon was launched with — and the keeper launched with the setting while the agent's verbs and the view run under the session's spawn pairs (the agent's own first verb replaced the keeper's browser the same way). So the keeper now launches a conversation's browser with the idle its pairs name; a changed setting reaches a conversation at its next spawn (a resume), like every other pair.
