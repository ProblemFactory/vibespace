# Browse yourself (B-6ae8) — design

> **STATUS (2026-09-28): BUILT** on lane-browse-yourself (2.369.197) under the **OWNER DECISIONS** block at the end of
> this file — where they differ from §1–§8 below, THEY win: the user is one more holder on his OWN pinned tab — no
> confirm, no pause, no interruption of any agent when he starts browsing (the takeover ruling applies only when he
> drives an AGENT's tab from a conversation's live view — §5 below is superseded); his actions ARE recorded like an
> agent's, with the per-profile opt-out "Also record my own actions"; **Close** = his tab / window only, **Quit the
> whole browser** = a stop for everyone with a confirm naming the conversations; the keep while away = 12 h when he
> launched the browser (`browser.humanKeepMs`), 10 min when he joined an agent's. The as-built reference (every module,
> route, record and gate) is docs/kb-file-structure.md → "src/browser-human.js + BROWSE YOURSELF"; the behavior is
> docs/kb-features.md → "Browse yourself"; the API is docs/kb-api.md. U1 / U3 (§8.3) were measured before the dependent
> parts were built (results in kb-file-structure); U2 (a real phone's soft keyboard) and U4 (confirmActions under his
> session) remain unmeasured.

**Owner, 2026-09-28:** "我能自己打开一个浏览器profile用它浏览吗？" — today, no.
**Status:** DESIGN ONLY, read-only research, no code. **Baseline:** master `b970f16d` (2.369.196). The identity-r4
lane (`lane-browser-dialog`, e2293b26, ships 2.369.197) is not merged yet; §1.1 says where this design meets its
fresh-key rule.
**Seed:** `/var/tmp/vibespace-lanes/browse-yourself-detail.txt`, used as the starting sketch. Where this design moves
away from it, the reason is given in place. The largest change: the "seat" wording is gone. `seat` already means a
CloakBrowser **license seat** in this subsystem (`reg.seats`, `seatStates()`, `backend_seat_taken`), and a second
meaning would be a trap. The new object is called the **human holder** (code: `human`, key prefix `hu-`).

**The answer in one paragraph.** On every local profile row of the Agent browser panel, a **Browse yourself** button
starts that profile's browser, or joins it if it is already running. The keeper starts it through the same `start()`
an agent's first command uses: same Chrome, same directory, same config file, same proxy. It opens your **own tab**
in that browser and opens the existing live-view window (`browser-live`) already in takeover, with the keyboard yours
and a new **address row** (address field, Back, Forward, Reload). You are a **holder row** in the keeper's one list
of holders. You are not a conversation, so there are no chat cards, no billed turns and no "Who can use it" check:
you own every profile. If a conversation is using that browser, your browsing *is* a takeover. The agents are
interrupted and told, and when you finish they are reminded to re-run what was interrupted (the 2026-09-27 ruling).
Only when you started and ended is recorded, never what you did. It ends with **Done — leave it running** or
**Stop the browser**.

**Alternatives considered and rejected:**
* *Open the profile's folder in the Browser app (the desktop-app face, real Chrome through xpra).* It would give a
  full browser UI, but it breaks three rules the tree enforces:
  (1) one folder can hold one Chrome at a time (SingletonLock), so every agent command would be refused
  `profile_locked` while you browse, with no interruption, no telling and no reminder;
  (2) the Browser app refuses `--user-data-dir` in its argv on purpose (`FORBIDDEN_BROWSER_ARG_RE`,
  src/desktop-apps.js:647), because its profile is the human's own and never an agent's;
  (3) a Chrome newer than the agent's Chromium writing the folder trips the §7.4 version ladder
  (`downgrade_refused`), which can leave the agent unable to open its own login.
  The workaround in the seed stays documented for a *separate*, fully human profile.
* *A hidden "user conversation" that holds a lease.* It would pull in session meta, chat cards, a spend identity,
  the who-list and reconciliation, all to express "the person at the keyboard". That is the wrong owner.

---

## 1. The model: a HUMAN holder

### 1.1 What it is

| Fact | Value | Why |
|---|---|---|
| Unit | ONE human holder per profile (the owner is the only human on an instance, cookie auth = the owner) | "one browser per profile" (owner ruling A), and one person |
| Key | `hu-<the profile id's 8 hex>`: **derived** from the profile id, never minted | Profile ids already go through a fresh-id loop (`mintId`), so a derived key cannot collide. It needs no row in identity-r4's mint census, only a DERIVED row (the census gets one line: "`hu-` = `bp-` re-prefixed"). The same key every time gives a stable daemon session name and a stable open-session key in the recorder. |
| Daemon session | `vs-hu-<hex>` over the keeper browser's **raw** CDP url (`leaseCliOpts(profileId, key)`), with its own `--pin-tab` tab (`tab new`) | the naive-study-2 law: never the directory, only the keeper's one Chrome (a second Chrome on the folder dies on SingletonLock) |
| Mediation | **never** mediated, even on a `separate tabs` profile | The mediator fences *agents*. The human's grant would read `paused()` = true (its own input is `user`), so the fence would refuse the human's own `Page.navigate`. The human's tab is outside every agent grant's `Target.*` scope, so a mediated agent cannot see it. |
| Where it lives | **in keeper memory** (`humans: Map<profileId, holder>`), projected into `holderRows` | See the next paragraph |
| Input side | a normal `inputs` state keyed `hu-<hex>\|bp-<id>`, taken over by the human's viewer | Reuses every takeover rule (`decideTakeover`, `held`, `viewerAlive`, the interrupt cycle, siblings) |
| States | `driving` (input `user`, a live viewer holds it) · `away` (not driving: its window closed, the connection dropped, or it was handed back elsewhere; the tab is kept) · ended | PURE `humanStep`, §4 |

**Why the human holder is in memory and not a persisted row in `reg.leases`.** `reconcileLeases` drops any lease
whose key no live session carries, so a `hu-` lease would be dropped by the tick's 2-minute grace, or at boot. A
persisted human lease would also be exactly the §3.5 failure: a lease on disk marks the browser `leased`, so it never
idles out, and the only thing that can hold it, the person's websocket, died with the server. A restart already ends
every takeover by construction (`inputs` is in memory), and the human holder follows the same rule. At the next boot
the recorder closes the human session's marker with reason `restart`, the browser is adopted, and it idles out on the
normal clock unless an agent attaches.

