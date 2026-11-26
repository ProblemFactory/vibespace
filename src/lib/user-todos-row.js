// THE For-you row renderer (docs/design-user-inbox-reply.md chunk 2, 2026-09-23).
//
// ONE function draws every row the inbox shows — an open ask, a notice, a row
// resolved IN PLACE while the popup is open (inc-mtw02kbq-kj96), and a row of
// the "Recently resolved" tail — and ONE function patches an existing row to a
// new state. The panel (src/lib/user-todos-panel.js) reconciles keyed rows with
// these two, and chunk 3's per-window mini inbox reuses them (`ctx.mini`).
//
// Why a separate file: the popup used to re-render wholesale (`popup.innerHTML
// = …`) on every broadcast. That was fine while a row held only buttons; a row
// now holds a REPLY BOX the user types into, and one broadcast (another item
// filed, another client's ✓) would have swallowed the text and the focus. So:
//   renderRow(entry, ctx)       → a fresh `.ut-item[data-id]` element
//   patchRow(el, entry, ctx)    → the same element brought to `entry`; a
//                                 `.ut-reply` box on it is NEVER replaced
//                                 (its focus and its text survive)
//   applyLive(el, item, ctx)    → only the live half (reply button / option
//                                 chips / Send: enabled + tooltip) — the panel
//                                 calls it on every active-sessions broadcast
//                                 without touching anything else
//   replyBoxEl(t)               → the box (a one-line auto-growing textarea +
//                                 Send), inserted under the row's text
//
// XSS: every item string (title, detail, option labels, the session name, the
// reply) is a peer/user-controlled string synced to EVERY client — each one
// goes through escHtml here, and nothing else in this file builds markup.
//
// entry = {item, resolved, notice?, tail?, band?}   (band: a tray attention-list row — lane foryou-folds)
// ctx   = {t, nameFor(key, items), wordsOf(item), detailOf(item),
//          replyState(item) → {show, enabled, why}, optionsOf(item) → [label] (the chips: the agent's options, else
//          its detail's parsed — lane foryou-honest, PURE src/ask-options.js), mini?}
import { escHtml, formatSize } from './utils.js'; // formatSize: a size a person reads (the proposal card's memory)
import { cutOffWords, isProposal, cardSig } from '../end-proposal.js'; // PURE (CJS, lane login-request-card piece 3b): what would be cut off, in the person's words
import { vsLinkHtml } from './internal-link-door.js'; // lane login-request-card piece 1: THE drawing of a conversation / desktop link
import { tc, t as tr, deviceLocale } from './i18n.js'; // lane foryou-honest: «Dismiss» in the For-you sense (忽略 — the plain key is a dialog's «close»); r7: the deadline ticker's words (no ctx at a tick)
import { techFoldHtml } from './plain-words.js'; // lane ui-plain-words: an item's mechanics (`i18n.fold`) under ONE «技术细节» fold
import { dateOf, stampAt } from './page-time.js'; // lane ui-language: the ONE formatter of a time / number a person reads
import { UI_ICONS } from './icons.js';
import { getFileIcon } from './file-types.js';
import { REACH_CHOICES, reachWord, reachTitle } from './automation-reach.js'; // lane key-instance-scope: the first-use card's reach choices (one spelling with the For-you window and the Vault window)
import { isSettingKey, SETTINGS_SCHEMA } from './settings-schema.js'; // lane setting-doors pick 1: THE client's schema test — a `vibespace://settings/<key>` link only when the key IS a row
import { linkedHtml, segmentText, maskedLinkNote, maskedNoteOf } from './foryou-links.js'; // PURE (lane foryou-attachments): THE links in an item's words — one grammar with the chat
import { cardWords, progressWords } from './app-card-model.js'; // design 009: THE words of an app install's one card (PURE)
import { attachDictation, voiceField } from './voice-input.js'; // lane voice-everywhere: the microphone on every message box
import { buttonsOf, buttonsNoteOf, endWordsOf, receiptWords } from '../foryou-actions.js';   // lane queued-is-not-woke: a row's declared buttons
import { decidedStamp, PERSON_DECIDES, closersOf, doorOf, isParkedAsk, isHidden, expiryWords, isDecisionRow, grantWords, verbsOf, runCardOf, runStripOf, factsDroppedWords, deadlineOf, endOf, ruledOf } from '../foryou-actions.js'; // PURE (lane wake-approve-card): THE decided stamp «approved by you · 09:41» — one spelling with the chat card; r3: the closers a row draws, a pointer's hide, a wake ask's lifetime
import { fieldWhole } from '../inbox-origin.js'; // PURE: batch 47's cure — only the AGENT's own ask (isAsk: via 'ask', vibespace-ask) has whole words; B-76dc: fieldWhole = the ONE answer every surface asks
import { isSecretAsk, secretBoxEl } from './vault-paste-box.js'; // lane vault-paste-request: an agent's request for a secret — its masked paste box (kept across repaints, like the reply box)
import { pressVerdict as settingPressVerdict, isProposable, isSettingChange, holdIsLive, PROPOSABLE } from '../ask-setting.js'; // PURE (CJS, lane setting-doors pick 2): an ask that PROPOSES one change of one setting — THE verdict the card draws (the hub judges it again)
import { clockAt } from '../stash-summary.js'; // PURE: an instant in the viewer's zone (the product's one spelling — «22:00», «Sun 22:00»)

/** "3min ago" / "2h ago" / a date — words by the caller's t(). */
export function agoText(ts, t) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return t('just now');
  if (m < 60) return t('{m}min ago', { m });
  const h = Math.round(m / 60);
  return h < 24 ? t('{h}h ago', { h }) : dateOf(ts);
}
/** 2.369.152: a notice about a WINDOW carries the window's end (`expiresAt`). */
export function expiresText(ts, t) {
  if (!(typeof ts === 'number' && Number.isFinite(ts))) return '';
  const m = Math.ceil((ts - Date.now()) / 60000);
  if (m <= 0) return '';
  return m < 60 ? t('expires in {n} min', { n: m }) : m < 24 * 60 ? t('expires in {n} h', { n: Math.round(m / 60) }) : t('expires in {n} d', { n: Math.round(m / 1440) }); // r3: a lifetime in days
}
/** The END a row says under its age: a notice's window (expiresText), an open decision row's lifetime (lane wake-approve-card
 *  r3 — THE registry's expiryWords: «expires in 7 d»), nothing for any other item. */
export function itemExpiryText(i, t, notice = false) {
  if (notice) return expiresText(i && i.expiresAt, t);
  return expiryWords(i, { t }) || '';
}
/** The status word of a resolved row — «done» / «dismissed», and a POINTER the person hid «hidden — nothing was decided»
 *  (lane wake-approve-card r3: never «done»: hiding decides nothing). */
export function statusWords(i, t) {
  if (isHidden(i)) return t('hidden — nothing was decided');
  if (i && i.resolvedBy === 'ask-expired' && i.action) return t('timed out — the agent\'s command was refused (it may ask again)'); // r7 addendum: an ask nobody answered in time keeps its place, its outcome said (never «done»)
  const end = endOf(i);
  if (end && end.unknown) return t('outcome unknown'); // r8: a decision row's end this client cannot classify — its code beside it (endCodeOf), never «done»
  return i && i.status === 'dismissed' ? t('dismissed') : t('done');
}
/** r8: the code of an end this client cannot classify (THE registry's endOf) — drawn monospace beside «outcome unknown»; '' else. */
export function endCodeOf(i) {
  const end = endOf(i);
  return end && end.unknown ? end.unknown : '';
}
/** r12: a held decision's PART dropped before it was decided (its watcher no longer woken by those conversations — the
 *  server's heldDroppedOf on the record's resolvedFact) → « · <its words>» | '' (the twin of foryou-actions settledWords'). */
function heldDropTail(item, t) {
  const d = item && item.resolvedFact && item.resolvedFact.dropped;
  if (!d || typeof d !== 'object' || !(Number(d.k) > 0)) return '';
  const p = { k: Number(d.k) || 0, m: Number(d.of) || 0, d: Number(d.n) || 0, agent: String(d.agent || '') };
  return ' · ' + (d.why === 'not-covered' ? t('the rule no longer covers {k} of {m} conversations — {d} held messages dropped', p) : t('{k} of {m} conversations no longer wake {agent} — {d} held messages dropped', p));
}
/** 主开发 r5164 (2) / r5176 (4): THE AGENT'S RECEIPT OF A PERSON'S ANSWER — a producer that settled the record for a person (the vault's
 *  paste answer, an app proposal's decision) marks it while the agent's receipt is not on disk yet (`not-on-disk`) or could not be
 *  queued (`not-queued`); the mark leaves once it landed or a turn took it (src/user-todos.js noteReceipt). Said after the record's own
 *  words; no path, no value. */
export function resolvedByText(by, t, item = null) {
  const base = resolvedByTextOf(by, t, item);
  const tail = receiptWords(item && item.resolvedFact && item.resolvedFact.receipt, t);
  return tail ? (base ? `${base} · ${tail}` : tail) : base;
}
/** Who resolved it, in words ('expired' = the store's sweep, 'reply' = the
 *  user's own inbox reply, design-user-inbox-reply D1.4). `item` = the
 *  resolved item, for a resolution worded with its fact ('resumed'). */
function resolvedByTextOf(by, t, item = null) {
  // lane wake-approve-card: a decision only a person's click makes (a `decide: 'person'` row — a wake request, a reach request)
  // reads as the chat card's record does: «approved by you · 09:41» / «denied by you · 09:41» — the tray, the mini inbox and
  // the For-you window all word a resolved row here
  const stamp = item ? decidedStamp(item, { t }) : null;
  if (stamp) return stamp.text;
  const end = item ? endOf(item) : null;
  if (end && end.unknown) return ''; // r8: statusWords says «outcome unknown», endCodeOf draws its code — never the raw word here
  if (end && end.mapped) { item = ruledOf(item); by = item.resolvedBy; } // r8: a producer's outcome-in-the-fact settle reads as the ruled one
  // lane passkey-browse-yourself r10: a passkey registration card's «Allow once» taken back by a later answer before it was used — read off the record's
  // FACT (browser-dialogs is the one writer of endedBy 'later-answer'), never a literal action id (test-architecture §78's ratchet)
  const pkEnd = item && item.resolvedFact && item.resolvedFact.endedBy === 'later-answer' ? Number(item.resolvedFact.endedAt) : 0;
  if (pkEnd > 0) { const d = new Date(pkEnd); return t('allowed once · withdrawn by your later answer at {time}', { time: stampAt(d.getTime(), { words: true }) }); }
  if (by === 'agent') return t('by the agent');
  if (by === 'system') return t('automatically');
  if (by === 'expired') return item && isDecisionRow(item) ? t('expired · the agent can ask again') : t('expired'); // r3: a wake ask's END (its lifetime) — the card's words
  if (by === 'reply') return t('by your reply');
  if (by === 'handed-back') return t('handed back'); // lane browser-takeover-queue: a takeover request answered by the handback
  // lane-pairing ⑥: an exit's "ask me each time" item is resolved BY its outcome
  if (by === 'allowed' && item && item.resolvedFact && item.resolvedFact.late === true) return t('let through once · waiting for it to run again'); // r8: a late Allow without the person mark
  if (by === 'allowed') return t('allowed');
  if (by === 'denied') return t('denied');
  if (by === 'vault_locked') return t('the vault locked before it was answered'); // r8: never the raw word
  if (by === 'revoked') return t('access removed');
  if (by === 'ask-expired') return item && item.action ? '' : t('expired'); // r7 addendum: the status word says it all (statusWords — «timed out — the agent's command was refused …»)
  if (by === 'ask-changed') return t('not run — it changed after it was shown'); // verify-r6 W1
  if (by === 'ask-over') return t('this request is over — the agent can ask again'); // verify-r6 W2: a reopened ask that is over
  if (by === 'hidden') return ''; // r3: a hidden pointer's status word says it all (statusWords) — nothing was decided
  if (by === 'conversation-gone') return t('the conversation ended before you answered');
  if (by === 'hub-restart') return t('VibeSpace restarted before it was answered'); // B-ebb7: a past hub life's sign-in ask (browser-dialogs' sweep)
  if (by === 'stored') return t('saved to the vault'); // lane vault-paste-request: a paste request answered by its paste
  if (by === 'delivered') return t('delivered') + heldDropTail(item, t); // r6: a held digest the owner released (Deliver) — r12: the part dropped before, said
  if (by === 'discarded' && item && item.resolvedFact && item.resolvedFact.why === 'watch-removed') return t('the rule they were held for was removed — {n} messages discarded', { n: Number(item.resolvedFact.n) || 0 }); // r9: no watcher left to deliver to
  if (by === 'discarded' && item && item.resolvedFact && item.resolvedFact.why === 'access-removed') return t('the access they were held under was removed — {n} messages discarded', { n: Number(item.resolvedFact.n) || 0 }); // r10: the grant its watcher lived by was revoked
  if (by === 'discarded' && item && item.resolvedFact && item.resolvedFact.why === 'not-covered') return Number(item.resolvedFact.convs) > 1 ? t('the rule no longer covers its {m} conversations — {n} messages discarded', { m: Number(item.resolvedFact.convs), n: Number(item.resolvedFact.n) || 0 }) : t('the rule no longer covers this conversation — {n} messages discarded', { n: Number(item.resolvedFact.n) || 0 }); // r11: out of the rule's reach (its rules edited, the conversation renamed) — r12: a digest's every one
  if (by === 'discarded') return t('discarded — nothing was sent') + heldDropTail(item, t); // …or dropped (Discard)
  if (by === 'granted') { const gw = item ? grantWords(item, { t }) : null; return gw ? gw.text : t('allowed'); } // r4: an agent's request for a stored secret (vault-grant-ask) answered — r6: the duration its record carries (none ⇒ «allowed») and the grant's life (ended / revoked), THE reader foryou-actions grantWords
  // B-2198 part 2: a raw-API proposal's item is answered BY its outcome (the card's words: Ran · 200 · 1.2 KB / Rejected by you)
  if (by === 'channel-api' && item && item.resolvedFact && item.resolvedFact.apiOutcome) return t(item.resolvedFact.apiOutcome.key, item.resolvedFact.apiOutcome.params || {});
  // lane exit-item-heal: an unexpected-exit item answered by the conversation running again (its new session's start, this device's clock)
  if (by === 'resumed') {
    const at = item && item.resolvedFact && Number(item.resolvedFact.resumedAt);
    if (!at) return t('running again');
    return t('running again (resumed {time})', { time: stampAt(at, { words: true }) });   // the page's one format (lane ui-language: beyond today, its date)
  }
  // a row's DECLARED end words (lane queued-is-not-woke: the messages-waiting item's ends — never a raw code in any language)
  const ew = item && item.action ? endWordsOf(item.action.type) : null;
  if (ew && typeof by === 'string' && ew[by]) return t(ew[by]);
  return by && by !== 'user' ? by : '';
}

