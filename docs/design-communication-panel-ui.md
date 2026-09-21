# Communication panel — the UI design (a2: three directions, one chosen)

Owner, 2026-09-17, after 2.369.106: *"界面很乱，没有层次，你需要用前端技能+实际渲染截图好好设计优化一下"*. This is the second chunk of the polish: **no product change**. Three genuinely different design directions for the three most-seen surfaces — the Channels rail panel, the conversation window with an inline approval card, and the Outbox window — were built as real HTML/CSS on top of the product's own stylesheets (`public/style.css` + `viewers.css` + `chat.css` + `fonts.css`) under the product's own class names, rendered in headless chrome at 1200×800 (rail at its 260 px default → 203 px of panel content; the conversation window 504 px beside a 392 px Outbox) and 375×667, dark and light, in zh, measured, and judged against a written rubric. The chosen direction is specified in §4 for a3 to build; the a1 audit (`docs/design-communication-panel-polish-audit.md`) is the defect list every decision below answers.

**Reproduce:** `node scripts/dbg-comm-directions.mjs` (a static server over this checkout's `public/` + the mockups; chrome over raw CDP; per-pid scratch; zero vendor calls; `VS_UI_SHOTS_DIR`, `VS_UI_DIRS=a,b,c`, `VS_UI_THEMES=dark,light`, `VS_UI_ONLY=<substring>`). Output = 48 PNGs + 48 JSONs (`<dir>-<theme>-desktop-all|panel|window|outbox|empty`, `<dir>-<theme>-mobile-panel|window|outbox`) + `index.json`. The run this document cites is in **`/tmp/vs-comm-directions-a2`** (PNGs are never committed). The mockups themselves are committed: `docs/design-mockups/communication-panel/` — `direction-a|b|c.html` (shells), `directions.js` (ONE zh fixture + the rail/sidebar/window frame + three renderers, DOM built with `createElement` exactly as the product does), `direction-a|b|c.css` (the proposed rules — each file IS a candidate token map, liftable into `style.css`), `frame.css` (mock-only frame + the 375 px single-surface switch). Open `direction-a.html?view=all|panel|window|outbox|empty&theme=dark|light` behind any static server rooted at `public/`.

Fixture: 3 adapters (飞书 connected as Member A on a live push lane · Gmail with an expired token and 3 failed passes · the built-in Agents), 12 conversations (9 tracked; one with 7 unread + 1 proposal awaiting; one whose last wake was held; two untracked; one deliberately over-long title), 8 messages with two consecutive-author runs, 5 proposals (awaiting / sent / unknown / failed / rejected). Neutral labels only, relative ages, no calendar date.

---

## 1. The three directions

Each direction is a different HOUSE IDIOM applied whole — five shades of one aesthetic would have been no choice (the design kit's rule for direction sketches). Each states its hierarchy in the order the eye is meant to land, its scale on the §17 tokens, its empty states, and where its icons go.

### A — 列表优先 (the Folders / Tasks idiom)
*Motivation:* a channel panel is a list of conversations, and the app already has a list-of-things vocabulary the user reads all day — the Sessions list (`folder-header` groups + bordered `session-item-card` rows + 9 px badge pills). *Tradeoff:* bordered rows cost ~16 px per row over plain lines (10 of 12 rows fit at 800 px, not 12).

- **Hierarchy:** bar (`12 个会话 · 已跟踪 9 个` 11 dim + **发件箱** secondary button carrying an accent count) → adapter = a collapsible `folder-header` row (chevron 10 · kind icon 13 · name 11/600 sentence-case · **6 px state dot** · `4/6` tracked/total 10 dim · ⋯ 20 px icon-btn) → a second line ONLY when not connected (10 px `--warn-text` + alert icon + the verb `重新授权`) → rows on a fixed grid: line 1 = **title 12 (flex 1, min 60 px) + ONE freshness pill**; line 2 = participants 10 dim (flex 1) + the needs-you badges right-aligned (**awaiting** accent-outline pill with a check icon, **unread** accent-filled count); line 3 only when assigned (`→ 运维分诊 · 已过滤 · 草稿权` 10 secondary, `--warn-text` when the last wake was held). Untracked = title in `--text-secondary`, line 2 ends in a 9 px dim `未跟踪`, no pill.
- **Card:** head (state pill 9/700 · drafter 10 dim · age right) → text 12 → **one meta line** 10 dim (`缘由: 告警 #4127` link · `需要审批: 这个频道要求审批` · `将以 Member A 的身份发送` · `24 小时后过期`) → identity warning ONLY when `identityWarning.level==='warn'`, once, 10 px `--warn-text` with the alert icon → actions right-aligned: `拒绝…` `编辑…` secondary + **批准** primary (accent fill, `--accent-fg`). Outbox cards add a `飞书 · 运维值班群` link line under the head.
- **Window:** bar = title 13/600 + ⋯ · meta 11 dim (`飞书 · Member A, Member B, Member C · 5m以内`) · assignment as an accent-tint chip · day separator `今天` · messages 11/600 author + 10 dim time, body 12, consecutive same-author lines grouped (no head) · the inline section = **awaiting cards only** under `待你审批 · 1` with `发件箱里还有 4 条` · composer `font: inherit; 12 px; 40 px`, placeholder `写一条回复…`, one 10 px policy note + **提议** primary.
- **Outbox:** `jobs-toolbar` (summary 11 + a two-button segment 待审批 | 全部) → `待审批 · 1` / `历史 · 4` section labels (10/700 uppercase-style dim) → cards.
- **Empty states:** panel `.empty-hint` "连接一个频道并跟踪会话后，新消息会列在这里。" + a `连接` section of full-width `mounts-btn` rows (kind icon + `连接飞书`, note `由集群提供` under it; `设置 Gmail 凭据…`, note `需要你自己的 OAuth client`); section `.empty-hint.empty-hint-inline` "还没有发现会话。"; untracked window = list hint + footer `未跟踪 —— 跟踪后才会抓取这个会话的消息。` + `跟踪这个会话`; Outbox = centred `.empty-hint`.
- **Icons:** kind icon on the section head (chat / mail / robot, 13 px stroke), chevron, ⋯, the check inside the awaiting pill (9 px), the alert glyph before every warning sentence, the pencil nowhere (edit is a button). No icon on the Outbox button (text + count; the icon cost 17 px of summary at 203 px).

### B — 分诊看板 (the Background Work idiom)
*Motivation:* the channel row is a triage decision — does this need me? — and Background Work already solved "which of these needs me" with a 3 px severity edge + a chip line. *Tradeoff:* every row is a 2–3 line card (avg 55 px vs A's 48 / C's 27), and the idiom's own habits are the a1 defects D5 (uppercase heads) and D9 (an outlined "primary").

- **Hierarchy:** `jobs-rail-bar` (`1 待批 · 13 未读 · 已跟踪 9/12` + `发件箱 1` jobs-btn) → adapter = `jobs-sec-head` (10 px uppercase, kind icon, `4/6`, a bordered state chip `已连接` / `需重新授权`, ⋯) → rows = `jobs-card` with the edge coloured by ONE thing (accent = needs you, amber = a held wake, hairline = idle or untracked); l1 = title 12/600 + a state word right (`7 未读` accent / `已读` dim / `未跟踪`); l2 = the monospace bordered chips (`live` green-bordered, `5m以内`, `1 待批` accent, `→ 运维分诊` assignment) + participants as `jobs-ctx`.
- **Card:** the same card with the edge by state; l1 = 6 px dot + state word 11/600 + drafter/where dim + age; text; l2 = chips (`缘由 告警 #4127`, `需要审批 · 频道策略`, `以 Member A 发送`, `24 小时后过期`); warning; actions in the `jobs-btn` family (批准 = outlined accent).
- **Window:** the bar is a `jobs-toolbar` (title 12/600 · `飞书` chip · `live` chip · participants · ⋯); messages as a **monospace time column** ledger (`10:02  Member B 部署完成…`, 17 px per line); inline head as a `jobs-sec-head`.
- **Outbox:** grouped by STATE with a dot per head (待审批 · 结果未知 · 已发送 · 失败 · 已拒绝) — the one element the chosen direction borrows.
- **Empty states / icons:** `jobs-empty` copy; a `+ 连接` head with `jobs-btn` connect rows; icons as A plus the 6 px state dots.

### C — 安静账本 (the Remote idiom)
*Motivation:* the Remote panel is the calmest surface in the app — section title + subtitle, bordered rows with an 8 px dot and one bordered badge, dim second lines — and weight/dots can carry meaning without a single pill. *Tradeoff:* with no chip vocabulary the needs-you signal is a bold number and a 6 px dot; the meta cluster (`1 待批 · 7 · live`) eats the title (66 px minimum at 203 px).

- **Hierarchy:** a full-width `发件箱 · 1 条等你审批` button → `会话` title + `12 个 · 已跟踪 9 个` subtitle → adapter = a `mounts-row` card (8 px dot · name 12/600 · lane badge `推送在线` · refresh + ⋯ icon-buttons) with the status as a dim second line (`已连接为 Member A · 2 天后重新授权` / amber `需要重新授权 —— 令牌已过期 · 连续 3 次失败`) → its conversations as **indented children** (2 px accent-tint left rule): title 12 (600 when unread) + right-aligned meta `1 待批` accent · `7` bold accent · `live` green / `5m` dim; untracked = dim title + `未跟踪`.
- **Card:** hairline-separated blocks: 6 px dot + state word 11/600 + drafter · where · age; body indented 12 px; one dim meta line; actions right.
- **Window:** as A; the assignment line with a pencil icon-button. **Outbox:** a ledger with `今天` / `昨天` group labels.
- **Empty states / icons:** `mounts-empty` paragraph + full-width connect buttons + a `mounts-note`; icons = dots, the lane badge, refresh/⋯ icon-buttons.

---

## 2. The rubric and the scores

Every score has its number in the run's JSON (`<dir>-dark-desktop-all.json` unless noted). 5 = nothing to fix, 3 = works with a visible cost, 1 = fails the criterion.

| Criterion | What was measured | A | B | C |
|---|---|---|---|---|
| **Hierarchy at a 2-second glance** — the first read is the conversations that need me; the adapter is a quiet divider; controls are on demand | controls-vs-rows share of the panel (a1: 47 % / 59 %): A 25 %, B 18 %, C 35 %; where the accent lands (A: unread/awaiting badges only; B: the edge + state word + section chip; C: a bold number + 6 px dot); one head line per adapter (A/C yes; B's uppercase head + chip competes) | **5** | 4 | 3 |
| **Scan-ability of a 12-row list** | rows visible at 800 px: A 10, B 9, C 12; row height avg A 48 / B 55 / C 27; title width min/median at 203 px: A 108/129, B 122/124, C **66**/112; truncated titles: A 2 (one is the deliberate over-long fixture), B 1, C 2 (both real); lines per row: A 2–3, B 2–3, C 1–2 | 4 | 3 | 3 |
| **Chip legibility** — one colour per meaning, ≥ AA in both themes, readable at 9–10 px | min contrast of the meaning-coloured chips: A dark 5.12 / light 4.63; B dark 6.56 / light 4.55 (its dim bordered chips 4.43 dark = house `jobs-chip`); C has no chips — unread is a bare 11/700 number, freshness a 10 px dim word, awaiting a 10 px word (light 4.72) | **5** | 4 | 2 |
| **Mobile survival at 375** (`<dir>-dark-mobile-*.json`) | rows visible: A 7, B 7, C 10; row hit height: A 51–69, B 54–59, C **30–45**; buttons ≥ 36 px on all three; inline card 173 / 184 / 160; composer share 16 %; titles never truncated at 362 px | **5** | 4 | 4 |
| **Consistency with Folders / Tasks / Background Work** | A = the Sessions list literally (`folder-header` + `session-item-card` + badge pills) and reuses `mounts-btn`, `jobs-toolbar`, `.empty-hint`; B = Background Work literally, but a conversation list that looks like the jobs list is a second jobs panel; C = the Remote panel literally, but conversations-as-children-of-a-card exists nowhere else in the app | **5** | 4 | 4 |
| **Token compliance (§17)** | radii `--radius-sm` rows / `--radius` cards / 999 pills; integer type 9–13; primary = accent fill + `--accent-fg` (A, C) vs the outlined `jobs-btn` (B — a1 D9); sentence-case names (A, C) vs `text-transform: uppercase` on the adapter name (B — a1 D5); `.empty-hint`; theme vars only (all three); the design's "ONE freshness pill" contract (§10): A yes, B yes (a chip), C no | **5** | 3 | 4 |
| **Total** | | **29** | 22 | 20 |

**Verdict: Direction A**, taking two elements from the others:

1. from **B** — the Outbox's `全部` view is grouped by STATE with a 6 px dot per head (待审批 · 结果未知 · 失败 · 已发送 · 已拒绝) instead of A's `历史` bucket, so an `unknown` outcome (the one state §9.4 says is NOT a failure) is never buried under sent ones;
2. from **C** — the adapter head gets its dim 10 px status line when it has something to say beyond "connected": `已连接为 Member A · 2 天后重新授权` when a re-authorization is due within 7 days, the amber sentence + verb when not connected, nothing otherwise (a1's rule "the status sentence only when it is not connected", widened by the one number a user acts on early).

Not borrowed, and why: B's severity edge on rows (a second colour carrier beside the badges — two ways to say "needs you" is the D4 class), B's monospace time column (denser but the CJK author names lose the 11/600 head that makes a run scannable), C's full-width Outbox button (costs a row of the list on every open), C's day-grouped Outbox (the state is the decision, the day is not).

---

## 3. Before → after (the a1 defects this direction answers)

| a1 finding | shipped (a1 measurement) | direction A (this run) |
|---|---|---|
| D1/D2 controls above content, per section | 47 % of the panel at 260 px, 59 % with two real adapters; 3–7 buttons per section | 25 % (one head line + one note line for the one adapter that needs it); all verbs in ⋯ |
| D3 four claims per row, `flex-shrink: 0` | title 75 px at 260 px, **0 px** on four rows at 200 px | title min 108 / median 129 px at 203 px; chips leave line 1 (one pill) and sit on line 2 right |
| D4 chip colour ≠ meaning | yellow = scan lane AND approval; blue = fresh AND not polling | one colour per meaning (§4.3): accent = needs you, green = live, neutral = an age, amber = a warning, red = failed |
| D5 uppercase on the name + a raw lane code | `SCAN · NO-STORE-ON-PLATFORM` | sentence-case name, a dot, `4/6`; the lane is a tooltip on the dot (a3) |
| D6 status sentences truncated | `needs re-authorization (toke…` | the note wraps (10 px, `flex-wrap`) and carries its verb |
| D7 connect block last | a second uppercase head at the bottom | the ONLY section on a fresh instance, `mounts-btn` rows with the note under each |
| D9 a third button language at 10 px | `chan-btn` 10 px `1px 7px`, outlined "primary" | `mounts-btn` secondary + `mounts-btn-primary` (accent fill) everywhere; 11 px / 3×9 |
| D11 `.chan-empty` | 11 px dim, left | `.empty-hint` / `.empty-hint-inline` |
| W1 UA monospace composer, 2-line placeholder, standing identity warning | 13.33 px monospace, 48 px, warning on every open | `font: inherit` 12 px, 40 px, `写一条回复…`, one policy note; the warning lives on the card |
| W2 three tiers in the bar, verbs at title weight | 73 px bar, two 10 px buttons | 76 px bar: title 13/600 + ⋯, meta 11 dim, one assignment chip |
| C1 8–11 lines per card, reason twice, 5/5/5 repeats in the Outbox | awaiting card 158 px, unknown 207 px; policy + identity + warning on all 5 | 5 lines (head / text / meta / warning-when-warn / actions); the identity warning appears **once** in the whole Outbox (the awaiting card of the `unknown`-identity channel); cards 182 / 96 / 163 / 117 / 117 px |
| C2 unknown = red | failed / rejected / unknown all `--red` | unknown = amber pill, rejected = neutral pill, failed = red pill |
| C4 the inline section pushes the newest message off screen | 744 px section, newest above the fold | awaiting cards only (144 px) + a link to the rest; `newestVisible: true` at 560 px and at 375×667 |
| C5 the Outbox header is a 10 px line | no filter | `jobs-toolbar` + 待审批 \| 全部 |
| §3.4 amber / green / accent-on-tint text fail AA in light | 1.8–2.9 : 1 | ≥ 4.55 : 1 in light, ≥ 5.1 in dark (§4.4's text tokens) |

---

## 4. The chosen direction — specification for a3

### 4.1 Screenshot facts (A, `/tmp/vs-comm-directions-a2/a-*.png`, numbers from the JSON beside each)

- **Panel, 1200×800, 260 px sidebar → 203 px content:** bar 25 px (summary 11 dim + `发件箱` 11 px secondary with a 15 px accent count); section head 24 px; the Gmail note 2 lines (10 px, wraps) + `重新授权` verb; rows 45 px (2 lines) / 63 px (3 lines with an assignment), avg 48; 10 rows in the first 800 px; title widths 108–158 px (median 129); pills 9/600 `live` 32 px wide, `30s以内` 48 px; unread count 16×15 px; awaiting pill 30×15 px. Controls 25 % of the panel's height.
- **Panel, 375×667:** 362 px content; rows 51–69 px (8×10 padding under 480 px); 7 rows in view; no title truncated; badges at the line-2 right edge.
- **Window, 504×560:** bar 76 px (title row 22, meta 16, chip 16); messages 33 px per head+body, 17 px per grouped continuation; day separator 14 px; inline section head 14 px + the awaiting card 144 px; composer 40 px textarea + 24 px row, foot 17 % of the window; buttons 53×24 / 42×24. At 375×667 the app hides the titlebar (style.css 1896–1898) — the in-window bar is the title; card 173 px; buttons 62×36 / 50×36; foot 16 %.
- **Outbox, 392×600:** toolbar 39 px; cards 182 (awaiting) / 96 (sent) / 163 (unknown, with its reason + 检查结果) / 117 / 117 px; 3 cards in view; exactly ONE identity warning in the list. At 375×667: 194 / 114 / 175 / 117 / 117, 3 in view.
- **Light theme:** every meaning-coloured text ≥ 4.55 : 1 (unread `--accent-fg` on `--accent` 4.8; the warn note 4.87; live pill 4.63; awaiting pill 4.9); the only sub-AA colour is the house `--text-dim` (#6b7280 on the sidebar, 4.45 at 9–10 px) — a theme token, not this feature's (§6).

### 4.2 Component inventory (class names = the ones the gates read; new ones marked ★)

| Surface | Element | Class | Notes |
|---|---|---|---|
| panel | bar | ★`.chan-bar` › `.chan-summary` + `.chan-outbox-btn.mounts-btn[data-outbox-button]` › ★`.chan-outbox-count` | `.chan-outbox-attn` when awaiting > 0 (accent border + text) |
| panel | adapter head | `.chan-sec` › `.chan-sec-head.folder-header` › chevron · kind icon · ★`.chan-sec-name` · ★`.chan-dot.chan-dot-ok\|-warn\|-idle` · ★`.chan-sec-count` · ★`.chan-sec-more.icon-btn` | replaces `.chan-adapter-ctl` + `.chan-actions`; every adapter verb (Track… / Options / Push… / Sender line ☑ / Re-authorize / Disconnect / Disable) moves into the ⋯ menu as a `channel-adapter` contribution menu |
| panel | status line | ★`.chan-sec-note[.chan-warn]` › alert icon + sentence + ★`.chan-sec-verb.mounts-btn` | only when not connected, or a re-auth is due within 7 d (borrowed from C) |
| panel | row | `.chan-row.session-item-card[.chan-tracked]` › `.chan-row-line` (`.chan-row-title`, `.chan-chip[.chan-chip-live]`) · `.chan-row-sub` (★`.chan-row-who`, `.chan-untracked` \| `.chan-awaiting` + `.chan-unread`) · `.chan-row-assign[.chan-warn]` | `chan-chip-within` / `chan-chip-scan` retire (one neutral pill for every age, `-live` for a live lane) |
| panel | fresh instance | `.empty-hint` + `.chan-sec.chan-connect` › head + ★`.chan-connect-btn.mounts-btn` + ★`.chan-connect-note` | one button per connectable kind; the note under it words the credential path (§10.1's three copy paths) |
| window | bar | `.chanwin-bar` › ★`.chanwin-title-row` (b + `.icon-btn` ⋯) · `.chanwin-meta` · ★`.chan-assign-chip` | Assign… / Reach & policy… / Track / Mark read live in the ⋯ menu (the existing `channel-row` menu, same ctx) |
| window | list | `.chanwin-list` › ★`.chanmsg-day` · `.chanmsg[.chanmsg-cont][.chanmsg-agent]` › `.chanmsg-head` (b, `.chanmsg-at`) + `.chanmsg-body` · `.chanwin-outbox` › `.chanwin-outbox-head` + `.chan-prop-link` + cards | `.chanmsg-cont` = same author within 5 min: no head, −3 px; `.chanmsg-agent` colours the author `--attn-text`; the inline `.chanwin-outbox` section (a4 rule, recorded r4) = the cards that NEED the user — awaiting, then an unknown / failed outcome — plus the newest TWO decided ones, the rest behind "{n} more in the Outbox": the outcome of a click stays in view where it was clicked, and a1 C4's 744 px section that held every card is gone (test-channels-e2e ⑤ reads the sent card in the Outbox window) |
| window | foot | `.chanwin-foot` › `.chanwin-composer` (textarea + `.chanwin-composer-row` › `.chanwin-note` + `.mounts-btn.mounts-btn-primary[data-channel-propose]`) \| `.chanwin-readonly` › span + `.mounts-btn` | the identity warning is NOT here (card only) |
| card | | `.chan-prop.chan-prop-<state>` › `.chan-prop-head` (`.chan-prop-state.chan-prop-state-<state>`, `.chan-prop-who`, `.chan-prop-when`) · `.chan-prop-where` (Outbox only) · `.chan-prop-text` · ★`.chan-prop-meta` · `.chan-prop-idwarn` · `.chan-prop-reason[.chan-warn]` · `.chan-prop-actions` (`.mounts-btn`×2 + `.mounts-btn-primary[data-approve]` \| `检查结果[data-reconcile]`) | retires `.chan-prop-policy`, `.chan-prop-identity` (folded into the meta line), the duplicated unknown sentence, `.chan-prop-ttl` (meta), `.chan-prop-honesty` stays as a meta item when set |
| outbox | | `.chanwin.chan-outbox` › `.jobs-toolbar` (`.jobs-summary` + ★`.chan-seg` › `.jobs-btn[.chan-seg-on]`×2) · `.chanwin-list.chan-outbox-list` › ★`.chan-outbox-sec` (+ `.chan-dot`) + cards | 待审批 view = awaiting only; 全部 view = grouped by state in the order awaiting · unknown · failed · sent · rejected |

Gate impact for a3: `scripts/test-channels-e2e.mjs` reads `.chan-adapter-ctl`, `[data-honesty-line]` and the section buttons — those move into the ⋯ menu (drive the menu through `menuItems('channel-adapter', ctx)`); `.chan-row / .chan-chip / .chan-tracked / .chan-unread / .chan-awaiting / [data-outbox-button] / .chan-prop-* / .chanwin-* / [data-honesty-line]` keep their names.

### 4.3 The chip vocabulary — one colour per meaning

| Chip | Says | Colour | Shape / type | Where |
|---|---|---|---|---|
| unread count | messages you have not read | `--accent` fill, `--accent-fg` text | pill 999, 10/700, min 16 px | row line 2 right; the rail badge is the sum |
| awaiting | proposals waiting for YOUR decision | `--attn-text` on transparent, `--accent-dim` border, check icon 9 px | pill 999, 9/700 | row line 2 right, before the count; the Outbox button's count |
| freshness (an age) | how old this row's evidence is (`30s以内`, `5m以内`, `18m以内`, `scanned 4m ago`) | `--text-secondary` on a 12 % tint of itself | pill 999, 9/600 | row line 1 right — the ONLY pill on line 1 |
| live | the lane is alive (positive evidence, `--ok-text`) | `--ok-text` on a 13 % green tint | same pill | same slot |
| not tracked | nothing is fetched for this row | `--text-dim` 9 px, no pill; the title in `--text-secondary` | text | row line 2 right |
| adapter state dot | connected / needs attention / off | green / `--yellow` / dim 6 px | dot | section head after the name |
| warning line | why it needs attention, with its verb | `--warn-text` 10 px + alert icon | line | under the head; on the row's assignment line when the last wake was held |
| card state | awaiting / sent / failed / unknown / rejected | `--attn-text` on accent tint / `--ok-text` on green tint / `--bad-text` on red tint / `--warn-text` on amber tint / `--text-secondary` on neutral tint | pill 999, 9/700, sentence case | card head, first |
| identity warning | "not verified whose name the recipient sees" / "the recipient sees the app" | `--warn-text` 10 px + alert icon | line, ONCE per card, only when `level==='warn'` | card, after the meta line |
| assignment | who is woken, how (`→ 运维分诊 · 已过滤 · 草稿权`) | `--text-secondary` 10 px (panel), accent-tint 9/600 pill (window bar) | line / pill | row line 3; window bar |

Amber is never a lane colour and never an approval colour; blue is retired from the feature.

### 4.4 CSS token map (the exact rules are `docs/design-mockups/communication-panel/direction-a.css`; this is the map a3 lifts into `public/style.css`, replacing the `.chan-*` block at 3748–3902)

**New text tokens** (proposed for the theme block, or scoped under `.chan-*` if the theme block is off limits): the raw `--green` / `--yellow` / `--red`, and `--accent` on its own tint, are NOT theme-adapted — measured 1.7–3.9 : 1 as TEXT in light — while dots and tints are fine with the raw hue. Text mixes toward `--text`:

```css
--ok-text:   color-mix(in srgb, var(--green,  #3fb950) 44%, var(--text));   /* light 4.63 on the green tint · dark 6.5+ */
--warn-text: color-mix(in srgb, var(--yellow, #e5c07b) 47%, var(--text));   /* light 4.87 · dark 9+ */
--bad-text:  color-mix(in srgb, var(--red,    #e55)    55%, var(--text));   /* light 6+ · dark 5.6 on the red tint */
--attn-text: color-mix(in srgb, var(--accent)          78%, var(--text));   /* light 4.9 on the accent tint · dark 7+ */
```

| Role | Token / value | §17 rule |
|---|---|---|
| section head | 11/600 `--text-secondary`, sentence case, `padding 4px 6px`, `--radius-sm`, hover `--bg-hover` (= `folder-header`) | children keep their casing |
| head dot | 6 px, `--green` / `--yellow` / `--text-dim` | state dots 6 px |
| head count / ⋯ | 10 dim / `icon-btn` 20 px | micro label 10 |
| status line | 10 px, `line-height 1.45`, `--text-dim` or `--warn-text`, `flex-wrap`, verb = `mounts-btn` 10 px | `.usage-warn` semantics, separate from the note |
| row | `padding 5px 8px`, `margin 2px 0`, `1px solid --border`, `--radius-sm`, hover `--bg-hover` + `--border-active` (= `session-item-card`); ≤ 480 px `8px 10px` | radius-sm on rows |
| row title | 12 px `--text`, `flex 1 1 auto; min-width 60px`, ellipsis; untracked `--text-secondary` | body 12 |
| participants | 10 px `--text-dim`, `flex 1`, ellipsis | meta 10 |
| pills | 9 px, 999 radius, `padding 1px 6px`; unread `padding 0 5px; line-height 15px; min-width 16px` | micro 9, pills 999 |
| assignment line | 10 px `--text-secondary` / `--warn-text` | meta 10 |
| Outbox button | `mounts-btn` (11 px, `3px 9px`, `--bg-input`, `--border`) + a 15 px accent count; `--accent` border+text when > 0 | secondary spec |
| connect rows | `mounts-btn` full width `6px 9px`, icon 13 + 11 px label; note 10 dim under | secondary spec; `.usage-note` semantics |
| window bar | `padding 8px 12px; border-bottom --border`; title 13/600; meta 11 dim; chip 9/600 accent 14 % tint / `--attn-text` | emphasis 13 |
| day separator | 10 dim, hairlines `--border` | meta 10 |
| message | author 11/600 (`--attn-text` for an agent), time 10 dim, body 12 `line-height 1.45`; continuation `margin-top −3px` | secondary 11 / body 12 |
| inline section | `border-top --border; padding-top 8px`; head 10/600 uppercase `.04em` dim + a `--accent` link | micro label |
| composer | textarea `font: inherit; 12px; line-height 1.4; padding 6px 8px; min-height 40px; --bg-input; --border; --radius-sm; focus --accent`; note 10 dim; primary `mounts-btn-primary` | inputs radius-sm, focus border only |
| card | `1px solid --border`, `--radius`, `padding 8px 10px`, `gap 5px`, transparent bg; awaiting: border `color-mix(--accent 45%, --border)` | radius on cards |
| card head | 10 dim; state pill 9/700 (tints 12–15 %); age `flex-shrink 0` | micro 9 / meta 10 |
| card meta | 10 dim, `flex-wrap; gap 2px 10px`; links `--accent` | meta 10 |
| card warning / reason | 10 `--warn-text` + icon / 11 `--text-secondary` (`--warn-text` for unknown) | secondary 11 |
| card actions | right-aligned, `gap 6px`; `mounts-btn` ×2 + `mounts-btn-primary`; ≤ 480 px `min-height 36px; 6px 12px; 12px` | primary = accent fill + `--accent-fg` |
| Outbox toolbar | `jobs-toolbar` (`8px 12px`, `--bg-panel, var(--bg-titlebar)` fallback form, border-bottom); summary 11; segment = two `jobs-btn` joined (radius-sm on the outer corners, `--accent` on the active) | toolbar spec |
| Outbox section label | 10/700 uppercase `.06em` `--text-dim` + a 6 px dot | micro label |

Type scale used: 9 (pills, untracked, chip text) · 10 (meta, notes, participants, time, section labels) · 11 (section names, author, buttons, summary, reason) · 12 (titles, bodies, composer) · 13 (window title). Radii: `--radius-sm` rows/inputs/buttons, `--radius` cards, 999 pills. No literal colour anywhere; every tint is `color-mix(in srgb, var(--token) N%, transparent)`.

### 4.5 Empty-state copy (en / zh / ja)

| Where | en | zh | ja |
|---|---|---|---|
| panel summary, nothing connected | No channels connected | 还没有连接任何频道 | 接続済みのチャンネルはありません |
| panel body, nothing connected (`.empty-hint`) | Connect a channel and track a conversation — new messages will be listed here. | 连接一个频道并跟踪会话后，新消息会列在这里。 | チャンネルを接続して会話を追跡すると、新着メッセージがここに並びます。 |
| connect row, cluster credential | Connect Lark / Provided by the cluster | 连接飞书 / 由集群提供 | Lark を接続 / クラスターが提供 |
| connect row, no credential | Set up Gmail credentials… / Needs your own OAuth client | 设置 Gmail 凭据… / 需要你自己的 OAuth client | Gmail の資格情報を設定… / 自分の OAuth クライアントが必要 |
| adapter with no conversations (`.empty-hint-inline`) | No conversations discovered yet. | 还没有发现会话。 | まだ会話は見つかっていません。 |
| untracked conversation, list | Not tracked — nothing has been fetched yet. | 未跟踪 —— 还没有抓取任何消息。 | 未追跡 — まだ何も取得していません。 |
| untracked conversation, footer + verb | Not tracked — messages are fetched once you track it. / Track this conversation | 未跟踪 —— 跟踪后才会抓取这个会话的消息。 / 跟踪这个会话 | 未追跡 — 追跡するとこの会話のメッセージを取得します。 / この会話を追跡 |
| read-only conversation, footer | Read-only here: {why} | 这里是只读的：{why} | ここは読み取り専用です：{why} |
| tracked conversation, no messages | No messages yet. | 还没有消息。 | まだメッセージはありません。 |
| Outbox summary, empty | No proposals yet | 还没有提案 | 提案はまだありません |
| Outbox body, empty (`.empty-hint`) | When an agent proposes a reply with vibespace-channels, it waits here for you to approve, edit or reject it. | Agent 用 vibespace-channels 提议回复后，会在这里等你批准、编辑或拒绝。 | エージェントが vibespace-channels で返信を提案すると、ここであなたの承認・編集・却下を待ちます。 |
| inline section, nothing awaiting | (no section — the element is not rendered) | | |

Dictionary pass carried over from a1 §1 (W): 发件箱 / 送信箱 for Outbox, 提案 for proposal, 频道 for channel, 适配器 for adapter, 审批 for review-as-a-verb; the state words `等你审批 · 已发送 · 失败 · 结果未知 · 已拒绝` and their ja `承認待ち · 送信済み · 失敗 · 結果不明 · 却下`.

### 4.6 Mobile rules (375×667, measured)

1. **One surface at a time.** The app already shows only the active window and hides titlebars under 768 px (style.css 1896–1898); the in-window bar therefore keeps the conversation's title (it is not redundant), and opening the Outbox from the panel must focus it (`openChannelOutbox` does).
2. **The panel fills the width** (362 px of content); rows keep the desktop grid — line 1 title + pill, line 2 participants + badges — and pad `8px 10px`; 7 rows in view; nothing truncates.
3. **Targets:** every button in a card, the composer and the read-only footer is ≥ 36 px tall under 480 px (measured 36); rows are 51–69 px tall; the ⋯ icon-buttons stay 20–22 px but sit at the row's right edge with the whole head as their hit area (the head row is the click target, ⋯ is the affordance).
4. **The card's three actions stay on one row** (62 + 62 + 50 px < 362) right-aligned; the reject reason opens inline under them, never a second button row.
5. **The composer is 16 % of the height** (40 px textarea + note + 提议); the inline section shows the cards that need the user plus the newest two decided ones (§4.2's rule), so the newest message is on screen after the card (`newestVisible: true`).
6. **Entry point** — a1 M1 stands: the rail is not built on phones and the ⚙ `Channels…` row is gated on it; this design assumes a3/a4 give the ⚙ row a phone path (open the sidebar with the channels tab). Listed in §6.

### 4.7 Where the icons are

Stroke SVGs on a 16-grid at 1.5 px (the `icons.js` wrapper), 13 px in heads, 10–11 px inside pills/notes: kind (chat / mail / robot) before the adapter name; chevron before it; ⋯ at the head's right edge and the window bar's; the check inside the awaiting pill; the alert glyph before every `--warn-text` sentence; no icon on text buttons (批准 / 拒绝… / 编辑… / 提议 / 重新授权 are words, like `mounts-btn` everywhere else); the connect rows carry the kind icon like Remote's `Add machine` rows carry theirs.

---

## 5. Measured facts for the record (all three directions, dark unless stated)

| | A | B | C |
|---|---|---|---|
| panel row height avg / range | 48 / 45–63 | 55 / 50–75 | 27 / 24–39 |
| rows visible at 800 px / at 667 px phone | 10 / 7 | 9 / 7 | 12 / 10 |
| title width min / median at 203 px | 108 / 129 | 122 / 124 | 66 / 112 |
| controls share of the panel | 25 % | 18 % | 35 % |
| pill / chip type | 9/600 · unread 10/700 · awaiting 9/700 | 9/700 mono · awaiting 10/600 | none (11/700 number · 10/400 word) |
| meaning-chip min contrast dark / light | 5.12 / 4.63 | 6.56 / 4.55 | 6.0 / 4.72 |
| window bar / inline card / foot share | 76 / 144 / 17 % | 37 / 145 / 17 % | 80 / 133 / 17 % |
| phone: inline card / button height | 173 / 36 | 184 / 36 | 160 / 36 |
| Outbox cards (awaiting/sent/unknown/failed/rejected) | 182/96/163/117/117 | 170/143/78/99/99 | 143/67/132/81/86 |
| Outbox cards in view at 600 px / identity warnings | 3 / 1 | 3 / 1 | 4 / 1 |

---

## 6. Open points (for the result's openIssues, not questions)

- The house `--text-dim` (#6b7280) reads 4.45 : 1 on the light sidebar at 9–10 px — every panel in the app shares it; a theme-level nudge (e.g. `#626b7d`) is outside this feature.
- The neutral card pill (`rejected`) at 9/700 `--text-secondary` on its own 12 % tint measures 4.43 in dark; a3 can drop the tint on the neutral state or use `--text` at 600.
- The 200 px sidebar width (a1's `panel-09-narrow-200`) was not rendered here (the mockup frame is 260 / 375); a3's driver run must include it — the row grid (title min 60 px, badges on line 2) is designed for it but unmeasured.
- Phone entry point (a1 M1) is a product gap this design assumes closed.
- The ⋯ menu contents for an adapter (`channel-adapter` contribution menu: Track… / Options / Push… / Sender line ☑ / Re-authorize / Disconnect / Disable, state-driven) were designed, not mocked — the menu chrome is the house `context-menu`.
