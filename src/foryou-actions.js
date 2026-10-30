'use strict';
/**
 * PURE (imports nothing; CJS so the hub, the store, the census and the browser bundle share ONE spelling) — THE FOR-YOU
 * ACTION REGISTRY (lane chat-needs-you-card, amendment 1 — the owner's registry law, 2026-10-26: «这种不是应该有个统一的
 * 注册表之类的吗»: every kind / category / origin / door family is ONE PURE registry row naming every surface + a census).
 *
 * ONE row per For-you ACTION TYPE (`item.action.type` — what a producer's item does when the person decides):
 *   type      the name a producer files
 *   identity  how two filings of it MERGE in the store (`action[identity]` must match; null = by its text) — was
 *             ACTION_IDENTITY in src/user-todos.js
 *   producer  the file whose add() files it (+ `builtIn`: the module that spells the type when another builds the action)
 *   waits     an agent's tool call held on the owner's answer (the attention list's band 2) — was WAIT_ACTIONS in
 *             src/attention-model.js
 *   answer    'card' = answered on a card in the chat, never by a typed reply (was CARD_ACTION_TYPES, src/inbox-reply.js) ·
 *             'buttons' = its own buttons on the item, never a typed reply (was ANSWER_ACTION_TYPES) · 'reply' = a reply may
 *   card      where For-you draws the type's own verbs: 'row' (user-todos-row.js — the tray, the mini inbox, the chat's
 *             card) · 'inbox-window' (only the For-you window) · 'none' (the generic verbs: ✓ ✕, the door)
 *   handled   its branch in src/lib/user-todos-actions.js (runAction / jump / isDoor)
 *   chat      the chat's needs card draws it (src/lib/chat-needs-card.js) — false + `owner` = another card in the chat answers
 *             it (never drawn twice) or its answer is its own form; `on` = where that is, in an agent's words (filedLine)
 *   kind      what the card and the chip call it (approval / question / secret / browser / check)
 *   cli       the agent CLI that files it and the line it prints: 'filed' (the hub's `filedLine` — the card in this
 *             conversation + the tray), 'wait' (a held call's wait note names the card), 'own' (the CLI's own words)
 *   scope     where it is filed: 'conversation' (its key) · 'about' (a group key + `about` naming it) · 'group' (no conversation)
 *   decide    'person' = ONLY a person's click on this instance's page decides it — its door asks THE person verdict
 *             (src/routes/vault.js personVerdict: any bearer ⇒ human_only, not this page ⇒ cross_site), so its record says
 *             «approved by you · 09:41» (decidedStamp) on both doors (lane wake-approve-card); absent = its words stay its own.
 *             A DECISION ROW (acceptance round 2) = a `decide: 'person'` row that draws its own verbs (`card: 'row'` — a wake
 *             request): exactly TWO verbs end its item — Approve / Deny (DECISION_ENDS: allowed / denied, or its end:
 *             expired) — no generic closer (✓ Mark done / ✕ Dismiss / «Mark all seen» / a reply), and a decided one is final
 *             (never reopened, never re-stamped): src/user-todos.js refuses the rest by name. open-channel is no decision
 *             row: its item is a DOOR (`card: 'none'` — its Approve / Deny are the Reach dialog's) and the Outbox's pointer
 *             («Proposals awaiting approval in …», retracted by its producer) shares its type
 *   ends      a DECISION ROW's ends (acceptance round 3): the `resolvedBy` values its producer may close its item with — its
 *             verbs and its own ends (a held ask's 60 s, a locked vault, a gone conversation); nothing else closes it (absent =
 *             DECISION_ENDS: allowed / denied / expired)
 *   stamp     the decided stamp's words (STAMPS): 'approve' «approved by you · 09:41» (the default) · 'allow' «allowed by you» /
 *             «always allowed by you» (a held ask's Allow once / Always) · 'store' «stored · 09:41» (a paste request) ·
 *             'grant' «allowed once by you» / «allowed by you for 8 h» (an agent's request for a stored secret — r4)
 *   showsExpiry  the card and the tray row say its end («expires in 7 d» — a wake ask's lifetime, expiryWords)
 *   verbs     a proposal-shaped row's own two words (r6: a held digest's Deliver / Discard) — {approve, reject, title}; absent =
 *             Approve / Deny (Reject) — verbsOf(type)
 *   closer    'hide' = its item is a POINTER (acceptance round 3 — 主开发: «a pointer item hides, never decides»): a door to
 *             where its question lives (the Reach dialog, the Outbox, the conversation), so its ONE closer is ✕ «Hide» —
 *             no ✓ Mark done, no «done» record, no Undo, no ↺ (closersOf); the person's close is a HIDE in the store
 *             (src/user-todos.js: 'dismissed', resolvedBy 'hidden' — «hidden — nothing was decided») and the question it
 *             points at stays open where it lives (an rq- request comes back to the tray at the next boot reconcile, or
 *             when the agent asks again); absent = the generic closers (✓ / ✕ while open, ↺ once resolved)
 * Every older table is DERIVED here (ACTION_IDENTITY · WAIT_ACTIONS · CARD_ACTION_TYPES · ANSWER_ACTION_TYPES);
 * scripts/test-foryou-actions-census.mjs fails on a type a producer files with no row, a row nobody files, a `handled` row
 * with no branch, a `card: 'row'` row the row does not draw, a `chat` row the card does not draw.
 *
 * …and WHAT A CONVERSATION ASKS OF YOU, IN THAT CONVERSATION (the brief's row 1 — the owner 2026-10-26: «这个界面里是不是
 * 应该有个地方能让我看到需要approve？» — a channel watch's approval sat only in the tray). The law (S1's helper card,
 * generalized): ANSWERABLE WHERE IT APPEARS. Every open For-you item a conversation PRODUCED (its sessionKey) or that
 * ADDRESSES it (`about`) is ALSO a card in its chat, drawn by the ONE row renderer with the tray's own verbs:
 *   needOf(item)                 → {kind, card, owner, cli} — its row (by action type, else BY_ORIGIN); null = no need
 *   needsOf(items, keys)         → the OPEN needs of the conversation known by `keys`, oldest first: [{item, kind}]
 *   recordsOf(items, keys)       → its RESOLVED ones (the quiet one-line records), oldest first
 *   placementOf(item, transcript)→ {at: <record id> | null, how: 'named' | 'tool' | 'turn' | 'end' | 'none'}
 *   tailPlan(open, transcript, o)→ {at, dock, waiting, loose} — which open card stands where: at its record when that is on
 *                                  screen, at most ONE docked at the end, every one in the chip (lane needs-card-tail)
 *   filingIndex(item, readPage, o) → the index of the record that filed it ABOVE a loaded window (the landing's read upward)
 *   chipWords(needs, t)          → {text, title} | null — «waiting for you · an approval» / «· 3 approvals» / «· 3»
 *   settledWords(item, t)        → «approved» / «denied» / «saved to the vault» / «done» … (the quiet line's verb)
 *   surfaceOf(type | item)       → {at: 'card' | 'window' | 'owner' | 'notice', kind, on} — where it IS shown and answered
 *   filedLine(type | item, id, tray) → THE one line an agent can quote after a filing (the hub's words; a CLI prints it),
 *                                  worded from surfaceOf — never «the card in this conversation» for an item with none
 *   SURFACES                     → every surface that shows a conversation its own items, and whether it reads `about`
 *   decidedStamp(item, {t, now}) → «approved by you · 09:41» / «denied by you · 09:41» for a `decide: 'person'` row's
 *                                  decision THE PERSON VERDICT MARKED (resolvedFact.decidedBy 'person' — the decide route's;
 *                                  null otherwise: an older record keeps «approved») — THE stamp the chat card AND the tray say
 *   isDecisionRow(item) · offersClosers(item) · DECISION_ENDS → a decision row has two verbs and no generic closer
 *   closersOf(item, resolved)    → the closer verbs a surface draws: ['done', 'dismiss'] / ['reopen'] (any item) ·
 *                                  ['hide'] / [] (a POINTER — isPointer, `closer: 'hide'`) · [] (a decision row) — isHidden(item)
 *   expiryWords(item, {t, now})  → «expires in 7 d» for an OPEN decision row (a wake ask's lifetime) — null otherwise
 *   decisionCard(item, {role})   → {state, buttons, stamp, waiting} — the PURE card model: filed / approved / denied /
 *                                  expired / waiting-owner (a viewer who may not decide: the words, no buttons)
 *   VIEWERS · canDecide(role)    → WHO may decide: an IDENTITY fact (the owner's cookie), never a view's — one row per role
 * `transcript` = the chat's loaded records as lean rows {id, ts, role, tool, cmd, out} (chat-needs-card.js maps them).
 */

/** `i18nKey` = the extractor's marker for a declared human-visible string. */
const i18nKey = (s) => s;
/** The KINDS a card names (the chip's words, the agent's line). */
const KINDS = Object.freeze(['approval', 'question', 'secret', 'browser', 'check']);