const REPLY_SNIPPET = 80; // chars of "You replied: …" on a resolved row (the For-you window shows the whole reply)

// A PRODUCER'S ACTION (design-reset-credits p2): an item that carries `action`
// gets ONE button doing it — the client maps the TYPE to a verb it owns.
const actionBtnHtml = (i, t) => (i && i.action && i.action.type === 'reset-credit' && i.action.accountKey
  ? `<button class="ut-act ut-action-reset" aria-label="${escHtml(t('Use a reset credit…'))}" data-label="${escHtml(t('Use a reset credit…'))}">${UI_ICONS.refresh || ''}</button>` : '');
// lane channel-names-readable: a channel account's sign-in lacks a permission — ITS Re-authorize dialog (the same
// producer-action click: the model maps the type)
// lane channel-reauth-visible: a DEAD sign-in (`signin: 'expired'`) says its verb in WORDS on its own line instead — Reconnect
// (the same click: the model opens the account's Re-authorize dialog)
const signinItem = (i) => !!(i && i.action && i.action.type === 'channel-reauth' && i.action.adapterId && i.action.signin === 'expired');
const reauthBtnHtml = (i, t) => (i && i.action && i.action.type === 'channel-reauth' && i.action.adapterId && !signinItem(i)
  ? `<button class="ut-act ut-action-reset ut-action-reauth" aria-label="${escHtml(t('Re-authorize'))}" data-label="${escHtml(t('Re-authorize'))}">${UI_ICONS.refresh || ''}</button>` : '');
const reconnectHtml = (i, t) => (signinItem(i)
  ? `<div class="ut-reconnect-row"><button type="button" class="ut-action-reset ut-action-reauth ut-reconnect" title="${escHtml(t('Open the account\'s Re-authorize'))}">${escHtml(t('Reconnect'))}</button></div>` : '');
// lane ui-needs-a-button pick 6: A POINTER'S DOOR its registry row declares (foryou-actions doorOf — never a branch per type):
// ONE button with words on its own line under the sentence — «Open the Outbox» — the item's own door (the model's jump, as the
// row's body); its closers stay where they are. The house button (need-line's classes), in the answers' container
// ui-words: the door's verb is an i18nKey its registry row declares (foryou-actions.js open-outbox `door`), never a stored value
const doorHtml = (i, t) => { const d = doorOf(i); return d ? `<div class="ut-exit-answer ut-door-answer"><button type="button" class="mounts-btn mounts-btn-primary need-door ut-door" data-door="${escHtml(d.opens)}" title="${escHtml(t(d.title || d.verb))}">${escHtml(t(d.verb))}</button></div>` : ''; };
// lane browser-takeover-queue: an assistant needs the person in its browser — its live view (the same producer-action click)
const takeoverBtnHtml = (i, t) => (i && i.action && i.action.type === 'browser-takeover' && i.action.requestId
  ? `<button class="ut-act ut-action-reset ut-action-takeover" title="${escHtml(t('Open its live view — take over there'))}" data-label="${escHtml(t('Take over'))}">${UI_ICONS.browserLive || ''}</button>` : '');
/** The command an exit ask names, in mono, then its ANSWER — Allow / Deny on their own line — and the rule (open items
 *  only). lane-pairing ⑥: answered right here (the popup, the mini inbox and the phone paint this row). naive-user
 *  N-ask: the two buttons rode the floated `.ut-actions` bar — at 35 % opacity until the row is hovered (a 60-second
 *  decision whose Allow read as disabled) and, on the phone, six 36-px buttons wide, crushing the question into a
 *  one-word column ("Sessi / on 2"). */
// verify-r4 F4: THE WHOLE COMMAND, as it runs — the item's `detail` (exit-proxy files the whole command there; the
// store keeps 8 000 chars, a command is ≤ 4 096 bytes), line breaks kept, ALL of it above Allow (no inner scroll box —
// a macOS overlay scrollbar is invisible until scrolled, so a clipped box reads as the whole command). Pre-fix the row showed
// `action.cmd` — the head cut at 120 characters with every line break turned into a space — clipped to three lines
// (overflow hidden, no mark), with the whole command in a collapsed "detail" BELOW Allow: a three-line command whose
// last line was `curl … | sh` read "echo … curl" above an Allow button (reproduced).
const exitCmdOf = (i) => (i && typeof i.detail === 'string' && i.detail ? i.detail : String((i && i.action && i.action.cmd) || ''));
const exitAskHtml = (i, t) => (i && i.action && i.action.type === 'exit-run-ask'
  ? `<pre class="ut-exit-cmd">${escHtml(exitCmdOf(i))}</pre>`
    + planNoteHtml(exitCmdOf(i), t) // lane mask-value-shape r6 (m7): the command reads as written; a masked run's note FOLLOWS it
    + (i.action.askId ? `<div class="ut-exit-answer"><button type="button" class="ut-act ut-action-exit ut-exit-allow" data-answer="allow">${escHtml(t('Allow'))}</button><button type="button" class="ut-act ut-action-exit ut-exit-deny" data-answer="deny">${escHtml(t('Deny'))}</button></div>` : '')
    + `<div class="ut-exit-note">${escHtml(t('Nothing runs until you answer. After 60 s it is refused.'))}</div>` : '');
/** A row that DECLARES its buttons (foryou-actions buttonsOf — lane queued-is-not-woke's messages-waiting: Open the conversation) — drawn
 *  from the registry's fields; the press runs through runAction's ONE generic door. */
const rowButtonsHtml = (i, t) => { const bs = i && i.action ? buttonsOf(i.action.type) : null; if (!bs) return ''; const note = buttonsNoteOf(i.action.type);
  return `<div class="ut-exit-answer ut-row-buttons">${bs.map((b) => `<button type="button" class="ut-act ut-action-exit" data-answer="${escHtml(b.answer)}" title="${escHtml(t(b.title))}">${escHtml(t(b.label))}</button>`).join('')}</div>`
    + (note ? `<div class="ut-exit-note">${escHtml(t(note))}</div>` : ''); };
/** lane mask-value-shape r6 (m7): the note of a masked run in a VERBATIM command — a block after it, never inside it ('' when none). */
const planNoteHtml = (detail, t) => { const n = maskedNoteOf(String(detail || ''), t); return n ? `<div class="masked-link-note">${escHtml(n)}</div>` : ''; };

/** lane hub-act-ask (design q-042 D4): a hub act nobody clicked, HELD on a cluster instance — answered where it appears:
 *  Allow once / Always on this machine / Deny; its words (what it would do, who asked, what each answer does) shown whole
 *  ABOVE them, never folded below (the exit-ask lesson). Allow once / Always are armed like every Allow (press-arm). */
const HUB_ANSWERS = ['once', 'window', 'always', 'deny'];   // r7 (lane vault-standing-request): «Allow for 1 hour» — a run card the door marked `action.window` only
// design q-046 (lane automation-keys-core): a held AUTOMATION call answers the same three ways — 允许一次 / 一直（授权给这个会话） / 拒绝
  // lane vault-run-door (design q-043 §8.3): an agent's RUN held on its card — 允许一次 / 此形状总是 (not offered for a shell, an
  // interpreter or an unknown destination: `action.always` false) / 拒绝
  const HELD_ASKS = ['hub-act-ask', 'automation-ask', 'pool-cross-provider', 'vault-run-ask', 'vault-grant-ask', 'vault-words-ask', 'vault-job-ask'];   // + lane vault-job-approval: a Background job's use of a stored secret — 允许 (验证是你) / 拒绝   // + lane vault-entry-description: an agent's proposal of an entry's words — 允许 / 拒绝 // q-053 P0b (decision ①): a pool's move to ANOTHER provider waits for the owner — 允许一次 / 这个池一直允许 / 拒绝
  const GRANT_ANSWERS = ['once', '8h', 'deny'];
  const WORDS_ANSWERS = ['allow', 'deny'];   // lane vault-entry-description: words, never a value — a click, no second password
  const STANDING_ANSWERS = ['standing', 'deny']; // lane vault-standing-request: an agent's STANDING request — Allow (the owner's «谁可以用» row, until he takes it back) / Deny // lane vault-manual-and-lock (design q-043 D4): 允许一次 (its next run) / 8 小时 (every run, 8 h) / 拒绝; it waits for nobody, never expires (a lock withdraws it)
  const hubAnswerWord = (a, t, type = 'hub-act-ask', act = null) => (a === 'allow' ? t('Allow') : a === 'once' ? t('Allow once') : a === 'window' ? t('Allow for 1 hour') : a === '8h' ? t('For 8 hours') : a === 'standing' ? t('Allow (standing)') : a === 'always' && type === 'vault-run-ask' && act && act.command ? t('Always (this command)') : a === 'always' ? (type === 'automation-ask' ? t('Always for this conversation') : type === 'pool-cross-provider' ? (act && act.fallback ? t('Always — to any fallback this pool lists') : t('Always for this pool')) : type === 'vault-run-ask' ? t('Always let this conversation use it (these hosts)') : t('Always on this machine')) : t('Deny'));
  const winWords = (i) => !!(i.facts && typeof i.facts === 'object' && (i.facts.v === 1 || i.facts.v === 2) && i.facts.window && typeof i.facts.window === 'object' && i.facts.window.offered === true);   // r8: «Allow for 1 hour» only beside its words (facts.window — a card whose facts the store dropped offers none)
  const heldAnswers = (i) => (i.action.type === 'vault-words-ask' || i.action.type === 'vault-job-ask' ? WORDS_ANSWERS : i.action.type === 'vault-grant-ask' ? (i.action.standing ? STANDING_ANSWERS : GRANT_ANSWERS) : HUB_ANSWERS.filter((a) => a !== 'window' || (i.action.type === 'vault-run-ask' && i.action.window === true && !i.action.late && winWords(i))).filter((a) => a !== 'always' || (!(i.action.type === 'vault-run-ask' && i.action.always === false) && !(i.action.type === 'vault-run-ask' && i.action.late)))).filter((a) => a === 'deny' || !(i.action.type === 'vault-run-ask' && i.action.late && i.action.restartLost === true)); // r8: a LATE run card offers 允许一次 / 拒绝 only — its door refuses «Always» (a card never offers what its door refuses); after a restart (r23's restartLost) an Allow would mint nothing — 拒绝 alone, the line says why
// lane vault-scrub-forms (q-043 verify M1): a RUN card says what the scrubbing does not promise — the owner reads the command
// lane key-instance-scope: an AUTOMATION card offers the grant's REACH beside its answers — 只有它开的会话 (the default) · 这些岗位的会话
// (only when the caller is in one: action.groups) · 整个 VibeSpace (red, its title says it reaches the owner's own conversations too);
// lane needs-card-tail r11 (the r10 acceptance — the attention dock drew a hidden copy of the row, radios of the SAME name, and
// radios with one name and no form are ONE group: the copy drawn last took the check, so the card showed none and its Allow
// sent no reach): THE PICK IS THE ITEM'S — kept here, one per item, never read off a copy in the DOM (the panel's answer
// asks reachPickOf); every drawn copy's group is its OWN (`-<n>`, a sequence) and is drawn from the pick; a press on any copy
// writes it (pickReach) and every copy on the page follows; the attention dock draws no pick at all (ctx.noPick);
// r12 (the r11 acceptance — the dock drew no pick yet its Allow / Always sent the item's pick, made on another copy: a «整个
// VibeSpace» read in the tray and left there became an instance-wide grant from a strip that showed no reach): A PRESS POINT
// NEVER SENDS A SCOPE IT DOES NOT SHOW — a copy that draws no pick SAYS the pick its answers carry, one line beside them
// (scopeHtml: «Reach <the pick>», the label dim, 整个 VibeSpace red-tinted) and its Always names it (dockAlwaysWord); a pick
// made on any copy rewords it at once (pickReach) — the words and the answer read the ONE pick (reachPickOf)
const REACH_PICKS = new Map(); // item id → the owner's pick ('opened' | 'groups' | 'instance'); an item no longer open is dropped (forgetReachPicks)
let reachSeq = 0;
export const reachPickOf = (id) => REACH_PICKS.get(String(id)) || 'opened';
const drawsPick = (i) => !!(i && i.action && i.action.type === 'automation-ask' && i.action.askId); // the one item that offers a reach
/** What an answer to `item` carries as its reach: the item's pick when it offers one, else null (nothing to carry). */
export const reachFor = (item) => (drawsPick(item) ? reachPickOf(item.id) : null);
export function pickReach(id, value) {
  if (!REACH_CHOICES.includes(value)) return;
  REACH_PICKS.set(String(id), value);
  if (typeof document === 'undefined') return;
  for (const r of document.querySelectorAll('.ut-ak-reach input[type="radio"]')) if (r.closest('.ut-item')?.dataset.id === String(id)) r.checked = r.value === value;
  for (const s of document.querySelectorAll('.ut-ak-scope')) { // r12: a copy with no pick says the new one before any press
    const row = s.closest('.ut-item');
    if (row?.dataset.id !== String(id)) continue;
    const w = s.querySelector('.ut-ak-scope-word');
    s.dataset.reach = value;
    if (w) { w.className = `ut-ak-scope-word ut-ak-reach-${value}`; w.textContent = reachWord(value); }
    const al = row.querySelector('.ut-hub-always');
    if (al) al.textContent = dockAlwaysWord(value, tr);
  }
}
export function forgetReachPicks(open) {
  const keep = (open || []).map((i) => i && String(i.id));
  for (const id of [...REACH_PICKS.keys()]) if (!keep.includes(id)) REACH_PICKS.delete(id);
}
/** r12: what a copy with no pick says its answers carry — the item's pick, by THE reach words (automation-reach.js). */
const scopeHtml = (pick, t) => `<div class="ut-ak-scope" data-reach="${pick}"><span class="ut-ak-reach-lbl">${escHtml(t('Reach'))}</span> <span class="ut-ak-scope-word ut-ak-reach-${pick}">${escHtml(reachWord(pick))}</span></div>`;
const dockAlwaysWord = (pick, t) => t('Always · {reach}', { reach: reachWord(pick) });
const reachPickHtml = (i, t) => {
  const groups = String(i.action.groups || '').split(' ').filter(Boolean);   // the caller's Task Group ids (space-joined by the engine)
  const name = `ut-ak-reach-${String(i.id || i.action.askId || '')}-${++reachSeq}`; // r11: this copy's own group
  const picked = reachPickOf(i.id);
  return `<div class="ut-ak-reach" role="radiogroup" aria-label="${escHtml(t('Reach'))}"><span class="ut-ak-reach-lbl">${escHtml(t('Reach'))}</span>`
    + REACH_CHOICES.filter((r) => r !== 'groups' || groups.length).map((r) => `<label class="ut-ak-reach-opt ut-ak-reach-${r}" title="${escHtml(reachTitle(r, groups.join(', ')))}"><input type="radio" name="${escHtml(name)}" value="${r}"${r === picked ? ' checked' : ''}> ${escHtml(reachWord(r))}</label>`).join('')
    + '</div>';
};
const hubAskHtml = (i, t, detail, noPick = false) => (i && i.action && HELD_ASKS.includes(i.action.type)
  ? runCardOf(i, { t }) ? runFactsHtml(i, t, { strip: noPick }) // r7: the run card's FACTS, worded here (a record without them: its prose, below — unchanged); r15: the strip's own (below)
  : (factsDroppedWords(i, { t }) ? `<div class="ut-run-cut ut-facts-dropped">${escHtml(factsDroppedWords(i, { t }))}</div>` : '') // r9: facts the store dropped — said above the text
    + `<div class="ut-proposal-plan">${escHtml(detail || '')}</div>`
    + planNoteHtml(detail, t) // lane mask-value-shape r6 (m7): the command reads as written; a masked run's note FOLLOWS it (the window's pre says the same)
    + (i.action.type === 'vault-run-ask' ? `<div class="ut-exit-note">${escHtml(t('The output is scrubbed of the secret\'s common spellings; a command that re-encodes it can still show it — read the whole command before you allow it.'))}</div>` : '')
    + (drawsPick(i) ? (noPick ? scopeHtml(reachPickOf(i.id), t) : reachPickHtml(i, t)) : '') // r11: the dock draws no pick (one form per item); r12: it SAYS the pick
    + (i.action.askId ? `<div class="ut-exit-answer ut-hub-answer">${heldAnswers(i).map((a) => `<button type="button" class="ut-act ut-action-exit ut-exit-${a === 'deny' ? 'deny' : 'allow'} ut-hub-${a}" data-answer="${a}">${escHtml(noPick && a === 'always' && drawsPick(i) ? dockAlwaysWord(reachPickOf(i.id), t) : hubAnswerWord(a, t, i.action.type, i.action))}</button>`).join('')}</div>` : '')
  : '');