**Identity-r4 interplay.** The fresh-key rule (`freshBrowserKey`, e0139c5c) is about `bk-` keys and does not apply to
`hu-`. One thing must be pinned: `hu-` never matches `BROWSER_KEY_RE`/`CHILD_KEY_RE`, so every admission,
chat-card, bindings, told, pin and cap path that gates on `isBrowserKey` rejects it **by construction**. §7 makes
that a census, not a hope.

### 1.2 What each reader says about it

| Reader | What it says while you browse | Change |
|---|---|---|
| `holderRows` (digest `leases`, status `leases`, the ONE holder list, lane H) | one row `{profileId, browserKey:'hu-…', holder:'user', human:true, sessionId:null, since, input, viewers}` | `holderRows({…, humans})` appends it. Every reader that needs a conversation already skips `sessionId: null` rows: auto-bind (browser-live-window.js:1630), `ownerDots` (chain-layout.js:650), phone auto-open. The picker's `attached` count (browser-profile-picker.js:187) filters `!l.human`. |
| `factFor` (one fact per conversation) | A conversation leased on that profile has `input:'user'` (taken WITH you) and its words say "you are driving", which is the truth. A conversation with no lease there is unchanged. | none (the fact stays per conversation; you are not one) |
| The conversation's live-view strip | the shared profile's tab: **"you, browsing it yourself"**, where a click opens *your* browsing window | PURE `browserListFor`: `driver:'you-self'` when the driver key is `hu-` (today it would say `other-user`, "you, in {name}" with no name) |
| The switch dialog | `in-use-by-hand`, driver = your holder: "You're browsing “Work” yourself. Press Done there, then switch." plus ONE button **Done browsing** that performs Done | `holdOf` reads the human row too. Today it reads only `reg.leases` × `inputs`, so on a profile no conversation leases, a switch would go through (`mode:'switch'`) and **stop the Chrome under you**. `stateWords('in-use-by-hand')` gains the human action. |
| `whoMayUse` / `mayAttach` | **not asked**: "Who can use it" names conversations and Task Groups; you may browse every profile | The verdict never takes the list (a test row: a profile kept to "Only chat X" is still browsable by you; CONTROL a verdict copy that asks the list ⇒ red). The panel's who-cell tooltip gains one sentence: "You can always browse it yourself." |
| Agent answers (`agentDigestView`, `agentLeaseRow`) | your row reduces to `{profileId, other:true}`, a count | none (`hu-` names nothing an agent may act on; not masked, not needed) |
| The housekeeping row (the panel) | state line "You are browsing it" / "You were browsing it — Continue" (away) | a `human` field on the row (from `keeper.humanOf(id)`); `housekeepingVerdict`'s `held` stays conversations only |

### 1.3 The PURE verdict — `browseYourselfVerdict`

New PURE module **`src/browser-human.js`** (imports nothing, CJS so the keeper, the routes and the bundle share one
spelling, like browser-fact.js). The verdict:

```
browseYourselfVerdict({ profile, browser, control, switching, human, heldBy, running, cap, leases })
  → { ok:true, how:'launch'|'join'|'rejoin', key:'hu-…', interrupts:[browserKey…] }
  | { ok:false, code, error, …extra }
```

The first match wins, in this order (the order is the decision):

