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
 *   chipWords(needs, t)          → {text, title} | null — «waiting for you · an approval» / «· 3 approvals» / «· 3»
 *   settledWords(item, t)        → «approved» / «denied» / «saved to the vault» / «done» … (the quiet line's verb)
 *   surfaceOf(type | item)       → {at: 'card' | 'window' | 'owner' | 'notice', kind, on} — where it IS shown and answered
 *   filedLine(type | item, id, tray) → THE one line an agent can quote after a filing (the hub's words; a CLI prints it),
 *                                  worded from surfaceOf — never «the card in this conversation» for an item with none
 *   SURFACES                     → every surface that shows a conversation its own items, and whether it reads `about`
 * `transcript` = the chat's loaded records as lean rows {id, ts, role, tool, cmd, out} (chat-needs-card.js maps them).
 */

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
  { type: 'hub-act-ask', identity: 'askId', producer: 'src/server/hub-act-ask.js', waits: false, answer: 'buttons', card: 'row', handled: true, chat: true, kind: 'approval', scope: 'group' },
  // ── vault ──
  { type: 'automation-ask', identity: 'askId', producer: 'src/server/automation-engine.js', waits: false, answer: 'buttons', card: 'row', handled: true, chat: true, kind: 'approval', cli: C('vibespace-api', 'an automation key\'s first use', 'own'), scope: 'conversation' },
  { type: 'vault-run-ask', identity: 'askId', producer: 'src/server/vault-run-door.js', waits: false, answer: 'buttons', card: 'row', handled: true, chat: true, kind: 'approval', cli: C('vibespace-vault', 'run', 'wait'), scope: 'conversation' },
  { type: 'vault-grant-ask', identity: 'askId', producer: 'src/server/vault-run-door.js', waits: false, answer: 'buttons', card: 'row', handled: true, chat: true, kind: 'approval', cli: C('vibespace-vault', 'request <vault://…>', 'filed'), scope: 'conversation' },
  { type: 'secret-request', identity: 'requestId', producer: 'src/server/vault-paste-door.js', waits: false, answer: 'buttons', card: 'row', handled: true, chat: true, kind: 'secret', cli: C('vibespace-vault', 'request "<what>"', 'filed'), scope: 'conversation' },
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
  { type: 'channel-watch-request', identity: null, producer: 'src/server/channels-access.js', waits: false, answer: 'reply', card: 'row', handled: true, chat: true, kind: 'approval', cli: C('vibespace-channels', 'watch --mode wake', 'filed'), scope: 'about' },
  { type: 'open-channel', identity: 'key', producer: 'src/server/channels-access.js', waits: false, answer: 'reply', card: 'none', handled: true, chat: true, kind: 'approval', cli: C('vibespace-channels', 'request', 'filed'), scope: 'about' },
  { type: 'channel-api-proposal', identity: 'id', producer: 'src/server/channel-api-cards.js', builtIn: 'src/channel-api-card.js', waits: false, answer: 'reply', card: 'row', handled: true, chat: false, owner: 'the raw-API card the chat draws where it was proposed (B-2198) — src/lib/channel-api-card-view.js', on: 'the API card in this conversation', scope: 'group' },
  { type: 'channel-reauth', identity: null, producer: 'src/server/channels-engine.js', waits: false, answer: 'reply', card: 'row', handled: true, chat: true, kind: 'check', scope: 'group' },
  // ── an app on the desktop ──
  { type: 'desktop-app-notify', identity: null, producer: 'src/server/desktop-app-keeper.js', waits: false, answer: 'reply', card: 'inbox-window', handled: true, chat: true, kind: 'check', scope: 'group' },
].map((r) => Object.freeze(r)));
const ANSWERS = Object.freeze(['card', 'buttons', 'reply']);
const CARDS = Object.freeze(['row', 'inbox-window', 'none']);
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
 *  'end'   — else (the anchor is older than what is loaded, or nothing is) the END of the last turn — an open card is
 *            never hidden in history that is not loaded; a RESOLVED one there is 'none' (history stays history). */