/** THE REGISTRY — one row per action type (the header names the fields). */
const C = (bin, verb, line) => Object.freeze({ bin, verb, line });
const ROWS = Object.freeze([
  // ── an agent's held tool call / its own asks ──
  { type: 'main-ask', identity: 'requestId', producer: 'src/server/main-asks.js', builtIn: 'src/main-ask.js', waits: true, answer: 'card', card: 'none', handled: true, chat: false, owner: 'the conversation\'s own permission / question card (lane parked-ask-inbox) — src/lib/chat-renderers.js', on: 'the permission card in this conversation', scope: 'conversation' },
  { type: 'helper-ask', identity: null, producer: 'src/server/helper-asks.js', builtIn: 'src/helper-ask.js', waits: true, answer: 'card', card: 'none', handled: true, chat: false, owner: 'the helper\'s permission card on its Agent card (lane S1) — src/lib/chat-renderers.js', on: 'the helper\'s permission card in this conversation', scope: 'conversation' },
  { type: 'browser-grant', identity: 'profileId', producer: 'src/agent-routes/status.js', builtIn: 'src/ask-grant.js', waits: false, answer: 'reply', card: 'row', handled: true, chat: true, kind: 'approval', cli: C('vibespace-ask', '--grant browser:<profile>', 'filed'), scope: 'conversation' },
  // ── machines ──
  { type: 'exit-run-ask', identity: 'askId', producer: 'src/exit-proxy.js', waits: true, answer: 'buttons', card: 'row', handled: true, chat: true, kind: 'approval', cli: C('vibespace-exit', 'run / push / pull', 'wait'), scope: 'conversation' },
  { type: 'hub-act-ask', identity: 'askId', producer: 'src/server/hub-act-ask.js', waits: false, answer: 'buttons', card: 'row', handled: true, chat: true, kind: 'approval', scope: 'about', decide: 'person', ends: ['allowed', 'always', 'denied', 'expired', 'ask-expired', 'ask-over'], stamp: 'allow' },   // r3: `about` = the asking conversation (an agent's act) — its chat draws the card
  // lane ledger-dedup-law F3 / r9: a background subject's ONE standing item — a NOTICE: no answer drawn (`answer: 'reply'`,
  // `card: 'none'` — ✓ ✕ and its door to Manage Agents → Machines), no `decide`; its 60 s cards stay hub-act-ask
  { type: 'hub-act-standing', identity: 'askId', producer: 'src/server/hub-act-ask.js', waits: false, answer: 'reply', card: 'none', handled: false, chat: true, kind: 'check', scope: 'group' },
  // ── vault ──
  { type: 'automation-ask', identity: 'askId', producer: 'src/server/automation-engine.js', waits: false, answer: 'buttons', card: 'row', handled: true, chat: true, kind: 'approval', cli: C('vibespace-api', 'an automation key\'s first use', 'own'), scope: 'conversation' },
  { type: 'vault-run-ask', identity: 'askId', producer: 'src/server/vault-run-door.js', waits: false, answer: 'buttons', card: 'row', handled: true, chat: true, kind: 'approval', cli: C('vibespace-vault', 'run', 'wait'), scope: 'conversation', localizeDetail: true, decide: 'person', ends: ['allowed', 'always', 'denied', 'expired', 'ask-expired', 'ask-over', 'ask-changed', 'vault_locked', 'conversation-gone'], stamp: 'allow' },   // r7c (the owner's ruling «A»): past its 60 s the command is refused and the card stays answerable — an Allow then lets the agent's next run of that command through once (r8: the door marks it `action.late`; the client never infers it from its own clock)   // int361: + vault-agent-own r25's late-card end (conversation-gone) and vault-use-grants r7's localizeDetail (its plain detail lines through t())
  { type: 'vault-grant-ask', identity: 'askId', producer: 'src/server/vault-run-door.js', waits: false, answer: 'buttons', card: 'row', handled: true, chat: true, kind: 'approval', cli: C('vibespace-vault', 'request <vault://…>', 'filed'), scope: 'conversation', decide: 'person', ends: ['granted', 'denied', 'vault_locked', 'ask-changed', 'ask-over'], stamp: 'grant' },   // r4: Allow once / For 8 hours / Deny are its three verbs (+ a lock, a changed card, an ask that is over); r6: a grant is `granted` (every reader knows it) + `resolvedFact.grantedFor` — its life: grantLifeOf
  { type: 'secret-request', identity: 'requestId', producer: 'src/server/vault-paste-door.js', waits: false, answer: 'buttons', card: 'row', handled: true, chat: true, kind: 'secret', cli: C('vibespace-vault', 'request "<what>"', 'filed'), scope: 'conversation', decide: 'person', ends: ['stored', 'denied', 'vault_locked', 'ask-over', 'expired'], stamp: 'store' },
  { type: 'vault-unlock', identity: null, producer: 'src/server/vault-hooks.js', waits: false, answer: 'reply', card: 'none', handled: true, chat: true, kind: 'check', scope: 'group' },
  // the audit's two drifts (2026-10-26): a failed use was in no table; a rotate suggestion merged by its text — now by its entry
  { type: 'vault-use-failed', identity: null, producer: 'src/server/vault-hooks.js', waits: false, answer: 'reply', card: 'none', handled: true, chat: true, kind: 'check', scope: 'group', merge: 'by its text on purpose — the dedupe text is the head (who used which key for which verb) + its cause (lane vault-key-row-compact)' },
  { type: 'vault-rotate', identity: 'entry', producer: 'src/server/vault-hooks.js', waits: false, answer: 'reply', card: 'none', handled: true, chat: true, kind: 'check', scope: 'group' },
  // the vault run door's notices (lane vault-use-grants r3/r4): the marked run store failed its mark (fail closed), a grants.json
  // member no longer verified (forged / widened / replayed), the policy judge approved a run (its door is the entry's row + Revoke)
  { type: 'vault-store-refused', identity: null, producer: 'src/server/vault-run-door.js', waits: false, answer: 'reply', card: 'none', handled: true, chat: true, kind: 'check', scope: 'group' },
  { type: 'vault-grant-stale', identity: null, producer: 'src/server/vault-run-door.js', waits: false, answer: 'reply', card: 'none', handled: true, chat: true, kind: 'check', scope: 'group' },
  { type: 'vault-policy-approved', identity: null, producer: 'src/server/vault-run-door.js', waits: false, answer: 'reply', card: 'none', handled: true, chat: true, kind: 'check', scope: 'conversation' },
  // ── the account pool ──
  { type: 'pool-cross-provider', identity: 'askId', producer: 'src/server/usage-pool-engine.js', waits: false, answer: 'buttons', card: 'row', handled: true, chat: true, kind: 'approval', scope: 'conversation' },
  { type: 'reset-credit', identity: null, producer: 'src/server/usage-pool-engine.js', waits: false, answer: 'reply', card: 'row', handled: true, chat: false, owner: 'the limit wall card\'s «Use a reset credit» (design-reset-credits) — src/lib/chat-renderers.js', on: 'the limit card in this conversation', scope: 'conversation' },
  // ── apps ──
  { type: 'app-install', identity: 'id', producer: 'src/server/apps-engine.js', waits: false, answer: 'reply', card: 'row', handled: true, chat: true, kind: 'approval', cli: C('vibespace-app', 'install / remove', 'own'), scope: 'conversation' },
  // ── the agent browser ──
  { type: 'browser-proposal', identity: 'id', producer: 'src/server/browser-propose.js', builtIn: 'src/browser-switch.js', waits: false, answer: 'reply', card: 'row', handled: true, chat: false, owner: 'the proposal card the chat draws where it was proposed (lane browser-propose) — src/lib/browser-proposal-card.js', on: 'the proposal card in this conversation', scope: 'conversation' },
  { type: 'browser-takeover', identity: 'requestId', producer: 'src/server/browser-handback.js', builtIn: 'src/browser-takeover-request.js', waits: false, answer: 'reply', card: 'row', handled: true, chat: true, kind: 'browser', cli: C('vibespace-browser', 'ask-human', 'own'), scope: 'conversation' },
  { type: 'browser-floor-check', identity: null, producer: 'src/server/browser-keeper.js', waits: false, answer: 'reply', card: 'inbox-window', handled: true, chat: true, kind: 'check', scope: 'group' },
  { type: 'browser-restart', identity: null, producer: 'src/server/browser-keeper.js', waits: false, answer: 'reply', card: 'inbox-window', handled: true, chat: true, kind: 'check', scope: 'group' },
  // the base's two browser cards (int358: lanes browser-surfaces + browser-login, after this registry's own base — int360 seam (e)):
  // filed under the browser's group key, drawn on the row by proposalAskHtml, answered by their own Approve / Reject; merged by
  // their text, in no wait / card / buttons table — exactly as the base's tables had them
  { type: 'browser-surface', identity: null, producer: 'src/server/browser-dialogs.js', waits: false, answer: 'reply', card: 'row', handled: true, chat: true, kind: 'browser', scope: 'group' },
  { type: 'save-login', identity: null, producer: 'src/server/browser-logins.js', waits: false, answer: 'reply', card: 'row', handled: true, chat: true, kind: 'approval', scope: 'group' },
  // ── channels ──
  { type: 'channel-watch-request', identity: 'id', producer: 'src/server/channels-access.js', waits: false, answer: 'reply', card: 'row', handled: true, chat: true, kind: 'approval', cli: C('vibespace-channels', 'watch --mode wake', 'filed'), scope: 'about', decide: 'person', ends: ['allowed', 'denied', 'expired'], showsExpiry: true },
  { type: 'channel-held-digest', identity: 'id', producer: 'src/server/channels-access.js', waits: false, answer: 'buttons', card: 'row', handled: true, chat: true, kind: 'approval', scope: 'group', decide: 'person', ends: ['delivered', 'discarded', 'expired'], stamp: 'deliver', showsExpiry: true, verbs: Object.freeze({ approve: i18nKey('Deliver'), reject: i18nKey('Discard'), title: i18nKey('Sends them now, as one block — a billed turn') }) },   // lane wake-approve-card r6: hits a boot found held longer than their window × 24 — Deliver (a billed turn) / Discard, never sent by themselves
  { type: 'open-channel', identity: 'key', producer: 'src/server/channels-access.js', waits: false, answer: 'reply', card: 'none', handled: true, chat: true, kind: 'approval', cli: C('vibespace-channels', 'request', 'filed'), scope: 'about', decide: 'person', closer: 'hide' },
  { type: 'channel-api-proposal', identity: 'id', producer: 'src/server/channel-api-cards.js', builtIn: 'src/channel-api-card.js', waits: false, answer: 'reply', card: 'row', handled: true, chat: false, owner: 'the raw-API card the chat draws where it was proposed (B-2198) — src/lib/channel-api-card-view.js', on: 'the API card in this conversation', scope: 'group' },
  { type: 'channel-reauth', identity: null, producer: 'src/server/channels-engine.js', waits: false, answer: 'reply', card: 'row', handled: true, chat: true, kind: 'check', scope: 'group' },
  // ── an app on the desktop ──
  { type: 'desktop-app-notify', identity: null, producer: 'src/server/desktop-app-keeper.js', waits: false, answer: 'reply', card: 'inbox-window', handled: true, chat: true, kind: 'check', scope: 'group' },
].map((r) => Object.freeze(r)));
const ANSWERS = Object.freeze(['card', 'buttons', 'reply']);
const CARDS = Object.freeze(['row', 'inbox-window', 'none']);
const CLOSERS = Object.freeze(['hide']);   // a row's `closer` (absent = the generic ✓ / ✕ / ↺)
const ROW_OF = Object.freeze(Object.fromEntries(ROWS.map((r) => [r.type, r])));
const typesWhere = (pred) => Object.freeze(ROWS.filter(pred).map((r) => r.type));
/** DERIVED — the store's merge rule (src/user-todos.js add): an item carrying one of these types merges only with a re-file
 *  of the same type AND the same `action[identity]`. */
const ACTION_IDENTITY = Object.freeze(Object.fromEntries(ROWS.filter((r) => r.identity).map((r) => [r.type, r.identity])));
/** DERIVED — an agent's tool call held on the owner's answer (src/attention-model.js: band 2). */
const WAIT_ACTIONS = typesWhere((r) => r.waits);
/** DERIVED — answered on a card in the chat, never by a typed reply (src/inbox-reply.js `card_item`). */
const CARD_ACTION_TYPES = typesWhere((r) => r.answer === 'card');
/** DERIVED — answered by its own buttons, never by a typed reply (src/inbox-reply.js `exit_ask`). */
const ANSWER_ACTION_TYPES = typesWhere((r) => r.answer === 'buttons');
/** The CLI regex a row's tool-card anchor looks for (placementOf's 'tool' rung). */
const cliRe = (bin) => (bin ? new RegExp('\\b' + bin.replace(/[-]/g, '\\-') + '\\b') : null);
/** needOf's view of a row (BY_TYPE kept as the name the card's code reads). */
const BY_TYPE = Object.freeze(Object.fromEntries(ROWS.map((r) => [r.type, Object.freeze({ kind: r.kind, card: !!r.chat, owner: r.owner || null, cli: r.cli ? cliRe(r.cli.bin) : null, scope: r.scope })])));

/** …and BY ORIGIN for an item with no action (an agent's own ask, a producer's plain question). */
const BY_ORIGIN = Object.freeze({
  agent: { kind: 'question', card: true, cli: /\bvibespace-ask\b/ },
  browser: { kind: 'browser', card: true, cli: /\b(?:vibespace-browser|agent-browser)\b/ },
  pool: { kind: 'question', card: true },
  machines: { kind: 'check', card: true },
  channels: { kind: 'check', card: true, cli: /\bvibespace-channels\b/ },
  vault: { kind: 'check', card: true, cli: /\bvibespace-vault\b/ },
  apps: { kind: 'check', card: true, cli: /\bvibespace-app\b/ },
  jobs: { card: false, owner: 'the job\'s own form (Background Work — the tray row opens it)', on: 'the job\'s own form in Background Work' },
  spend: { kind: 'check', card: true, scope: 'global' },
  login: { kind: 'check', card: true, scope: 'global' },
  plugin: { kind: 'check', card: true, scope: 'global' },
  server: { kind: 'check', card: true, scope: 'global' },
});
const DEFAULT_NEED = Object.freeze({ kind: 'check', card: true });