/** THE RUN CARD (lane wake-approve-card r7 — the owner: «这个卡片的可读性很差»): `item.facts` worded through THE model
 *  (foryou-actions runCardOf) — the command in its own box (it wraps INSIDE the box, never the card), ≤ 4 fact rows with the
 *  deciding one first and marked, the answers with the «Always» hint beside them (why it is not offered), the technical
 *  lines in a «Technical details» fold. Every value escaped (a name, a path and the command are an agent's or a peer's
 *  words); a code the model has no words for is drawn monospace. `buttons: false` = the For-you window's pane and a
 *  record's fold (the window's answers live in its action row — the hint beside them, as text nodes). */
const segHtml = (parts) => parts.map((x) => (x.code != null ? `<code class="ut-run-code">${escHtml(x.code)}</code>` : x.mono != null ? `<span class="ut-run-mono">${escHtml(x.mono)}</span>` : x.aside != null ? `<span class="ut-run-aside">${escHtml(x.aside)}</span>` : escHtml(x.text || ''))).join('');
const linesHtml = (lines) => lines.map((l) => `<span class="ut-run-line">${segHtml(l)}</span>`).join('');
const segText = (parts) => (Array.isArray(parts) ? parts.map((x) => (x.code != null ? x.code : x.mono != null ? x.mono : x.aside != null ? x.aside : x.text || '')).join('') : ''); // a title's words (lane foryou-dock-layout)
const runHintHtml = (v) => (v && v.always.hint ? `<span class="ut-run-hint">${segHtml(v.always.hint)}</span>` : '');
// r7: «Allow for 1 hour»'s own words beside the answers (the card's row above them says what it writes)
const runWindowHintHtml = (v) => (v && v.window && v.window.hint ? `<span class="ut-run-hint ut-run-hint-window">${segHtml(v.window.hint)}</span>` : '');
const runWindowOffHtml = (v) => (v && v.window && v.window.excepted ? `<span class="ut-run-hint ut-run-hint-window-off">${segHtml(v.window.excepted)}</span>` : '');   // r8: why no «Allow for 1 hour» (除了)
// lane vault-standing-request r5 (the r4 acceptance's MAJOR: the words «this replaces that grant …» lived only in the hint, and the
// hint is hidden beside a hosts «Always» — the press silently cut a no-end host to 30 days): WHAT THE ROW WILL BE is its OWN row
// above the answers, on every surface that draws the card (the tray / chat row, the For-you window's pane, the phone), whatever
// the hint does — and a card the press drew again carries its mark first
const runChangesHtml = (v) => (v && v.changes ? `<div class="ut-run-changes" data-changes="${v.changes.lines.length}">${v.changes.redrawn ? `<span class="ut-run-line ut-run-redrawn">${escHtml(v.changes.redrawn)}</span>` : ''}${linesHtml(v.changes.lines)}</div>` : '');
/** The answers the STRIP withholds from a run ask its card offers (its hosts too long for a strip — r16: the hosts row's bound
 *  alone) — the landing's toast says so (runCardOf: a run ask's card, else null — no branch on the type here). */
export const stripWithholds = (i, t = tr) => { const v = i && i.action && i.action.askId ? runCardOf(i, { t }) : null; return v && !runStripOf(v, { t }).fits ? heldAnswers(i).filter((a) => a === 'always') : []; };
/** lane needs-card-tail r15 (the r14 acceptance — the strip offered «Always let this conversation use it (these hosts)» with
 *  the hosts, the warning row, the «asked again» line and the cut hidden by its grammar): THE STRIP'S RUN CARD — its command
 *  head, WHAT ITS ANSWERS DECIDE ON (foryou-actions runStripOf: the hosts, every warning row, the «asked again» line, the
 *  cut — whole, wrapped, the card's own words and accent) and the answers those facts carry. r16 (the r15 acceptance: twelve
 *  hosts hid a writable program's warning and the «asked again» line beside Allow once): hosts too long for a strip ⇒ THEIR row
 *  says they are on its card (and «Always» with them — the card's); every warning row and the «asked again» line drawn
 *  whatever the hosts. A press point never sends a scope it does not show. */
const stripGistHtml = (s, t, always) => `<div class="ut-run-gist">${s.rows.map((r) => `<span class="ut-run-grow${r.warn ? ' ut-run-warn' : ''}${r.out ? ' ut-run-out' : ''}" data-fact="${r.key}"><span class="ut-run-lbl">${escHtml(r.label)}</span> <span class="ut-run-val">${r.out
  ? `<span class="ut-run-aside">${escHtml(always ? t('(too long to show here — the hosts, and «Always», are on its card)') : t('(too long to show here — the hosts are on its card)'))}</span>`
  : r.lines.map((l) => segHtml(l)).join(escHtml(t(', ')))}</span></span>`).join('')}`
  + `${s.again ? `<span class="ut-run-again">${segHtml(s.again)}</span>` : ''}${s.cut ? `<span class="ut-run-cut">${escHtml(t('The command is cut — its card holds the whole'))}</span>` : ''}</div>`;
export function runFactsHtml(i, t, { buttons = true, strip = false } = {}) {
  const v = runCardOf(i, { t });
  if (!v) return '';
  if (strip) { // r15: the strip's own — the head, what it decides on, the answers those carry (never the card's rows or folds; an answer that WRITES brings what it writes — the .367 seam 6)
    const s = runStripOf(v, { t }), held = i.action.askId ? heldAnswers(i) : [], answers = held.filter((a) => a !== 'always' || s.fits);
    // the .367 seam 6 (× lane vault-standing-request, the integrator's ruling 10-31): an answer that WRITES («Allow for 1 hour»,
    // «Always») is offered with what it writes — the card's own changes row (vault-standing r5: «what the row will be», on every
    // surface that draws the card) and «Allow for 1 hour»'s own words — and named as the card names it (hubAnswerWord with the action)
    const writes = answers.includes('window') || answers.includes('always');
    // lane foryou-dock-layout (the owner 2026-11-02 «这个布局不太好»: the strip OPENED with «Allow for 1 hour»'s explanation — two
    // lines above who asks for what — and said the hour's consequence twice): THE STRIP READS TOP-DOWN — the ask (the row's
    // question), the command + where it sends, what an «Always» replaces (a warning: never folded), the answers, then ONE dim line
    // of the hour's consequence (the hour, this conversation — what the press carries). The hour's LONG words are the button's
    // title and the strip's ONE fold — that line is its summary — with the scrub note (style: chat.css .ut-dock-fold)
    const win = answers.includes('window') && v.window && v.window.offered ? v.window : null, winN = win && Array.isArray(win.lines) ? win.lines.length : 0;
    const own = writes && v.changes ? { lines: v.changes.lines.slice(0, v.changes.lines.length - winN), redrawn: v.changes.redrawn } : null;
    const long = win ? [...(win.lines || []).filter((l) => !win.by || l !== segText(win.by)), segText(win.hint)].filter(Boolean).join('\n') : '';   // B-d868: who started the turn is the summary's, not said twice
    const fold = win ? `<details class="ut-detail-exp ut-run-fold ut-dock-fold"><summary>${win.by ? `<span class="ut-run-hint ut-run-hint-window">${segHtml(win.by)}</span> ` : ''}${win.short ? `<span class="ut-run-hint ut-run-hint-window ut-run-hint-short">${segHtml(win.short)}</span> ` : ''}<span class="ut-dock-more">${escHtml(t('detail'))}</span></summary><div class="ut-run-tech">${(win.lines || []).filter((l) => !win.by || l !== segText(win.by)).map((l) => `<span class="ut-run-line">${escHtml(l)}</span>`).join('')}${win.hint ? `<span class="ut-run-line">${segHtml(win.hint)}</span>` : ''}${v.output && v.output.length ? `<span class="ut-run-line ut-run-output">${segHtml(v.output)}</span>` : ''}</div></details>` : '';
    return `<div class="ut-run"><pre class="ut-run-cmd">${escHtml(v.cmd)}</pre>${stripGistHtml(s, t, held.includes('always'))}${own && (own.lines.length || own.redrawn) ? runChangesHtml({ changes: own }) : ''}${answers.length ? `<div class="ut-exit-answer ut-hub-answer ut-run-answer">${answers.map((a) => `<button type="button" class="ut-act ut-action-exit ut-exit-${a === 'deny' ? 'deny' : 'allow'} ut-hub-${a}" data-answer="${a}"${a === 'window' && long ? ` title="${escHtml(long)}"` : ''}>${escHtml(hubAnswerWord(a, t, i.action.type, i.action))}</button>`).join('')}</div>` : ''}${fold}</div>`;
  }
  const rows = v.rows.map((r) => `<div class="ut-run-row${r.warn ? ' ut-run-warn' : ''}" data-fact="${r.key}"><span class="ut-run-lbl">${escHtml(r.label)}</span><span class="ut-run-val">${linesHtml(r.lines)}</span></div>`).join('');
  const answers = buttons && i.action.askId ? heldAnswers(i) : [];
  const row = answers.length ? `<div class="ut-exit-answer ut-hub-answer ut-run-answer">${answers.map((a) => `<button type="button" class="ut-act ut-action-exit ut-exit-${a === 'deny' ? 'deny' : 'allow'} ut-hub-${a}" data-answer="${a}">${escHtml(hubAnswerWord(a, t, i.action.type, i.action))}</button>`).join('')}${answers.includes('always') && !i.action.command ? '' : runHintHtml(v)}${answers.includes('window') ? runWindowHintHtml(v) : runWindowOffHtml(v)}</div>` : '';   // lane vault-standing-request: «Always (this command)» keeps its plain words beside it; r7: «Allow for 1 hour» its own
  const fold = v.fold.length ? `<details class="ut-detail-exp ut-run-fold"><summary>${escHtml(t('Technical details'))}</summary><div class="ut-run-tech">${v.fold.map((f) => `<div class="ut-run-row"><span class="ut-run-lbl">${escHtml(f.label)}</span><span class="ut-run-val">${f.cmd != null ? `<pre class="ut-run-cmd ut-run-cmd-full">${escHtml(f.cmd)}</pre>` : linesHtml(f.lines)}</span></div>`).join('')}</div></details>` : '';
  const cut = v.cut ? `<div class="ut-run-cut">${escHtml(v.cut.text)}</div>` : ''; // r8: a command longer than the body's bound says it is a cut (the whole: the fold)
  const again = v.again ? `<div class="ut-run-again">${segHtml(v.again)}</div>` : ''; // r11: a near-identical rerun names the ONE way it differs (the door's whyAgain)
  return `<div class="ut-run">${v.cmd ? `<pre class="ut-run-cmd">${escHtml(v.cmd)}</pre>` : ''}${cut}${again}<div class="ut-run-facts">${rows}</div>${runChangesHtml(v)}${row}${fold}</div>`;
}