| # | Code | When | The user's words (en; zh/ja in §6) | The one way out |
|---|---|---|---|---|
| 1 | `not-found` | no such record | "This profile no longer exists." | — |
| 2 | `not_attachable` | an ephemeral record (a conversation's own temporary browser) | "This is a conversation's own temporary browser — open its live view and take over instead." | Open live view |
| 3 | `remote_profile` | `profile.host` (a paired machine) | "“{label}” is saved on {machine}; browsing it yourself works only for profiles on the computer VibeSpace runs on." | — (§8 Q7) |
| 4 | `not_ours` | provider row `starts:false` (`cdp`: an existing browser reached over CDP) or `leaseKind:'window-target'` (tier 3) | "VibeSpace only connects to this browser — open it where it runs." | — |
| 5 | `backend_unavailable` | the provider control for this machine refused (binary missing, unwired) | the control's words; the switch dialog's install card is the way out | Open the switch dialog |
| 6 | `browser_restarting` | a backend switch is in flight | "The browser is restarting on another backend — try again in a moment." | wait |
| 7 | `profile_locked` | the record says another browser holds its folder (lane H's verdict, `user:true` when it carries no mark of ours) | "“{label}” is open in a browser VibeSpace did not start (pid {pid}) — it may be your own Chrome. Close it first." | never ended by us |
| 8 | `browser_unstable` | the record's heal budget is spent | "Its browser keeps closing — press Stop on its row first, then try again." | Stop |
| 9 | `held` | a conversation's live view **you** hold drives this browser now (a live holder, r7) | "You're already driving “{label}” in the live view of “{chat}”." | Go to that view |
| 10 | `already_browsing` | your holder is `driving` with a live viewer (another window or client) | not an error: the client **focuses** that window (the answer carries `key`, `syncId`) | — |
| 11 | `cap` | the browser is **not live** and live browsers + desktop apps ≥ `CONCURRENT_CAP` (6) | "{n} browsers are running on this computer — the most it runs at once. Stop one, then Browse yourself again." (the client scrolls to the running rows, which already have Stop) | Stop one |
| — | ok `rejoin` | your holder exists and is `away` | continue it (its tab kept) | — |
| — | ok `join` / `launch` | live record ⇒ join (a join never counts against the ceiling, ruling A (6)); otherwise launch | — | — |

Launch-time refusals come from `start()` and pass through with their own words, never re-worded: `backend_no_key`
(+ `openIntegration`), `fence_refused`, `launch_failed`, `profile_locked` found at launch, `browser_closed`, and
`backend_seat_taken`/`backend_seat_ceiling` (CloakBrowser license seats).

`interrupts` is the list of conversations with a lease on the profile, in lease order. The client names them from its
own session rows for the confirm sentence (§5, §8 Q2); the server sends keys only, never names.

`remote_profile` is deliberate in v1. `streamPortFor` already refuses a paired machine's profile ("its live view is
not bridged in this release", browser-keeper.js:3358), and a human holder is a live view.

---

## 2. Launch

**Route (cookie-only, UI):** `POST /api/browser/profiles/:id/browse`. It follows the `/api/browser/*` shape: `host`
is refused by `refuseHost`, and every failure is `{error, code}` with a STATUS row. **There is no `/api/agent/…`
twin.** An agent can never start, end, navigate or view a human holder. §7 pins that with a grep census over the
agent routes and the agent CLIs.

**Keeper (`keeper.browse(profileId)`), in order:**
1. `browseYourselfVerdict` over the keeper's own facts. The ceiling is asked only when the record is not live.
2. `start(profileId, {why:'browse'})`, the **same** function an agent's attach calls: join / wait / launch, the lane-H
   lock judgement, the launch mark, the named config file (`machine-<id>.json`), the launch view (idle 0, headed per
   setting), the provider flags and the key resolve.
   **Egress and allowlist are unchanged by construction.** Your tab runs in the *same Chrome process* the agents
   use, so everything fixed at launch applies to you unchanged: the profile's `proxy`, a CloakBrowser row's egress
   proxy, and the machine config's domain fence (which refuses a persistent profile, `fence_refused`, exactly as for
   an agent). Nothing is relaxed for a human and nothing is added.
3. The holder: `{key, profileId, state:'away', since, fresh:<token>, lastInputAt}`. It stays **`away` until a viewer
   attaches**: a window that never opens (the client crashed) ends on the away clock (§4), and nothing waits for it.
4. Its tab: `rt.exec(ns, ['--pin-tab','tab','new'], leaseCliOpts(profileId, key))`, the rebind primitive `attach()`
   already uses (browser-keeper.js:2004–2011).
5. A lease-seam event `{kind:'human-start', profileId, key}`. The recorder writes the start marker (§3). `notify()`
   broadcasts the digest, so every client's panel row now says "You are browsing it".
6. Answer: `{ok, key, how, interrupts, syncId:'win-bhuman-<profileId>'}`. The syncId is deterministic, so two clients
   converge on ONE window, as `win-blive-<session>` does.

**The window: the existing `browser-live` type, no new window type** (the multiview owner ruling: reuse, no new
window kinds). OpenSpec: `{action:'openBrowserLive', profileId, human:true}`. The existing replay dispatches on
`spec.human`. On a human window:
* **Hidden:** the strip, bind/Snap-beside, the fit claim for a session, the ownership dots and "Open in web view".
* **Title:** "{label} · you". The mode badge says **"You are browsing"**.
* **The ADDRESS ROW (new, human windows only):** an address field, Back, Forward, Reload.
  * A URL runs the daemon's own `open <url>` (and `back`/`forward`/`reload`) under `vs-hu-…`, through
    `POST /api/browser/browse/:key/navigate {url|verb}`.
  * The field takes **web addresses only** (http/https, and about:blank to clear), the same rule as the agent's
    (`localSchemeOf`, refused by name: "Only web addresses").
  * **Without this row, Browse yourself is useless on a fresh profile.** Today's live view shows the URL but cannot
    navigate, and Chrome's own omnibox is not in the screencast, so Ctrl+L goes to the page.
* **TABS pane:** clickable on a human window. The daemon's `tab <n>` under the human's session switches its active
  tab.
* **No takeover anchor on a human relay.** A human relay never arms the verify-r3 anchor (`takeoverAnchorStep`).
  During your browsing every agent is paused, so any tab change is yours (a login popup, a link opened in a new
  tab). With the anchor armed, the first OAuth popup would answer `tab_switched` to every key you press.
  *Measure first:* §8, unverified item U1.
* Everything else is reused as it is: fit (the page is your pane's size), the input pipeline (≤3-unit text chunks,
  IME, ⌘ table), copy out, receipts, the Actions pane (this profile's sessions list), and the viewer count.

**The bridge (`src/server/browser-stream.js`):**
* A third query shape: `?browse=<hu-key>`, cookie auth as before.
* The target: `{kind:'human', key, profileId, ns:'vs-<profileId>', sessionName:'vs-<key>'}`. The relay key is
  `human:<key>`. `streamPortFor` gains a `human` branch (the attachment branch's `leaseCliOpts` with the human key).
* **A view never starts a browser.** A stopped profile answers `browser_stopped`, and the window then offers
  **Browse again**, which is a POST (a user act).
* On attach, **PURE `humanAttachVerdict`** decides whether this viewer takes the controls at once:
  * **yes** for the `fresh` token's first attach (you just pressed Browse yourself);
  * **yes** when nobody holds the input and no conversation holds a lease (there is nothing to interrupt);
  * **otherwise no.** The window shows **Continue browsing** (one click). This keeps the reload law: a replayed
    window never re-pauses agents that resumed while you were gone.
* A second viewer while a live one drives gets the existing typed `held`. Its window reads "You're browsing this in
  another window" (§8 Q6 asks for a **Continue here** that *moves* the controls: `decidePass` initiated by the
  receiver, still one holder).
* Viewer-left of the holder follows the existing r7 rule (a holder whose socket is gone never blocks, and the
  browser's siblings are handed back `viewer-left`, zero-spend). Your holder goes `away`; your tab is kept.

**Taking over on the phone:**
* The panel is reachable (⚙ → Tools → Agent browser…, or the "+" sheet's Agent browser row → Agent browser…).
* The window opens as the one full-screen pane (≤768 px shows one pane). The layout sync pushes the same window to
  the other clients, where it reads "You're browsing this in another window": this is the "pushed live view".
* The pinch-zoom is refused while driving (existing), taps map through the existing transform, and the bar gains a
  **Keyboard** button on touch devices only. It focuses the existing IME sink *inside the tap*, because a phone
  raises its soft keyboard only for a focus inside a gesture. Today `focusSink()` runs on the async `mode` record, so
  typing on a phone probably never raised the keyboard. *Measure first:* §8, unverified item U2.

---

## 3. Sessions and trace

**The session:**
* One `bs-` session per human holder, from `human-start` to the holder's end. The recorder writes it into the
  **profile's** scope: `data/browser-trace/<profileId>/sessions.ndjson`.
* Marker: `{kind:'session', phase, id, browserKey:'hu-<hex>', holder:'user', profileId, at, …}`, with
  `webuiSessionId` absent.
* End reasons: the closed set `END_REASONS` plus ONE new reason, `left` (you closed the window or lost the
  connection, and the away clock ran out, §4). Done ⇒ `released`, Stop ⇒ `stopped`, a server restart ⇒ `restart`
  (the existing boot path in `ensureOpenLoaded`).
* PURE changes in `src/browser-sessions.js`: `markerFor` carries `holder`, and `pairSessions` copies it.
  `chatCardsFor` already refuses every key that is not `bk-` (`isKey`); it now also skips `holder:'user'` as a
  second gate.
* The recorder's `startSession` gate (`/^bk-…$/`, src/server/browser-trace.js:215) is widened **only** on the new
  `human-start` branch.
* The trace switch rule is unchanged: with `browser.actionTrace` off, no new session is written. This is the code's
  own rule at src/server/browser-trace.js:217.

**No chat card anywhere, by construction and by census:**
* The recorder's `onSession` wiring matches `s._browserKey === m.browserKey` (mounts-plugins-wiring.js:907), and no
  live session's key is `hu-`.
* The handback announcer's `sessionFor(null, 'hu-…')` finds no session, so it has no card, no notice, no inbox item
  and no delivery for your own takeover and handback events.
* `chatCardsFor` gates on `isKey`.
* §7 pins all three with a spy census and a patched-copy control.

**The Sessions list:** in the replay window (the panel's Replay…) and in the Actions pane of any live view on that
profile, a human session is one row: **"You · 14:02 · 4 min"**. It has no Replay button, because a replay exists
only with actions (browser-session-words' rule). Its detail line says "Only when you started and stopped is kept."
(the new named empty state `yours-not-recorded`).

**What is NOT recorded, and why that costs nothing:** the recorder builds actions from the stream server's
`command`/`result` mirrors, i.e. the *daemon's* commands (src/server/browser-trace.js:282). A viewer's forwarded input records
never appear there (measured in lane S2: "the stream server answers NOTHING for an input record"), and nothing arms a
tap on a human relay (taps are armed by conversation lease events keyed by webui session id). So with this design the
default already records only start, end and duration. §7 has a census so a later change cannot quietly start
recording you.

**Video:** the per-profile `record` checkbox films **conversations'** sessions (it runs `record start` per lease
session). Your session is not filmed. The owner's 2026-09-28 rule ("video manual, per profile") is unchanged.

**The optional "Also record my own actions" (per profile, default OFF): designed here, recommended NOT for v1**
(§8 Q4). If the owner wants it, the shape is:
* A profile field `recordMine:false`, a checkbox beside `record` on the panel row.
* When it is on, the recorder arms a tap on the human relay, and the bridge emits **synthetic** `command`/`result`
  pairs for the holder's acts, on the relay's taps only and never to viewers. The acts are: a click at page (x,y); a
  key chord by name; a text act as «N chars», never the text (D7/D35's redaction); a wheel; an address-row
  navigation with its URL.
* The existing pipeline (before-frame = last frame, after-frame pick, the size-only retention) writes entries tagged
  `holder:'user'` under the profile scope. The replay row then gains its Replay button.
* Cost: about 150 lines plus a census that the synthetic records never reach an agent's tool card (tool cards query
  by conversation key, and `hu-` is never one).

---

## 4. Ending

**Two buttons, always visible on the human window's bar (folding priority 0, beside the badge):**

| Situation | Button 1 | Button 2 | The line under them |
|---|---|---|---|
| no conversation holds a lease | **Done — leave it running** | **Stop the browser** | "It closes by itself after {min} min if nothing uses it." (`browser.idleTimeoutMs`, 15 min) |
| ≥1 conversation holds a lease | **Done — hand it back** | **Stop the browser** | "{name} is using it too — Stop closes its pages; its next command opens it again." (§8 Q5) |

* **Done** ⇒ ends the holder `released`.
  * Your tab is closed under your own session (`tab close` + `close`, the closeLeaseSession sequence). It runs even
    on a mediated profile, because your session is raw.
  * Your input state is handed back with cause `explicit`, which mirrors to every sibling taken with you (verify r6
    machinery).
  * The browser **keeps running**. `lastLeaseDroppedAt` is stamped when the last holder leaves, so the keeper's idle
    clock starts at your Done, not at launch.
  * The window closes. The panel row says "running · closes by itself in 15 min unless a conversation uses it".
* **Stop** ⇒ `keeper.stop(profileId, {why:'user'})`: today's Stop, unchanged.
  * `handBackOnStop` hands back every input state on the profile with cause `stop`. That covers yours and your
    siblings'. It is zero-spend, and each sibling hears "The user stopped the browser while they were driving it…" at
    its next turn.
  * Your holder ends `stopped`. The window shows "Stopped — Browse again".
  * If the owner answers Q5 "no", Stop is instead offered only when no conversation holds a lease, and with a lease
    Button 2 is **absent**. It is never greyed out, because the owner ruled out disabled controls that carry a hint.
    The panel's own row Stop remains the hard stop.

**The PURE lifecycle `humanStep(state, event) → {state, effects}`, one table:**

| From \ event | fresh attach | attach (replay / second view) | viewer-left | handed back elsewhere (chat card, switch dialog) | idle ≥ `takeoverIdleMs` **and a sibling waits** | away ≥ `takeoverIdleMs` | Done | Stop / browser stopped / profile deleted |
|---|---|---|---|---|---|---|---|---|
| **away** (created or left) | take over → driving | `humanAttachVerdict`: take over only if nothing to interrupt, else "Continue browsing" | — | — | — | **end `left`**: tab closed, browser kept | end `released` | end `stopped` |
| **driving** | — (already) | `held` (second viewer) | → away (siblings: `viewer-left`, zero-spend) | → away (the whole browser went back: siblings enumerate the human row) | → away (siblings: `idle`, today's For-you item) | — | end `released` | end `stopped` |

Two consequences of the table:
* With **no** conversation on the profile, your browsing never lapses while the window is open. There is nobody to
  give it back to, so `sweepIdleTakeovers` skips a human primary with no siblings, and a long read is never
  interrupted. The only clock is "away for 10 min".
* A server restart is an end by construction. Nothing is persisted, and the marker ends `restart` at the next boot.

**Keeper rules that still apply:**
* **The ceiling** is asked at launch only, never on a join.
* **Idle:** the idle-out stops a browser only when it is not leased, and `browserIdle` counts the human row as a
  lease. So while you browse, the browser is *used* and never idled out.
* **Resource guard:** it reports only, whatever it samples (the owner's 2026-09-25 ruling, "Keepers report, never
  kill a used session"). No new limit can end or refuse a human browse except the launch ceiling, which already
  applies to a person's desktop-app launch the same way.
* **Delete…** (`releaseAll`) and a **backend switch** see the human row. Delete ends it `stopped` and the window says
  "“Work” was deleted". A switch while you browse becomes a *proposal* (`holdOf` ⇒ `driven`) and never stops the
  Chrome under you.

---

## 5. When an agent is using the same profile

**Your browsing is a takeover of the browser.** It uses the 2026-09-27 ruling and the verify-r6/r7 machinery with no
new rule. Your key is the takeover's *primary*, and every conversation leased on the profile is a *sibling* taken
with it (`with: hu-…`):
* **Interrupted:** mediated calls in flight are answered `browser_interrupted` (≤2 ms), a running script gets
  `Runtime.terminateExecution`, and a non-mediated command runs to its end with the agent still told.
* **Told:** each conversation gets **one** takeover card in its chat plus a zero-spend `browser-takeover` notice.
  The card's words are today's: "The user took over the “Work” browser; N operations were interrupted: …".
* **Refused while you browse:** its next verbs are refused `browser_paused` and go on its re-run list.
* **Done:** each sibling's handback carries `sibling: hu-…`. PURE `announceVerdict` delivers a billed
  `browser-handback` turn **only if that conversation had something interrupted or refused**, and that turn is its
  re-run reminder. Otherwise the zero-spend notice rides its next turn. Pressing Done never wakes N idle agents
  (r7).
* A conversation that attaches while you browse is **paused from birth** (`joinTakeoverIfDriven` already finds your
  `inputs` key) and gets its own card.
* The existing confirm-actions, stale-approval sweep and live-fact republish behave exactly as for any takeover.

**No conversation on the profile ⇒ nothing is shown in any chat.** There are no siblings, so there is no takeover
event for any conversation. Your own events find no session (§3). A census pins it.

**The four crossings, each with one answer:**

| You… | While… | Result |
|---|---|---|
| press Browse yourself | you drive that browser from a conversation's live view (a live holder) | `held` names the chat and offers **Go to that view** (one browser, one holder, r7) |
| press Take over in a conversation's live view | you are browsing that profile yourself | `held` (`heldBy: hu-…`): "You're browsing this browser yourself in another window" and **Go there** |
| press Hand back on a chat card or in the switch dialog | you are browsing yourself | the whole browser goes back (the human row is a sibling), your window turns `away`: "You handed it back — Continue browsing" |
| had a takeover open in a view whose socket is **gone** | — | a dead holder never blocks: the browser moves whole to your human holder (r7's `siblingTakeover`) |

**Build requirements:**
* `siblingLeases` / `siblingsHeldBy` must enumerate the human row. Today they read `reg.leases` only
  (browser-keeper.js:2225), and that would split the browser into two drivers on a chat-card handback.
* `takeover()`'s verify-S5 guard must accept the human key: `holdersOn`, not `B.findLease`. Today it refuses a named
  profile's takeover by any key without a lease (`no_lease`, browser-keeper.js:2175–2178), so the human's own takeover
  would be refused.
* The relay's `browserKey` must be the `hu-` key, because `onInput` routes mode records by it.

**The confirm before interrupting (§8 Q2, recommended yes).** When `interrupts` is non-empty, Browse yourself asks
once:
* title: "Browse “{label}” yourself?"
* message: "{name} is using this browser. Browsing it yourself pauses it until you're done — it is told, and reminded
  afterwards to re-run anything that was interrupted."
* button: **Browse yourself**

It uses `showConfirmDialog` (house modal). There is no confirm when nothing is interrupted.

---

## 6. Surfaces and words

| Surface | What changes |
|---|---|
| **Agent browser panel, profile row** (`openBrowserProfilesWindow` → `profileRow`) | **Browse yourself** as the first action for a local profile whose provider starts a browser. When your holder exists, it becomes **Open your browsing window** (focuses the `win-bhuman-<id>` window). A remote or `cdp`/tier-3 profile shows **no** button (no greyed control), and its host chip already says where it lives. The state line reads "You are browsing it" / "You were browsing it — Continue". |
| **The switch dialog** | *Not live:* `emptyWords` / the `ready` line gain **Open it yourself**. "The browser isn't open right now. If a site blocks your agent, open “{label}” yourself and get past the check." It is ONE action button that performs Browse yourself. Today the empty line sends the user to "take over in the live view", which does not exist when nothing runs. *Live, you browsing:* `in-use-by-hand` with the **Done browsing** action (§1.2). |
| **The human browse window** (§2) | the badge, the address row, the two end buttons, Continue browsing / Browse again / "in another window", the touch Keyboard button |
| **A conversation's live view, strip tab** | "you, browsing it yourself". Clicking it opens your browsing window. |
| **A conversation's chat** | the existing takeover and handback cards only (§5) |
| **Session card menu** | unchanged. "Hand back to agent" appears while `browserInput === 'user'` and now also ends your browsing (§5). |
| **New Session dialog** | **no**. It creates a *conversation*. Your browsing is not one, and a row there would suggest the new chat's agent does it. |
| **Phone** | the same panel button, the full-screen window, and the Keyboard button (§2) |

**i18n (English-string-as-key, `t()`/`tc()` in the client only; zh + ja in the same commit — the build's i18n-check
enforces it):**

| en (the key) | zh | ja |
|---|---|---|
| Browse yourself | 自己浏览 | 自分で閲覧 |
| Open your browsing window | 打开你的浏览窗口 | 閲覧ウィンドウを開く |
| You are browsing | 你正在浏览 | あなたが閲覧中 |
| You are browsing it | 你正在浏览它 | あなたが閲覧中です |
| You were browsing it — Continue | 你刚才在浏览 — 继续 | 閲覧の途中です — 続ける |
| Type an address | 输入网址 | アドレスを入力 |
| Only web addresses | 只能输入网页地址 | ウェブのアドレスのみ |
| Done — leave it running | 完成，保持运行 | 完了（起動したまま） |
| Done — hand it back | 完成，交还 | 完了（エージェントに返す） |
| Stop the browser | 关闭浏览器 | ブラウザを停止 |
| It closes by itself after {min} min if nothing uses it. | 若 {min} 分钟内没人使用，它会自动关闭。 | {min} 分間だれも使わなければ自動で閉じます。 |
| {name} is using it too — Stop closes its pages; its next command opens it again. | {name} 也在用它 — 关闭会关掉它的页面；它的下一条命令会重新打开。 | {name} も使用中です — 停止するとそのページも閉じ、次のコマンドで再び開きます。 |
| Continue browsing | 继续浏览 | 閲覧を続ける |
| Browse again | 再次浏览 | もう一度閲覧 |
| You're browsing this in another window | 你正在另一个窗口里浏览它 | 別のウィンドウで閲覧中です |
| Continue here | 在这里继续 | ここで続ける |
| Keyboard | 键盘 | キーボード |
| you, browsing it yourself | 你（自己在浏览） | あなた（自分で閲覧中） |
| You · {time} · {dur} | 你 · {time} · {dur} | あなた · {time} · {dur} |
| Only when you started and stopped is kept. | 只保留你开始和结束的时间。 | 開始と終了の時刻だけが残ります。 |
| Browse “{label}” yourself? | 自己浏览“{label}”？ | 「{label}」を自分で閲覧しますか？ |
| {name} is using this browser. Browsing it yourself pauses it until you're done — it is told, and reminded afterwards to re-run anything that was interrupted. | {name} 正在用这个浏览器。你自己浏览会让它暂停，直到你结束 — 它会收到通知，结束后会被提醒重做被打断的操作。 | {name} がこのブラウザを使用中です。自分で閲覧すると終わるまで一時停止します — 通知され、終了後に中断された操作をやり直すよう伝えられます。 |
| Open it yourself | 自己打开 | 自分で開く |
| Done browsing | 结束浏览 | 閲覧を終了 |
| You can always browse it yourself. | 你随时可以自己浏览它。 | いつでも自分で閲覧できます。 |

The refusal words of §1.3 become i18n keys the same way (`routeErrorText`-style: the client words the CODE, and the
server's English `error` stays for the journal).

---

## 7. Gates

**Tier rule:** a lane runs the fast tier only. The heavy leg runs once, at integration.

### Fast — new `scripts/test-browser-human.mjs` (PURE + in-process, ~6 s, port 0, scratch dirs, the fake 0.38.1)

**① PURE tables (src/browser-human.js)**
* `browseYourselfVerdict`: every code of §1.3, in its order, and both orders where two apply (remote + cap ⇒ remote;
  locked + already ⇒ …). The `interrupts` list. A profile kept to "Only chat X" is still ok (the list is not an
  input). A join at 6/6 is ok; a launch at 6/6 is `cap`.
* `humanStep`: every cell of the §4 table.
* `humanAttachVerdict`: fresh / replay-with-siblings / replay-alone / second-live-viewer.
* The end-button model (words by situation). `addressVerdict`: web only, named refusal.
* `holderRows` with a human row, and the `hu-` key never matching `BROWSER_KEY_RE`/`CHILD_KEY_RE`.

**① patched-copy CONTROLS (scripts/mutant-copy.mjs; never src/).** Each copy must turn the gate red:
1. a verdict that asks `mayAttach`;
2. one that counts the ceiling on a join;
3. one that allows `profile.host`;
4. a `humanStep` that lets the idle sweep lapse a lone human primary.

**② The REAL keeper + routes over the share-model's fake 0.38.1** (extended to log `tab new`, `open`, `back`,
`forward`, `reload`, `tab <n>` per session). Each leg:
* **Launch and join:** Browse on a stopped profile ⇒ ONE launch; the human session connects **over CDP, never the
  directory** (`connects.log` has `vs-hu-…`, `refused.log` is empty); `tab new` is under `vs-hu-…`. Browse on a
  profile an agent runs ⇒ **no second launch** (`launches.log` still 1).
* **The takeover:** the agent's `/api/agent/browser/resolve` answers `browser_paused` while you browse. Done ⇒
  `tab close` + `close` under `vs-hu-…`, and the agent resolves again.
* **Spend (the real announcer, a spy `deliver`):**
  * a handback event carries `sibling: hu-…`;
  * **0 deliveries** when the agent had nothing interrupted or refused;
  * **1 delivery** (`spendReason:'browser-handback'`) when its refused verb is on its cycle;
  * and `test-spend-paths` stays green with **no new site**.
* **Stop:** Stop with no agent ⇒ the record is `stopped` and the human is ended `stopped`. Stop with an agent ⇒
  `stopped` + sibling cause `stop` (zero-spend).
* **The away clock (a fake clock):** close the viewer ⇒ `away` ⇒ after `takeoverIdleMs` ⇒ ended `left`, the tab is
  closed, the browser is still `ready`. After another `idleTimeoutMs` with no lease it idles out.
* **The rest of the keeper's paths:**
  * a "Who can use it" PATCH narrowing leaves the human untouched;
  * Delete… (`releaseAll`) ends it;
  * a backend switch while browsing ⇒ `mode:'proposal'` (`holdOf` sees the human);
  * a handback from a chat card ⇒ the human goes `away` (the siblings enumerate it);
  * a mediated profile ⇒ **no `grantFor` for the `hu-` key** (a spy on the mediator);
  * the navigate route refuses `file:`/`chrome:` by name.
* **The real bridge over a fake upstream** (the test-browser-fit pattern):
  * `?browse=` resolves the human target, and the fresh attach takes over (`mode` with `mine:true`);
  * a replay attach with a sibling does NOT (the reload law);
  * a second viewer gets `held`;
  * a tab change on a human relay forwards input (**no anchor**), while the same change on an agent takeover relay
    is still refused `tab_switched` (the control).
  * A stopped profile answers `browser_stopped` and launches nothing.

**③ The census legs**
* **No chat card for a human session.** A full lifecycle with no agent (browse → type → Done → browse → Stop) runs
  with a spy on every card, notice, inbox and delivery seam: `feedBrowserCard`, `feedPeerCard`, `emitPeerCard`,
  `deliverToConversation`, `pushNotice`, `userTodos.add`. The assert is **zero** calls, while the markers file has
  start + end with `holder:'user'`. CONTROL: a copy of the wiring's `onSession` that matches by profile ⇒ a card
  appears ⇒ red.
* **The trace-off-for-you census.** 20 forwarded viewer inputs on a human relay write **zero** index entries.
  CONTROL: a recorder copy that arms taps on `human-start` ⇒ red.
* **The holder-reader census.** Every `reg.leases` site in browser-keeper.js (48 today) is classified in a table in
  the suite as *conversation-only* or *holder*; a holder site must go through `holdersOn(profileId)`. A new
  unclassified site turns the gate red (the owner's fence-is-a-census rule).
* **The agent can never reach a human holder.** A grep census: no `/api/agent/` route and no agent CLI
  (`data/bin/vibespace-*`) names `hu-`, `/browse` or `human`.

**④ The words:** every new key in en through the module and in zh + ja from the dictionaries.

### Extensions of existing fast suites
* `test-browser-sessions`: human markers pair, `chatCardsFor` skips `holder:'user'`, the `left` reason,
  `yours-not-recorded`.
* `test-browser-switcher-model`: `in-use-by-hand` with a human driver ⇒ the **Done browsing** action; not live ⇒
  **Open it yourself**.
* `test-live-strip`: `driver:'you-self'` and its words.
* `test-architecture`: the new PURE module imports nothing; the gate census lists `test-browser-human` (fast) and
  `test-browser-human-ui` (heavy).

### Heavy — new `scripts/test-browser-human-ui.mjs` (real agent-browser 0.38.1 + real Chrome + headless chrome client; vncEnv; scratch only)
**(a) The basic round trip:**
1. From the panel row: Browse yourself ⇒ the window opens in takeover with the badge "You are browsing" and focus in
   the address field.
2. A local fixture URL typed and loaded (a frame arrives, the URL line agrees).
3. A click into an input plus typed text, including a 6-character CJK paste. The page's own value is read back over
   CDP as the oracle.
4. **Done** ⇒ the window closes and the row says "closes by itself in 15 min".
5. Browse yourself again ⇒ **join** (no relaunch, the same Chrome pid).
6. **Stop** ⇒ the browser is stopped and the window offers **Browse again**.

**(b) A second client page (another browser context):** its panel row says "You are browsing it". Its window
(pushed by the layout sync) is watch plus "You're browsing this in another window", and its input is refused
(`held`).

**(c) An agent's in-flight call is interrupted:**
* A stub claude runs the shipped `vibespace-browser` (the test-channel-jump pattern) on a **mediated** profile with an
  `eval` 5 s busy loop.
* Browse yourself interrupts it: the CLI prints `[browser_interrupted]` and its chat shows the takeover card.
* Done ⇒ its re-run reminder arrives (one delivery).
* The same run on a **non-mediated** profile: the command runs to its end, the next one is refused `browser_paused`.

**(d) Phone (390×844, touch):** the panel row button, the full-screen window, the Keyboard button focuses the sink
inside the tap, a tap maps to the page, and pinch is refused while driving.

**(e) The end bar:** rect census at 360 px in zh / ja / en (no clip, no wrap: lane I's fold rule).

---

## 8. Owner questions, lean set, unverified items, build brief

### 8.1 请 owner 决定（每行一个是/否；全按推荐就回「都按推荐」）

1. 在 Agent 浏览器面板里，每个配置那一行加一个「自己浏览」按钮：点一下就打开这个配置的浏览器（登录都还在），你直接在里面输网址、点、打字。—— 要吗？（推荐：要）
2. 如果这个配置正有对话在用，点「自己浏览」前先弹一句确认，写明会暂停哪个对话（它会被告知，你结束后提醒它重做被打断的事）。—— 要这句确认吗？（推荐：要）
3. 你自己浏览时点了哪里、打了什么，默认一律不记录，只记开始和结束时间，回放列表里显示成「你 · 14:02 · 4 分钟」。—— 这样可以吗？（推荐：可以）
4. 要不要再给每个配置加一个开关「也记录我自己的操作」（像 agent 的回放那样每步截图）？（推荐：先不做）
5. 有对话也在用这个浏览器时，你点「关闭浏览器」照样把它关掉（那个对话打开的页面也会关，它下一条命令会重新打开），跟面板上现在的「停止」一样。—— 是/否？（推荐：是）
6. 电脑上开着浏览窗口时，手机上点「在这里继续」就能把操作拿到手机上（电脑那边变成只看）。—— 要吗？（推荐：要）
7. 另一台电脑（配对设备）上的配置，第一版不支持自己浏览，那一行不显示这个按钮。—— 可以吗？（推荐：可以）
8. 你关掉浏览窗口或者断网后，你那一页再留 10 分钟，回来点「继续浏览」还是原来那页；10 分钟后自动收掉（浏览器本身照常 15 分钟没人用才关）。—— 是/否？（推荐：是）

（不急，不用回：机器上已开着 6 个浏览器时，「自己浏览」一个没在运行的配置会被拒绝，并提示你先关一个 —— 跟桌面应用和 agent 守同一个上限；已经在运行的配置随时能进。）

### 8.2 The lean set (per point: what it removes for the owner, cost, risk, do?)

| Point | What it removes / gives | Cost | Risk | Do |
|---|---|---|---|---|
| Human holder + verdict + lifecycle (§1, §4) | the feature itself | M (PURE ~250 lines + keeper ~200) | M: the holder readers (census) | **yes** |
| Address row: address / Back / Forward / Reload (§2) | without it a fresh profile is unusable (the screencast has no omnibox) | S | S | **yes** |
| Clickable tabs + no anchor on human relays (§2) | login popups, links opened in new tabs | S | M: U1 measure first | **yes, after U1** |
| Touch Keyboard button (§2) | typing on the phone at all | XS | S: U2 | **yes** |
| Switch-dialog "Open it yourself" (§6) | the "site blocks my agent" path when nothing runs | XS | S | **yes** |
| Confirm before interrupting (§5, Q2) | a surprise pause of billed agent work | XS | — | owner Q2 |
| "Continue here" pass (§2, Q6) | the phone-after-desktop dead end | S (a receiver-initiated `decidePass`) | S | owner Q6 |
| Away clock 10 min (§4, Q8) | losing a half-filled form on a blip | XS (reuses `takeoverIdleMs`) | S | owner Q8 |
| "Also record my own actions" (§3, Q4) | a replay of your own browsing | M (~150 lines + census) | M | **not in v1** |
| Remote profiles (Q7) | browsing a paired machine's login | L (the live view is not bridged remotely at all) | L | **not in v1** |

### 8.3 Not verified (measure before building the dependent part)

* **U1 — popups and new tabs.** Does a `window.open` / `target=_blank` from the human's `--pin-tab` tab show up in
  the session's `tabs` records on 0.38.1, and does `tab <n>` under a CDP-attached, tab-pinned session switch *its*
  stream to it? If a pinned session cannot follow a popup, the fallback is a human session **without** `--pin-tab`.
  Every agent is paused while you browse, so an unpinned human session cannot steal a working agent's tab. Measure on
  the real 0.38.1 + Chrome 153, as `scripts/measure-anchor-grace.mjs` did.
* **U2 — the phone's soft keyboard.** Does focusing the hidden sink inside the Keyboard button's tap raise the
  keyboard on iOS Safari and Android Chrome? The heavy leg only emulates touch. One manual check on a real phone.
* **U3 — navigation.** Does `open <url>` under `vs-hu-…` with `AGENT_BROWSER_CDP` navigate the session's own pinned
  tab, never the browser's active one? It is very likely (agents do exactly this), but pin it in the fast fake and
  the heavy leg.
* **U4 — confirm-actions.** The human session runs under the same named config file, so a `confirmActions` in the
  machine's config will ask *you* to confirm your own navigation, in the live view's confirm bar. This design accepts
  that (the human answers it). If the owner finds it silly, the human's calls can drop that key. Nothing was measured.

### 8.4 Build brief (for an Opus builder)

**Setup**
* Worktree under `/var/tmp/vibespace-lanes/` (not /tmp, which is tmpfs), with its own `data/` and its own
  node_modules. **Never** the production checkout or its `data/`. **Never** `~/.agent-browser`: suites use scratch
  HOME / XDG.
* Harnesses set `VIBESPACE_SKIP_AGENT_HOOKS=1`. No server from the repo dir. No vendor calls.
* **Read first:** docs/kb-file-structure.md for browser-keeper.js, browser-stream.js (both), browser-trace.js (both),
  browser-live-window.js, browser-switch.js and browser-trace-view.js. Then docs/design-agent-browser-v2.zh.md §3.2.6,
  §4.3, §6.2.2, and this file.

**The order, each a green fast gate before the next:**
1. **PURE `src/browser-human.js`** (imports nothing, CJS): `humanKeyFor(profileId)` / `isHumanKey`,
   `browseYourselfVerdict`, `humanStep`, `humanAttachVerdict`, `humanEndChoices`, `humanHolderRow`,
   `addressVerdict`. Plus `scripts/test-browser-human.mjs` ① with its controls.
2. **PURE edits:**
   * `browser-profiles.js`: `holderRows({humans})`;
   * `browser-sessions.js`: `holder`, `left`, and `chatCardsFor` skipping `holder:'user'`;
   * `browser-stream.js`: the `human` target and `driver:'you-self'`;
   * `browser-switch.js`: `holdOf` reads human rows;
   * `src/lib/browser-switcher-model.js`: the two new actions.
   * Extend the suites listed in §7.
3. **ORCH `src/server/browser-keeper.js`:**
   * `humans` map, `browse()`, `humanFor/humanOf`, `endHuman({how})`, `navigateHuman()`;
   * `holdersOn()` + the 48-site classification;
   * `siblingLeases` including human rows;
   * `browserIdle` counting them and the `lastLeaseDroppedAt` stamp;
   * `stop()` / `releaseAll()` / the switch ending or proposing;
   * the tick's away sweep; `sweepIdleTakeovers` skipping a lone human primary;
   * lease-seam `human-start` / `human-end`.
   * Then `src/server/browser-stream.js`: `?browse=`, the relay key, the auto-take by `humanAttachVerdict`, no anchor
     on human relays, viewer-left ⇒ away.
   * Then `src/server/browser-trace.js`: markers only on the human events, never a tap.
   * Then `src/routes/browser.js`: `POST /api/browser/profiles/:id/browse`, `POST /api/browser/browse/:key/end`,
     `POST /api/browser/browse/:key/navigate`, and STATUS rows for the new codes.
   * Then `src/routes/browser-trace.js`: the row's `human` field. Finish with test ② and ③.
4. **CLIENT:**
   * `browser-live-window.js`: the `human` openSpec + replay, the address row, the end bar, clickable tabs on human
     windows, Continue / Browse again, the touch Keyboard button;
   * `browser-trace-view.js`: the row button + state line + who-cell sentence;
   * the strip words, the session words, i18n zh/ja. Icons via icons.js SVG only; theme vars only;
     `showConfirmDialog`; textContent for every page string.
5. **Docs in the same commits:**
   * kb-file-structure: a new entry for browser-human.js + test-browser-human(-ui); edits to the keeper, bridge,
     recorder and live-window entries;
   * kb-features: Agent browser → Browse yourself;
   * kb-api: the three routes + `?browse=`;
   * docs/design-agent-browser-v2(.zh).md: a dated note in §3.2.6 + §4.3 pointing here;
   * CLAUDE.md: ONE index line for `src/browser-human.js` (≤ 300 chars, `⇒ kb-file-structure.md`).

**Discipline**
* Every commit: version bump (package.json + lock) + CHANGELOG + kb together.
* Fast tier only in the lane. `test-browser-human-ui` runs once, at integration.
* Adversarial verify is **required**: this touches the takeover/spend path (a billed handback), and the owner's
  speed-over-phases rule keeps adversarial verify for money, credentials and kills.
* Attack list for the verifier:
  * a human holder that survives its browser's stop;
  * a chat card or a delivery for a human-only lifecycle;
  * a chat-card handback splitting the browser into two drivers;
  * a replayed window re-pausing resumed agents;
  * a popup freezing input (the anchor);
  * an agent path that reaches `/browse` or a `hu-` key;
  * a switch or Delete stopping the Chrome under you silently;
  * the idle sweep lapsing a lone human read.

**Size:** about 1,100–1,400 lines of product + ~900 lines of tests. Two builder rounds + one verify round.

---
## OWNER DECISIONS (2026-09-28 17:38 PDT, replies to ut-286bc734e0) — build under these; they override §8.1's recommendations where they differ
1. 可以 — the "Browse yourself" button on every local profile row; live view + address row.
2. **"我其实也相当于是一个agent而已"** — the owner's model: one profile = one Chrome shared by several conversations at once (each on its own tabs), and the human is ONE MORE HOLDER with his OWN tab. So: NO confirm, NO pause, NO interruption of the agents when he starts browsing — he joins the running browser as a peer holder (the `hu-` holder row) on his own pinned tab. The 2026-09-27 takeover ruling applies ONLY when he drives an AGENT's tab from the live view (the existing takeover path), never to opening his own tab. Rewrite §5 accordingly; the "with an agent on the same profile" section becomes: concurrent by default; takeover only on an agent's tab.
3. **一起记录** — the human's actions ARE recorded, like an agent's (start/end + the action trace with frames; the Sessions list shows "你 · 14:02 · 4 分钟" and its replay). Default ON.
4. **加开关** — the per-profile switch "也记录我自己的操作" exists, default ON (an opt-OUT), in v1.
5. **窗口 vs 浏览器**: "Close" closes the human's own WINDOW/TAB (the browser stays for the agents; it idles out by the keeper's rule when nobody holds it). A separate explicit button "退出整个浏览器" ends the browser for everyone — with the confirm naming the conversations that lose their tabs (they reopen with `tab new` on their next command).
6. 可以 — phone "在这里继续" pass.
7. 可以 — remote (paired-machine) profiles not in v1.
8. **12 h when the owner LAUNCHED the browser** (his page + the browser stay 12 h after his window closes / disconnects, `browser.humanKeepMs` 12 h); when he JOINED a browser an agent launched, the recommended 10 min keep for his tab stands and the browser follows its holders.