/** THE SURFACES that show a conversation its OWN For-you items (the owner's registry law, 2026-10-26: «这种不是应该有个统一的
 *  注册表之类的吗» — every family ONE PURE registry naming every surface; a deferred surface is a census row, never prose):
 *  `fn` = the function that picks the conversation's items, in `file`; `about: true` = it also counts the items that
 *  ADDRESS the conversation (a watch request under 'channels'); 'deferred' = the conversation's own key only — named here
 *  so test-conversation-needs ⑨ keeps it honest (a deferred row whose function starts reading `about` goes red until its
 *  row says true; a new function matching a conversation's items by sessionKey goes red until it is a row). */
const SURFACES = Object.freeze({
  'chat-card': { file: 'src/foryou-actions.js', fn: 'cardsWhere', about: true, what: 'the cards and the quiet records in the chat (needsOf / recordsOf → src/lib/chat-needs-card.js) + the status bar\'s «waiting for you · N»' },
  'title-badge': { file: 'src/lib/user-todos-layout.js', fn: 'inboxBadgeFor', about: 'deferred', what: 'the window title bar\'s mini inbox badge (2.369.169)' },
  'mini-inbox': { file: 'src/lib/user-todos-layout.js', fn: 'miniInboxEntries', about: 'deferred', what: 'the title-bar mini inbox popover' },
  'session-marker': { file: 'src/lib/user-todos-layout.js', fn: 'sessionMark', about: 'deferred', what: 'a session row\'s «needs you · N» (lane foryou-honest)' },
});

/** The identity ids an item's producer names in its words (a tool's result says `wr-…` / `sr-…` / `ut-…`). */
const IDENTITY_FIELDS = Object.freeze(['id', 'requestId', 'askId']);

/** The census row of `item`'s producer → {kind, card, owner, cli}; null = not a need (a notice, a cleared item, a job's). */
function needOf(item) {
  if (!item || typeof item !== 'object' || item.kind === 'notice' || item.clearedAt) return null;
  if (item.jobId) return { ...BY_ORIGIN.jobs };
  const type = item.action && typeof item.action.type === 'string' ? item.action.type : '';
  const row = (type && BY_TYPE[type]) || (!type && BY_ORIGIN[item.origin]) || DEFAULT_NEED;
  // an AGENT-origin item a hub producer worded (its `i18n` — an unexpected exit's «restarted once») is no question of the agent's
  if (row === BY_ORIGIN.agent && item.i18n) return { kind: 'check', card: true, owner: null, cli: null };
  return { kind: row.kind || null, card: !!row.card, owner: row.owner || null, cli: row.cli || null };
}

const keySet = (keys) => new Set((Array.isArray(keys) ? keys : [keys]).filter((k) => typeof k === 'string' && k));
/** Is `item` THIS conversation's — produced by it (its sessionKey) or addressing it (`about`)? */
const isTheirs = (item, set) => !!item && (set.has(item.sessionKey) || (typeof item.about === 'string' && set.has(item.about)));
const byCreated = (a, b) => (Number(a.item.createdAt) || 0) - (Number(b.item.createdAt) || 0);
function cardsWhere(items, keys, open) {
  const set = keySet(keys);
  if (!set.size || !Array.isArray(items)) return [];
  const out = [];
  for (const item of items) {
    if (!item || (item.status === 'open') !== open || !isTheirs(item, set)) continue;
    const n = needOf(item);
    if (n && n.card) out.push({ item, kind: n.kind || 'check' });
  }
  return out.sort(byCreated);
}
/** The OPEN needs of the conversation `keys` names (its sessionKey, its webui twin…), oldest first. */
function needsOf(items, keys) { return cardsWhere(items, keys, true); }
/** Its RESOLVED cards (the quiet records), oldest first — what the snapshot's resolved tail still carries. */
function recordsOf(items, keys) { return cardsWhere(items, keys, false); }

const SKEW_MS = 2000;            // a tool card's ts is the CALL's; its CLI files a moment later — and clocks drift a little
const FILED_WINDOW_MS = 15 * 60 * 1000; // a call further back than this did not file it
const idsOf = (item) => [item.id, ...IDENTITY_FIELDS.map((f) => item.action && item.action[f])].filter((x) => typeof x === 'string' && x.length >= 6);
/** WHERE the card of `item` sits in `transcript` (the loaded records, in order):
 *  'named' — the tool card whose RESULT names the item (its id, its request id: `wr-…`, `sr-…`) — exact;
 *  'tool'  — else the latest tool card that ran the producer's CLI just before the filing (within FILED_WINDOW_MS);
 *  'turn'  — else the record at or just before the filing (the turn that filed it, as far as it had come);
 *  'end'   — else (the anchor is older than what is loaded, or nothing is) the END of what is loaded — tailPlan decides
 *            whether a card stands there (lane needs-card-tail: at most ONE, the rest wait in the chip); a RESOLVED one is
 *            'none' (history stays history).
 *  `more` (lane needs-card-tail) = records exist AFTER the last loaded one (a window loaded mid-history — a landing, a
 *  search): a filing after what is loaded is not «at» the last loaded record, so the CLI-call and the at-the-filing rungs
 *  need a loaded record past the filing (the jump to an old ask stacked every newer one on the window's last record). */
function placementOf(item, transcript, { resolved = false, more = false } = {}) {
  const rows = Array.isArray(transcript) ? transcript.filter((r) => r && r.id != null) : [];
  const at = Number(item && item.createdAt) || 0;
  const ids = item ? idsOf(item) : [];
  for (let k = rows.length - 1; k >= 0; k--) {
    const r = rows[k];
    if (r.role === 'tool' && typeof r.out === 'string' && r.out && ids.some((id) => r.out.includes(id))) return { at: r.id, how: 'named' };
  }
  const n = needOf(item);
  const cli = n && n.cli;
  const past = !more || rows.some((r) => (Number(r.ts) || 0) > at + SKEW_MS); // the filing lies inside what is loaded
  if (cli && at && past) {
    for (let k = rows.length - 1; k >= 0; k--) {
      const r = rows[k], ts = Number(r.ts) || 0;
      if (ts > at + SKEW_MS) continue;
      if (ts < at - FILED_WINDOW_MS) break;
      if (r.role === 'tool' && typeof r.cmd === 'string' && cli.test(r.cmd)) return { at: r.id, how: 'tool' };
    }
  }
  if (at && rows.length && past) {
    let hit = null;
    for (const r of rows) { const ts = Number(r.ts) || 0; if (ts && ts <= at + SKEW_MS) hit = r; }
    // the first loaded record is AFTER the filing: its anchor is in history not loaded
    if (hit && !(hit === rows[0] && Number(rows[0].ts) > at)) return { at: hit.id, how: 'turn' };
  }
  if (resolved) return { at: null, how: 'none' };
  return { at: rows.length ? rows[rows.length - 1].id : null, how: 'end' };
}

/** THE TAIL (lane needs-card-tail, the owner 2026-10-28 on 2.369.360: «这个应该同时堆叠在页面最下吗？» — six asks filed days
 *  ago stood stacked under the newest message, because every open card whose record was not on screen fell back to the
 *  end): which of a conversation's OPEN cards stands where, given what the chat has loaded.
 *    `open`       needsOf's entries ({item, kind}, oldest first)
 *    `transcript` the loaded records (lean rows, placementOf's)
 *    `rendered`   (record id) → is that record on screen (the chat's element for it, in its list)
 *    `atEnd`      the loaded window reaches the conversation's live end (false = a window loaded mid-history)
 *    `pick`       the ask the person landed at the end (a chip row whose ask has no record) — it keeps the dock
 *    `known`      Map(item id → record id): the record a landing's read PROVED filed it (r3 — a window ending inside the skew
 *                 margin of the filing cannot place it alone; the read past it did) — used when placementOf says 'end'
 *  → { at: Map(item id → record id) — a card whose record IS on screen stands there, unchanged;
 *      dock: item id | null — at most ONE of the rest docks at the end: the person's pick, else the NEWEST of them (the next
 *            newest takes it when that one is answered); none in a window that ends mid-history (its end is not the chat's);
 *      waiting: every open entry, NEWEST first — THE CHIP's index (the rest wait there; choosing one lands it);
 *      loose: the ids with no record on screen }
 *  The base's rule (an open card's fallback is the end) is one docked card per loose id; scripts/test-conversation-needs.mjs
 *  ⑩ runs the owner's six (RED copy: that rule ⇒ six cards at the end). */
function tailPlan(open, transcript, { rendered = () => true, atEnd = true, pick = null, known = null } = {}) {
  const list = Array.isArray(open) ? open.filter((e) => e && e.item) : [];
  const rows = Array.isArray(transcript) ? transcript : [];
  const at = new Map(), loose = [];
  for (const e of list) {
    const p = placementOf(e.item, rows, { more: !atEnd });
    const proved = known && typeof known.get === 'function' ? known.get(e.item.id) : null;
    const rec = p.how !== 'end' && p.at != null ? p.at : proved != null && rows.some((r) => r && r.id === proved) ? proved : null;
    const el = rec != null ? drawnAt(rows, rec, rendered) : null;
    if (el != null) at.set(e.item.id, el);
    else loose.push(e);
  }
  const newest = loose.reduce((a, e) => (!a || (Number(e.item.createdAt) || 0) >= (Number(a.item.createdAt) || 0) ? e : a), null);
  const dock = !atEnd || !newest ? null : pick != null && loose.some((e) => e.item.id === pick) ? pick : newest.item.id;
  return { at, dock, waiting: [...list].reverse().sort((a, b) => byCreated(b, a)), loose: loose.map((e) => e.item.id) };
}

/** A card's anchor that is LOADED but drawn as nothing (a hidden unknown-record notice — chat-view keeps the record and
 *  draws no element) stands at the nearest DRAWN record after it — the end of what is loaded if none (lane needs-card-tail
 *  r2: such a card vanished into the chip, or docked saying «further up» though it was filed at the end).
 *  `rows` = the loaded records in DISPLAY order, `rendered(id)` = is that record drawn → a drawn record id | null */
function drawnAt(rows, id, rendered = () => true) {
  if (id == null) return null;
  if (rendered(id)) return id;
  const k = rows.findIndex((r) => r && r.id === id);
  if (k < 0) return null;
  for (let j = k + 1; j < rows.length; j++) if (rows[j] && rendered(rows[j].id)) return rows[j].id;
  for (let j = k - 1; j >= 0; j--) if (rows[j] && rendered(rows[j].id)) return rows[j].id; // nothing drawn after it: the end
  return null;
}

const tsOf = (r) => Number(r && r.ts) || 0;
/** THE LANDING's read (lane needs-card-tail — R2: a chip row, R5: a For-you door, whose ask was filed outside what the chat
 *  has loaded): where in the WHOLE conversation is the record that filed `item`? The loaded window (`rows` = its lean records
 *  in display order, `start`/`end` = its first record's index and the one past its last, `total` = the conversation's count)
 *  first; else the history read a page at a time by `readPage(offset, limit)` → lean records, TOWARD the filing (round 2: a
 *  landing read only upward, and an ask filed BELOW a window loaded mid-history — after any landing, search or minimap jump
 *  — was called «no record»):
 *    DOWN from the window's end — nothing loaded lies past the filing and the conversation goes on;
 *    UP from its top — the window starts after the conversation's first record (a page whose first record is inside the 2 s
 *       skew margin is not the filing's: the page above is read too — round 2, a record opening a page made a −1).
 *  → the index of the record that filed it (placementOf over what was read + the records around it); −1 = NO RECORD, a fact
 *  only when the conversation's first record is read and lies after the filing (filed before what its record holds); null =
 *  unknown (a page failed, more than `pages` pages, or nothing read lies past the filing) — never claimed «no record».
 *  `onHit(row)` is told the record the index names (r3: the landing lands on a hit inside its window by the record's id). */