/** A CARD WITH A DEADLINE SHOWS IT (r7 addendum): THE model's line (foryou-actions deadlineOf) under the question — «valid for
 *  60 sec · 42 sec left by the server's clock», the warning accent under 15 s, then «time is up by the server's clock —
 *  waiting for the server» (its answers KEPT — r8: only the producer's settle withdraws them) or, on a card its producer
 *  marked late, the late answer's words (the run card: its two buttons stay). The tray row, the chat card (the same row) and
 *  the For-you window draw it; ONE page ticker re-reads every such line once a second (tickDeadlines).
 *  A CLOCK IS THE HUB'S (r8): every For-you broadcast and snapshot carries the server's `now`; noteHubClock keeps this tab's
 *  offset from it and hubNow() is the time every line counts by — never the device's own clock against hub stamps. */
let hubOffset = 0, hubKnown = false;
export function noteHubClock(serverNow, at = Date.now()) {
  const n = Number(serverNow);
  if (Number.isFinite(n) && n > 0) { hubOffset = n - at; hubKnown = true; }
  return hubOffset;
}
export const hubNow = (at = Date.now()) => at + hubOffset;
/** r9: whose clock hubNow() is — 'hub' once a snapshot said the server's `now`, else 'device' (an older hub sends none: the
 *  line then says «by this device's clock», never «by the server's»). */
export const hubClock = () => (hubKnown ? 'hub' : 'device');
const deadlineAttrs = (i, d) => `data-deadline-at="${d.at}" data-deadline-from="${d.from}"${i.action && i.action.late ? ' data-deadline-late="1"' : ''}${i.action && i.action.late && i.action.restartLost === true ? ' data-deadline-lost="1"' : ''}`;
export const deadlineHtml = (i, t, d = deadlineOf(i, { t, now: hubNow(), clock: hubClock() })) => { return d ? `<div class="ut-deadline${d.warn ? ' ut-deadline-warn' : ''}" data-state="${d.state}" ${deadlineAttrs(i, d)}>${escHtml(d.text)}</div>` : ''; };
/** THE DEADLINE TICKER: ONE interval for the page, armed when a line is drawn, re-reading every `[data-deadline-at]` still in
 *  the document through deadlineOf at the HUB's time — its words, its accent, its state. It never touches an answer (r8). It
 *  stops itself when no line is counting: a row taken out of the document takes its line with it — nothing per row to tear
 *  down (the listener-lifecycle law). → the number of lines still counting. */
let deadlineTimer = null;
export function tickDeadlines(root = document, now = hubNow()) {
  let counting = 0;
  for (const el of root.querySelectorAll('[data-deadline-at]')) {
    const late = el.dataset.deadlineLate === '1', lost = el.dataset.deadlineLost === '1';
    const d = deadlineOf({ status: 'open', kind: 'action', expiresAt: Number(el.dataset.deadlineAt), createdAt: Number(el.dataset.deadlineFrom), action: { type: 'deadline', ...(late ? { late: true } : {}), ...(lost ? { restartLost: true } : {}) } }, { t: tr, now, clock: hubClock() });
    if (!d) continue;
    const text = el.dataset.deadlineShort ? d.short : d.text; // lane phone-dock-restore r2: the phone's folded strip's clock
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('ut-deadline-warn', d.warn);
    if (el.dataset.state !== d.state) el.dataset.state = d.state;
    if (d.state === 'live') counting++;
  }
  return counting;
}
export function armDeadlines() {
  if (deadlineTimer || typeof document === 'undefined' || typeof setInterval !== 'function') return;
  deadlineTimer = setInterval(() => { let n = 0; try { n = tickDeadlines(document); } catch { n = 0; } if (!n) { clearInterval(deadlineTimer); deadlineTimer = null; } }, 1000);   // a page that cannot be read stops it too
  if (deadlineTimer && typeof deadlineTimer.unref === 'function') deadlineTimer.unref();   // never what keeps a node test alive
}

/** lane vault-paste-request: an agent's REQUEST FOR A SECRET — its words (what, what for, where it goes, what the paste does)
 *  shown whole ABOVE its paste box (the exit-ask lesson: never folded below the answer); the box itself is DOM nodes the
 *  row appends (renderRow / patchRow — never markup: it holds a field the owner pastes into). */
const secretAskHtml = (i, t, detail) => (isSecretAsk(i) ? `<div class="ut-proposal-plan ut-secret-plan">${wordsHtml(detail || '', { whole: fieldWhole(i, 'detail', detail) })}</div>` : '');   // lane login-request-card r2: THE item's words renderer (a masked link = its words + THE note, inline in prose) — a login card's agent words ride only here

/** lane browser-propose (2026-09-30): the agent's PROPOSAL, answered where it appears — its words (the card's, line for
 *  line: what Approve runs) ABOVE Approve / Reject, never folded (the exit-ask lesson: a folded detail below the button
 *  read as the whole story). ONE primary (Approve), a quiet Reject; open items only. */
const PROPOSAL_ACTIONS = ['browser-proposal', 'channel-watch-request', 'channel-api-proposal', 'channel-held-digest'];   // r6: a held digest's Deliver / Discard   // B-2198 part 2: a raw-API proposal too   // lane channel-agent-watch: an agent's wake request is answered the same way
/** lane passkey-ui: a PASSKEY card (`pk-…`) answers with ITS choices (register: Allow once / Not now; sign-in: Allow once /
 *  Always allow / Not now / Never) — the words above them say what the agent may do after; the first = the primary. */
const PK_CHOICES = ['once', 'always', 'no', 'never'];
const pkChoiceWord = (c, t) => (c === 'once' ? t('Allow once') : c === 'always' ? t('Always allow') : c === 'no' ? t('Not now') : t('Never'));
const passkeyAskHtml = (i, t, detail) => {
  const cs = String(i.action.choices || '').split(' ').filter((c) => PK_CHOICES.includes(c));
  return `<div class="ut-proposal-plan">${escHtml(detail || '')}</div>`
    + (cs.length ? `<div class="ut-exit-answer ut-proposal-answer ut-passkey-answer">${cs.map((c, k) => `<button type="button" class="ut-act ut-action-proposal ${k === 0 ? 'ut-proposal-approve' : 'ut-proposal-reject'} ut-passkey-${c}" data-answer="pk:${c}">${escHtml(pkChoiceWord(c, t))}</button>`).join('')}</div>` : '');
};
/** card grammar (lane card-grammar-exceptions): a raw-API proposal's CARD (src/channel-api-card.js forYouOf) — its
 *  policy a chip on the plan line, its raw call (method + URL, the body's size + sha256) under ONE collapsed 技术细节
 *  fold above Approve; the row's sentence is the card's title (wordsOf). Nothing raw outside the fold. */
const apiCardOf = (i) => (i && i.action && i.action.type === 'channel-api-proposal' && i.card && i.card.kind === 'api-call' ? i.card : null);
const apiChipHtml = (c, t) => (c && c.chip && c.chip.key ? `<span class="ut-api-chip">${escHtml(t(c.chip.key, c.chip.params || {}))}</span> ` : '');
const apiTechHtml = (c, t) => (c && Array.isArray(c.tech) && c.tech.length
  ? `<details class="ut-detail-exp ut-api-tech" data-fold="tech"><summary>${escHtml(t('Technical details'))}</summary><div class="ut-detail">${c.tech.map((l) => escHtml(String(l))).join('\n')}</div></details>` : '');
/** lane browser-surfaces: a BROWSER PROMPT only the owner can answer (a kernel's surface — a sign-in, a certificate, a device…):
 *  its words above Approve (presses the prompt's one answer that needs no typing — the page's own label in the tooltip) and
 *  Reject (its refusal); a prompt that needs typing has no Approve — the live view answers it. */
const surfaceAskHtml = (i, t, detail) => `<div class="ut-proposal-plan">${escHtml(detail || '')}</div><div class="ut-exit-answer ut-proposal-answer">`
  + (i.action.approve ? `<button type="button" class="ut-act ut-action-proposal ut-proposal-approve" data-answer="approve" title="${escHtml(t('Presses “{label}” on the page', { label: String(i.action.approveLabel || i.action.approve).slice(0, 80) }))}">${escHtml(t('Approve'))}</button>` : '')
  + (i.action.reject ? `<button type="button" class="ut-act ut-action-proposal ut-proposal-reject" data-answer="reject">${escHtml(t('Reject'))}</button>` : '') + '</div>';
/** lane browser-login: the owner's SAVE-LOGIN card — either a person signed in by hand in a live-view takeover (Save / Update /
 *  Not now), or an agent-generated pending password awaiting human promotion (Confirm / Discard; Ruling 1: only a human promotes). */
const saveLoginAskHtml = (i, t, detail) => `<div class="ut-proposal-plan">${escHtml(detail || '')}</div><div class="ut-exit-answer ut-proposal-answer">`
  + `<button type="button" class="ut-act ut-action-proposal ut-proposal-approve" data-answer="approve" title="${escHtml(i.action.pending ? t('Promotes the pending password to current in the vault') : t('Saves it in the vault — conversations you allow can sign in with it; VibeSpace never hands them the password'))}">${escHtml(i.action.pending ? t('Confirm') : i.action.update ? t('Update') : t('Save'))}</button>`
  + `<button type="button" class="ut-act ut-action-proposal ut-proposal-reject" data-answer="reject">${escHtml(i.action.pending ? t('Discard') : t('Not now'))}</button></div>`;
const proposalAskHtml = (i, t, detail) => (i && i.action && i.action.type === 'save-login' && /^sl-[0-9a-f]{8}$/.test(String(i.action.id || '')) ? saveLoginAskHtml(i, t, detail) : i && i.action && i.action.type === 'browser-surface' && i.action.id ? surfaceAskHtml(i, t, detail) : i && i.action && i.action.type === 'browser-proposal' && /^pk-[0-9a-f]{8}$/.test(String(i.action.id || '')) ? passkeyAskHtml(i, t, detail) : i && i.action && PROPOSAL_ACTIONS.includes(i.action.type)
  ? `<div class="ut-proposal-plan">${apiChipHtml(apiCardOf(i), t)}${escHtml(detail || '')}</div>${apiTechHtml(apiCardOf(i), t)}`
    + (i.action.id ? `<div class="ut-exit-answer ut-proposal-answer"><button type="button" class="ut-act ut-action-proposal ut-proposal-approve" data-answer="approve" title="${escHtml(t(verbsOf(i.action.type) ? verbsOf(i.action.type).title : 'Runs exactly what this card says'))}">${decideIcon(i, 'check')}${escHtml(t(verbsOf(i.action.type) ? verbsOf(i.action.type).approve : 'Approve'))}</button><button type="button" class="ut-act ut-action-proposal ut-proposal-reject" data-answer="reject">${decideIcon(i, 'close')}${escHtml(verbsOf(i.action.type) ? t(verbsOf(i.action.type).reject) : PERSON_DECIDES.includes(i.action.type) ? t('Deny') : t('Reject'))}</button></div>` : '') : '');   // r6: a row's own verbs (THE registry's `verbs` — a held digest's Deliver / Discard)
/** lane wake-approve-card: a decision only a person's click makes (a wake request) wears its verb's icon beside its word —
 *  Approve ✓ / Deny ✕, theme-coloured (currentColor); every other proposal's buttons stay words. */
const decideIcon = (i, k) => (i && i.action && PERSON_DECIDES.includes(i.action.type) ? `<span class="ut-decide-ico" aria-hidden="true">${UI_ICONS[k]}</span>` : '');

/** Layer 0 apps (docs/design-app-persistence.zh.md §3.1): an agent's install PROPOSAL, answered where it appears — Install…
 *  opens THE install dialog on the proposal (its fresh plan: every command, the packages, the sizes — nothing runs before
 *  the press there), Not now declines it (the agent is told on its next turn); open items only. */
const appAskHtml = (i, t) => (i && i.action && i.action.type === 'app-install' && i.action.id
  ? `<div class="ut-exit-answer ut-app-answer"><button type="button" class="ut-act ut-action-app ut-app-install" data-answer="install" title="${escHtml(t('Shows the plan first — nothing runs until you confirm'))}">${escHtml(t('Install…'))}</button><button type="button" class="ut-act ut-action-app ut-app-reject" data-answer="reject">${escHtml(t('Not now'))}</button></div>` : '');

/** lane controls-that-lie (naive study round 4, R1): an ask that names a GRANT (`vibespace-ask --grant browser:<profile>`)
 *  carries the grant itself — ONE button that DOES it: «Who can use it» gains this conversation (the owner's own door,
 *  the model's runAction), then the agent is answered. Its words name the profile; the title says both halves. */
export const grantAskOf = (i) => (i && !i.clearedAt && i.action && i.action.type === 'browser-grant' && typeof i.action.profileId === 'string' && i.action.profileId ? { profileId: i.action.profileId, label: String(i.action.label || i.action.profileId) } : null);
const grantAskHtml = (i, t) => {
  const g = grantAskOf(i);
  return g ? `<div class="ut-exit-answer ut-grant-answer"><button type="button" class="ut-act ut-action-grant ut-grant-go" data-answer="grant" title="${escHtml(t('Adds this conversation under “Who can use it” for {label}, then tells the agent', { label: g.label }))}">${escHtml(t('Let this conversation use {label}', { label: g.label }))}</button></div>` : '';
};

/** lane setting-doors pick 2 — AN ASK THAT PROPOSES ONE CHANGE OF ONE SETTING (`vibespace-ask "…" --propose <row>=<value> --until 6h`;
 *  the item's action = { type, key, value, was, untilRel? | untilAt?, askedAt }, built by the hub from the schema — src/ask-setting.js):
 *  ONE box — the row's label and its door, THE VALUE NOW (a value that moved since the ask is SAID), the proposal with its «until» on
 *  the owner's clock and the value it returns to, a hold that already stands, how old the ask is — and ONE button whose words name
 *  the amount and the moment, drawn only when THE verdict (ask-setting pressVerdict, against the value NOW) says it can be pressed;
 *  else the reason, with the row's link. The tray, the mini inbox, the phone sheet, the chat's card and its strip draw it here;
 *  the For-you window draws the same box as nodes (settingCardEls: its press is the pane's action row). */
