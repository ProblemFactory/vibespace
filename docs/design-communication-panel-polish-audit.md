# Communication panel — UI design + i18n polish: the AUDIT (a1)

Owner, 2026-09-17, after seeing 2.369.106: *"似乎没太做好 i18n，而且界面也比较缺乏设计"* and *"界面很乱，没有层次，你需要用前端技能+实际渲染截图好好设计优化一下"*. This document is the first chunk of the polish: **no product change**, every surface of the feature rendered in headless chrome at zh / ja / en, 1200×800 (rail panel at 260 px, widened to the resizer's max 500 px, narrowed to its min 200 px) and 375×667, dark + light, and measured. The later chunks (a2 composition, a3 i18n, a4 verify) start from the tables below; the verifier reproduces every number from the same script.

**Reproduce:** `node scripts/dbg-comm-surfaces.mjs` (per-pid scratch dirs, a worktree server with `VIBESPACE_CHANNELS_FAKE=1`, zero vendor calls). Switches: `VS_UI_SHOTS_DIR`, `VS_UI_LANGS=zh,ja,en`, `VS_UI_VIEWPORTS=desktop,mobile`, `VS_UI_THEMES=dark,light`, `VS_UI_ONLY=<substring>`. Output = one PNG + one JSON (rects, computed tokens, the visible-text scan) per surface × language × viewport × theme, plus `<lang>-<viewport>-<theme>-latin-leaks.json` (every Latin-only string on screen in a zh/ja pass, with the surfaces it appeared on) and `index.json`. PNGs are never committed; the shot names below (`panel-02-tracked`, `card-04-unknown`, …) are the file stems.

The design's own laws this audit judges against: docs/kb-design-lessons.md §16 (i18n) + §17 (UI conventions), docs/design-communication-panel.zh.md §9.2 (the approval face), §9.5 (identity), §10 (the panel), §12.4 (the loopback wizard), §13 (auth states), §14.5 (the Integrations card), and the design's rule **the server sends STRUCTURE, the client says the WORDS** (CLAUDE.md channel-adapter row).

---

## 0. The five root causes (everything below is an instance of one of them)

1. **The panel is a control panel first and a list second.** In `panel-02-tracked` (260 px sidebar, 172 px of content) the four adapter sections spend **318 px on adapter controls and 246 px on conversation rows**; with Lark and Gmail connected (`panel-11-B-full`) it is **702 px of controls vs 274 px of rows (59 % / 23 %)**. Every section repeats the same stack — status line, push line, up to seven 10 px buttons ("Sender line: off (instance default)" is on every sendable adapter, tracked or not) — above two rows. The thing the user came for (which conversation has something new) is the smallest, most truncated element on the screen.
2. **Every row wears every badge at once, at `flex-shrink: 0`.** A tracked row carries unread + awaiting + freshness + (untracked) chips on one 172 px line; the title is what gives way: **4 of 6 titles are truncated at 260 px, 6 of 6 at 200 px (title width 0 px on four rows)**. The design (§10) asks for ONE honest freshness claim per row; the row draws up to four claims.
3. **Structure the client should word arrives as sentences (and codes) from the server.** The `t()` coverage of the six client modules is 368/369 keys, so the English the owner saw is not un-wrapped literals: it is engine-composed reasons (`outcome unknown: … NOT retried automatically — …`, `forbidden: …`), `auth.why` codes and sentences (`needs re-authorization (token-expired)`, `application credential missing (the cluster provides no…)`), the PURE filter module's authority sentence, the adapters' declared option labels/help, and the whole Integrations registry (labels, help, setup notes, prerequisites, caveats, `Used by: src/channels/fake.js`). §1 lists every one with its source and fix class.
4. **Three generic CSS rules override the feature's own layout.** `.dialog-body label { display:flex; flex-direction:column }` turns the Track picker's grid rows and the receipt checkbox into centred columns; `.chan-flow-status { min-height: 1.2em }` inside the flex-column `.dialog-body` lets the estimate line shrink to **13 px while its text is 2–3 lines (it paints over the "Deliver" label at 375 px)**; the composer `textarea` has no font rule and renders in the UA monospace at 13.33 px. `.chan-flow-refusal.chan-warn` has no colour rule, so the port-busy refusal (§12.4's named refusal) is body-coloured text.
5. **The approval card says everything on every card.** In the Outbox window (`outbox-window`) all 5 cards repeat the policy line, the identity row AND the amber identity warning (5/5/5); the `unknown` card prints the same sentence twice (the engine's reason and the client's). §9.2 asks the card to carry *why it waits*, *who it sends as*, and *the decision* — one of each.

Three product gaps surfaced by the audit and outside a polish chunk's scope (openIssues): **the panel is rebuilt with a refetch on every `channels-updated` broadcast** (a blank frame + a scroll reset every engine pass — §2.1 D12), **no entry point to Channels on a phone** (the rail is not built at ≤768 px and the ⚙ row is hidden without a rail — the mobile passes could only reach the windows and the dialogs a window opens), and the Assign / Reach editors label a Task Group by `g.name`, a field the task store does not have (`title`), so **every group shows as its id** (`Group · T-…-ops-triage`).

---

## 1. i18n — every visible string that is not zh/ja under that language

Sources: the driver's `zh-*-latin-leaks.json` / `ja-*-latin-leaks.json` (every Latin-only visible text and title/placeholder in a zh/ja pass, fixture data and window chrome removed by hand), plus a static scan of every `t('…')` key in channels-panel / channel-window / channel-outbox / channel-filter-editor / channel-reach-editor / integrations-window / channel-caps / sidebar-rail against i18n-zh.js and i18n-ja.js (**369 keys, 1 missing**). Fix classes: **K** key missing from the dictionary · **W** dictionary wording keeps the English noun · **S** server-sent sentence (structure should cross the wire, the client should word it) · **A** adapter-declared label/help/choice (the adapter must declare a KEY the client's dictionary knows, or the words must be in the digest with a `t`-able id) · **R** registry-declared (integration-registry.js) · **E** enum rendered raw · **X** untranslatable by construction (vendor verbatim, user input) — listed so the census stays honest.

| Where it shows (shot) | String as rendered under zh / ja | Source | Fix class |
|---|---|---|---|
| Track dialog note (`dialog-track`) | *Nothing is fetched for a conversation until you track it.* | channels-panel.js `t()` — the ONE key absent from both dicts | **K** |
| Panel header + Outbox window title + composer note + card head (`panel-01-fresh`, `outbox-window`, `win-01`) | **Outbox** / *已放入 Outbox 等你审批* / *Outbox —— 这个对话的 proposal* / *1 条等你审批 · 共 5 条 proposal* | dict entries keep `Outbox`, `proposal`, `channel`, `adapter`, `kick`, `review` untranslated (42 zh entries; 19 ja entries — ja already says 提案 / アダプタ / チャンネル but keeps `Outbox` and `kick`) | **W** |
| Panel summary (`panel-02-tracked`) | *4 个 adapter · 6 个会话 · 已跟踪 4 个* / ja *アダプタ 4 件…* | dict wording (zh keeps `adapter`) | **W** |
| Section head, scan adapter (`panel-02d-section-scan`) | *扫描 · NO-STORE-ON-PLATFORM* (CSS uppercases it) | `laneNote()` prints `lane.why` (`no-store-on-platform`) raw | **E** |
| Section status, expired Lark (`panel-10-B-expired`) | *需要重新授权 (token-expired)* / ja *再認可が必要 (refresh-token-…* | `t('needs re-authorization ({why})', {why: auth.why})` — `auth.why` is a code | **E** |
| Section status, Gmail without credential (`panel-06-needs-credentials`) | *缺少应用凭据 (the cluster pro…* (truncated) | `auth.why` = integration-store's English sentence *the cluster provides no default for this integration* | **S** |
| Agents section status | *已连接为 you* / ja *you として接続中* | the built-in Agents record stores `auth.user: 'you'` (channels-engine.js) | **S** |
| Failed-passes state (not staged; code path) | *{n} failed passes ({code})* | `lastPass.code` raw | **E** |
| Push line / Push dialog (`dialog-push`) | *推送在线 — 只做游标 kick(未声明独占度)*; select options *unknown — 不做声明…* / *shared — …* | dict wording; the option keys start with the enum word by design | **W** |
| Push dialog / panel when the lane is unavailable (code path) | *push unavailable: {why}* | `p.lastStateWhy` (lane transport text) | **S** |
| Composer toast after Propose (`toast-01-held`) | *已放入 Outbox 等你审批(channel-policy)* | `r.decision.reasons.join(', ')` — the reason ENUM, not `reasonLabel()` | **E** |
| Card outcome line, failed (`card-03-failed`) | *forbidden: fake: the fixture refused the send* | engine composes `${code}: ${why}` into `p.reason` | **S** (+ **X** for the adapter's own words after the colon) |
| Card outcome line, unknown (`card-04-unknown`) | *outcome unknown: the request left and the answer was lost (…); NOT retried automatically — check the conversation on the platform, or press Check outcome* — then the client's own zh sentence saying the same | engine composes the whole sentence into `p.reason`; the client adds its translated twin | **S** (and a duplication defect, §2) |
| Card, expired / lost-at-boot / send-not-available (code paths) | *expired: not approved within 24 h* · *outcome unknown: the server stopped…* · *send-not-available: …* · *rejected by the user* | engine `p.reason` literals | **S** |
| Card reconcile line (code path) | *… — {lastWhy}* | adapter's reconcile reason | **X** |
| Card "Why:" reference (code path) | `p.why.label` | agent/adapter-supplied | **X** |
| Card receipt line (code path) | *Receipt handed to the agent ({lane})* | `d.lane` raw (`message`/`channel`/…) | **E** |
| Conversation window meta (`win-01`) | *fake-poll · Ada, Brook, Cass · 5m以内* | `c.adapterId` (the id, not `label`) | **E** |
| Window read-only reason (`win-03-untracked`) | *这里是只读的(发送能力尚不清楚)* on an UNTRACKED conversation | `sendWhyText('unknown')` — correct words, wrong claim (untracked ≠ unknown capability) | wording (§2) |
| Assign editor, authority note (`dialog-assign-filter`) | *这里不提供直接发送: this channel requires review before anything is sent* | PURE `channel-filter.js authorityCap()` returns an English sentence | **S** |
| Assign editor, clamp note (code path) | *…reads as draft: {why}* | `a.authorityWhy` from the same module | **S** |
| Assign editor, principal rows | *组 · T-260918-ops-triage(在它的活会话上轮转)* / *{kind} · {name} (not live now)* | `g.name` (absent — the task store has `title`) and `a.principal.kind` raw | **E** + product bug |
| Assign editor, last-wake line (code path) | *… via {lane} — {why}* / *held or stashed: {why}* | `lw.lane`, `lw.whys`, `lw.why` server codes/sentences | **E**/**S** |
| Assign editor, wake latency (code path) | *({why})* / *({source})* | `wakeLatency.why`, `.source` | **E** |
| Reach dialog policy line (`dialog-reach`) | *当前生效: review(默认值: 审批)* / *adapter 的默认值* | `pol.mode` raw + dict wording | **E** + **W** |
| Options dialog, Lark (`dialog-options-lark`) | *Brand* + *feishu = 飞书 (open.feishu.cn), lark = …* | lark.js `OPTIONS[].label/help` | **A** |
| Options dialog, Gmail (`dialog-options-gmail`) | *Include query*, *Pub/Sub topic (push)*, *Pub/Sub subscription (push)* + three help paragraphs + placeholders | gmail.js `OPTIONS[]` | **A** |
| Connect block, credential note (code path) | *credential state unknown* falls back to `cred.why` | engine `credentialFacts().why` (*no integration store*, *integration lookup failed: …*) | **S** |
| Flow dialog, ended with an error (code path) | *The consent flow ended: {error}* | `a.flow.error` / `lastAuthError` (vendor or loopback text) | **S**/**X** |
| Integrations, every card (`integ-01-window`) | row labels *Fake channel (test adapter)*, field labels *API key / Region / App ID / App Secret / OAuth client ID / OAuth client secret / License key*, every `help` (*Only when using your own client. Leading and trailing whitespace is trimmed before saving.*), `setup.callbackNote` (*Developer Console → Security Settings → Redirect URLs. It must match byte for byte.*), every prerequisite, `test.describe` (button tooltip), `test.caveat` (*This only proves the app id / secret pair is right…*), `wiredIn` (*agent-browser v2 (src/server/…)*) | integration-registry.js (PURE, bundled) — the strings are DATA to the client | **R** |
| Integrations, "where used" + docs (`integ-02-card-fake`) | *用在: src/channels/fake.js* · *文档: docs/design-communication-panel.zh.md* | `consumers` (source paths) and `docs` (repo path) shown to the user | **R** (and a content defect: a user is shown file paths) |
| Integrations, chip tooltip / why / store error (`integ-02-card-gmail`, cloak) | *stored values could not be decrypted (clientSecret): the current key file (.integrations-key) is not the one…* · *restore the .integrations-key this instance had…* · *the cluster provides no default for this integration* · *the cluster provides no preset* (select title) · *the cluster default this row used (…) is no longer provided…* | integration-store.js / integration-registry.js `why` / `clusterWhy` / `storeError.message` sentences | **S** |
| Integrations, Test failure (`integ-04-test-failed-own-key`) | *the fixture switch: the resolved key contains "fail" (source: user)* · Lark: *no credential resolved for Lark…* | the row's test runner returns `error` text | **S** (runner-side) / **X** (vendor text) |
| Integrations, wired-in note | *Not wired until {phase}* with the phase text | registry `wiredIn` | **R** |
| Window titles in the taskbar / window-type registry | `label: 'Channel'`, `'Outbox'`, `'Integrations & keys'` in `registerWindowType` | not passed through `t()` (the title bar itself is; the type label is what the window-list popup and tab groups show) | **K** (wrap at use) |

Fixture strings (`Ops room`, `Announcements`, `Ada, Brook, Cass`, the fake message bodies, `fake-poll`), brand names (`Gmail`, `Lark / 飞书`, `CloakBrowser`) and the user's own typed text (`Wrong tone for that room`) are Latin by nature and excluded.

**What the fix classes mean for a2/a3 (recommended options, taken):**
- **S / E**: the digest and the outbox view keep `code`s and structured fields; the client words them (`reasonLabel`, `sendWhyText`, `freshnessText` already do this for their families). New PURE composers in `channel-caps.js` / `channel-policy.js` for the outcome sentence (`{kind:'lost'|'refused'|'threw'|'expired'|'boot', code, vendorText}`), the auth `why` (a closed set), the authority cap (return `{code, why}`), the toast reasons (reuse `reasonLabel`). Vendor text stays verbatim after the client's sentence, never inside it.
- **A**: adapters keep declaring `label`/`help`, but as KEYS — the client renders `t(o.label)`; the keys join the dictionaries (i18n-extract needs to read `src/channels/*.js OPTIONS` — one census line).
- **R**: the same for the registry: the client renders `t(row.label)`, `t(f.label)`, `t(f.help)`, `t(setup.callbackNote)`, `t(prereq)`, `t(test.caveat)`; the extractor reads `src/integration-registry.js`. `consumers`/`docs` leave the card (they belong in a "Details" tooltip at most).
- **W**: a dictionary pass — 发件箱 / 送信箱 for Outbox, 提案 for proposal (ja already has it), 频道 / チャンネル for channel, 适配器 / アダプタ for adapter (ja already has it), 审核 for review where it is a verb; 42 zh + 19 ja entries.
- **K**: the one key + the three window-type labels.

---

## 2. Hierarchy and design — per surface

Reading order is what a user's eye lands on first / second / third in the screenshot (size × contrast × position), against what the surface is FOR.

### 2.1 The Channels rail panel (`panel-01-fresh` … `panel-11-B-full`, `panel-09-wide-500`, `panel-09-narrow-200`)

| | Today | Should be |
|---|---|---|
| 1st | the uppercase adapter names (`FAKE-POLL`, 10 px/700, dim) and the button stacks under them | the conversations that need me: title + unread count + ONE freshness chip |
| 2nd | the row chips (blue/yellow pills, 9 px/700) — four different pills on one line | the adapter section head as a quiet divider with its ONE state word |
| 3rd | the row title (12 px, truncated to 75 px, "Announceme…", "O…") | the adapter's controls, on demand |

Defects (each with the law it breaks):
- **D1 Controls above content, repeated per section (§10.1 "the panel" is a list of conversations; §17 density-preserving).** Every section draws a status line, a push line, and 3–7 buttons BEFORE its rows; the Agents section has three buttons and zero rows. 47 % of the panel's height is controls at 260 px, 59 % with two real adapters connected. → one section header line = name + state chip + a `⋯` (the existing `channel-row`-style contribution menu) holding Track…/Options/Push…/Sender line/Disconnect/Disable; the status sentence only when it is not `connected`.
- **D2 The "Sender line: off (instance default)" switch is a button in every sendable section** (P4 §9.5). It is a per-channel setting with an instance default; it reads as a status. → into the `⋯` menu as a checkable item, or into the Options dialog.
- **D3 Row badges: four claims per row, all `flex-shrink:0`.** `chan-unread` (16 px), `chan-awaiting` (66 px), `chan-chip` (58–59 px), `chan-untracked` (48 px) on a 160 px line → title 75 px at 260 px; **0 px at 200 px**. §10 says ONE freshness chip is the row's honesty contract. → unread as the row's leading count (like Background Work's red count), awaiting folded into the same badge with the accent colour, the freshness chip the ONLY pill, "not tracked" as a row style (dim title + no chip) rather than a fifth label.
- **D4 Chip colour ≠ meaning.** `within` = blue, `live` = green, `scanned` = yellow, `not polling` = blue, `1 to approve` = yellow, unread = accent — yellow means both "scan lane" and "needs approval", blue means both "fresh" and "nothing is fetched". §17: notes are neutral-dim vs amber-warn, SEPARATE. → one colour per meaning: neutral for a freshness age, accent for "you have something to do", amber only for a warning.
- **D5 Section head casing + the raw lane note.** `scan · no-store-on-platform` becomes `SCAN · NO-STORE-ON-PLATFORM` by `text-transform: uppercase` on the whole head (§17: child spans keep their casing); the code is a code (§1 E).
- **D6 Status sentences truncate with no way to read them.** `.chan-auth` is `nowrap; ellipsis`: *application credential missin…* (`panel-06-needs-credentials`), *needs re-authorization (toke…* (`panel-10-B-expired`); the identityObserved paragraph (`panel-09-wide-500`) wraps to 4 lines above the first row. → the status is a chip on the head (Connected / Re-authorize / Needs credentials, coloured by state) and the sentence goes to a tooltip or the section's expanded form.
- **D7 Connect block.** *Connect* is a second uppercase head at the bottom with one 12 px bold name + a 10 px note + a 10 px button per kind — after the user has scrolled past six sections. Design §10.1 makes the connect wizard the ONE thing a user clicks on a fresh instance. → on a fresh instance the connect block is the panel's first section; connected adapters push it down.
- **D8 The header.** *4 adapters · 6 conversations · 4 tracked* (11 px dim) + an *Outbox* button (10 px). The count line says nothing actionable; the Outbox button is the only place the awaiting count lives once the rail badge is read. → header = search (the rail's own) + Outbox with count as a proper secondary button; drop the count line or make it the empty state's sentence.
- **D9 Buttons are 10 px / `1px 7px` padding / `--bg-secondary`** (§17 secondary = `--bg-input` bg, `--border`, radius-sm, hover border+color accent) and the "primary" variant is an outlined accent text button (§17 primary = accent fill + `--accent-fg`). The `chan-btn` family is its own third button language beside `jobs-btn` and `mounts-btn`.
- **D10 Widths.** At 500 px the panel becomes readable (0/6 titles truncated) but the identityObserved sentence eats 4 lines; at 200 px it is unusable (6/6 titles at 0–36 px, the fake-poll section 361 px tall for two rows). Background Work at the same widths keeps one line per job. → the row must be title-first (min-width on the title, chips wrap or collapse to a count), controls must not stack vertically below 240 px.
- **D11 Empty states** use `.chan-empty` (11 px dim, left) not the house `.empty-hint`/`.empty-hint-inline` (§17).
- **D12 The panel is torn down and rebuilt on every engine pass.** sidebar-rail.js (`_railWireBadges`, the `channels-updated` branch) removes `.rail-panel-channels` and calls `_renderRailPanel()` on EVERY broadcast, and the new `renderChannelsPanel` FETCHES `/api/channels` before it draws — while the panel's own `onBroadcast` already redraws from the digest the message carries. Measured: the list's scroll position resets to the top on each pass, and the driver caught the empty panel twice in seven passes (`panel-10-B-expired` shot as a blank 172×175 strip although its measurement, 100 ms later, held the Lark section's text). For a user this is a flicker + a scroll jump every few seconds while an adapter is polling; the fix is the render-once rule the rail states for itself (§10.4: one broadcast, one repaint IN PLACE).

### 2.2 The conversation window (`win-01-tracked-sendable`, `win-02-readonly-adapter`, `win-02b-readonly-mailbox`, `win-03-untracked`, `win-06-assigned-bar`)

| | Today | Should be |
|---|---|---|
| 1st | the composer's monospace placeholder paragraph (13.33 px UA monospace, two lines) | the newest messages |
| 2nd | the title (13 px/700) + two `Assign… / Reach & policy…` buttons on the same bar | the title and its ONE meta line |
| 3rd | the messages (11 px bold names, 12 px bodies, 40 px per message) | the composer as a quiet input with one primary action |

- **W1 Composer** — `.chanwin-composer textarea` inherits no font (`font: inherit` missing): UA monospace 13.33 px in a 12 px body (measured); the placeholder is a 2-line policy explanation; under it a 10 px note repeats the policy AND a 10 px amber identity warning on every open. §9.5 puts the disclosure "at the moment of authorization" — that is the card, not the idle composer. → `font: inherit; font-size: 12px`, a short placeholder, the policy as one 10 px note, the identity warning ONLY on the card.
- **W2 Context bar** carries three tiers in 10–13 px with no rhythm: title, meta (`fake-poll · Ada, Brook, Cass · within 5m` — adapter id, participants, freshness), assignment sentence + two buttons. The `chanwin-assign` line is 10 px and its two verbs are the same weight as the title. → title 13/600, meta 11 dim, assignment as a chip (`→ Ops triage · filtered · drafts`) with the two verbs in a `⋯`.
- **W3 Read-only footer** is a bare 11 px dim sentence with 8 px of padding in a 12 px-padded window; on an UNTRACKED conversation it says *the send capability is not known yet* — the honest reason there is "not tracked" (§10 invariant 6). → one footer line per case: untracked = "Track this conversation to read it" with the Track verb; read-only = the reason.
- **W4 Message rows** are fine in shape (name/time/body) but 40 px per row with a 6 px gap draws the list like a form; no day separators, no grouping of consecutive same-author lines. Minor; keep for a later pass.

### 2.3 The composer's inline approval cards and the Outbox window (`card-01` … `card-07`, `win-04-outbox-inline`, `win-05-with-cards`, `outbox-window`)

| | Today | Should be |
|---|---|---|
| 1st | the uppercase state chip (`AWAITING YOUR APPROVAL`, 156 px wide, accent tint) | the proposed text |
| 2nd | the amber identity warning (every card) | the state + the one decision (Approve) |
| 3rd | the text (12 px) | why it waits (one 10 px line) |

- **C1 Composition (§9.2).** The card stacks head (chip · drafted by · date) / where / why / text / policy / identity+warning / honesty / reason(s) / reconcile / receipt / TTL / actions — 8 to 11 lines, each 10 px dim. In `card-04-unknown` the reason appears TWICE (engine sentence in amber + the client's sentence in amber). The Outbox window's five cards repeat the policy line, identity row and warning **5/5/5 times** (measured), so the queue reads as one amber wall. → card = text first (12 px), a meta line (`drafted by you · 09-18 00:45 · waits for your approval: this channel requires review`), the identity row ONLY when `identityWarning.level==='warn'` and then once, the state chip 9 px/700 like the panel's, actions right-aligned with ONE primary. The `unknown` card: one sentence (the client's), the adapter's verbatim in a `<details>`.
- **C2 State chip colour.** failed / rejected / unknown are all `--red`; `unknown` is the one state §9.4 says is *not* a failure. → unknown = amber, rejected = neutral, failed = red.
- **C3 Actions.** Approve is the outlined-accent variant, `Edit…` and `Reject…` the dim outline; the reject box opens a second row with an 11 px input + a second `Reject` button. → primary Approve (accent fill), the reject reason inline in the same row.
- **C4 The inline section head** `OUTBOX — PROPOSALS FOR THIS CONVERSATION` (10 px uppercase) sits inside the message list after a dashed rule; the section can be 744 px tall (`win-05`: five cards) and pushes the newest message off screen. → cap the inline section to the AWAITING cards (+ a "N more in the Outbox" link); history lives in the Outbox window.
- **C5 The Outbox window** is the same list with a 10 px summary line as its whole header (`1 awaiting your approval · 5 proposals`) and no filter. → a toolbar in the house style (`jobs-toolbar`: 8 px 12 px, `--bg-panel`, border-bottom) with the summary and an Awaiting/All toggle.
- **C6 Toast after Propose** prints the reason enum (§1 E) and a second `For you` toast arrives at the same moment; two toasts for one click.

### 2.4 Assign & filter editor (`dialog-assign-default`, `dialog-assign-filter`, `narrow-dialog-assign`)

- **A1 The estimate line is squashed** — `.chan-flow-status { min-height: 1.2em }` inside `.dialog-body { display:flex; flex-direction:column; overflow-y:auto }` (a flex item with an explicit `min-height` may shrink below its content): rect **h = 13 px for 2 lines at 440 px and 3 lines at 375 px** — the text paints over the `Deliver` label (`narrow-dialog-assign`). The estimate is the §7.2 honesty line. → `min-height: auto` (or `flex-shrink: 0`) + a real block.
- **A2 The receipt checkbox** `.chan-opt-check` is a `<label>` → the generic `.dialog-body label` rule makes it `display:flex; flex-direction:column; font-weight 500` (measured `display=flex`, h 46 px): checkbox above a 2-line sentence. → scope the generic rule or give the row `display:flex; flex-direction:row`.
- **A3 Labels and selects have no rhythm.** Labels 11 px dim with `margin: 8px 0 3px` inside a 10 px flex gap → 18 px above a label, 3 px under it, selects 33 px tall; the `Authority` note, the wake-latency note and the pacing label (a 30 px, two-line label) read as body text between fields. → the house form vocabulary (`.dialog-body label` 11/500) for labels, notes as `.usage-note`-class dim lines, the pacing label shortened with its explanation as a note.
- **A4 Rules box** (`.chan-af-rules`, bordered `--bg-secondary`) holds `Match [any rule]`, the rule rows (kind 11 px · input · `Remove`), and the add row (`[kind ▾] [Add rule]`) — the add control is inside the box at the bottom, the same weight as a rule. → add row outside/under the box as a link-button; rule rows as chips with an × when there are >2.
- **A5 The principal picker** shows `Group · T-260918-ops-triage (round-robin over its live sessions)` — the id (product bug, §0) and a parenthetical that belongs in a note.
- **A6 Width** 440 px for a 640 px-tall form (11 fields); the dialog scrolls at 800 px viewport (`body scroll` 594). → 520 px and two-column rows for the short fields (On / Deliver, Authority / Pacing).

### 2.5 Reach & policy editor (`dialog-reach`)

- **R1** The policy select's third option is the adapter's default but the line under it (`Reads as: review (the default: review)…`) repeats the value and spells the mode raw (§1 E); the note is 12 px, the same size as the select.
- **R2** A grant row = `group T-… · [visible] · by assignment · removed with the assignment` — the origin and the "removed with" note are the same 10 px dim, so the ONE fact that matters (who can see it) has no emphasis; `visible` reuses `.chan-chip` in green, which in the panel means *live*.
- **R3** The add-grant row is two full selects + a `Grant` button; the placeholder `Grant reach to…` is the only label. Fine for v1; align it with A3's vocabulary.
- **R4** The dialog is `minWidth: min(560px, 92vw)` while every sibling is 440/460 px — the only 560 px dialog of the family.

### 2.6 Connect wizard: the connect block, the flow dialog, the port-busy refusal (`panel-01b-connect-block`, `panel-04-connect-user-cluster`, `wizard-01-flow`, `wizard-02-port-busy`, `wizard-03-flow-gmail`, `narrow-dialog-flow`)

- **Z1 Three copy paths, one weight.** *none* / *cluster* / *user* are told apart only by a 10 px note above a 10 px button (§10.1 wants the button to SAY it: *Set up … credentials…* vs *Connect …* vs *Provided by the cluster*). The block is at the bottom of the panel, under a second `CONNECT` uppercase head.
- **Z2 The flow dialog's primary action is an `<a class="chan-btn chan-btn-primary">`** at 10 px, `1px 7px` padding, stretched to the full 410 px width by the flex column (`a.chan-btn` measured w 410 × h 18) — the one thing the user must click is the smallest control on the dialog. The intro paragraph (12 px, 3 lines) explains paste-back BEFORE the user has opened anything. → primary button (accent fill, 12 px) "Open the consent page" first; the paste-back section as a collapsed "Didn't come back?" step; the *Waiting for the vendor to redirect back to port 17865…* line as a status with a spinner.
- **Z3 Port-busy refusal is not a refusal visually**: `.chan-flow-refusal.chan-warn` has no rule → body colour `rgb(226,232,240)`, same as the intro (measured). §12.4 calls it a NAMED refusal. → amber (`.usage-warn` semantics) with the two verbs (finish it there / paste back) as the paragraph's only bold words.
- **Z4 The Finish / Cancel row** is under the input with no status area until something happens (`.chan-flow-status` again 1.2em-squashed).
- **Z5 Section-side connect** (`panel-05-lark-not-connected`): `not connected` + `push not started` + `[Connect] [Push…] [Sender line…] [Track…] [Options] [Disable]` — six controls for an adapter that has never connected; only Connect is meaningful. → state-driven verb set: not connected ⇒ Connect + Options + ⋯.

### 2.7 Options / Push / Track dialogs (`dialog-options-lark`, `dialog-options-gmail`, `dialog-push`, `dialog-track`)

- **O1 Track picker rows are centred columns**: `.chan-track-item` is a `<label>` → `.dialog-body label` overrides the grid (measured `display=flex`, 58 px per row, checkbox centred above the title). → scope or `display:grid !important`-free fix (a class on the body: `chan-flow-body` exists already but only the reach dialog uses it).
- **O2 Options/Push** labels 11 px dim, inputs 12 px, help 10 px dim — three greys, no group boundaries; the Push dialog's 5-line help paragraph is the biggest element. → help as a collapsible note; the exclusivity select's option texts shortened (the explanation is the help).
- **O3 Dialog widths** 440 px default (`.dialog`), 460 px for these three by `max-width` (a max on a 440 px width does nothing — measured 440); the reach dialog 560. → one width token for the family.

### 2.8 ⚙ → Integrations (`integ-01-window`, `integ-02-card-*`, `integ-03-test-passed`, `integ-04-test-failed-own-key`, `integ-06-editing-secret`)

This is the one surface already in a house language (`plugin-card`), and it reads as such; the defects are content and rhythm, not structure.

| | Today | Should be |
|---|---|---|
| 1st | the callback URL box (accent-tinted `integ-setup`, 125 px tall) | the row name + source chip + whether it is ready (a state word) |
| 2nd | the row name + source chip | the setup block (§14.5 says ABOVE the fields, and it is — but it should not out-weigh the name) |
| 3rd | radios / fields / test / used-by / docs (six 10–11 px lines, three greys) | one Test verdict line and the fields |

- **I1 Developer text on a user card**: `Used by: src/channels/fake.js`, `Docs: docs/design-communication-panel.zh.md`, `Not wired until agent-browser v2 (src/server/browser-backend.js, …)`, `There is no console for the fake adapter. This line exists so the setup block is exercised end to end.` — source paths and test-fixture prose (§1 R). → `consumers` becomes a human phrase per row (*Used by the Lark channel*), `docs` a link with a label, the fake row's copy rewritten as a user would read it (it ships).
- **I2 Verdict layout**: `Failed` (11/600 red) then ` · just now` on its own line (the result box is `flex-direction: column`), then the error, then the italic caveat — four lines for one verdict. → one line `Failed · just now — <error>` + the caveat.
- **I3 The undecryptable row** (`integ-02-card-gmail` after the key rotation) prints two amber paragraphs of server English (§1 S) above a `Not configured` chip that contradicts them (the values exist, they cannot be read). → a state chip `Cannot be decrypted` + one sentence + the remedy verb.
- **I4 Help under every field** (10 px dim, 1–2 lines each) doubles the card height; the TRIM_NOTE is appended to every help. → help as a `title`/info affordance; the trim note once per card or nowhere.
- **I5 The intro line** (`Your own key wins over the cluster default. Secrets are never shown again after saving — only replaced.`) is the window's whole toolbar (`jobs-toolbar` reused). Good pattern; the sentence is fine.
- **I6 Chips**: source chip 9 px/700 with three colours (green own / accent cluster / dim none) — consistent with the panel's pills, and therefore inherits D4's colour overload once the panel changes; keep them in sync.

### 2.9 375 × 667 (`zh-mobile-*`, `en-mobile-*`, and the desktop-at-375 `narrow-*` shots)

- **M1 No entry point.** `isMobile` skips the rail; `focusChannelsPanel` returns false without a rail; the ⚙ `Channels…` row has `when: rail exists`. The feature is unreachable on a phone except through a restored window or the Outbox ⚙ row. (openIssue — a product gap, not a polish item.)
- **M2 Dialogs at 375** (desktop app narrowed): the assign editor's A1 overlap, the flow dialog's full-width 10 px link; widths are `92vw`-ish by the base `.dialog` rule, fine.
- **M3 Windows at 375** are full-screen and read well; the composer takes 1/5 of the height with its placeholder paragraph (W1).
- **M4 The context bar's verbs wrap at 375** (`ja-mobile-dark-win-05-with-cards`): `割り当て…` and `閲覧権とポリシー…` become two-line 10 px buttons 60 px wide, and the assignment sentence beside them is cut to `未割り当て — この会話では誰も起こさ…`; in the inline outbox the three decision buttons (`編集版を承認 · 編集… · 却下…`) fill the card's whole width. The `⋯` menu of W2 solves both.

### 2.10 Dark vs light

See §3.4 (filled from the `en-desktop-light` pass). The colour findings that hold in both themes: D4 (meaning ≠ colour), C2 (unknown = red), and every amber-on-tint pill.

---

## 3. Measured facts (from the run's JSON; `en-desktop-dark` unless stated)

### 3.1 Type and tokens

| Element | size / weight | padding · radius · other |
|---|---|---|
| `.sidebar-title` (Channels) | 14 / 600 | — |
| `.chan-summary` | 11 / 400 dim | 2 lines at 172 px |
| `.chan-sec-head` / `b` / `.chan-sec-state` | 10 / 400 · 10 / 700 · 10 / 400 | uppercase, letter-spacing .6px, ALL three (the state word too) |
| `.chan-auth` | 11 / 400 | nowrap + ellipsis |
| `.chan-push`, `.chan-connect-note`, `.chan-row-sub` | 10 / 400 dim | — |
| `.chan-btn` | **10 / 400** | `1px 7px`, r 4, bg transparent (`--bg-secondary` resolves transparent here), border `--border`; `-primary` = accent text + accent border, no fill |
| `.chan-row` / `-title` | 41 px tall / 12 px title | title w 75 px of 160 at 260 px |
| `.chan-chip` / `.chan-unread` / `.chan-awaiting` / `.chan-untracked` | 9/700 · 10/700 · 9/700 · 9/400 | 58 · 16 · 66 · 48 px wide, all `flex-shrink:0` |
| `.chanwin-bar b` / `.chanwin-meta` / `.chanwin-assign` | 13/700 · 10 · 10 | bar 73 px tall |
| `.chanmsg-head b` / `.chanmsg-at` / `.chanmsg-body` | 11/700 · 10 · 12 | 40 px per message |
| `.chanwin-composer textarea` | **13.33 / UA monospace** | no `font` rule; 48 px min-height |
| `.chanwin-note` / `.chanwin-warn` | 10 / 10 amber | — |
| `.chan-prop` | card 158 px (awaiting), 109 (sent), 207 (unknown) | `8px 10px`, r 8, `--bg-secondary` |
| `.chan-prop-state` | 10 / 700 uppercase | pill, 156 px wide for AWAITING YOUR APPROVAL |
| `.chan-prop-text` / `-policy` / `-identity` / `-idwarn` / `-ttl` | 12 · 10 · 10 · 10 amber · 10 | — |
| card `.chan-btn` (Approve) | 11 | `3px 10px`, outlined accent |
| `.dialog` | 440 × up to 640 | r 12 (base), header h3 14/600, body pad 14, gap 10 |
| `.chan-opt-label` / `.chan-opt-input` / `.chan-flow-note` | 11 dim · 12 (33 px tall) · 12 | label margin `8px 0 3px` inside the 10 px gap |
| `.chan-flow-status` | 11 | **h 13 px** while holding 2–3 lines |
| `.chan-opt-check`, `.chan-track-item` | 11 / 500 | **display flex, column** (inherited from `.dialog-body label`) |
| `a.chan-btn-primary` (Open the consent page) | 10 | **410 × 18 px** — full-width, 18 px tall |
| `.chan-flow-refusal` | 12 | colour rgb(226,232,240) = body (no amber rule) |
| `.integ-card` | 12 body | `10px 12px`, r 8, heights 265–331 px |
| `.plugin-name` / `.integ-chip` | 13/600 · 9/700 | chip r 999 |
| `.integ-setup` | accent 6 % tint + 25 % border | 125 px tall for the Lark row |
| `.integ-cb-url` / `.integ-copy` / `.integ-test` | 11 mono · 11 · 11 | `mounts-btn` family (3px 9px) — a second button language in the same feature |
| `.plugin-cfg-label` / `.plugin-detail` / `.integ-caveat` / `.integ-used` | 10 · 10 · 10 italic · 10 | three greys: 148,163,184 / 136,144,168 |
| `.context-menu` (row menu) | items 11 px, 40 px tall | house menu, fine |

### 3.2 Panel geometry (controls vs rows; truncation)

| Shot | sidebar → content width | per section: controls h / rows h / buttons | titles truncated |
|---|---|---|---|
| `panel-02-tracked` | 260 → 172 px | fake-poll 81/82/3 · fake-push 75/82/3 · fake-scan 81/82/3 · Agents 81/0/3 | 4 / 6 (widths 75, 75, 38, 75, 44, 28) |
| `panel-11-B-full` (Lark expired + Gmail) | 260 → 172 px | fake-poll 169/96/3 · Lark 141/0/7 · Gmail 155/0/6 (+ the three above) = 702 px controls vs 274 px rows | 4 / 6 (23 … 96) |
| `panel-09-wide-500` | 500 → 412 px | fake-poll 91/96 (identityObserved paragraph 4 lines) · Lark 83/0/6 · Gmail 83/0/7 | 0 / 6 |
| `panel-09-narrow-200` | 200 → 112 px | fake-poll **247**/96 · Gmail **249**/0/7 · Lark 185/0/6 | **6 / 6 (0, 36, 0, 36, 0, 0)** |

Row 0 chips at 260 px: freshness 58 px + unread 16 px (tracked); freshness 59 + awaiting 66 (assigned, `panel-08-assigned-row`: title = "O…").

### 3.3 Windows, cards, dialogs

- Conversation window 520 × 560: 9 messages + 5 inline cards ⇒ list scroll height 561 px of which the inline outbox section is **744 px** (`win-05-with-cards`); the newest message is above the fold.
- Outbox window 560 × 600: 5 cards, `chan-prop-policy` × 5, `chan-prop-identity` × 5, `chan-prop-idwarn` × 5; list scroll 601 / client 598.
- Dialog sizes: flow 440 × 352 · track 440 × 231 · options(gmail) 440 × 466 · push 440 × 310 · assign 440 × 640 (body scrolls at 800 px) · reach **560** × 366 · at 375 px: assign 356 × 567, flow 356 × 352.
- `dialog-assign-filter`: `.chan-flow-status` rect (395 × **13**) holds "~0/day would wake (of ~8.3/day) · only 0.12 days of history are stored — the rate is over that span" (2 lines at 11 px ≈ 30 px) — the `Deliver` label starts 1 px under it; at 375 px the third line (`… when set; actually 0/day since (7-day measurement)`) is painted over by the label (`narrow-dialog-assign`).
- Integrations window 720 × 560: four cards 300 + 331 + 316 + 265 px; body scroll 561 / client 558 — two cards per screen.

### 3.4 Light theme (`en-desktop-light-*`, computed colours from the JSON; contrast = WCAG ratio of the text colour over the surface it sits on — the sidebar `rgb(245,245,250)` / the dialog `rgb(255,255,255)` in light, `rgb(14,14,30)` / `rgb(26,26,48)` in dark)

The structure reads the same in light (every §2 finding holds); what changes is which pills stop being legible.

| Element | dark: colour · contrast | light: colour · contrast | Verdict |
|---|---|---|---|
| amber text — `chan-awaiting` pill, `chan-chip-scan`, `.chan-auth.chan-warn` (*needs re-authorization*), `.chan-flow-refusal` if it ever got its rule, `chanwin-warn`, `chan-prop-idwarn` | `rgb(245,158,11)` · 7.0–8.9 : 1 | **`rgb(245,158,11)` (not theme-adapted) · 1.8–2.0 : 1** | fails AA (4.5) and AA-large (3.0) in light — every amber sentence and pill in the feature |
| `chan-unread` count (`color: var(--bg)` on `--accent`) | `rgb(226,232,240)` on `rgb(45,212,191)` · **1.5 : 1** | `rgb(30,41,59)` on `rgb(15,118,110)` · 2.7 : 1 | fails in BOTH themes — §17: text on an accent fill is `--accent-fg`, never `--bg` |
| `chan-chip-within` (blue pill: *within 5m* AND *not polling*) | `rgb(59,130,246)` on its 13 % tint · 4.5 : 1 | same blue · **2.9 : 1** | fails AA in light |
| `chan-prop-state-unknown/-failed/-rejected` (red pill) | `rgb(239,68,68)` · 5.1 : 1 | same · 5.1 : 1 | passes; but one colour for three meanings (C2) |
| `integ-chip-cluster` (accent pill) | `rgb(45,212,191)` · 6.9 : 1 | `rgb(15,118,110)` · 4.5 : 1 | passes (just) |
| dim meta — `.chan-sec-state`, `.chan-row-sub`, `.chan-push`, `.chan-untracked`, `.chan-flow-label`, `.integ-caveat` (10–11 px) | `rgb(136,144,168)` · 5.4–6.0 : 1 | `rgb(107,114,128)` · 4.45–4.8 : 1 | borderline at 10 px (AA wants 4.5 for text under 18 px) — the feature's most-used colour is its least legible one, in both themes |
| secondary — `.chan-auth`, `.chan-btn`, `.chan-flow-intro`, `.integ-prereq` | `rgb(148,163,184)` · 6.6–7.4 : 1 | `rgb(71,85,105)` · 7.0–7.6 : 1 | passes |

Root cause of the amber row: `--yellow` is used raw (`color: var(--yellow, #e5c07b)`) for TEXT on both themes while the theme only adapts `--text-*`; the light theme needs an amber text token (or `color-mix` toward `--text` for text, keeping the raw hue for the tint). Root cause of the unread row: 3766 `.chan-unread { color: var(--bg) }`.

### 3.5 CSS root causes (public/style.css, line refs at 8dc52aea)

- 1442 `.dialog-body { display:flex; flex-direction:column; gap:10px; overflow-y:auto }` + 1443 `.dialog-body label { display:flex; flex-direction:column; … }` — overrides `.chan-track-item` (grid, 3799) and `.chan-opt-check` (row, 3902); squashes 3797 `.chan-flow-status { min-height: 1.2em }`.
- 3781 `.chan-btn { font-size:10px; padding:1px 7px; background: var(--bg-secondary) }` and 3784 `.chan-btn-primary { border-color: var(--accent); color: var(--accent) }` vs §17's primary/secondary spec.
- 3755 `.chan-sec-head { text-transform: uppercase }` applies to the `b` AND the state span (§17: children keep their casing).
- 3766–3771 / 3855 the pill palette: `--accent` unread, `--yellow` awaiting AND scan, `--blue` within AND not-polling (the `off` state reuses `chan-chip-within`), `--green` live.
- 3792 `.chan-flow-refusal` has no `.chan-warn` colour rule (3775 lists auth/auth-err/connect-note only).
- 3830 `.chanwin-composer textarea { width; min-height; resize; border-radius }` — no `font`.
- 3790 `.dialog.chan-flow, .chan-track, .chan-options { max-width: 460px }` on a `width: 440px` base (no effect); 3806 `.chan-assign { max-width: 560px }` likewise; the reach dialog sets `minWidth` inline.
- 3876 `.chan-prop-state-failed, -rejected, -unknown { color: var(--red) }` — one colour for three meanings.

---

## 4. What a2 / a3 should build (the recommended option, taken)

1. **Panel = a list.** Section head: name (12/600, sentence case) + ONE state chip + `⋯` menu (all adapter verbs, state-driven set) — the status sentence only when not connected, as the head's second line. Rows title-first (`min-width: 0` on the chips' side, title `flex: 1 1 auto` with a real min), unread as a leading count, awaiting folded into it with the accent, ONE freshness pill (neutral dim; `live` accent), untracked = dim title, no pill. Connect block first on a fresh instance. `.empty-hint` for empties. The `chan-btn` family re-based on the house secondary/primary spec.
2. **Card = text, meta, decision.** Order text → meta line → (identity warning only when warn, once) → actions; state chip 9 px; unknown amber / rejected neutral / failed red; inline section = awaiting only + a link to the Outbox; the Outbox window gets a `jobs-toolbar` header with Awaiting/All.
3. **Composer** = `font: inherit; 12 px`, short placeholder, one policy note, no standing identity warning; footer copy per case (untracked / read-only).
4. **Dialogs** = one width token (480), the generic `label` rule scoped (`.dialog-body > label` or a `chan-form` body class that resets it), `.chan-flow-status { min-height:auto; flex-shrink:0 }`, labels/notes on the house form vocabulary, the wizard's primary as a real primary button + the paste-back as a collapsed step + amber refusal.
5. **i18n** per §1's fix classes: codes cross the wire, the client words them; adapter OPTIONS and the registry declare keys the dictionaries know (extractor census over `src/channels/*.js` and `src/integration-registry.js`); the 42 zh + 19 ja entries that keep English nouns re-worded; the one missing key + three window-type labels.
6. **Integrations** = developer paths off the card, verdict on one line, the undecryptable state as a chip + one sentence, help behind an info affordance.

Gates that must stay green while doing it: scripts/test-channels-e2e.mjs (it reads `.chan-row`, `.chan-chip`, `.chan-tracked`, `.chan-unread`, `.chan-awaiting`, `[data-outbox-button]`, `.chan-prop-*`, `.chanwin-*`, `[data-honesty-line]`, `.chan-adapter-ctl` — every class that moves needs the suite moved with it), scripts/test-integrations-ui.mjs (`.integ-*`, `.plugin-*`, `.mounts-btn-primary`), and this driver re-run for the before/after diff.