async function filingIndex(item, readPage, { start = 0, end = null, total = null, rows = null, after = [], page = 200, pages = 60, onHit = null } = {}) {
  const at = tsOf(item && { ts: item.createdAt });
  if (!at || typeof readPage !== 'function') return null;
  const win = Array.isArray(rows) ? rows.filter((r) => r && r.id != null) : Array.isArray(after) ? after.slice(0, 40) : [];
  const s0 = Math.max(0, Number(start) || 0), e0 = end == null ? s0 + win.length : Math.max(s0, Number(end) || 0);
  const t0 = total == null ? e0 : Math.max(e0, Number(total) || 0);
  const past = (list) => list.some((r) => tsOf(r) > at + SKEW_MS);
  const hit = (seg, base, more) => { const p = placementOf(item, seg, { resolved: true, more }); const k = p.at != null ? seg.findIndex((r) => r && r.id === p.at) : -1; if (k < 0) return null; if (typeof onHit === 'function') onHit(seg[k]); return base + k; };
  // the window itself (a record drawn as nothing is still a record: its index is known)
  if (Array.isArray(rows)) { const k = hit(win, s0, e0 < t0); if (k != null) return k; }
  // DOWN: the filing lies after what is loaded
  if (e0 < t0 && !past(win)) {
    const ctx = win.slice(-200), base = e0 - ctx.length, got = [];
    let from = e0, found = false, ended = false;
    for (let n = 0; from < t0 && n < pages; n++) {
      let rs;
      try { rs = await readPage(from, Math.min(page, t0 - from)); } catch { return null; }
      if (!Array.isArray(rs)) return null;
      if (!rs.length) { ended = true; break; } // the conversation ends sooner than it was counted
      got.push(...rs); from += rs.length;
      if (past(rs)) { found = true; break; } // a record past the filing (+ the skew margin): the filing lies inside what was read
    }
    if (!found && !ended && from < t0) return null; // out of pages
    return hit([...ctx, ...got], base, found && from < t0); // found, or the conversation's end reached (the filing at its very end)
  }
  // UP: the filing lies before what is loaded
  let top = s0, next = win.slice(0, 40);
  for (let n = 0; top > 0 && n < pages; n++) {
    const from = Math.max(0, top - page);
    let rs;
    try { rs = await readPage(from, top - from); } catch { return null; }
    if (!Array.isArray(rs) || !rs.length) return null;
    const first = rs.find((r) => tsOf(r));
    top = from;
    if (from > 0 && first && tsOf(first) > at + SKEW_MS) { next = rs.slice(0, 40); continue; } // the whole page came after the filing
    if (from > 0 && first && tsOf(first) > at - SKEW_MS) { next = [...rs, ...next]; continue; } // its first record inside the skew margin: the page above too
    const seg = [...rs, ...next]; // contiguous: the page, then the records that follow it
    const k = hit(seg, from, true);
    if (k != null) return k;
    return from === 0 && past(seg) ? -1 : null;
  }
  if (top > 0) return null;
  return past(win) ? -1 : null; // the window starts at the first record and lies after the filing
}

/** The default formatter (the suite and the hub pass none): English with `{param}` filled — the client passes its `t`. */
const fmt = (s, p) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p && p[k] != null ? p[k] : ''));
const ONE = Object.freeze({ approval: i18nKey('an approval'), question: i18nKey('a question'), secret: i18nKey('a secret'), browser: i18nKey('a step in the browser'), check: i18nKey('something to check') });
const MANY = Object.freeze({ approval: i18nKey('{n} approvals'), question: i18nKey('{n} questions'), secret: i18nKey('{n} secrets'), browser: i18nKey('{n} steps in the browser'), check: i18nKey('{n} things to check') });
const kindOf = (e) => (e && KINDS.includes(e.kind) ? e.kind : 'check');
/** THE CHIP's words: nothing open ⇒ null (no chip); one ⇒ «waiting for you · an approval»; several of one kind ⇒
 *  «waiting for you · 3 approvals»; mixed ⇒ «waiting for you · 3» with every kind in the title. Several ⇒ its click LISTS
 *  them (lane needs-card-tail: the chip is the index — choosing one lands it); one ⇒ its click goes to it. */
function chipWords(needs, t = fmt) {
  const list = Array.isArray(needs) ? needs : [];
  if (!list.length) return null;
  const counts = new Map();
  for (const e of list) counts.set(kindOf(e), (counts.get(kindOf(e)) || 0) + 1);
  const said = (k, n) => (n === 1 ? t(ONE[k]) : t(MANY[k], { n }));
  const what = counts.size === 1 ? said(kindOf(list[0]), list.length) : String(list.length);
  const all = [...counts].map(([k, n]) => said(k, n)).join(', ');
  const title = list.length > 1 ? t('This conversation is waiting for you: {all} — click to list them, choose one to go to it', { all }) : t('This conversation is waiting for you: {all} — click to go to it', { all });
  return { text: t('waiting for you · {what}', { what }), title, n: list.length };
}

/** THE END A RECORD SAYS (lane wake-approve-card r8 — the acceptance drove vault-agent-own 4ff55fb4's real door: its late
 *  settles wrote resolvedBy the person ('user') or 'vault' with the outcome in resolvedFact.outcome; the store skipped them and
 *  the late card stayed open with its buttons after the one-run pass was granted, a lock read «完成 · vault», the ruled
 *  'vault_locked' its raw word). A decision row's record reads in 主开发's RULED shape — resolvedBy IS the outcome word, one
 *  of its row's `ends`. A producer that wrote the outcome in its fact instead is read the same (OUTCOME_ENDS — 'late-allowed'
 *  is a late 'allowed') until it writes the ruled one; the store maps it the same way at the write (src/user-todos.js
 *  resolveAnswered). Anything else is an end this client CANNOT CLASSIFY — {unknown: <code>}, worded «outcome unknown ·
 *  <code>» (the code monospace), never «done» and never a bare raw word. → {by, late, mapped} | {unknown} | null (open, or no
 *  decision row: its own words). */
const OUTCOME_ENDS = Object.freeze({ allowed: 'allowed', 'late-allowed': 'allowed', denied: 'denied', expired: 'expired', vault_locked: 'vault_locked' });
/** The ends these words name beyond a row's own (a record from before the decision law: «withdrawn by the agent», …). */
const WORDED_ENDS = Object.freeze(['allowed', 'always', 'denied', 'expired', 'ask-expired', 'ask-over', 'ask-changed', 'vault_locked', 'granted', 'stored', 'delivered', 'discarded', 'agent', 'conversation-gone', 'handed-back']);
function endOf(item) {
  if (!item || item.status === 'open' || !isDecisionRow(item)) return null;
  const by = item.resolvedBy, f = item.resolvedFact && typeof item.resolvedFact === 'object' ? item.resolvedFact : {};
  const late = f.late === true || f.outcome === 'late-allowed';
  if (typeof by === 'string' && (endsOf(item).includes(by) || WORDED_ENDS.includes(by))) return { by, late, mapped: false };
  // r9 (the acceptance: a record a person closed with the generic ✓ / ✕ BEFORE the decision law — resolvedBy 'user', or the
  // engine's 'system' — read «outcome unknown · user»): with no outcome fact it keeps the base's word for its STORED status
  // («dismissed» / «done» / «done · automatically»); «outcome unknown» is only for an end nobody worded
  if ((by === 'user' || by === 'system') && !(typeof f.outcome === 'string' && f.outcome)) return { by, late: false, mapped: false, legacy: true };
  const o = typeof f.outcome === 'string' && Object.prototype.hasOwnProperty.call(OUTCOME_ENDS, f.outcome) ? OUTCOME_ENDS[f.outcome] : null;
  if (o && endsOf(item).includes(o)) return { by: o, late, mapped: true };
  return { unknown: String(by || f.outcome || item.status || '?').slice(0, 40) };
}
/** The record in the ruled shape (endOf's mapping applied: resolvedBy the outcome word, `late` on its fact), else as it is. */
function ruledOf(item) {
  const e = endOf(item);
  return e && e.mapped ? { ...item, resolvedBy: e.by, resolvedFact: { ...item.resolvedFact, ...(e.late ? { late: true } : {}) } } : item;
}

/** r12: the PART of a held decision dropped before it was decided (its watcher no longer woken by those conversations —
 *  the server's heldDroppedOf `{n, k, of, why, agent}` on the record's resolvedFact) → « · <its words>» | ''. */
function heldDropTail(item, t = fmt) {
  const d = item && item.resolvedFact && item.resolvedFact.dropped;
  if (!d || typeof d !== 'object' || !(Number(d.k) > 0)) return '';
  const p = { k: Number(d.k) || 0, m: Number(d.of) || 0, d: Number(d.n) || 0, agent: String(d.agent || '') };
  return ' · ' + (d.why === 'not-covered' ? t('the rule no longer covers {k} of {m} conversations — {d} held messages dropped', p) : t('{k} of {m} conversations no longer wake {agent} — {d} held messages dropped', p));
}
/** The quiet record's VERB — how a resolved card reads in its line («approved · 2 min ago»). */
function settledWords(item, t = fmt, kind = null) {
  const end = endOf(item);
  if (end && end.unknown) return t('outcome unknown');   // r8: the caller draws the code beside it (monospace)
  item = ruledOf(item);
  const by = item && item.resolvedBy;
  const k = kind || (needOf(item) || {}).kind;
  if (item && item.reply && item.reply.text) return t('you replied');
  if (by === 'allowed' && item.resolvedFact && item.resolvedFact.late === true) return t('let through once · waiting for it to run again');   // r8: a late Allow without the person mark (its stamp says «by you» when it has one)
  if (by === 'allowed') return k === 'approval' ? t('approved') : t('allowed');
  if (by === 'denied') return t('denied');
  if (by === 'vault_locked') return t('the vault locked before it was answered');   // r8: never the raw word
  if (by === 'stored') return t('saved to the vault');
  if (by === 'always') { const gw = grantWords(item, { t }); return gw ? gw.text : t(GRANT_VERB.always); }   // r8: the run card's «always» without the person mark — its grant's words (was «done»)
  if (by === 'granted') { const gw = grantWords(item, { t }); return gw ? gw.text : t('allowed'); }   // r4: an agent's request for a stored secret, answered — r6: the duration its record carries (none ⇒ «allowed») and the grant's LIFE (ended / revoked)
  if (by === 'delivered') return t('delivered') + heldDropTail(item, t);   // r6: a held digest the owner released (r12: the part dropped before, said)
  if (by === 'discarded' && item && item.resolvedFact && item.resolvedFact.why === 'watch-removed') return t('the rule they were held for was removed — {n} messages discarded', { n: Number(item.resolvedFact.n) || 0 });   // r9: no watcher left to deliver to — the store ended it, said
  if (by === 'discarded' && item && item.resolvedFact && item.resolvedFact.why === 'access-removed') return t('the access they were held under was removed — {n} messages discarded', { n: Number(item.resolvedFact.n) || 0 });   // r10: its row stands, inert — the grant it lived by was revoked
  if (by === 'discarded' && item && item.resolvedFact && item.resolvedFact.why === 'not-covered') return Number(item.resolvedFact.convs) > 1 ? t('the rule no longer covers its {m} conversations — {n} messages discarded', { m: Number(item.resolvedFact.convs), n: Number(item.resolvedFact.n) || 0 }) : t('the rule no longer covers this conversation — {n} messages discarded', { n: Number(item.resolvedFact.n) || 0 });   // r11: the rule stands, its reach no longer takes the held conversation (r12: a digest's every one)
  if (by === 'discarded') return t('discarded — nothing was sent') + heldDropTail(item, t);
  if (by === 'expired' && item && item.action && item.action.type === 'channel-held-digest') return t('expired — discarded, nothing was sent');   // r6: its end discards
  if (by === 'ask-expired' && item && item.action) return t(DEADLINE_WORDS['timed-out']);   // r7 addendum: a held ask nobody answered in time (a command: exit / run / hub act / automation) keeps its place with its outcome
  if (by === 'expired' || by === 'ask-expired') return isDecisionRow(item) ? t('expired · the agent can ask again') : t('expired');   // r2: a decision's end
  if (by === HIDDEN_BY) return t('hidden — nothing was decided');   // r3: a pointer the person hid
  if (by === 'agent') return t('withdrawn by the agent');
  if (by === 'handed-back') return t('handed back');
  if (by === 'conversation-gone') return t('the conversation ended before you answered');
  return item && item.status === 'dismissed' ? t('dismissed') : t('done');
}