// THE LIVE FACTS (registered by the app — src/lib/app.js: its settings store and the holds cache, GET /api/setting-holds + the
// `setting-holds` broadcast): `value(key)` = the row's value NOW, `holdOf(key)` = its standing hold or null, `present(key, v)` =
// the hub answered a press with another present value («moved») — the app redraws on it. None registered ⇒ the row's default.
let settingFacts = null;
const num = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' ? NaN : Number(v));   // ask-setting's NUM: Number(null) is 0 — an absent field is NO number
export function registerSettingFacts(f) { settingFacts = f && typeof f === 'object' ? f : null; }
const factRaw = (key) => { try { return settingFacts && typeof settingFacts.value === 'function' ? settingFacts.value(key) : undefined; } catch { return undefined; } };
// B-0a33 cure (主开发 04:23Z): a row the store holds with NO NUMBER (blank — an absent row reads its default) is «no limit is set»: 0 for the
// verdict (every turn nobody typed refused — a proposal over it is a raise), «none» in words; never the default
const factNone = (key) => { const v = factRaw(key); return v !== undefined && !(Number.isFinite(num(v)) && num(v) >= 0); };
const factValue = (key) => { const v = num(factRaw(key)); return Number.isFinite(v) && v >= 0 ? v : factNone(key) ? 0 : PROPOSABLE[key] ? PROPOSABLE[key].def : NaN; };
// LAW B (the check, 2026-11-15): a hold is LIVE only while the row holds its value — a row the owner changed by hand has no hold
// here at once (no held line, no «then …», no «End now»), before the hub's `setting-holds` broadcast that ends it arrives
const factHold = (key) => { try { const h = settingFacts && typeof settingFacts.holdOf === 'function' ? settingFacts.holdOf(key) : null; return h && typeof h === 'object' && Number.isFinite(num(h.value)) && Number.isFinite(num(h.untilAt)) && holdIsLive(h, factRaw(key)) ? h : null; } catch { return null; } };   // cure 2: liveness by the RAW value (a blank is no hold's value)
/** the hub said what the row holds NOW (a press answered «moved» / «same» / «passed») — the card redraws on it, nothing is pressed again */
export function noteSettingPresent(key, value) { try { if (settingFacts && typeof settingFacts.present === 'function' && Number.isFinite(num(value))) settingFacts.present(key, num(value)); } catch { /* the next broadcast tells */ } }
/** the item's proposed change (its action) when it is one of a proposable row, else null — the ONE test every surface asks */
const settingAskOf = (i) => (i && !i.clearedAt && isSettingChange(i.action) && Number.isFinite(num(i.action.value)) ? i.action : null);
/** A MOMENT ON THE OWNER'S CLOCK (the device's zone and locale): «22:00» today, «22:00 tomorrow», else THE instant spelling (a weekday). */
export function untilClock(at, t, { now = Date.now() } = {}) {
  const locale = deviceLocale();
  const hm = clockAt(at, { now: at, locale });
  const day = (x) => { try { return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(x)); } catch { return ''; } };
  if (day(at) === day(now)) return hm;
  if (day(at) === day(now + 86400000)) return t('{time} tomorrow', { time: hm });
  return clockAt(at, { now, locale });
}
const spanWords = (ms, t) => { const m = Math.max(1, Math.round(ms / 60000)); if (m < 60) return t('{n} min', { n: m }); const h = Math.floor(m / 60), r = m % 60; return r ? t('{h} h {m} min', { h, m: r }) : t('{n} h', { n: h }); };
const holdBack = (key, h) => (Number.isFinite(num(h.before)) && num(h.before) >= 0 ? num(h.before) : h.before != null ? 0 : PROPOSABLE[key].def);   // `before` null = the row's default; B-0a33 cure: a blank «before» = none (0)
const backNone = (h) => h.before != null && !(Number.isFinite(num(h.before)) && num(h.before) >= 0);
/** A STANDING HOLD IN WORDS — «1600 until 22:00, then 800» — the card's held line and the Settings row's (settings-ui) say it ONE way; '' = none. */
export function holdWords(key, t, { now = Date.now() } = {}) {
  const h = isProposable(key) ? factHold(key) : null;
  return h ? t('{value} until {time}, then {back}', { value: num(h.value), time: untilClock(num(h.untilAt), t, { now }), back: backNone(h) ? t('none') : holdBack(key, h) }) : '';
}
/** THE CARD'S FACTS against the value NOW → null | { key, label, value, now, was, moved, held, back, verdict, button: {words, title,
 *  raise} | null, nowWords, heldWords, whyWords, whyLink, vol: {prop, asked} (the words that move with the clock — patched in place,
 *  never in a row's signature), sig }. `now` = the HUB's time (the verdict's, as the press is judged). */
export function settingCardOf(i, t, { now = hubNow() } = {}) {
  const a = settingAskOf(i);
  if (!a) return null;
  const key = String(a.key), value = num(a.value), cur = factValue(key), was = num(a.was);
  const schema = SETTINGS_SCHEMA[key];
  const held = factHold(key);
  const verdict = settingPressVerdict(a, { present: cur, now, lasting: held ? holdBack(key, held) : undefined });   // LAW A: a live hold's «before» is the row's lasting value
  const rel = Number.isFinite(num(a.untilRel)) ? num(a.untilRel) : null;
  const at = rel == null && Number.isFinite(num(a.untilAt)) ? num(a.untilAt) : null;
  const timed = rel != null || at != null;
  const back = held ? holdBack(key, held) : cur;   // a hold keeps its FIRST «before» (src/server/setting-holds.js amendment 4)
  const curW = factNone(key) ? t('none') : cur, backW = held ? (backNone(held) ? t('none') : back) : curW;   // B-0a33 cure: a row holding no number is said «none», never the default
  const moved = Number.isFinite(was) && was !== cur;
  const nowWords = moved ? t('It is {now} now — it was {was} when asked', { now: curW, was }) : t('Now: {value}', { value: curW });
  const prop = rel != null ? t('Proposed: {value} for {span} from your press (until about {time}), then {back}', { value, span: spanWords(rel, t), time: untilClock(now + rel, t, { now }), back: backW })
    : at != null ? t('Proposed: {value} until {time}, then {back}', { value, time: untilClock(at, t, { now }), back: backW })
    : t('Proposed: {value} — it stays until you change it', { value });
  const hold = held ? holdWords(key, t, { now }) : '';
  const heldWords = !held ? '' : !verdict.press ? t('Held at {hold}', { hold })   // no press: what stands, nothing it would replace
    : timed ? t('Held at {hold} — this press replaces the hold\'s value and moment; it still returns to {back}', { hold, back: backW })
    : t('Held at {hold} — this press ends the hold; it stays at {value}', { hold, value });
  let button = null, whyWords = '', whyLink = false;
  if (verdict.press) {
    const raise = !!verdict.raise;
    const p = { value, time: at != null ? untilClock(at, t, { now }) : '', span: rel != null ? spanWords(rel, t) : '' };
    const words = at != null ? (raise ? t('Raise to {value} until {time}', p) : t('Lower to {value} until {time}', p))
      : rel != null ? (raise ? t('Raise to {value} for {span}', p) : t('Lower to {value} for {span}', p))
      : held ? t('Set to {value} for good — the hold ends', p)   // a lasting change on a held row: at or below its «before» (law A)
      : t('Lower to {value}', p);   // a lasting change with no hold is never a raise (the verdict refuses one)
    button = { words, raise, title: timed ? t('Sets it to {value} now and back to {back} at that moment, then tells the agent', { value, back: backW }) : t('Sets it to {value} now, then tells the agent', { value }) };
  } else if (verdict.why === 'same') whyWords = t('It is already {value} — nothing to change', { value: curW });
  else if (verdict.why === 'passed') { whyWords = t('That moment ({time}) has passed — change it on the row', { time: at != null ? untilClock(at, t, { now }) : '' }); whyLink = true; }
  else if (verdict.why === 'raise-needs-until') { whyWords = t('A raise needs its «until» — change it on the row'); whyLink = true; }
  else if (verdict.why === 'raise-over-hold') { whyWords = t('{value} would stay above {back}, the value before the hold — a raise needs its «until»; change it on the row', { value, back: verdict.lasting }); whyLink = true; }
  else { whyWords = t('This change cannot be pressed here — change it on the row'); whyLink = true; }
  const vol = { prop, asked: t('asked {ago}', { ago: agoText(num(a.askedAt) || num(i.createdAt) || Date.now(), t) }) };
  return { key, label: schema && typeof schema.label === 'string' ? schema.label : key, value, now: cur, was, moved, held, back, verdict, button, nowWords, heldWords, whyWords, whyLink, vol,
    sig: JSON.stringify([key, value, cur, was, held ? [num(held.value), num(held.untilAt), held.before] : null, verdict.press ? 1 : verdict.why, button && button.words, at, rel]) };
}
/** THE BOX's lines, in order — ONE list both renderers draw (the row's escaped HTML, the For-you window's nodes): the label and its
 *  door, the value now, the proposal (its clock words volatile), a standing hold, the ask's age (not in the strip — its meta says it),
 *  and with no press the reason (+ the row's door). */
const cardLines = (c, strip) => [
  { cls: 'ut-sc-head', label: c.label, door: true },
  { cls: 'ut-sc-now' + (c.moved ? ' ut-sc-moved' : ''), text: c.nowWords },
  c.verdict.why === 'same' ? null : { cls: 'ut-sc-prop', vol: 'prop' },   // already the value proposed: the why line says it (no «then» to promise)
  c.heldWords ? { cls: 'ut-sc-held', text: c.heldWords } : null,
  strip ? null : { cls: 'ut-sc-asked', vol: 'asked' },
  c.button ? null : { cls: 'ut-exit-note ut-sc-why', text: c.whyWords, door: c.whyLink },
].filter(Boolean);
/** THE BOX (escaped words only) with its ONE press; `strip` = the chat's attention strip (the row's meta already says the age).
 *  The row's door is THE setting link's own span (foryou-links' shape: `.fy-link` data-fy="setting" — every surface's link press
 *  opens Settings on the row; it opens, never writes). */
export function settingCardHtml(i, t, { strip = false } = {}) {
  const c = settingCardOf(i, t);
  if (!c) return '';
  const door = `<span class="fy-link ut-sc-link" role="link" tabindex="0" data-fy="setting" data-ref="${escHtml(c.key)}">${escHtml(t('Open this setting'))}</span>`;
  const lineHtml = (l) => `<div class="${l.cls}">${l.label != null ? `<span class="ut-sc-label">${escHtml(l.label)}</span>` : l.vol ? `<span class="ut-sc-vol" data-vol="${l.vol}">${escHtml(c.vol[l.vol])}</span>` : escHtml(l.text)}${l.door ? ' ' + door : ''}</div>`;
  return `<div class="ut-setting-change" data-key="${escHtml(c.key)}" data-press="${escHtml(c.verdict.press ? 'yes' : String(c.verdict.why))}">`
    + cardLines(c, strip).map(lineHtml).join('')
    + (c.button ? `<div class="ut-exit-answer ut-setting-answer"><button type="button" class="ut-act ut-action-setting ut-setting-go" data-answer="setting" data-shown="${escHtml(String(c.now))}" title="${escHtml(c.button.title)}">${escHtml(c.button.words)}</button></div>` : '')
    + '</div>';
}
/** The same box as NODES (the For-you window — every item string is textContent there; its press is the pane's action row). */
export function settingCardEls(i, t) {
  const c = typeof document === 'undefined' ? null : settingCardOf(i, t);
  if (!c) return [];
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const door = () => { const d = el('span', 'fy-link ut-sc-link', t('Open this setting')); d.setAttribute('role', 'link'); d.tabIndex = 0; d.dataset.fy = 'setting'; d.dataset.ref = c.key; return d; };
  const box = el('div', 'ut-setting-change');
  box.dataset.key = c.key; box.dataset.press = c.verdict.press ? 'yes' : String(c.verdict.why);
  for (const l of cardLines(c, false)) {
    const line = el('div', l.cls);
    if (l.label != null) line.append(el('span', 'ut-sc-label', l.label));
    else if (l.vol) { const v = el('span', 'ut-sc-vol', c.vol[l.vol]); v.dataset.vol = l.vol; line.append(v); }
    else line.append(document.createTextNode(l.text));
    if (l.door) line.append(' ', door());
    box.append(line);
  }
  return [box];
}
/** the box's words that move with the clock, written into the nodes already drawn (a minute's «asked 3min ago» never rebuilds the
 *  button — THE LIVE CARD LAW, r14) */
export function patchSettingVolatile(root, i, t) {
  const c = root && typeof root.querySelectorAll === 'function' ? settingCardOf(i, t) : null;
  if (!c) return;
  for (const n of root.querySelectorAll('.ut-setting-change .ut-sc-vol')) { const w = c.vol[n.dataset.vol]; if (typeof w === 'string' && n.textContent !== w) n.textContent = w; }
}
// ── THE PROPOSAL CARD (lane login-request-card, majordomo piece 3b — the owner's addition, 2026-11-16): an agent that may NOT end a
// conversation PROPOSES the end. Its rows come from conversations.list's builder (src/server/end-proposals.js); each row: its name
// (words), its last activity, its memory, and WHAT WOULD BE CUT OFF in the person's words (src/end-proposal.js cutOffWords);
// rows with nothing running are ticked, busy or unknown ones are NOT (the person ticks them knowingly); a row that started something
// after the drawing comes back unticked with what changed. «Terminate selected» = the person's own Terminate · «Keep all»; each row's
// jobs (piece 7's ONE helper, mounted by user-todos-actions mountProposalRows) are ticked before the end. Its SECOND kind (action.kind
// 'wake' — piece 7's propose-wake) lists the proposed jobs through the same helper, drawn ticked: «Allow the ticked ones» · «Keep all as they are».
const proposalOf = (i) => !!(i && !i.clearedAt && isProposal(i.action) && i.card && Array.isArray(i.card.rows));
/** THE PERSON'S TICKS on a proposal card, per item (the cure's law 4: a redraw never drops a tick in a box in use) — `ends` by the
 *  row's key, `jobs` by the job's id; recorded by the card's change listener (user-todos-actions mountProposalRows), read back at
 *  every drawing of the same item (the tray, the chat's card and the For-you window alike). */