function placementOf(item, transcript, { resolved = false } = {}) {
  const rows = Array.isArray(transcript) ? transcript.filter((r) => r && r.id != null) : [];
  const at = Number(item && item.createdAt) || 0;
  const ids = item ? idsOf(item) : [];
  for (let k = rows.length - 1; k >= 0; k--) {
    const r = rows[k];
    if (r.role === 'tool' && typeof r.out === 'string' && r.out && ids.some((id) => r.out.includes(id))) return { at: r.id, how: 'named' };
  }
  const n = needOf(item);
  const cli = n && n.cli;
  if (cli && at) {
    for (let k = rows.length - 1; k >= 0; k--) {
      const r = rows[k], ts = Number(r.ts) || 0;
      if (ts > at + SKEW_MS) continue;
      if (ts < at - FILED_WINDOW_MS) break;
      if (r.role === 'tool' && typeof r.cmd === 'string' && cli.test(r.cmd)) return { at: r.id, how: 'tool' };
    }
  }
  if (at && rows.length) {
    let hit = null;
    for (const r of rows) { const ts = Number(r.ts) || 0; if (ts && ts <= at + SKEW_MS) hit = r; }
    // the first loaded record is AFTER the filing: its anchor is in history not loaded
    if (hit && !(hit === rows[0] && Number(rows[0].ts) > at)) return { at: hit.id, how: 'turn' };
  }
  if (resolved) return { at: null, how: 'none' };
  return { at: rows.length ? rows[rows.length - 1].id : null, how: 'end' };
}

/** The default formatter (the suite and the hub pass none): English with `{param}` filled — the client passes its `t`. */
const fmt = (s, p) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p && p[k] != null ? p[k] : ''));
/** `i18nKey` = the extractor's marker for a declared human-visible string. */
const i18nKey = (s) => s;
const ONE = Object.freeze({ approval: i18nKey('an approval'), question: i18nKey('a question'), secret: i18nKey('a secret'), browser: i18nKey('a step in the browser'), check: i18nKey('something to check') });
const MANY = Object.freeze({ approval: i18nKey('{n} approvals'), question: i18nKey('{n} questions'), secret: i18nKey('{n} secrets'), browser: i18nKey('{n} steps in the browser'), check: i18nKey('{n} things to check') });
const kindOf = (e) => (e && KINDS.includes(e.kind) ? e.kind : 'check');
/** THE CHIP's words: nothing open ⇒ null (no chip); one ⇒ «waiting for you · an approval»; several of one kind ⇒
 *  «waiting for you · 3 approvals»; mixed ⇒ «waiting for you · 3» with every kind in the title. */
function chipWords(needs, t = fmt) {
  const list = Array.isArray(needs) ? needs : [];
  if (!list.length) return null;
  const counts = new Map();
  for (const e of list) counts.set(kindOf(e), (counts.get(kindOf(e)) || 0) + 1);
  const said = (k, n) => (n === 1 ? t(ONE[k]) : t(MANY[k], { n }));
  const what = counts.size === 1 ? said(kindOf(list[0]), list.length) : String(list.length);
  const all = [...counts].map(([k, n]) => said(k, n)).join(', ');
  return { text: t('waiting for you · {what}', { what }), title: t('This conversation is waiting for you: {all} — click to go to the newest card', { all }), n: list.length };
}

/** The quiet record's VERB — how a resolved card reads in its line («approved · 2 min ago»). */
function settledWords(item, t = fmt, kind = null) {
  const by = item && item.resolvedBy;
  const k = kind || (needOf(item) || {}).kind;
  if (item && item.reply && item.reply.text) return t('you replied');
  if (by === 'allowed') return k === 'approval' ? t('approved') : t('allowed');
  if (by === 'denied') return t('denied');
  if (by === 'stored') return t('saved to the vault');
  if (by === 'expired' || by === 'ask-expired') return t('expired');
  if (by === 'agent') return t('withdrawn by the agent');
  if (by === 'handed-back') return t('handed back');
  if (by === 'conversation-gone') return t('the conversation ended before you answered');
  return item && item.status === 'dismissed' ? t('dismissed') : t('done');
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

module.exports = { ROWS, ROW_OF, ANSWERS, CARDS, ACTION_IDENTITY, WAIT_ACTIONS, CARD_ACTION_TYPES, ANSWER_ACTION_TYPES, KINDS, KIND_WORDS: ONE, SURFACES, BY_TYPE, BY_ORIGIN, IDENTITY_FIELDS, SKEW_MS, FILED_WINDOW_MS, needOf, needsOf, recordsOf, placementOf, chipWords, settledWords, surfaceOf, FILED, filedLine };