/** DERIVED (lane wake-approve-card) — the types ONLY a person's click on this page decides (`decide: 'person'`): their
 *  door asks THE person verdict (pinned by scripts/test-wake-approve-card.mjs), so their record may say «by you». */
const PERSON_DECIDES = typesWhere((r) => r.decide === 'person');
/** A DECISION ROW HAS TWO VERBS (lane wake-approve-card, acceptance round 2 — 主开发: «a generic close is not a decision»).
 *  An item of a `decide: 'person'` row leaves 'open' ONLY by its decision — `allowed` / `denied`, which the decide route's
 *  engine writes — or by its END (`expired`: the agent can ask again). Nothing else closes it: no ✓ Mark done / ✕ Dismiss is
 *  drawn (the row's own Approve / Deny stand where they stood), «Mark all seen» passes it by («N decisions left for you»), a
 *  reply never answers it; and a decided one is FINAL — never reopened, never re-stamped (an undone Approve would withdraw a
 *  billed wake already proceeding; after a Deny the agent asks again). src/user-todos.js refuses the rest BY NAME
 *  (decision_row / decision_final); the row (user-todos-row.js) and the For-you window (inbox-window-layout.js) draw
 *  `offersClosers` — one answer, three surfaces. */
const DECISION_ENDS = Object.freeze(['allowed', 'denied', 'expired']);
/** A decision row's own ends (its row's `ends`, else DECISION_ENDS) — what src/user-todos.js lets close its item. */
function endsOf(item) { const r = item && item.action && ROW_OF[item.action.type]; return r && Array.isArray(r.ends) ? r.ends : DECISION_ENDS; }
/** The `decide: 'person'` rows whose item DRAWS its two verbs (`card: 'row'`) — the wake request. open-channel is not one: its
 *  item is a door to the Reach dialog (where its Approve / Deny are), and the Outbox's pointer item shares its type (its
 *  producer retracts it — a law that refused that close would leave the pointer standing: test-channel-names F2). */
const DECISION_ROWS = typesWhere((r) => r.decide === 'person' && r.card === 'row');
function isDecisionRow(item) { return !!(item && item.action && typeof item.action === 'object' && DECISION_ROWS.includes(item.action.type)); }
/** Does this item offer the generic closers (✓ Mark done / ✕ Dismiss while open, ↺ Reopen once resolved)? Never a decision row. */
function offersClosers(item) { return !isDecisionRow(item); }
/** A POINTER HIDES, NEVER DECIDES (lane wake-approve-card, acceptance round 3 — 主开发: «an rq- access item is a POINTER to the
 *  Reach dialog (like the Outbox pointer)»). Was: ✓ Mark done on an access request's item recorded «✓ done» while the request
 *  stood open in the Reach dialog — a record that read like an answer nobody gave. A `closer: 'hide'` row's item offers ONE
 *  closer, ✕ «Hide»; the person's close is written as a HIDE (src/user-todos.js: status 'dismissed', `resolvedBy: 'hidden'`)
 *  whatever door sent it (the ✓ a stale page draws, «Mark all seen»); the record says «hidden — nothing was decided»; no
 *  Undo and no ↺ (it comes back by itself while the question is open — channels-access's boot reconcile, the agent's re-ask);
 *  its producer's answer still lands on it (a decision in the Reach dialog stamps the hidden pointer «approved by you»). */
const HIDDEN_BY = 'hidden';
const POINTER_ROWS = typesWhere((r) => r.closer === 'hide');
function isPointer(item) { return !!(item && item.action && typeof item.action === 'object' && POINTER_ROWS.includes(item.action.type)); }
function isHidden(item) { return !!(item && item.status !== 'open' && item.resolvedBy === HIDDEN_BY); }
/** THE CLOSERS a surface draws for `item` (the tray row, the mini inbox and the chat card — one renderer — and the For-you
 *  window): ['done', 'dismiss'] while open / ['reopen'] once resolved; a POINTER ['hide'] / []; a decision row [] (its two
 *  verbs end it). `resolved` = the surface's view (a row resolved in place leads its item's status by a broadcast). */
function closersOf(item, resolved = !!(item && item.status && item.status !== 'open')) {
  if (isDecisionRow(item)) return [];
  if (isPointer(item)) return resolved ? [] : ['hide'];
  return resolved ? ['reopen'] : ['done', 'dismiss'];
}
const DAY_MS = 24 * 60 * 60 * 1000;
/** A WAKE ASK HAS A LIFETIME (acceptance round 3): an OPEN decision row's `expiresAt` in words — «expires in 7 d» (whole
 *  days, rounded), «expires in 5 h» under a day, «expires in 12 min» under an hour; null for anything else (a closed one, an
 *  item of another row — a notice words its own window, src/lib/user-todos-row.js expiresText). The card in the chat and
 *  the tray row say it (one renderer); the For-you window too. */
function expiryWords(item, { t = fmt, now = Date.now() } = {}) {
  if (!item || item.status !== 'open' || !isDecisionRow(item) || !ROW_OF[item.action.type].showsExpiry) return null;
  const at = Number(item.expiresAt);
  if (!Number.isFinite(at) || at <= now) return null;
  const m = Math.ceil((at - now) / 60000);
  if (m < 60) return t('expires in {n} min', { n: m });
  if (m < 24 * 60) return t('expires in {n} h', { n: Math.round(m / 60) });
  return t('expires in {n} d', { n: Math.round((at - now) / DAY_MS) });
}

/** A CARD WITH A DEADLINE SHOWS IT (lane wake-approve-card r7 addendum — the owner: «这种 approval 卡片如果我一直不管，那边指令就会
 *  超时？会发生什么？是不是应该显示个倒计时警告一下用户？»; the run card waited its 60 s in silence, then left). EVERY open ACTION
 *  item carrying `expiresAt` — a generic rule, never one kind's: the run card, a hub act, an automation call, an exit ask —
 *  whose window is ≤ DEADLINE_LIVE_MS counts down BY THE SECOND: «valid for 60 sec · 42 sec left by the server's clock», the
 *  warning accent under DEADLINE_WARN_MS (a longer window — the 7-day wake ask — keeps expiryWords' «expires in 7 d»).
 *  A CLOCK IS THE HUB'S (r8 — the acceptance: a device 60 s fast hid the Allow / Deny of a live 60 s ask from the start, a
 *  device behind kept counting after the hub refused): `now` is the HUB's time as this tab reads it (the caller's — the client
 *  passes user-todos-row's hubNow(): the device clock plus the offset the server's own `now` on every For-you broadcast set),
 *  the countdown only ADVISES, and NO state here withdraws an answer — only the producer's settle does (the item leaves
 *  'open'). Past its end with no settle yet: 'due' («time is up by the server's clock — waiting for the server»), the buttons
 *  kept (a press answers with the door's own words: «too late»). An item its producer marked `action.late` (r7c, the owner's
 *  ruling «A»: the agent's command was refused, an Allow now lets its next run of that command through once — r20b's door)
 *  keeps its buttons and says so. → {at, from, left, total, warn, state: 'live' | 'due' | 'late', text} | null (no live
 *  deadline: a notice words its own window). DEADLINE_WORDS['timed-out'] = a SETTLED ask nobody answered (`ask-expired`). */
const DEADLINE_LIVE_MS = 60 * 60e3;
const DEADLINE_WARN_MS = 15e3;
const DEADLINE_WORDS = Object.freeze({
  live: i18nKey('valid for {total} · {left} left by the server\'s clock'),
  due: i18nKey('time is up by the server\'s clock — waiting for the server'),
  late: i18nKey('timed out — the agent\'s command was refused; Allow now = its next run of this command goes through (once)'),
  'late-lost': i18nKey('timed out — the agent\'s command was refused; the server restarted since, so an Allow now would let nothing through — its next run asks again'),   // r8: vault-agent-own r23's `action.restartLost` (the late pass cannot be minted — fails safe)
  'timed-out': i18nKey('timed out — the agent\'s command was refused (it may ask again)'),
  // r9 (the acceptance: a snapshot with no `now` — an older hub — counted by the DEVICE's clock while saying «by the server's
  // clock»): the same two lines when the hub's time is not known, saying whose clock they count by
  'live-device': i18nKey('valid for {total} · {left} left by this device\'s clock'),
  'due-device': i18nKey('time is up by this device\'s clock — waiting for the server'),
});
const spanWords = (ms, t) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 120) return t('{n} sec', { n: s });
  const m = Math.round(s / 60);
  return m < 120 ? t('{n} min', { n: m }) : t('{n} h', { n: Math.round(m / 60) });
};
function deadlineOf(item, { t = fmt, now = Date.now(), clock = 'hub' } = {}) {   // `clock`: whose time `now` is — 'hub' (the server's, known) | 'device'
  if (!item || item.status !== 'open' || item.kind === 'notice' || item.clearedAt) return null;
  const marked = !!(item.action && item.action.late);   // the PRODUCER says the deadline passed and the card still answers
  const at = Number(item.expiresAt), from = Number(item.createdAt);
  if (!marked && !(Number.isFinite(at) && Number.isFinite(from) && at > from && at - from <= DEADLINE_LIVE_MS)) return null;
  const left = Number.isFinite(at) ? at - now : 0, total = Number.isFinite(at) && Number.isFinite(from) ? at - from : 0;
  const state = marked ? 'late' : left <= 0 ? 'due' : 'live';
  const lost = marked && item.action.restartLost === true;   // r8: a restart since — an Allow would mint nothing (r23); said, and not offered
  const dev = clock === 'device' ? '-device' : '';
  const text = state === 'live' ? t(DEADLINE_WORDS['live' + dev], { total: spanWords(total, t), left: spanWords(left, t) }) : t(DEADLINE_WORDS[lost ? 'late-lost' : state === 'due' ? 'due' + dev : state]);
  return { at, from, left: Math.max(0, left), total, warn: state !== 'live' || left < DEADLINE_WARN_MS, state, text };
}

/** WHO MAY DECIDE (lane wake-approve-card — 主开发's ruling 2026-10-27: canDecide is an IDENTITY fact, never a VIEW fact).
 *  The person holding the owner's cookie decides from EVERY view they open — the live chat, a view-* history, a sub-*
 *  viewer: taking the buttons from a read-only view would cost the owner a door and fence nothing (the fence is the
 *  server's: the cookie + THE person verdict). One row per viewer ROLE an instance can have; `VIEWER_ROLE` is the role every
 *  page has today. 'viewer' is DEFERRED: no instance has a non-owner viewer (Clerk's allowlist names owners only;
 *  window-share shares desktop-app windows, never a chat) — the day one does, its row loses `deferred`, a page names it,
 *  and the card's false branch («waiting for the owner», no buttons) is what it sees. The census
 *  (scripts/test-wake-approve-card.mjs) fails a deferred row a page names, and a role no row declares. */
const VIEWERS = Object.freeze({
  owner: Object.freeze({ canDecide: true, how: 'the owner\'s cookie on this instance\'s page' }),
  viewer: Object.freeze({ canDecide: false, deferred: true, how: 'no instance has a non-owner viewer yet — Clerk\'s allowlist names owners only' }),
});
const VIEWER_ROLE = 'owner';
/** May a viewer of `role` decide? An unknown role may not (fail closed). */
function canDecide(role = VIEWER_ROLE) { const r = Object.prototype.hasOwnProperty.call(VIEWERS, role) ? VIEWERS[role] : null; return !!(r && r.canDecide); }