export const PROPOSAL_TICKS = new Map();
export const proposalTicksOf = (id) => { let m = PROPOSAL_TICKS.get(id); if (!m) { m = { ends: new Map(), jobs: new Map() }; PROPOSAL_TICKS.set(id, m); } return m; };
const stampOf = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null);
export function proposalCardOf(i, t) {
  if (!proposalOf(i)) return null;
  const end = i.action.kind !== 'wake';
  const rows = i.card.rows.slice(0, 20).map((r) => {
    if (!end) return { id: String(r.id || ''), name: String(r.name || r.id || '') };
    const at = stampOf(r.idleSince);
    const cut = cutOffWords(r.busy).map((w) => t(w.key, w.params || {}));
    const held = PROPOSAL_TICKS.has(i.id) ? PROPOSAL_TICKS.get(i.id).ends.get(String(r.key || '')) : undefined;
    return { key: String(r.key || ''), name: String(r.name || r.key || ''), pick: r.changed || r.failed ? false : held !== undefined ? held : r.pick === true,
      meta: [at != null ? t('last active {ago}', { ago: agoText(at, t) }) : t('last activity unknown'), Number.isFinite(r.memBytes) ? t('memory {size}', { size: formatSize(r.memBytes) }) : null].filter(Boolean).join(' · '),
      cut: cut.length ? cut : [t('Nothing runs in it.')],
      changed: Array.isArray(r.changed) && r.changed.length ? t('Something started in it after this card was drawn — it was not ended. Look again.') : r.failed ? t('It could not be terminated — look again.') : null };
  });
  return { end, why: String(i.card.why || i.detail || ''), rows, sig: cardSig(i.card) };   // sig: THE drawing a press answers (the cure's law 4)
}
export function proposalCardHtml(i, t) {
  const c = proposalCardOf(i, t);
  if (!c) return '';
  if (!c.end) return `<div class="ut-proposal-card ut-wakeprop" data-kind="wake" data-sig="${escHtml(c.sig)}"><div class="ut-ep-why">${escHtml(c.why)}</div><div class="ut-wp-rows" data-place="piece-7"></div>`
    + `<div class="ut-exit-answer ut-ep-answer"><button type="button" class="ut-act ut-action-endprop ut-endprop-go" data-answer="save">${escHtml(t('Allow the ticked ones'))}</button>`
    + `<button type="button" class="ut-act ut-action-endprop ut-endprop-keep" data-answer="keep">${escHtml(t('Keep all as they are'))}</button></div></div>`;
  const rowHtml = (r) => `<div class="ut-ep-row${r.changed ? ' ut-ep-changed' : ''}" data-key="${escHtml(r.key)}">`
    + `<label class="ut-ep-pick"><input type="checkbox" class="ut-ep-check" data-key="${escHtml(r.key)}"${r.pick ? ' checked' : ''}> </label>`
    + `<span class="ut-ep-name">${escHtml(r.name)}</span>`   // its name in words (a link once lane login-request-card's internal links is under this card)
    + `<span class="ut-ep-meta">${escHtml(r.meta)}</span>`
    + `<div class="ut-ep-cut">${r.cut.map((w) => `<div>${escHtml(w)}</div>`).join('')}</div>`
    + (r.changed ? `<div class="ut-ep-changed-words">${escHtml(r.changed)}</div>` : '')
    + `<div class="ut-ep-jobs" data-place="piece-7"></div></div>`;
  return `<div class="ut-proposal-card ut-endprop" data-kind="end" data-sig="${escHtml(c.sig)}"><div class="ut-ep-why">${escHtml(c.why)}</div>${c.rows.map(rowHtml).join('')}`
    + `<div class="ut-exit-answer ut-ep-answer"><button type="button" class="ut-act ut-action-endprop ut-endprop-go" data-answer="terminate">${escHtml(t('Terminate selected'))}</button>`
    + `<button type="button" class="ut-act ut-action-endprop ut-endprop-keep" data-answer="keep">${escHtml(t('Keep all'))}</button></div></div>`;
}

/** The same card as NODES (the For-you window — every word textContent; its presses are the pane's action row). */
export function proposalCardEls(i, t) {
  const c = typeof document === 'undefined' ? null : proposalCardOf(i, t);
  if (!c) return [];
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const box = el('div', `ut-proposal-card ${c.end ? 'ut-endprop' : 'ut-wakeprop'}`);
  box.dataset.kind = c.end ? 'end' : 'wake';
  box.dataset.sig = c.sig;
  box.append(el('div', 'ut-ep-why', c.why));
  if (!c.end) { const place = el('div', 'ut-wp-rows'); place.dataset.place = 'piece-7'; box.append(place); return [box]; }
  for (const r of c.rows) {
    const row = el('div', `ut-ep-row${r.changed ? ' ut-ep-changed' : ''}`); row.dataset.key = r.key;
    const pick = el('label', 'ut-ep-pick'), box1 = el('input', 'ut-ep-check'); box1.type = 'checkbox'; box1.dataset.key = r.key; box1.checked = !!r.pick; pick.append(box1);
    const nameBox = el('span', 'ut-ep-name', r.name);   // its name in words (a link once internal links is under this card)
    const cut = el('div', 'ut-ep-cut'); for (const w of r.cut) cut.append(el('div', null, w));
    row.append(pick, nameBox, el('span', 'ut-ep-meta', r.meta), cut);
    if (r.changed) row.append(el('div', 'ut-ep-changed-words', r.changed));
    const jobs = el('div', 'ut-ep-jobs'); jobs.dataset.place = 'piece-7'; row.append(jobs);
    box.append(row);
  }
  return [box];
}

/** An --options label is a REPLY the person sends — it reads as one («Reply: …»), never as the act it names. */
export const optionWords = (label, t) => t('Reply: {label}', { label: String(label) });
/** THE WORDS OF AN ITEM, ONE RENDERER (lane foryou-honest, the stress evaluation's P1-2): plain text + the For-you links
 *  (foryou-links linkedHtml — every segment escaped, a link a span around its own words), never markdown — the tray's rows
 *  and the For-you window's pane both draw this (the pane's markdown turned `__tests__/` into a bold «tests/»). */
const fyDraw = (g, inner, attrs) => vsLinkHtml(g.kind, g.ref, inner, { cls: 'fy-link', attrs });   // lane login-request-card piece 1: a conversation / desktop link's ONE drawing (the icon, the real name, the unknown chip)
export const wordsHtml = (text, { whole = false } = {}) => linkedHtml(String(text || ''), { escape: escHtml, note: (g) => maskedLinkNote(g, tr), whole, has: isSettingKey, draw: fyDraw });   // B-3f50: `whole` = the text IS the agent's own stored field — its end «…» is the store's cut only at a cap   // lane mask-value-shape: a masked link = words + THE note
/** The labels a row's chips stand for (lane foryou-honest): ctx.optionsOf (the model's — explicit, else parsed), else the item's own. */
export const rowOptions = (i, ctx) => (ctx && typeof ctx.optionsOf === 'function' ? ctx.optionsOf(i) : i && Array.isArray(i.options) ? i.options : []) || [];

/** design 009 §2 A: an app install's ONE CARD — the engine's view (`item.card`, src/app-card.js) worded by
 *  app-card-model: who asks and why, where it comes from and how big, what the click gives; TWO buttons (Install / Not
 *  now — the click installs, nothing in between); the progress, Installed · Open and a failure's Try again in the same
 *  card; everything else in its Details fold. Every string escHtml'd (an app's name and an agent's why are peer text).
 *  `buttons: false` = the For-you window's pane (its buttons live in the pane's action row). */
const isAppCard = (i) => !!(i && i.action && i.action.type === 'app-install' && i.card && typeof i.card === 'object');
/** apps-joint r1 (F1): a download's icon is served from its proposal (lane apps-install-core) — the only other address a
 *  card's picture may have. */
const PROPOSAL_ICON_RE = /^\/api\/apps\/proposals\/ap-[0-9a-f]{6}\/icon$/;
export function appCardHtml(i, t, { lang = 'en', resolved = false, buttons = true } = {}) {
  const v = i.card;
  const w = cardWords(v, t, lang);
  const pg = progressWords(v, t);
  const line = (cls, s) => (s ? `<div class="ut-app-line ${cls}">${escHtml(s)}</div>` : '');
  const icon = v.app && typeof v.app.icon === 'string' && (v.app.icon.startsWith('/api/apps/icon?') || PROPOSAL_ICON_RE.test(v.app.icon)) ? `<img class="ut-app-icon" alt="" src="${escHtml(v.app.icon)}">` : '';
  let html = icon + line('ut-app-by', w.by) + line('ut-app-from', w.from) + (w.argv || []).map((l) => line('ut-app-argv', l)).join('') + line('ut-app-note', w.fromNote) + line('ut-app-gives', w.gives) + line('ut-app-first', w.firstUse) + line('ut-app-changed', w.changed);
  if (pg) {
    const acts = buttons ? pg.actions.map((a) => `<button type="button" class="ut-act ut-action-app ut-app-${a}" data-answer="${a}">${escHtml(a === 'open' ? t('Open') : t('Try again'))}</button>`).join('') : '';
    html += `<div class="ut-app-progress" data-kind="${pg.kind}">${pg.kind === 'busy' ? '<span class="ut-app-spin" aria-hidden="true"></span>' : ''}<span class="ut-app-progress-text">${escHtml(pg.text)}</span>${acts}</div>`;
  } else if (buttons && !resolved && v.state === 'proposed' && i.action.id) {
    html += `<div class="ut-exit-answer ut-app-answer"><button type="button" class="ut-act ut-action-app ut-app-install" data-answer="install">${escHtml(w.go)}</button><button type="button" class="ut-act ut-action-app ut-app-reject" data-answer="reject">${escHtml(w.later)}</button></div>`;
  }
  // 主开发 r5176 (4): the agent's receipt of the person's decision not on disk yet / not queued — on the card, the person's own record
  if (v.receipt === 'not-on-disk' || v.receipt === 'not-queued') html += line('ut-app-receipt', receiptWords(v.receipt, t));
  if (w.details.length) html += `<details class="ut-detail-exp ut-app-details"><summary>${escHtml(t('Details'))}</summary><div class="ut-app-detail">${w.details.map((d) => `<div class="ut-app-dline${d.mono ? ' ut-app-mono' : ''}">${escHtml(d.text)}</div>`).join('')}</div></details>`;
  return `<div class="ut-app-card" data-state="${escHtml(String(v.state || ''))}">${html}</div>`;
}

/** The static parts of a row for `entry` + the signature patchRow compares.
 *  The LIVE half (enabled / tooltip of the reply controls) is NOT in here —
 *  applyLive owns it, so a turn flip never rebuilds a row. */