const pad2 = (n) => String(n).padStart(2, '0');
/** A decision's clock time on this device: «09:41» the same day as `now`, else «10/26 09:41». */
function clockWords(ts, now = Date.now()) {
  const d = new Date(Number(ts) || 0), n = new Date(Number(now) || 0);
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
/** THE DECIDED STAMP (lane wake-approve-card, R1): a `decide: 'person'` row's item the owner decided ⇒ {verb, time, text}
 *  («approved by you», «09:41», «approved by you · 09:41»); anything else ⇒ null (its own words). The chat card's quiet
 *  line and the tray row (resolvedByText — the tray, the mini inbox, the For-you window) both say it: one spelling.
 *  «BY YOU» IS A FACT THE RECORD CARRIES (acceptance round 2): only an item the decide route resolved AFTER THE PERSON
 *  VERDICT — `resolvedFact: {decidedBy: 'person', decidedAt}` (channels-access) — says it, at that time; a record decided
 *  before the verdict stood (a bearer, a curl on the base route) or by any other road keeps its old words («approved»). */
/** THE STAMP'S WORDS per row (`stamp`; acceptance round 3 — 主开发: a held ask's record says «allowed by you · HH:MM», a paste
 *  request's «stored · HH:MM»): resolvedBy → the verb. A resolution the table does not name has no stamp (its own words). */
const STAMPS = Object.freeze({
  approve: Object.freeze({ allowed: i18nKey('approved by you'), denied: i18nKey('denied by you') }),
  allow: Object.freeze({ allowed: i18nKey('allowed by you'), 'allowed:late': i18nKey('let through once by you · waiting for it to run again'), always: i18nKey('always allowed by you'), denied: i18nKey('denied by you') }),   // r7c: a LATE Allow (`resolvedFact.late`) — the agent's next run of the command goes through once
  store: Object.freeze({ stored: i18nKey('stored'), denied: i18nKey('refused by you') }),
  deliver: Object.freeze({ delivered: i18nKey('delivered by you'), discarded: i18nKey('discarded by you') }),   // r6: a held digest's Deliver / Discard
  grant: Object.freeze({ 'granted:once': i18nKey('allowed once by you'), 'granted:8h': i18nKey('allowed by you for 8 h'), denied: i18nKey('denied by you') }),   // r4: vault-grant-ask's three verbs — r6: keyed `granted:<grantedFor>` (the record's fact); an old `granted` (no duration) has no stamp — its own words, «allowed»
});
/** THE GRANT'S LIFE (lane wake-approve-card r6 — 主开发: «a card's state follows the grant's life»; the record was a decision
 *  log that never fell: «allowed by you for 8 h · 09:38» at +9 h, +3 d and after a lock). An agent's request for a stored
 *  secret answered with a grant (`resolvedBy: 'granted'`) → {state: 'live' | 'ended' | 'revoked', at, grantedFor, until}
 *  read off its RECORD: `resolvedFact.grantedFor` ('once' | '8h'; absent on a record from before the field ⇒ «allowed»),
 *  `until`, and the END the vault door writes (`endedAt` / `endedBy`: a lock, the entry's switch OFF = 'revoked', a
 *  once-grant's run, its time, a restart — src/server/vault-run-door.js grantEnded). Past `until` with no end written ⇒ ended
 *  at `until`. null for anything else. THE ONE READER of a grant's state for the card, the tray and the window (the use
 *  check's truth is the door's grant rows; at the vault-use-grants integration the store's verdict — report.md «As-built —
 *  integration note»). */
function grantLifeOf(item, now = Date.now()) {
  // the request's grant (`granted`) and the run card's «always» (`always`, its `alwaysFor` ttl) — the two grants a vault card makes
  const req = !!(item && item.action && item.action.type === 'vault-grant-ask' && item.resolvedBy === 'granted');
  const run = !!(item && item.action && item.action.type === 'vault-run-ask' && item.resolvedBy === 'always');
  if (!req && !run) return null;
  const f = item.resolvedFact && typeof item.resolvedFact === 'object' ? item.resolvedFact : {};
  const grantedFor = run ? 'always' : f.grantedFor === 'once' || f.grantedFor === '8h' ? f.grantedFor : null;
  const until = Number(f.until) > 0 ? Number(f.until) : null;
  const endedAt = Number(f.endedAt) > 0 ? Number(f.endedAt) : null;
  if (endedAt && f.endedBy === 'revoked') return { state: 'revoked', at: endedAt, grantedFor, until };
  if (endedAt) return { state: 'ended', at: endedAt, grantedFor, until, by: String(f.endedBy || 'ended') };
  if (until && now >= until) return { state: 'ended', at: until, grantedFor, until, by: 'time' };
  return { state: 'live', at: null, grantedFor, until };
}
/** A row's own two verbs (`verbs` — the held digest's Deliver / Discard), or null (Approve / Deny). */
const verbsOf = (type) => (ROW_OF[type] && ROW_OF[type].verbs) || null;
const GRANT_VERB = Object.freeze({ '8h': i18nKey('allowed for 8 hours'), once: i18nKey('allowed once'), always: i18nKey('always allowed') });
/** A granted record in words, its life said: «allowed for 8 hours» / «allowed once» / «allowed» (no duration on the record),
 *  «allowed for 8 hours · ended 17:41», «allowed · revoked 17:41». → {verb, when, text, state} | null (not a grant). */
function grantWords(item, { t = fmt, now = Date.now() } = {}) {
  const life = grantLifeOf(item, now);
  if (!life) return null;
  if (life.state === 'revoked') { const verb = t(life.grantedFor === 'always' ? GRANT_VERB.always : 'allowed'), when = t('revoked {time}', { time: clockWords(life.at, now) }); return { verb, when, text: `${verb} · ${when}`, state: 'revoked' }; }
  const verb = t(GRANT_VERB[life.grantedFor] || 'allowed');
  if (life.state === 'ended') { const when = t('ended {time}', { time: clockWords(life.at, now) }); return { verb, when, text: `${verb} · ${when}`, state: 'ended' }; }
  return { verb, when: null, text: verb, state: 'live' };
}
function decidedStamp(item, { t = fmt, now = Date.now() } = {}) {
  if (!item || item.status === 'open' || !item.action || !PERSON_DECIDES.includes(item.action.type)) return null;
  item = ruledOf(item);   // r8: a producer's outcome-in-the-fact settle reads as the ruled one
  const by = item.resolvedBy;
  const fact = item.resolvedFact && typeof item.resolvedFact === 'object' ? item.resolvedFact : null;
  // r6: a grant that ENDED (or was revoked) says so, whoever decided it — «allowed for 8 hours · ended 17:41»
  const gw = by === 'granted' || by === 'always' ? grantWords(item, { t, now }) : null;
  if (gw && gw.state !== 'live') return { verb: gw.verb, time: gw.when, text: gw.text, denied: false, ended: gw.state };
  const words = STAMPS[ROW_OF[item.action.type].stamp] || STAMPS.approve;
  const key = by === 'granted' && fact && (fact.grantedFor === 'once' || fact.grantedFor === '8h') ? `granted:${fact.grantedFor}` : by === 'allowed' && fact && fact.late === true ? 'allowed:late' : by;
  if (!Object.prototype.hasOwnProperty.call(words, key)) return null;
  if (!fact || fact.decidedBy !== 'person') return null;
  const verb = t(words[key]);
  const time = clockWords(Number(fact.decidedAt) || item.resolvedAt || item.createdAt, now);
  return { verb, time, text: `${verb} · ${time}`, denied: by === 'denied' || by === 'discarded' };   // `denied`: the card's quiet red
}
/** THE VAULT-RUN CARD (lane wake-approve-card r7 — the owner, 2026-10-27: «这个卡片的可读性很差», the run card was an English
 *  prose wall on a Chinese UI). The door writes `item.facts` (lane vault-agent-own's PURE `cardFactsOf`: {v, who, tool, cmd,
 *  folder, secrets, hosts, shape, always, templates, masking} — every reason a CODE from its closed tables, never a
 *  sentence); THIS is the ONE reader the tray row, the chat card and the For-you window word it through, in the viewer's
 *  language: a HEADLINE (who + verb + what), the COMMAND (its own box), ≤ 4 fact ROWS with the deciding fact FIRST and
 *  marked, the «Always» HINT (why it is not offered) and the FOLD's technical lines (the full path, the references, what
 *  «Always» remembers, the masking, the templates — never in the body). A value is SEGMENTS: {text} words, {mono} data (a
 *  path, a host, a variable), {aside} a parenthesis, {code} a code these tables have no words for — drawn monospace, never guessed into a
 *  sentence. null = no facts this client reads (v ≠ 1, another kind): the record's prose `detail`, exactly as before.
 *  r11 — ONE PRODUCER CONTRACT (主开发's ruling): vault-agent-own's vault-run.js `cardFactsOf` (+ the door's `whyAgain`) is the
 *  ONLY author of what a run card says; this model draws the facts as they carry them and nothing it reads elsewhere (no
 *  live session name — a fallback that reads the hub is a fact nobody produced): `who`; every clipped string's `<key>Cut`
 *  marker with its `<key>Full` chunks reassembled under the fold (r25's clipFold — a secret's name / entry / ref, an env
 *  name / value, the «Always» directive; r12: the working folder and the program's path; `whoCut` has no fold); `whyAgain` —
 *  the ONE dimension named. r12 — a `<key>Cut` that arrives WITHOUT its `<key>Full` is drawn as what it is — cut, the rest not
 *  available — never as «its whole value» (the acceptance: a producer rename showed a 2 000-character clip as whole, with
 *  its length); the card reads no field the producer does not emit (no `cmdLen`: a cut fold says «over N»). */
/** THE ONE BOUND of a run card's command (r8 — /var/tmp/vibespace-lanes/vault-card-contract.md, both lanes): the body shows
 *  ≤ RUN_CMD_BODY_MAX characters (a longer one: its start + «…», `cmdCut: true`), the fold holds the whole ≤ RUN_CMD_MAX
 *  (`cmdFull`); a longer whole is cut THERE and said — r9: the door sends the QUOTED argv (1 000 single quotes make a
 *  2 035-byte argv a 5 037-character cmd), so the fold can be cut: `cut` names cmdFull and the card's line states only a
 *  total it can prove (the whole fold's own length, else «over 4 096» — r12: never a `cmdLen`, a field no producer emits);
 *  every other facts string ≤ RUN_CMD_BODY_MAX.
 *  src/user-todos.js clips at the write (never throws); the door clips at the same bound. */
const RUN_CMD_BODY_MAX = 2000;
const RUN_CMD_MAX = 4096;
const RUN_ALWAYS_WHY = Object.freeze({   // = vault-run.js's ALWAYS_WHY (int-C: its export is the census's list)
  'destination-unknown': i18nKey('where it sends what it reads is unknown'),
  'program-writable': i18nKey('the program sits in a folder an agent can write'),
  'config-reads': i18nKey('it reads a config file this card cannot show'),
  'card-too-long': i18nKey('what it would run is too long to show on this card'),
  redirect: i18nKey('it follows redirects, so where it ends up is not known'),
  'brace-var': i18nKey('its address is built from a variable this card cannot read'),
  'opaque-route': i18nKey('it routes the connection somewhere its address does not say'),
  'agent-template': i18nKey('the template it fills in sits where an agent could have written it'),
});
const RUN_HOSTS_WHY = Object.freeze({   // = vault-run.js's HOSTS_WHY
  'tool-names-none': i18nKey('this tool does not say where it sends what it reads'),
  opaque: i18nKey('its route hides the host'),
  'config-driven': i18nKey('its config file decides'),
});
const RUN_MASKING = Object.freeze({   // = vault-run.js's MASKING — the sentence the run card said before r7
  'common-encodings': i18nKey('The output is scrubbed of the secret\'s common spellings; a command that re-encodes it can still show it — read the whole command before you allow it.'),
});
const RUN_SHAPE = Object.freeze({   // what «Always» remembers (the shape key's kind)
  tool: i18nKey('«Always» remembers the tool, its flags, the hosts and the secrets — its other arguments may change'),
  line: i18nKey('«Always» remembers this whole command line'),
});
const RUN_AS = Object.freeze({ file: i18nKey('file {name}'), arg: i18nKey('on the command line'), stdin: i18nKey('standard input') });   // env: the variable's own name
const RUN_WHY_AGAIN = Object.freeze({   // = vault-run.js's WHY_AGAIN (r11 — vault-agent-own r25 minor 6b): the ONE way a near-identical rerun differs from the command the owner let through late
  folder: i18nKey('it runs in another folder'),
  env: i18nKey('its environment variable {name} changed'),
  'secret-set': i18nKey('it uses another set of secrets'),
  'arg-order': i18nKey('its arguments are in another order'),
  'arg-space': i18nKey('its arguments are spaced differently'),
  args: i18nKey('its arguments changed'),
});
/** The fact row a reason is ABOUT — that row goes first, with the warning accent. */
const RUN_DECIDES = Object.freeze({ 'destination-unknown': 'hosts', redirect: 'hosts', 'brace-var': 'hosts', 'opaque-route': 'hosts', 'program-writable': 'program' });
const RUN_ROWS = Object.freeze(['hosts', 'program', 'folder', 'secrets']);
const RUN_LABEL = Object.freeze({ hosts: i18nKey('Sends to'), program: i18nKey('Program'), folder: i18nKey('Working folder'), secrets: i18nKey('Secrets') });
function runCardOf(item, { t = fmt } = {}) {
  const f = item && item.action && item.action.type === 'vault-run-ask' && item.facts && typeof item.facts === 'object' && (item.facts.v === 1 || item.facts.v === 2) ? item.facts : null;   // r8: v 2 = vault-agent-own r23 (the chunked folds, env, the templates' text, the reason)
  if (!f) return null;
  const str = (x) => (typeof x === 'string' ? x : '');
  const joined = (x) => (Array.isArray(x) ? x.filter((c) => typeof c === 'string').join('') : str(x));
  // r11 (r25's clipFold): a clipped field → what the card's face draws (its clip + «…») and the WHOLE (its fold reassembled);
  // r12: `lost` — cut, and its fold did not arrive: `whole` is then the clip WITH its «…», never a whole it is not
  const wholeOf = (o, k) => {
    const x = o && typeof o === 'object' ? o : {}, raw = str(x[k]), cut = x[k + 'Cut'] === true, fold = cut ? joined(x[k + 'Full']) : '';
    const shown = cut && raw && !raw.endsWith('\u2026') ? raw + '\u2026' : raw;
    return { shown, whole: fold || (cut ? shown : raw), cut, lost: cut && !fold };
  };
  const LOST = i18nKey('(cut — the rest is not available)');
  const own = (table, code) => typeof code === 'string' && Object.prototype.hasOwnProperty.call(table, code);
  const said = (table, code) => (own(table, code) ? [{ text: t(table[code]) }] : code ? [{ code: String(code) }] : []);
  const list = (xs) => xs.flatMap((x, k) => (k ? [{ text: t(', ') }, ...x] : x));
  const tool = f.tool && typeof f.tool === 'object' ? f.tool : {};
  const folderW = wholeOf(f, 'folder'), pathW = wholeOf(tool, 'path');   // r12: the producer folds both (clipFold) like an env value
  const folder = folderW.whole;
  const asOf = (a) => {
    const kind = a && typeof a === 'object' ? str(a.kind) : '', name = a && typeof a === 'object' ? str(a.name) : '';
    if (kind === 'env') return [{ mono: name }];
    return own(RUN_AS, kind) ? [{ text: t(RUN_AS[kind], { name }) }] : kind ? [{ code: kind }] : [];
  };
  // the secrets by their ENTRY (`entry`, the door's grouping key): «UniFi 账号 · 用户名» and «UniFi 账号 · 密码» are ONE entry
  // «UniFi 账号 → UNIFI_USER、UNIFI_PASS» — its name the head the Vault window's «entry · field» names share (the full names
  // and references: the fold)
  const secrets = (Array.isArray(f.secrets) ? f.secrets : []).filter((s) => s && typeof s === 'object');
  const headOf = (n) => { const cut = n.indexOf(' · '); return cut > 0 ? n.slice(0, cut) : n; };
  const groups = [];
  for (const s of secrets) {
    const name = wholeOf(s, 'name').shown || wholeOf(s, 'ref').shown, key = wholeOf(s, 'entry').whole || headOf(name);
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push(g = { key, names: [], as: [] });
    g.names.push(name); g.as.push(asOf(s.as));
  }
  const entryName = (g) => (g.names.length === 1 ? g.names[0] : g.names.every((n) => headOf(n) === headOf(g.names[0])) ? headOf(g.names[0]) : g.names.join(t(', ')));
  const who = wholeOf(f, 'who').shown || t('An agent'), toolName = str(tool.name) || pathW.shown;   // r11: the facts' own `who` — never the record's live session name
  const headline = groups.length ? t('{who} wants to run {tool} with “{entries}”', { who, tool: toolName, entries: groups.map(entryName).join(t(', ')) }) : t('{who} wants to run {tool}', { who, tool: toolName });
  const a = f.always && typeof f.always === 'object' ? f.always : {};
  const h = f.hosts && typeof f.hosts === 'object' ? f.hosts : {};
  const hosts = (Array.isArray(h.list) ? h.list : []).filter((x) => typeof x === 'string' && x);
  const known = h.known === true && hosts.length > 0;
  const hostWhy = own(RUN_HOSTS_WHY, h.why) ? [{ text: t('unknown ({why})', { why: t(RUN_HOSTS_WHY[h.why]) }) }] : h.why ? [{ text: t('unknown') }, { text: ' ' }, { code: String(h.why) }] : [{ text: t('unknown') }];
  const path = pathW.whole || toolName;
  const rel0 = folder && path.startsWith(folder + '/') ? path.slice(folder.length + 1) : path;
  const rel = rel0.length > RUN_CMD_BODY_MAX ? rel0.slice(0, RUN_CMD_BODY_MAX) + '\u2026' : rel0;   // r12: the program relative to the WHOLE folder (a long folder's tail named: «evil-tail/run.sh»)
  const longAside = (w) => (!w.cut ? [] : [{ aside: w.lost ? t(LOST) : t('(shortened — the whole path is under “{fold}”)', { fold: t('Technical details') }) }]);
  const decides = a.offered === true ? null : RUN_DECIDES[a.why] || null;
  const lines = {
    hosts: [known ? list(hosts.map((x) => [{ mono: x }])) : hostWhy],
    program: [[{ mono: rel }, ...(rel0 !== rel || (pathW.lost && rel0 === path) ? longAside(pathW) : []), ...(tool.writable === true ? [{ aside: t('(in a folder an agent can write)') }] : [])]],
    folder: [[{ mono: folderW.shown }, ...longAside(folderW)]],   // r12: a long folder's clip on the face, said; the whole under the fold
    secrets: groups.map((g) => [{ text: entryName(g) }, { text: ' → ' }, ...list(g.as.filter((x) => x.length))]),
  };
  const rows = [...(decides ? [decides] : []), ...RUN_ROWS.filter((k) => k !== decides)]
    .filter((k) => k !== 'folder' || folder).filter((k) => k !== 'secrets' || groups.length)
    .map((key) => ({ key, label: t(RUN_LABEL[key]), lines: lines[key], warn: key === decides || (key === 'hosts' && !known) }));
  const hint = a.offered === true ? null : [{ text: t('No «Always»: {why}', { why: own(RUN_ALWAYS_WHY, a.why) ? t(RUN_ALWAYS_WHY[a.why]) : '' }).replace(/[:：]\s*$/, (m) => m.trimEnd()) }, ...(a.why && !own(RUN_ALWAYS_WHY, a.why) ? [{ code: String(a.why) }] : []), ...(str(a.directive) ? [{ mono: wholeOf(a, 'directive').shown }] : [])];
  const templates = (Array.isArray(f.templates) ? f.templates : []).filter((x) => x && typeof x === 'object');
  // r8 (a store clips and says, never throws): a command longer than the body's RUN_CMD_BODY_MAX — `cmd` its start, `cmdCut`,
  // the whole (≤ RUN_CMD_MAX) in `cmdFull` (chunks — r23's shape; the store folds an older producer's the same way); the body
  // SAYS it is a cut (drawn with «…») and the fold holds it all, reassembled
  const full = f.cmdCut === true && joined(f.cmdFull) ? joined(f.cmdFull) : null;
  // r9 (a store never states a length it cannot prove — the acceptance: a 2 035-byte argv with 1 000 quotes is a 5 037-char
  // quoted cmd; the store kept 4 096 and the line said «命令共 4096 个字符 … 完整命令在「技术细节」里»): the fold is CUT when a
  // store cut it (`cut` names cmdFull); the total is the chunks' sum only while the fold is whole — a cut fold says «over {max}»
  // r12: no `cmdLen` — no producer emits one (the acceptance: r11's «cut at K» branch was reached only by a hand-built field)
  const foldCut = !!full && Array.isArray(f.cut) && f.cut.includes('cmdFull');
  const total = !full || foldCut ? null : full.length;
  // r8: WHY IT ASKS (r23 `reason`): a secret another conversation stored, a value minted for one host that this run sends to another
  const rs = f.reason && typeof f.reason === 'object' ? f.reason : null;
  const away = (rs && Array.isArray(rs.away) ? rs.away : []).filter((x) => x && typeof x === 'object');
  // r9 (the acceptance: «是为 ? 生成的» — r23's fixture variant 1 has forHost null): a value minted for NO host says so in words
  const awayWords = (x) => {
    const to = x.unknown === true || !str(x.host) ? null : str(x.host), fh = str(x.forHost);
    if (!fh) return to ? t('is tied to no host — this run sends it to {to}', { to }) : t('is tied to no host — where this run sends it cannot be told');
    return to ? t('was minted for {host} — this run sends it to {to}', { host: fh, to }) : t('was minted for {host} — where this run sends it cannot be told', { host: fh });
  };
  const why = [...(rs && rs.notOwn === true ? [[{ text: t('it uses a secret another conversation stored') }]] : []),
    ...away.map((x) => { const rf = wholeOf(x, 'ref'); return [{ mono: rf.whole }, ...(rf.lost ? [{ aside: t(LOST) }] : []), { text: ' ' }, { text: awayWords(x) }]; })];   // r12: a long reference whole (r27's refFull)
  const cut = (Array.isArray(f.cut) ? f.cut : []).filter((x) => typeof x === 'string' && x).slice(0, 16);
  const env = (Array.isArray(f.env) ? f.env : []).filter((x) => x && typeof x === 'object' && str(x.name)).map((x) => ({ name: wholeOf(x, 'name').whole, value: wholeOf(x, 'value') }));   // r8: a run's plain (not secret) --env, when the door says it; r11: a clipped value is said and its whole is a box of its own
  const directive = wholeOf(a, 'directive');
  // r11: the ONE dimension a near-identical rerun differs in from the command let through late (the door's `whyAgain` {code, name})
  const wa = typeof f.whyAgain === 'string' ? { code: f.whyAgain } : f.whyAgain && typeof f.whyAgain === 'object' ? f.whyAgain : null;
  const AGAIN = i18nKey('Asked again — it differs from the command you let through: {why}');
  const again = !wa ? null : own(RUN_WHY_AGAIN, wa.code) ? [{ text: t(AGAIN, { why: wa.code === 'env' && !str(wa.name) ? t('an environment variable changed') : t(RUN_WHY_AGAIN[wa.code], { name: str(wa.name) }) }) }]
    : [{ text: t(AGAIN, { why: '' }).trimEnd() }, { text: ' ' }, { code: String(wa.code || '') }];   // a code this client has no words for: drawn as a code
  const fold = [
    ...(why.length ? [{ label: t('Why it asks'), lines: why }] : []),
    ...(full ? [{ label: foldCut ? t('Command (its first {n} characters)', { n: full.length }) : t('Whole command'), lines: [], cmd: full }] : []),
    ...(cut.length ? [{ label: t('Shortened'), lines: [[{ text: t('too long to keep whole, cut at the card\'s bound:') }, { text: ' ' }, ...list(cut.map((x) => [{ code: x }]))]] }] : []),
    pathW.cut && !pathW.lost ? { label: t(RUN_LABEL.program), lines: [], cmd: path } : { label: t(RUN_LABEL.program), lines: [[{ mono: path }, ...(pathW.lost ? [{ aside: t(LOST) }] : [])]] },   // r12: a long path WHOLE, in its own box
    ...(folderW.cut && !folderW.lost ? [{ label: t('Working folder (whole)'), lines: [], cmd: folderW.whole }] : []),   // r12: a long folder WHOLE (its tail is where the program runs)
    ...(env.length ? [{ label: t('Environment'), lines: env.map((x) => (x.value.lost ? [{ mono: `${x.name}=${x.value.whole}` }, { aside: t(LOST) }] : x.value.cut ? [{ mono: `${x.name}=` }, { aside: t('(its value is {n} characters — shortened on the card, the whole value below)', { n: x.value.whole.length }) }] : [{ mono: `${x.name}=${x.value.whole}` }])) }] : []),
    ...env.filter((x) => x.value.cut && !x.value.lost).map((x) => ({ label: t('{name} (its whole value)', { name: x.name }), lines: [], cmd: x.value.whole })),   // r11: a clipped env value WHOLE, in its own scrolling box (r12: only when its fold arrived)
    ...(secrets.length ? [{ label: t(RUN_LABEL.secrets), lines: secrets.map((s) => { const nm = wholeOf(s, 'name'), rf = wholeOf(s, 'ref'), en = wholeOf(s, 'entry'); return [{ text: nm.whole }, { text: ' — ' }, { mono: rf.whole }, { text: ' → ' }, ...asOf(s.as), ...(nm.lost || rf.lost || en.lost ? [{ aside: t(LOST) }] : nm.cut || rf.cut || en.cut ? [{ aside: t('(shortened on the card — whole here)') }] : [])]; }) }] : []),
    ...(directive.cut && !directive.lost ? [{ label: t('Its config directive (whole)'), lines: [], cmd: directive.whole }] : []),   // r11: the «Always» hint's directive, whole
    ...(known ? [{ label: t(RUN_LABEL.hosts), lines: hosts.map((x) => [{ mono: x }]) }] : []),
    ...(f.shape ? [{ label: t('Shape'), lines: [said(RUN_SHAPE, f.shape)] }] : []),
    ...(f.masking ? [{ label: t('Output'), lines: [said(RUN_MASKING, f.masking)] }] : []),
    ...(templates.length ? [{ label: t('Templates'), lines: templates.map((x) => [{ mono: str(x.label) }, { text: ' · ' + t('{n} bytes', { n: Number(x.bytes) || 0 }) + (x.shown === false ? ' · ' + t('not shown on this card') : '') }]) }] : []),
    ...templates.filter((x) => x.shown !== false && (str(x.text) || joined(x.textFull))).map((x) => ({ label: str(x.label) || t('Templates'), lines: [], cmd: joined(x.textFull) || str(x.text) })),   // r8: a template's text (its chunked fold reassembled — r23)
  ];
  const cmd0 = str(f.cmd), shown = full ? cmd0.replace(/\u2026$/, '').length : cmd0.length;
  const cmd = full && !/\u2026$/.test(cmd0) ? cmd0 + '\u2026' : cmd0;   // the body's cut is drawn as one
  const cutText = !full ? null : !foldCut ? t('The command is {n} characters long; the card shows its first {m} — the whole command is under “{fold}”.', { n: total, m: shown, fold: t('Technical details') })
    : t('The command is over {max} characters, so the whole command was not kept: see its run record in the Vault window. The card shows its first {m}.', { max: full.length, m: shown });   // r12: the cut point is what ARRIVED (the store's 4 096) — no producer states a total past it
  return { headline, cmd, cut: full ? { n: total, whole: !foldCut, shown, text: cutText } : null, again, rows, always: { offered: a.offered === true, hint }, fold };
}
/** r9 (a store says when it DROPS): a run card whose facts the store dropped files a stub `{dropped, cut: ['facts']}` (no `v` —
 *  runCardOf reads it as no facts: the prose, as before) and its card says so in ONE line above the text. → words | null */
const FACTS_DROPPED_WORDS = Object.freeze({ 'too-large': i18nKey('The facts were too large to keep — the card shows its text only'), 'not-an-object': i18nKey('The facts could not be read — the card shows its text only') });
function factsDroppedWords(item, { t = fmt } = {}) {
  const f = item && item.facts;
  if (!f || typeof f !== 'object' || typeof f.dropped !== 'string') return null;
  return t(Object.prototype.hasOwnProperty.call(FACTS_DROPPED_WORDS, f.dropped) ? FACTS_DROPPED_WORDS[f.dropped] : FACTS_DROPPED_WORDS['not-an-object']);
}
/** THE DECISION CARD'S MODEL (lane wake-approve-card) — `item` → {state, buttons, stamp, waiting}:
 *   'filed'         open, and this viewer may decide ⇒ buttons ['approve', 'deny'] (the row's own verbs — the tray's route)
 *   'waiting-owner' open, and this viewer may NOT (canDecide false) ⇒ NO buttons, `waiting` = the words it reads instead
 *   'approved' / 'denied' — decided; `stamp` = decidedStamp (a person row) or the settled verb
 *   'expired' / 'withdrawn' / 'settled' — over without a decision; never a button
 *   'ended' / 'revoked' — r6: a grant whose life is over (grantLifeOf: past its end, a lock, its one use / revoked) */
function decisionCard(item, { role = VIEWER_ROLE, t = fmt, now = Date.now() } = {}) {
  const it = ruledOf(item) || {};
  if (it.status === 'open') {
    return canDecide(role)
      ? { state: 'filed', buttons: ['approve', 'deny'], stamp: null, waiting: null }
      : { state: 'waiting-owner', buttons: [], stamp: null, waiting: t('waiting for the owner — answer it in the conversation or in For you') };
  }
  const st = decidedStamp(it, { t, now });
  const by = it.resolvedBy;
  const life = by === 'granted' || by === 'always' ? grantLifeOf(it, now) : null;   // r6: a grant's card follows its LIFE — 'ended' / 'revoked', never 'approved' for ever
  const state = life && life.state !== 'live' ? life.state : by === 'allowed' || by === 'always' || by === 'stored' || by === 'granted' || by === 'delivered' ? 'approved' : by === 'denied' || by === 'discarded' ? 'denied' : (by === 'expired' || by === 'ask-expired') ? 'expired' : by === 'agent' ? 'withdrawn' : 'settled';
  return { state, buttons: [], stamp: st ? st.text : settledWords(it, t), waiting: null };
}

/** WHERE an item IS shown and answered — read off its registry row (acceptance round 3, #5: the hub told an agent its
 *  `--notice` was «on the card in this conversation»; a notice has no card). `x` = an action TYPE (a producer that knows
 *  the row it files) or the filed ITEM. 'card' = the chat's needs card draws it (its verbs, and the tray's) · 'tray' = no
 *  conversation's chat draws it (filed under a group key with no `about`, a global producer) — the tray only · 'window' =
 *  its own buttons are the For-you window's (card: 'inbox-window') · 'owner' = another card in the chat (or its own form)
 *  answers it — `on` names it · 'notice' = no card, nothing to answer (the tray's Notices). */
function surfaceOf(x) {
  const ofRow = (r, about = false) => {
    if (!r.chat) return { at: 'owner', kind: r.kind || null, on: r.on || null };
    if (r.card === 'inbox-window') return { at: 'window', kind: r.kind || 'check', on: null };
    return { at: r.scope === 'group' && !about ? 'tray' : 'card', kind: r.kind || 'check', on: null };
  };
  if (typeof x === 'string') return ROW_OF[x] ? ofRow(ROW_OF[x]) : { at: 'card', kind: 'check', on: null };
  if (!x || typeof x !== 'object' || x.kind === 'notice') return { at: 'notice', kind: null, on: null };
  const type = !x.jobId && x.action && typeof x.action.type === 'string' ? x.action.type : '';
  if (type && ROW_OF[type]) return ofRow(ROW_OF[type], typeof x.about === 'string' && !!x.about);
  const n = needOf(x);
  if (!n) return { at: 'notice', kind: null, on: null };
  const o = (x.jobId ? BY_ORIGIN.jobs : BY_ORIGIN[x.origin]) || {};
  if (!n.card) return { at: 'owner', kind: n.kind || null, on: o.on || null };
  return { at: o.scope === 'global' ? 'tray' : 'card', kind: n.kind || 'check', on: null };
}
/** THE AGENT'S LINE after a filing, one per surface (the hub's words — a CLI prints it as it stands). */
const FILED = Object.freeze({
  card: 'Filed for you: {what} — answer it on the card in this conversation or in {tray}',
  tray: 'Filed for you: {what} — answer it in {tray}',
  window: 'Filed for you: {what} — answer it in the For-you window (open it from {tray})',
  owner: 'Filed for you — answer it on {on} or in {tray}',
  notice: 'Filed as a notice — it shows in {tray}\'s Notices, no answer needed',
});
/** `x` = the row's action TYPE or the filed ITEM (surfaceOf); `tray` = owner-facts' tray words. */
function filedLine(x, id, tray = null) {
  const s = surfaceOf(x);
  const where = (tray && typeof tray.name === 'string' && tray.name) || 'the For-you tray';
  return fmt(FILED[s.at], { what: fmt(ONE[KINDS.includes(s.kind) ? s.kind : 'check']), tray: where, on: s.on || 'its own card in this conversation' }) + (id ? ` (${id})` : '');
}

module.exports = { ROWS, ROW_OF, ANSWERS, CARDS, ACTION_IDENTITY, WAIT_ACTIONS, CARD_ACTION_TYPES, ANSWER_ACTION_TYPES, KINDS, KIND_WORDS: ONE, SURFACES, BY_TYPE, BY_ORIGIN, IDENTITY_FIELDS, SKEW_MS, FILED_WINDOW_MS, needOf, needsOf, recordsOf, placementOf, tailPlan, drawnAt, filingIndex, chipWords, settledWords, surfaceOf, FILED, filedLine, PERSON_DECIDES, DECISION_ROWS, DECISION_ENDS, endsOf, STAMPS, isDecisionRow, offersClosers, CLOSERS, HIDDEN_BY, POINTER_ROWS, isPointer, isHidden, closersOf, expiryWords, VIEWERS, VIEWER_ROLE, canDecide, clockWords, decidedStamp, decisionCard, grantLifeOf, grantWords, verbsOf, runCardOf, factsDroppedWords, FACTS_DROPPED_WORDS, RUN_ALWAYS_WHY, RUN_WHY_AGAIN, RUN_HOSTS_WHY, RUN_MASKING, RUN_SHAPE, RUN_CMD_BODY_MAX, RUN_CMD_MAX, deadlineOf, DEADLINE_WORDS, DEADLINE_LIVE_MS, DEADLINE_WARN_MS, OUTCOME_ENDS, endOf, ruledOf };