function partsOf(entry, ctx) {
  const { t } = ctx;
  const i = entry.item;
  const resolved = !!entry.resolved;
  const notice = !!entry.notice && !resolved;
  const tail = !!entry.tail;
  // a CLEARED item ("Clear content…", 2026-09-28): its words are the cleared sentence (ctx.wordsOf) — dimmed, in its place
  const dline = resolved ? null : deadlineOf(i, { t, now: hubNow(), clock: hubClock() }); // r7 addendum: its deadline — r8: at the HUB's time; it never withdraws an answer (the producer's settle does)
  // lane lark-refresh-stall r2 (acceptance r1's shots: desktop cut «…飞书的一…», phone 390 «…卡住了 8…» — the number itself): a row
  // whose words carry a CAUSE (`{cause}` — a words param: a dead sign-in's) WRAPS whole, folded or not
  const wraps = !!(i && !i.clearedAt && i.i18n && i.i18n.text && i.i18n.text.params && i.i18n.text.params.cause && typeof i.i18n.text.params.cause === 'object');
  const cls = 'ut-item' + (notice ? ' ut-item-notice' : '') + (resolved ? ' ut-item-resolved' : '') + (resolved && !tail ? ' ut-item-inplace' : '') + (i && i.clearedAt ? ' ut-item-cleared' : '') + (wraps ? ' ut-item-wraps' : '');
  const card = isAppCard(i) ? i.card : null; // design 009: an app install's ONE card (a cleared item has none left)
  const lang = typeof ctx.lang === 'function' ? ctx.lang() : (ctx.lang || 'en');
  const run = card ? null : runCardOf(i, { t }); // r7: the run card's facts — its headline is the row's question
  const words = card ? cardWords(card, t, lang).title : run ? run.headline : ctx.wordsOf(i);
  const detail = ctx.detailOf(i);
  // B-3f50: a field drawn WHOLE and as the agent stored it (never a template the page filled, never a line list) — the cut rule's caps judge it
  // batch 47's cure (主开发 09:09Z + its reader): ONLY THE AGENT'S OWN ASK (isAsk — via 'ask', the vibespace-ask route) is its whole words. A
  // PRODUCER's plain-words item (the browser hand-back, a helper's ask, a desktop app's notice…) may cut a field itself — its own «…»
  // below the store's cap (a confirmation's target at 300, a script at 200) — so it keeps the conservative reading: a «…» ending a
  // line or the text is a cut, and the address it went through is plain words, never a link to a wrong page
  // B-76dc: the rule itself is PURE src/inbox-origin.js fieldWhole (isAsk + the field as stored, no i18n template) — the For-you
  // window's pane and the vault paste box ask the same
  const wordsWhole = !card && !run && fieldWhole(i, 'text', words);
  const detailWhole = fieldWhole(i, 'detail', detail);
  const rs = !resolved && ctx.replyState ? ctx.replyState(i) : { show: false };
  const dot = resolved
    ? '<span class="ut-dot" data-urgency=""></span>'
    : `<span class="ut-dot" data-urgency="${notice ? '' : escHtml(i.urgency || 'normal')}" title="${escHtml(notice ? t('notice') : (i.urgency || 'normal'))}"></span>`;
  // Detail rides behind a collapsed expander (up to 2000 chars of agent context).
  // (an exit ask's detail IS its command — shown whole above its Allow / Deny, never again folded below them)
  const detailHtml = detail && !(i.action && i.action.type === 'exit-run-ask') ? `<details class="ut-detail-exp"><summary>${escHtml(t('detail'))}</summary><div class="ut-detail">${wordsHtml(detail, { whole: detailWhole })}</div></details>` : '';
  const detailOrFacts = run ? `<details class="ut-detail-exp"><summary>${escHtml(t('detail'))}</summary><div class="ut-detail">${runFactsHtml(i, t, { buttons: false })}</div></details>` : detailHtml; // r7: a record with facts never shows the prose (old clients' words)
  // lane browser-propose: an open proposal's words are shown whole ABOVE its Approve (proposalAskHtml) — never folded again below
  const detailFold = i && i.action && (i.action.type === 'browser-proposal' || i.action.type === 'channel-api-proposal' || HELD_ASKS.includes(i.action.type) || isSecretAsk(i)) && !resolved ? '' : detailOrFacts; // lane hub-act-ask: shown whole above its answers (design q-046: an automation ask too; lane vault-paste-request: a paste request's words above its box)
  // OPTION CHIPS (design-user-inbox-reply D3a): one click = a reply whose text
  // IS the label. Addressed by INDEX — the label never rides an attribute.
  // lane foryou-honest (P2-3): the chips are ctx.optionsOf's — the agent's options, else its detail's «A …；B …» parsed
  const optList = rowOptions(i, ctx);
  // THE OPTIONS LAW (lane ui-phone-and-fit pick 0 — the owner 2026-11-13, a 500 px chat window: «回复：保留 ag», the rest cut):
  // «Reply:» is said ONCE, a label before the options; each pill is the option's own words, whole (it wraps inside itself,
  // never an ellipsis — style.css «THE OPTIONS LAW»), the agent's first (its recommendation) first; its accessible name and
  // tip keep the whole reply («Reply: …» — lane controls-that-lie: a reply reads as a reply)
  const opts = !resolved && rs.show && optList.length
    ? `<div class="ut-opts"><span class="ut-opts-label">${escHtml(t('Reply:'))}</span>${optList.map((o, k) => `<button type="button" class="ut-opt" data-idx="${k}" aria-label="${escHtml(optionWords(o, t))}" title="${escHtml(optionWords(o, t))}">${escHtml(String(o))}</button>`).join('')}</div>` : '';
  let meta, ageWords = null, expWords = null; // r14: the row's VOLATILE words (the age, the lifetime) — patched in place, never in the signature
  if (resolved) {
    const by = resolvedByText(i.resolvedBy, t, i);
    const said = replyWords(i.reply, t, REPLY_SNIPPET);   // B-51dd: its text, its pictures, or both
    const replied = said ? ' · ' + escHtml(t('You replied: {text}', { text: said })) : '';
    meta = (tail ? `<span class="ut-sess" title="${escHtml(t('Go to this session'))}">${escHtml(ctx.nameFor(i.sessionKey, [i]))}</span> · ` : '')
      + escHtml(statusWords(i, t)) // r3: a hidden pointer reads «hidden — nothing was decided», never «done»
      + (by ? ' · ' + escHtml(by) : '') + (endCodeOf(i) ? ` · <code class="ut-end-code">${escHtml(endCodeOf(i))}</code>` : '') + replied // r8: an end this client cannot classify — its code, typed
      + (tail ? `<span class="ut-age"> · ${escHtml(agoText(i.resolvedAt || i.createdAt, t))}</span>` : '');
    if (tail) ageWords = ' · ' + agoText(i.resolvedAt || i.createdAt, t);
  } else {
    const exp = itemExpiryText(i, t, notice); // a notice's window; r3: a wake ask's lifetime («expires in 7 d»)
    // lane foryou-folds: a row of the tray's attention list (`entry.band`) names its conversation — the bands are flat, no
    // group head — with THE running dot of a real session in front (D1.7: the panel patches it live, never the row)
    const dot = entry.band && typeof i.sessionKey === 'string' && i.sessionKey.includes(':') ? `<span class="ut-live-dot" data-key="${escHtml(i.sessionKey)}" role="img"></span>` : '';
    // lane foryou-honest (acceptance round 2): the age keeps its separator — ONE nowrap span « · 3min ago», its space inside
    // (no break before the dot), so a long name wraps INSIDE itself and no line starts with «·»; an expiry's dot rides the age
    const age = escHtml(agoText(i.createdAt, t)) + (exp ? ' ·' : '');
    meta = (notice || entry.band ? `<span class="ut-sess" title="${escHtml(t('Go to this session'))}">${dot}${escHtml(ctx.nameFor(i.sessionKey, [i]))}</span><span class="ut-age"> · ${age}</span>` // lane foryou-honest (P3-8): the name is the tray row's door to its conversation
      : `<span class="ut-age">${age}</span>`) + (exp ? `<span class="ut-exp"> ${escHtml(exp)}</span>` : '');
    ageWords = (notice || entry.band ? ' · ' : '') + agoText(i.createdAt, t) + (exp ? ' ·' : '');
    expWords = exp ? ' ' + exp : null;
  }
  // lane foryou-honest (the phone's ONE row shape): a touch screen folds a row to its question + meta line — the whole row
  // opens it in place — and THIS trailing door keeps the conversation one tap away (a mouse never sees it: style.css); a row
  // RESOLVED in its band slot keeps it (acceptance round 2: nothing left to open — its door is its way to the conversation)
  // lane ui-needs-a-button (reader follow-up #10): a PARKED ASK's door is this one — it is answered on the conversation's card, and the
  // door says so on the tray and the phone sheet as it does in the For-you window
  // lane ui-needs-a-button pick 6 (the 390 px picture): a pointer's DECLARED door is its trailing door on a touch row too — its verb
  // («Open the Outbox») and the same jump; the conversation door stays for every other row
  const parkedGo = isParkedAsk(i) ? t('Open the conversation and answer') : '';
  const rowDoor = doorOf(i);
  // ui-words: the door's verb is an i18nKey its registry row declares (foryou-actions.js open-outbox `door`), never a stored value
  const go = (notice || entry.band) && rowDoor ? `<button type="button" class="ut-go ut-go-door" title="${escHtml(t(rowDoor.title || rowDoor.verb))}" aria-label="${escHtml(t(rowDoor.verb))}" data-label="${escHtml(t(rowDoor.verb))}">${UI_ICONS.external}</button>`
    : notice || entry.band ? `<button type="button" class="ut-go${parkedGo ? ' ut-go-answer' : ''}" title="${escHtml(parkedGo || t('Go to this session'))}" aria-label="${escHtml(parkedGo || t('Go to this session'))}" data-label="${escHtml(parkedGo || tc('inbox', 'Chat'))}">${UI_ICONS.chat}</button>` : '';
  const deadline = dline ? deadlineHtml(i, t, dline) : ''; // r7 addendum: the time left, under the question
  const body = `${go}<div class="ut-text">${card ? escHtml(words) : wordsHtml(words, { whole: wordsWhole })}</div>${deadline}${askChipsHtml(i, t)}${card ? appCardHtml(i, t, { lang, resolved }) : !resolved ? exitAskHtml(i, t) + rowButtonsHtml(i, t) + hubAskHtml(i, t, detail, !!ctx.noPick) + proposalAskHtml(i, t, detail) + appAskHtml(i, t) + grantAskHtml(i, t) + proposalCardHtml(i, t) + settingCardHtml(i, t, { strip: !!ctx.noPick }) + secretAskHtml(i, t, detail) + reconnectHtml(i, t) + doorHtml(i, t) : ''}${opts}${card ? '' : detailFold}${card || resolved ? '' : techFoldHtml(ctx.foldOf ? ctx.foldOf(i) : [], { className: 'ut-tech-fold' })}<div class="ut-meta">${meta}</div>`; // ONE ORDER where an item opens (主开发 13:34Z): the question, its OPTIONS, then the detail — a person decides first and reads the reason under it
  // ⤢ = THE For-you window ON this item (design-user-inbox-reply §9: long text at full width, reply / done there)
  // lane foryou-honest (the touch scale): every verb carries its WORD in data-label — a touch screen draws it under the icon
  // (style.css's touch block, ::after — never the button's text, so a title / aria / textContent reader is unchanged)
  const view = `<button class="ut-act ut-view" title="${escHtml(t('Open in the For-you window'))}" aria-label="${escHtml(t('Open in the For-you window'))}" data-label="${escHtml(t('Open'))}">⤢</button>`;
  // design 009: a card's Reply / Mark done / Ignore / Copy / Clear content… live behind its ⋯ (two buttons on its face)
  const more = `<button type="button" class="ut-act ut-more" aria-label="${escHtml(t('More'))}" data-label="${escHtml(t('More'))}">⋯</button>`;
  // lane wake-approve-card r2: A DECISION ROW HAS TWO VERBS (foryou-actions closersOf) — its Approve / Deny above, no ✓ / ✕
  // beside them (a generic close was a silent Deny), and no ↺ once decided (a decision is final); r3: A POINTER HIDES — ONE
  // ✕ «Hide» (no ✓: a pointer is never «done»; hiding decides nothing) and no ↺ once hidden (it comes back by itself)
  const closers = closersOf(i, resolved);
  const actions = resolved
    ? `<span class="ut-actions">${view}${closers.includes('reopen') ? `<button class="ut-act ut-reopen" aria-label="${escHtml(t('Reopen'))}" data-label="${escHtml(t('Reopen'))}">↺</button>` : ''}</span>`
    : card ? `<span class="ut-actions">${view}${more}</span>`
    : `<span class="ut-actions">${actionBtnHtml(i, t)}${reauthBtnHtml(i, t)}${takeoverBtnHtml(i, t)}${rs.show ? `<button type="button" class="ut-act ut-reply-btn" aria-label="${escHtml(t('Reply'))}" data-label="${escHtml(t('Reply'))}">${UI_ICONS.reply}</button>` : ''}${view}`
      + (closers.includes('done') ? `<button class="ut-act ut-done" title="${escHtml(i.open && i.open.done ? t(i.open.done) : t('Handled — mark done'))}" data-label="${escHtml(t('Mark done'))}">✓</button>` : '') // lane foryou-plugin-notices: a door's `done` = what this ✓ does (the plugin applies it)
      + (closers.includes('dismiss') ? `<button class="ut-act ut-dismiss" title="${escHtml(t('Dismiss (not going to act on this)'))}" data-label="${escHtml(tc('inbox', 'Dismiss'))}">✕</button>` : '')
      + (closers.includes('hide') ? `<button class="ut-act ut-dismiss ut-hide" title="${escHtml(t('Hide — decides nothing; what it points at stays open in the conversation'))}" data-label="${escHtml(isParkedAsk(i) ? t('Stop reminding (the conversation stays paused)') : t('Hide'))}">✕</button>` : '') + '</span>';
  // the deadline line's words, accent and state move every second (the ticker's) — the signature reads its facts only
  const sigBody = (deadline ? body.replace(deadline, deadline.replace(/>[^<]*<\/div>$/, '></div>').replace(/ ut-deadline-warn| data-state="[^"]*"/g, '')) : body)
    .replace(/ name="(ut-ak-reach-[^"]*)-\d+" value="(\w+)"(?: checked)?/g, ' name="$1" value="$2"') // r11: a copy's own group and the pick are no change of the row (a pick never repaints the radio under the person)
    .replace(/<span class="ut-sc-vol" data-vol="(\w+)">[^<]*<\/span>/g, '<span class="ut-sc-vol" data-vol="$1"></span>') // lane setting-doors pick 2: a proposed change's «until about 21:40» / «asked 3min ago» move with the clock (patchVolatile writes them)
    // lane needs-card-tail r14 (the r13 acceptance: «1min ago» → «3min ago» rebuilt the strip's Allow, and nothing re-armed the
    // new one — a press 30 s later was «moved under the pointer just now»): the age and the lifetime are words that move with
    // the clock — patchRow writes them in place (THE LIVE CARD LAW: never detach a button in use); a change of them is no change of the row
    .replace(/<span class="ut-(age|exp)">[^<]*<\/span>/g, '<span class="ut-$1"></span>');
  return { cls, dot, body, actions, deadline: !!deadline, age: ageWords, exp: expWords, item: resolved ? null : i, t, sig: cls + '\u0000' + dot + '\u0000' + sigBody + '\u0000' + actions };
}

/** The reply box (design-user-inbox-reply D3b): Enter sends, Shift+Enter is a
 *  newline, Esc folds — the panel owns those keys; this only builds it. */
/** lane foryou-attachments: an ask's --artifact CHIPS under the question — an SVG kind icon + the name (+ the host when it
 *  is not this box). Addressed by INDEX (data-ai): a click reads the item's own row, never a path back off an attribute. */
const askArts = (i) => (i && !i.clearedAt && Array.isArray(i.artifacts) ? i.artifacts : []); // a CLEARED item shows none (SHAPES todo drops them)
const chipFacts = (a, t) => ({ icon: a.kind === 'design' ? UI_ICONS.design : a.kind === 'page' ? UI_ICONS.globe : getFileIcon(a.name || a.path || ''),
  title: t('Open {name}', { name: (a.kind === 'page' ? a.url : a.path) || a.name || '' }) });
export function askChipsHtml(i, t) {
  const arts = askArts(i);
  if (!arts.length) return '';
  return `<div class="ut-arts">${arts.map((a, k) => {
    const f = chipFacts(a, t);
    return `<button type="button" class="ut-art" data-ai="${k}" data-kind="${escHtml(a.kind)}" title="${escHtml(f.title)}">`
      + `<span class="ut-art-ic" aria-hidden="true">${f.icon || ''}</span><span class="ut-art-name">${escHtml(a.name || '')}</span>`
      + (a.host ? `<span class="ut-art-host">${escHtml(a.host)}</span>` : '') + '</button>';
  }).join('')}</div>`;
}
/** The same chips as NODES (the For-you window — every item string is textContent there; the icon is a constant SVG). */
export function askChipEls(i, t) {
  const arts = askArts(i);
  if (!arts.length || typeof document === 'undefined') return [];
  const box = document.createElement('div');
  box.className = 'ut-arts';
  arts.forEach((a, k) => {
    const f = chipFacts(a, t);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ut-art'; b.dataset.ai = String(k); b.dataset.kind = a.kind; b.title = f.title;
    const ic = document.createElement('span'); ic.className = 'ut-art-ic'; ic.setAttribute('aria-hidden', 'true'); ic.innerHTML = f.icon || '';
    const nm = document.createElement('span'); nm.className = 'ut-art-name'; nm.textContent = a.name || '';
    b.append(ic, nm);
    if (a.host) { const h = document.createElement('span'); h.className = 'ut-art-host'; h.textContent = a.host; b.append(h); }
    box.append(b);
  });
  return [box];
}
/** lane foryou-attachments: the For-you window's words are markdown (escaped raw HTML + sanitizeHtml) — its TEXT nodes get
 *  the same links (src/lib/foryou-links.js), built as NODES (textContent), never HTML; a markdown <a> keeps its own link;
 *  a <code> run holds a relative path / bare filename (the chat's rule). */
export function linkifyInto(el) {
  if (!el || typeof document === 'undefined') return 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.data && !(n.parentElement && n.parentElement.closest('a, .fy-link'))) nodes.push(n);
  let made = 0;
  const after = [];   // lane mask-value-shape r6 (m7): [{block, notes}] — the notes that FOLLOW a verbatim block (this call's own, never kept)
  for (const n of nodes) {
    const inCode = !!(n.parentElement && n.parentElement.closest('code'));
    // r6 (m7): a VERBATIM block (a <pre> — the command an owner approves — or a code element) keeps its words exactly as written: a masked run in
    // it is its words (fy-masked), and THE note is a sibling AFTER the block, never inside it (a copy of the block copies the command)
    let block = n.parentElement ? n.parentElement.closest('pre') || n.parentElement.closest('code') : null;
    if (block && !el.contains(block)) block = null;
    let segs = segmentText(inCode ? '`' + n.data + '`' : n.data, { has: isSettingKey });   // lane setting-doors pick 1: a link to one setting too
    if (inCode) segs = segs.length > 1 && segs[0].s === '`' && segs[segs.length - 1].s === '`' ? segs.slice(1, -1) : segmentText(n.data, { has: isSettingKey });
    if (!segs.some((g) => g.t === 'link' || g.t === 'masked')) continue;
    const frag = document.createDocumentFragment();
    for (const g of segs) {
      if (g.t === 'masked') {   // lane mask-value-shape: a link a belt masked inside — its words + the note, never a link
        const w = document.createElement('span'); w.className = 'fy-masked'; w.textContent = g.s;
        if (block) { const words = maskedLinkNote(g, tr); let a = after.find((x) => x.block === block); if (!a) after.push(a = { block, notes: [] }); if (!a.notes.includes(words)) a.notes.push(words); frag.append(w); continue; }
        const n = document.createElement('span'); n.className = 'masked-link-note'; n.textContent = maskedLinkNote(g, tr);
        frag.append(w, ' ', n); continue;
      }
      if (g.t !== 'link') { frag.append(document.createTextNode(g.s)); continue; }
      if (g.kind === 'conversation' || g.kind === 'desktop') {   // lane login-request-card piece 1: THE drawing — every string in it escaped (vsLinkHtml)
        const box = document.createElement('span');
        box.innerHTML = fyDraw(g, escHtml(g.s), ` role="link" tabindex="0" data-fy="${escHtml(g.kind)}" data-ref="${escHtml(g.ref)}"`);
        frag.append(...box.childNodes); made++; continue;
      }
      const a = document.createElement('span');
      a.className = 'fy-link'; a.setAttribute('role', 'link'); a.tabIndex = 0;
      a.dataset.fy = g.kind; a.dataset.ref = g.ref; a.textContent = g.s;
      frag.append(a); made++;
    }
    n.replaceWith(frag);
  }
  for (const { block, notes } of after) {
    let at = block;
    for (const words of notes) {
      const d = document.createElement(block.tagName === 'PRE' ? 'div' : 'span'); d.className = 'masked-link-note'; d.textContent = words;
      if (block.tagName === 'PRE') at.after(d); else at.after(' ', d);
      at = d;
    }
  }
  return made;
}

export function replyBoxEl(t) {
  const box = document.createElement('div');
  box.className = 'ut-reply';
  const ta = document.createElement('textarea');
  ta.className = 'ut-reply-input';
  ta.rows = 1;
  ta.placeholder = t('Reply…');
  ta.setAttribute('aria-label', t('Reply'));
  const send = document.createElement('button');
  send.type = 'button';
  send.className = 'ut-act ut-reply-send';
  send.title = t('Send reply (Enter) · newline (Shift+Enter)');
  send.setAttribute('aria-label', send.title);
  send.innerHTML = UI_ICONS.send;
  // the box's one-line note ABOVE it (lane inbox-reply-dead-session): the verdict's fact — an ended conversation's send reopens it
  const why = document.createElement('div');
  why.className = 'ut-reply-why';
  why.style.display = 'none';
  box.append(why, voiceField(ta, attachDictation(ta)), send); // the microphone inside the box's trailing edge, Send unchanged
  return box;
}

/** B-51dd: what a reply said, in words — its text (cut at `max`), «N picture(s)» it carried, or both; '' for none. */
export function replyWords(reply, t, max = 0) {
  const text = reply && typeof reply.text === 'string' ? reply.text : '';
  const n = reply && Number(reply.pictures) > 0 ? Number(reply.pictures) : 0;
  const cut = max && text.length > max ? text.slice(0, max) + '…' : text;
  const pics = n ? t('{n} picture(s)', { n }) : '';
  return cut && pics ? `${cut} · ${pics}` : cut || pics;
}

/** A box the user is USING: it has focus or text. Never replaced or removed by a repaint. */
export function boxInUse(box) {
  if (!box) return false;
  const ta = box.querySelector('textarea');
  return box.contains(document.activeElement) || !!(ta && ta.value) || !!box.querySelector('.ut-reply-pic-item');   // B-51dd: a box holding a picture is in use
}

/** The live half: the reply button, the chips and an open box's Send follow
 *  the verdict of the session's CURRENT facts (ctx.replyState) — through THE box
 *  (ctx.replyBox, PURE src/inbox-reply.js replyBoxView): NEVER disabled (lane
 *  inbox-reply-dead-session, userW inc-mvfuzlom-nwav — an ended conversation's
 *  box was greyed out with its reason in a hover title). The fact is said in the
 *  box's note and every title; an ended conversation's send reopens it; only a
 *  send in flight holds the send and the chips. */
export function applyLive(el, item, ctx) {
  const { t } = ctx;
  const rs = ctx.replyState ? ctx.replyState(item) : { show: false, enabled: false, why: '' };
  const box = ctx.replyBox ? ctx.replyBox(item) : { reopen: false, note: rs.enabled || !rs.why ? null : { key: rs.why }, send: 'Reply', sendTitle: 'Send reply (Enter) · newline (Shift+Enter)' };
  const why = box.note ? t(box.note.key, { why: box.note.why || '' }) : '';
  const btn = el.querySelector(':scope > .ut-body > .ut-actions > .ut-reply-btn');
  if (btn) {
    btn.disabled = false;
    btn.title = rs.enabled ? t('Reply') : why || t('Reply');
    btn.setAttribute('aria-label', btn.title);
  }
  const busy = el.dataset.sending === '1';
  el.querySelectorAll(':scope > .ut-body > .ut-opts > .ut-opt').forEach((c) => {
    const label = rowOptions(item, ctx)[Number(c.dataset.idx)] || '';
    c.disabled = busy;
    c.title = rs.enabled ? t('Reply with "{label}"', { label }) : box.reopen ? t('Reopen and send "{label}"', { label }) : why;
  });
  const note = el.querySelector(':scope > .ut-body > .ut-reply > .ut-reply-why');
  if (note) {
    if (note.textContent !== why) note.textContent = why;
    note.style.display = why ? '' : 'none';
    note.dataset.reopen = box.reopen ? '1' : '';
  }
  const send = el.querySelector(':scope > .ut-body > .ut-reply > .ut-reply-send');
  // a box on a row that has since RESOLVED still sends (a reply to a resolved
  // item is accepted, D1.4)
  if (send) {
    send.disabled = busy;
    send.title = t(box.sendTitle);
    send.setAttribute('aria-label', box.reopen ? t(box.send) : send.title);
    // an ended conversation's send READS "Reopen and send" (its words beside the icon)
    let lb = send.querySelector(':scope > .ut-reply-send-label');
    if (box.reopen && !lb) { lb = document.createElement('span'); lb.className = 'ut-reply-send-label'; send.append(lb); }
    if (lb) { const w = box.reopen ? t(box.send) : ''; if (lb.textContent !== w) lb.textContent = w; lb.style.display = w ? '' : 'none'; }
    send.dataset.reopen = box.reopen ? '1' : '';
  }
}

/** A fresh row element for `entry`. */
export function renderRow(entry, ctx) {
  const el = document.createElement('div');
  el.dataset.id = entry.item.id;
  const p = partsOf(entry, ctx);
  el.className = p.cls;
  // the actions FLOAT at the body's top-right (first child, CSS float) so the words
  // wrap beside them and then use the full width below — a sibling column reserved
  // the right third of every tall row for four buttons (owner 2026-09-25 screenshot)
  el.innerHTML = p.dot + `<div class="ut-body">${p.actions}${p.body}</div>`;
  if (!entry.resolved && isSecretAsk(entry.item)) el.querySelector(':scope > .ut-body').append(secretBoxEl(entry.item));   // lane vault-paste-request: the paste box (DOM nodes)
  el.dataset.sig = p.sig;
  if (p.deadline) armDeadlines(); // r7 addendum: the line counts down from now
  applyLive(el, entry.item, ctx);
  return el;
}

/** Bring `el` (a row renderRow built) to `entry`. Unchanged ⇒ only the live
 *  half is re-applied. Changed ⇒ the dot, the text/detail/chips/meta and the
 *  actions are replaced AROUND a reply box — the box node itself is never
 *  detached (detaching a focused textarea blurs it), so a user typing while a
 *  broadcast lands keeps the caret and every character. An open detail stays open. */
export function patchRow(el, entry, ctx) {
  const p = partsOf(entry, ctx);
  if (el.dataset.sig !== p.sig) {
    const detailOpen = !!el.querySelector(':scope > .ut-body > .ut-detail-exp[open]');
    const runOpen = !!el.querySelector('.ut-run-fold[open]'); // r7: an open «Technical details» stays open through a repaint
    const techOpen = !!el.querySelector('.ut-tech-fold[open]'); // closure B1: the door's fold too
    let body = el.querySelector(':scope > .ut-body');
    const box = body && body.querySelector(':scope > .ut-reply');
    // an open row keeps its box; a resolved row keeps it only while in use
    const keep = box && (!entry.resolved || boxInUse(box)) ? box : null;
    // lane vault-paste-request: a PASTE box lives exactly while its request is open — never rebuilt by a repaint (what the
    // owner pasted and the focus survive a broadcast, a minute's «3min ago»), gone the moment the row resolves
    const sbox = body && body.querySelector(':scope > .ut-secret');
    const keepS = sbox && !entry.resolved && isSecretAsk(entry.item) ? sbox : null;
    const keeps = [keep, keepS].filter(Boolean);
    const wasOpen = el.classList.contains('ut-open'); // a row opened in place stays open through a repaint — an answer (resolved) closes it
    el.className = p.cls;
    if (wasOpen && !entry.resolved) el.classList.add('ut-open');
    if (!keeps.length) {
      el.innerHTML = p.dot + `<div class="ut-body">${p.actions}${p.body}</div>`;
      body = el.querySelector(':scope > .ut-body');
    } else {
      for (const c of [...el.children]) if (c !== body) c.remove();
      for (const c of [...body.children]) if (!keeps.includes(c)) c.remove();
      const tmp = document.createElement('div');
      tmp.innerHTML = p.dot + `<div class="ut-body">${p.actions}${p.body}</div>`;
      const [dotEl, freshBody] = [...tmp.children];
      el.insertBefore(dotEl, body);
      keeps[0].before(...freshBody.childNodes);
    }
    if (!keepS && !entry.resolved && isSecretAsk(entry.item)) body.append(secretBoxEl(entry.item));
    if (detailOpen) { const d = body.querySelector(':scope > .ut-detail-exp'); if (d) d.open = true; }
    if (runOpen) { const d = body.querySelector('.ut-run-fold'); if (d) d.open = true; }
    if (techOpen) { const d = body.querySelector('.ut-tech-fold'); if (d) d.open = true; }
    // (lane key-instance-scope: a re-render keeps the owner's pick — r11: drawn from the item's pick, reachPickOf, never re-read off this copy)
    el.dataset.sig = p.sig;
  } else patchVolatile(el, p); // r14: the same row a minute on — its words in place, its buttons the same nodes (their press arm kept)
  if (p.deadline) armDeadlines();
  applyLive(el, entry.item, ctx);
  return el;
}
/** r14: a row's words that move with the clock (partsOf `age` / `exp`) written into the nodes already drawn. */
function patchVolatile(el, p) {
  for (const [cls, w] of [['ut-age', p.age], ['ut-exp', p.exp]]) {
    const n = w == null ? null : el.querySelector(`:scope > .ut-body > .ut-meta > .${cls}`);
    if (n && n.textContent !== w) n.textContent = w;
  }
  if (p.item) patchSettingVolatile(el, p.item, p.t); // lane setting-doors pick 2: a proposed change's «until about» / «asked …»
}

/** THE KEYED RECONCILER (design-user-inbox-reply D1.9; §9 shares it with the
 *  For-you window's list): bring `container`'s keyed children (after `head`,
 *  when given) to `entries`, in order. A child whose key is still listed is
 *  PATCHED (never replaced — a focused textarea on it keeps focus and text), a
 *  new one is created, a child no longer listed is removed, and a node MOVES
 *  only when it is out of place (never the common case while a layout is
 *  append-only — moving a focused textarea would blur it).
 *  opts = {head, isRow(el), keyOf(el), idOf(entry), create(entry), patch(el, entry), drop(el)?} — drop: told of each
 *  child about to be removed (the tray: its reply box leaves the picture registry, B-51dd hosted cure) */
export function reconcileKeyed(container, entries, { head = null, isRow, keyOf = (el) => el.dataset.id, idOf = (e) => e.item.id, create, patch, drop = null }) {
  const existing = new Map();
  for (const c of container.children) if (isRow(c)) existing.set(keyOf(c), c);
  let prev = head;
  for (const e of entries) {
    const id = idOf(e);
    let row = existing.get(id);
    if (row) { patch(row, e); existing.delete(id); }
    else row = create(e);
    const slot = prev ? prev.nextElementSibling : container.firstElementChild;
    if (row !== slot) container.insertBefore(row, slot);
    prev = row;
  }
  for (const r of existing.values()) { if (drop) drop(r); r.remove(); }
}
