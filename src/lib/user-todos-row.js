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
import { escHtml } from './utils.js';
import { tc, t as tr } from './i18n.js'; // lane foryou-honest: «Dismiss» in the For-you sense (忽略 — the plain key is a dialog's «close»); r7: the deadline ticker's words (no ctx at a tick)
import { UI_ICONS } from './icons.js';
import { getFileIcon } from './file-types.js';
import { REACH_CHOICES, reachWord, reachTitle } from './automation-reach.js'; // lane key-instance-scope: the first-use card's reach choices (one spelling with the For-you window and the Vault window)
import { linkedHtml, segmentText } from './foryou-links.js'; // PURE (lane foryou-attachments): THE links in an item's words — one grammar with the chat
import { cardWords, progressWords } from './app-card-model.js'; // design 009: THE words of an app install's one card (PURE)
import { attachDictation, voiceField } from './voice-input.js'; // lane voice-everywhere: the microphone on every message box
import { decidedStamp, PERSON_DECIDES, closersOf, isHidden, expiryWords, isDecisionRow, grantWords, verbsOf, runCardOf, factsDroppedWords, deadlineOf, endOf, ruledOf } from '../foryou-actions.js'; // PURE (lane wake-approve-card): THE decided stamp «approved by you · 09:41» — one spelling with the chat card; r3: the closers a row draws, a pointer's hide, a wake ask's lifetime
import { isSecretAsk, secretBoxEl } from './vault-paste-box.js'; // lane vault-paste-request: an agent's request for a secret — its masked paste box (kept across repaints, like the reply box)

/** "3min ago" / "2h ago" / a date — words by the caller's t(). */
export function agoText(ts, t) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return t('just now');
  if (m < 60) return t('{m}min ago', { m });
  const h = Math.round(m / 60);
  return h < 24 ? t('{h}h ago', { h }) : new Date(ts).toLocaleDateString();
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
/** Who resolved it, in words ('expired' = the store's sweep, 'reply' = the
 *  user's own inbox reply, design-user-inbox-reply D1.4). `item` = the
 *  resolved item, for a resolution worded with its fact ('resumed'). */
export function resolvedByText(by, t, item = null) {
  // lane wake-approve-card: a decision only a person's click makes (a `decide: 'person'` row — a wake request, a reach request)
  // reads as the chat card's record does: «approved by you · 09:41» / «denied by you · 09:41» — the tray, the mini inbox and
  // the For-you window all word a resolved row here
  const stamp = item ? decidedStamp(item, { t }) : null;
  if (stamp) return stamp.text;
  const end = item ? endOf(item) : null;
  if (end && end.unknown) return ''; // r8: statusWords says «outcome unknown», endCodeOf draws its code — never the raw word here
  if (end && end.mapped) { item = ruledOf(item); by = item.resolvedBy; } // r8: a producer's outcome-in-the-fact settle reads as the ruled one
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
    const d = new Date(at);
    return t('running again (resumed {time})', { time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') });
  }
  return by && by !== 'user' ? by : '';
}

const REPLY_SNIPPET = 80; // chars of "You replied: …" on a resolved row (the For-you window shows the whole reply)

// A PRODUCER'S ACTION (design-reset-credits p2): an item that carries `action`
// gets ONE button doing it — the client maps the TYPE to a verb it owns.
const actionBtnHtml = (i, t) => (i && i.action && i.action.type === 'reset-credit' && i.action.accountKey
  ? `<button class="ut-act ut-action-reset" title="${escHtml(t('Use a reset credit…'))}">${UI_ICONS.refresh || ''}</button>` : '');
// lane channel-names-readable: a channel account's sign-in lacks a permission — ITS Re-authorize dialog (the same
// producer-action click: the model maps the type)
// lane channel-reauth-visible: a DEAD sign-in (`signin: 'expired'`) says its verb in WORDS on its own line instead — Reconnect
// (the same click: the model opens the account's Re-authorize dialog)
const signinItem = (i) => !!(i && i.action && i.action.type === 'channel-reauth' && i.action.adapterId && i.action.signin === 'expired');
const reauthBtnHtml = (i, t) => (i && i.action && i.action.type === 'channel-reauth' && i.action.adapterId && !signinItem(i)
  ? `<button class="ut-act ut-action-reset ut-action-reauth" title="${escHtml(t('Re-authorize'))}">${UI_ICONS.refresh || ''}</button>` : '');
const reconnectHtml = (i, t) => (signinItem(i)
  ? `<div class="ut-reconnect-row"><button type="button" class="ut-action-reset ut-action-reauth ut-reconnect" title="${escHtml(t('Open the account\'s Re-authorize'))}">${escHtml(t('Reconnect'))}</button></div>` : '');
// lane browser-takeover-queue: an assistant needs the person in its browser — its live view (the same producer-action click)
const takeoverBtnHtml = (i, t) => (i && i.action && i.action.type === 'browser-takeover' && i.action.requestId
  ? `<button class="ut-act ut-action-reset ut-action-takeover" title="${escHtml(t('Open its live view — take over there'))}">${UI_ICONS.browserLive || ''}</button>` : '');
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
    + (i.action.askId ? `<div class="ut-exit-answer"><button type="button" class="ut-act ut-action-exit ut-exit-allow" data-answer="allow">${escHtml(t('Allow'))}</button><button type="button" class="ut-act ut-action-exit ut-exit-deny" data-answer="deny">${escHtml(t('Deny'))}</button></div>` : '')
    + `<div class="ut-exit-note">${escHtml(t('Nothing runs until you answer. After 60 s it is refused.'))}</div>` : '');

/** lane hub-act-ask (design q-042 D4): a hub act nobody clicked, HELD on a cluster instance — answered where it appears:
 *  Allow once / Always on this machine / Deny; its words (what it would do, who asked, what each answer does) shown whole
 *  ABOVE them, never folded below (the exit-ask lesson). Allow once / Always are armed like every Allow (press-arm). */
const HUB_ANSWERS = ['once', 'window', 'always', 'deny'];   // r7 (lane vault-standing-request): «Allow for 1 hour» — a run card the door marked `action.window` only
// design q-046 (lane automation-keys-core): a held AUTOMATION call answers the same three ways — 允许一次 / 一直（授权给这个会话） / 拒绝
  // lane vault-run-door (design q-043 §8.3): an agent's RUN held on its card — 允许一次 / 此形状总是 (not offered for a shell, an
  // interpreter or an unknown destination: `action.always` false) / 拒绝
  const HELD_ASKS = ['hub-act-ask', 'automation-ask', 'pool-cross-provider', 'vault-run-ask', 'vault-grant-ask']; // q-053 P0b (decision ①): a pool's move to ANOTHER provider waits for the owner — 允许一次 / 这个池一直允许 / 拒绝
  const GRANT_ANSWERS = ['once', '8h', 'deny'];
  const STANDING_ANSWERS = ['standing', 'deny']; // lane vault-standing-request: an agent's STANDING request — Allow (the owner's «谁可以用» row, until he takes it back) / Deny // lane vault-manual-and-lock (design q-043 D4): 允许一次 (its next run) / 8 小时 (every run, 8 h) / 拒绝; it waits for nobody, never expires (a lock withdraws it)
  const hubAnswerWord = (a, t, type = 'hub-act-ask', act = null) => (a === 'once' ? t('Allow once') : a === 'window' ? t('Allow for 1 hour') : a === '8h' ? t('For 8 hours') : a === 'standing' ? t('Allow (standing)') : a === 'always' && type === 'vault-run-ask' && act && act.command ? t('Always (this command)') : a === 'always' ? (type === 'automation-ask' ? t('Always for this conversation') : type === 'pool-cross-provider' ? t('Always for this pool') : type === 'vault-run-ask' ? t('Always let this conversation use it (these hosts)') : t('Always on this machine')) : t('Deny'));
  const winWords = (i) => !!(i.facts && typeof i.facts === 'object' && (i.facts.v === 1 || i.facts.v === 2) && i.facts.window && typeof i.facts.window === 'object' && i.facts.window.offered === true);   // r8: «Allow for 1 hour» only beside its words (facts.window — a card whose facts the store dropped offers none)
  const heldAnswers = (i) => (i.action.type === 'vault-grant-ask' ? (i.action.standing ? STANDING_ANSWERS : GRANT_ANSWERS) : HUB_ANSWERS.filter((a) => a !== 'window' || (i.action.type === 'vault-run-ask' && i.action.window === true && !i.action.late && winWords(i))).filter((a) => a !== 'always' || (!(i.action.type === 'vault-run-ask' && i.action.always === false) && !(i.action.type === 'vault-run-ask' && i.action.late)))).filter((a) => a === 'deny' || !(i.action.type === 'vault-run-ask' && i.action.late && i.action.restartLost === true)); // r8: a LATE run card offers 允许一次 / 拒绝 only — its door refuses «Always» (a card never offers what its door refuses); after a restart (r23's restartLost) an Allow would mint nothing — 拒绝 alone, the line says why
// lane vault-scrub-forms (q-043 verify M1): a RUN card says what the scrubbing does not promise — the owner reads the command
// lane key-instance-scope: an AUTOMATION card offers the grant's REACH beside its answers — 只有它开的会话 (the default) · 这些岗位的会话
// (only when the caller is in one: action.groups) · 整个 VibeSpace (red, its title says it reaches the owner's own conversations too);
// the panel reads the checked choice when an answer is pressed (data-reach never rides the button: the radios are the state)
const reachPickHtml = (i, t) => {
  const groups = String(i.action.groups || '').split(' ').filter(Boolean);   // the caller's Task Group ids (space-joined by the engine)
  const name = `ut-ak-reach-${String(i.id || i.action.askId || '')}`;
  return `<div class="ut-ak-reach" role="radiogroup" aria-label="${escHtml(t('Reach'))}"><span class="ut-ak-reach-lbl">${escHtml(t('Reach'))}</span>`
    + REACH_CHOICES.filter((r) => r !== 'groups' || groups.length).map((r) => `<label class="ut-ak-reach-opt ut-ak-reach-${r}" title="${escHtml(reachTitle(r, groups.join(', ')))}"><input type="radio" name="${escHtml(name)}" value="${r}"${r === 'opened' ? ' checked' : ''}> ${escHtml(reachWord(r))}</label>`).join('')
    + '</div>';
};
const hubAskHtml = (i, t, detail) => (i && i.action && HELD_ASKS.includes(i.action.type)
  ? runCardOf(i, { t }) ? runFactsHtml(i, t) // r7: the run card's FACTS, worded here (a record without them: its prose, below — unchanged)
  : (factsDroppedWords(i, { t }) ? `<div class="ut-run-cut ut-facts-dropped">${escHtml(factsDroppedWords(i, { t }))}</div>` : '') // r9: facts the store dropped — said above the text
    + `<div class="ut-proposal-plan">${escHtml(detail || '')}</div>`
    + (i.action.type === 'vault-run-ask' ? `<div class="ut-exit-note">${escHtml(t('The output is scrubbed of the secret\'s common spellings; a command that re-encodes it can still show it — read the whole command before you allow it.'))}</div>` : '')
    + (i.action.type === 'automation-ask' && i.action.askId ? reachPickHtml(i, t) : '')
    + (i.action.askId ? `<div class="ut-exit-answer ut-hub-answer">${heldAnswers(i).map((a) => `<button type="button" class="ut-act ut-action-exit ut-exit-${a === 'deny' ? 'deny' : 'allow'} ut-hub-${a}" data-answer="${a}">${escHtml(hubAnswerWord(a, t, i.action.type, i.action))}</button>`).join('')}</div>` : '')
  : '');

/** THE RUN CARD (lane wake-approve-card r7 — the owner: «这个卡片的可读性很差»): `item.facts` worded through THE model
 *  (foryou-actions runCardOf) — the command in its own box (it wraps INSIDE the box, never the card), ≤ 4 fact rows with the
 *  deciding one first and marked, the answers with the «Always» hint beside them (why it is not offered), the technical
 *  lines in a «Technical details» fold. Every value escaped (a name, a path and the command are an agent's or a peer's
 *  words); a code the model has no words for is drawn monospace. `buttons: false` = the For-you window's pane and a
 *  record's fold (the window's answers live in its action row — the hint beside them, as text nodes). */
const segHtml = (parts) => parts.map((x) => (x.code != null ? `<code class="ut-run-code">${escHtml(x.code)}</code>` : x.mono != null ? `<span class="ut-run-mono">${escHtml(x.mono)}</span>` : x.aside != null ? `<span class="ut-run-aside">${escHtml(x.aside)}</span>` : escHtml(x.text || ''))).join('');
const linesHtml = (lines) => lines.map((l) => `<span class="ut-run-line">${segHtml(l)}</span>`).join('');
const runHintHtml = (v) => (v && v.always.hint ? `<span class="ut-run-hint">${segHtml(v.always.hint)}</span>` : '');
// r7: «Allow for 1 hour»'s own words beside the answers (the card's row above them says what it writes)
const runWindowHintHtml = (v) => (v && v.window && v.window.hint ? `<span class="ut-run-hint ut-run-hint-window">${segHtml(v.window.hint)}</span>` : '');
const runWindowOffHtml = (v) => (v && v.window && v.window.excepted ? `<span class="ut-run-hint ut-run-hint-window-off">${segHtml(v.window.excepted)}</span>` : '');   // r8: why no «Allow for 1 hour» (除了)
// lane vault-standing-request r5 (the r4 acceptance's MAJOR: the words «this replaces that grant …» lived only in the hint, and the
// hint is hidden beside a hosts «Always» — the press silently cut a no-end host to 30 days): WHAT THE ROW WILL BE is its OWN row
// above the answers, on every surface that draws the card (the tray / chat row, the For-you window's pane, the phone), whatever
// the hint does — and a card the press drew again carries its mark first
const runChangesHtml = (v) => (v && v.changes ? `<div class="ut-run-changes" data-changes="${v.changes.lines.length}">${v.changes.redrawn ? `<span class="ut-run-line ut-run-redrawn">${escHtml(v.changes.redrawn)}</span>` : ''}${linesHtml(v.changes.lines)}</div>` : '');
export function runFactsHtml(i, t, { buttons = true } = {}) {
  const v = runCardOf(i, { t });
  if (!v) return '';
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
    if (el.textContent !== d.text) el.textContent = d.text;
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
const secretAskHtml = (i, t, detail) => (isSecretAsk(i) ? `<div class="ut-proposal-plan ut-secret-plan">${escHtml(detail || '')}</div>` : '');

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
/** lane browser-login: the owner's SAVE-LOGIN card — a person signed in by hand in the agent browser (a live-view takeover): Save
 *  (or Update, for a login the vault keeps with another password) / Not now; the password is held on the hub until answered. */
const saveLoginAskHtml = (i, t, detail) => `<div class="ut-proposal-plan">${escHtml(detail || '')}</div><div class="ut-exit-answer ut-proposal-answer">`
  + `<button type="button" class="ut-act ut-action-proposal ut-proposal-approve" data-answer="approve" title="${escHtml(t('Saves it in the vault — agents you allow can have it filled, never seeing it'))}">${escHtml(i.action.update ? t('Update') : t('Save'))}</button>`
  + `<button type="button" class="ut-act ut-action-proposal ut-proposal-reject" data-answer="reject">${escHtml(t('Not now'))}</button></div>`;
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
/** An --options label is a REPLY the person sends — it reads as one («Reply: …»), never as the act it names. */
export const optionWords = (label, t) => t('Reply: {label}', { label: String(label) });
/** THE WORDS OF AN ITEM, ONE RENDERER (lane foryou-honest, the stress evaluation's P1-2): plain text + the For-you links
 *  (foryou-links linkedHtml — every segment escaped, a link a span around its own words), never markdown — the tray's rows
 *  and the For-you window's pane both draw this (the pane's markdown turned `__tests__/` into a bold «tests/»). */
export const wordsHtml = (text) => linkedHtml(String(text || ''), { escape: escHtml });
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
  const rs = !resolved && ctx.replyState ? ctx.replyState(i) : { show: false };
  const dot = resolved
    ? '<span class="ut-dot" data-urgency=""></span>'
    : `<span class="ut-dot" data-urgency="${notice ? '' : escHtml(i.urgency || 'normal')}" title="${escHtml(notice ? t('notice') : (i.urgency || 'normal'))}"></span>`;
  // Detail rides behind a collapsed expander (up to 2000 chars of agent context).
  // (an exit ask's detail IS its command — shown whole above its Allow / Deny, never again folded below them)
  const detailHtml = detail && !(i.action && i.action.type === 'exit-run-ask') ? `<details class="ut-detail-exp"><summary>${escHtml(t('detail'))}</summary><div class="ut-detail">${wordsHtml(detail)}</div></details>` : '';
  const detailOrFacts = run ? `<details class="ut-detail-exp"><summary>${escHtml(t('detail'))}</summary><div class="ut-detail">${runFactsHtml(i, t, { buttons: false })}</div></details>` : detailHtml; // r7: a record with facts never shows the prose (old clients' words)
  // lane browser-propose: an open proposal's words are shown whole ABOVE its Approve (proposalAskHtml) — never folded again below
  const detailFold = i && i.action && (i.action.type === 'browser-proposal' || i.action.type === 'channel-api-proposal' || HELD_ASKS.includes(i.action.type) || isSecretAsk(i)) && !resolved ? '' : detailOrFacts; // lane hub-act-ask: shown whole above its answers (design q-046: an automation ask too; lane vault-paste-request: a paste request's words above its box)
  // OPTION CHIPS (design-user-inbox-reply D3a): one click = a reply whose text
  // IS the label. Addressed by INDEX — the label never rides an attribute.
  // lane foryou-honest (P2-3): the chips are ctx.optionsOf's — the agent's options, else its detail's «A …；B …» parsed
  const optList = rowOptions(i, ctx);
  const opts = !resolved && rs.show && optList.length
    ? `<div class="ut-opts">${optList.map((o, k) => `<button type="button" class="ut-opt" data-idx="${k}">${escHtml(optionWords(o, t))}</button>`).join('')}</div>` : ''; // lane controls-that-lie: a reply reads as a reply
  let meta;
  if (resolved) {
    const by = resolvedByText(i.resolvedBy, t, i);
    const replied = i.reply && typeof i.reply.text === 'string' && i.reply.text
      ? ' · ' + escHtml(t('You replied: {text}', { text: i.reply.text.length > REPLY_SNIPPET ? i.reply.text.slice(0, REPLY_SNIPPET) + '…' : i.reply.text })) : '';
    meta = (tail ? `<span class="ut-sess" title="${escHtml(t('Go to this session'))}">${escHtml(ctx.nameFor(i.sessionKey, [i]))}</span> · ` : '')
      + escHtml(statusWords(i, t)) // r3: a hidden pointer reads «hidden — nothing was decided», never «done»
      + (by ? ' · ' + escHtml(by) : '') + (endCodeOf(i) ? ` · <code class="ut-end-code">${escHtml(endCodeOf(i))}</code>` : '') + replied // r8: an end this client cannot classify — its code, typed
      + (tail ? `<span class="ut-age"> · ${escHtml(agoText(i.resolvedAt || i.createdAt, t))}</span>` : '');
  } else {
    const exp = itemExpiryText(i, t, notice); // a notice's window; r3: a wake ask's lifetime («expires in 7 d»)
    // lane foryou-folds: a row of the tray's attention list (`entry.band`) names its conversation — the bands are flat, no
    // group head — with THE running dot of a real session in front (D1.7: the panel patches it live, never the row)
    const dot = entry.band && typeof i.sessionKey === 'string' && i.sessionKey.includes(':') ? `<span class="ut-live-dot" data-key="${escHtml(i.sessionKey)}" role="img"></span>` : '';
    // lane foryou-honest (acceptance round 2): the age keeps its separator — ONE nowrap span « · 3min ago», its space inside
    // (no break before the dot), so a long name wraps INSIDE itself and no line starts with «·»; an expiry's dot rides the age
    const age = escHtml(agoText(i.createdAt, t)) + (exp ? ' ·' : '');
    meta = (notice || entry.band ? `<span class="ut-sess" title="${escHtml(t('Go to this session'))}">${dot}${escHtml(ctx.nameFor(i.sessionKey, [i]))}</span><span class="ut-age"> · ${age}</span>` // lane foryou-honest (P3-8): the name is the tray row's door to its conversation
      : `<span class="ut-age">${age}</span>`) + (exp ? ' ' + escHtml(exp) : '');
  }
  // lane foryou-honest (the phone's ONE row shape): a touch screen folds a row to its question + meta line — the whole row
  // opens it in place — and THIS trailing door keeps the conversation one tap away (a mouse never sees it: style.css); a row
  // RESOLVED in its band slot keeps it (acceptance round 2: nothing left to open — its door is its way to the conversation)
  const go = notice || entry.band ? `<button type="button" class="ut-go" title="${escHtml(t('Go to this session'))}" aria-label="${escHtml(t('Go to this session'))}" data-label="${escHtml(tc('inbox', 'Chat'))}">${UI_ICONS.chat}</button>` : '';
  const deadline = dline ? deadlineHtml(i, t, dline) : ''; // r7 addendum: the time left, under the question
  const body = `${go}<div class="ut-text">${card ? escHtml(words) : wordsHtml(words)}</div>${deadline}${askChipsHtml(i, t)}${card ? appCardHtml(i, t, { lang, resolved }) : !resolved ? exitAskHtml(i, t) + hubAskHtml(i, t, detail) + proposalAskHtml(i, t, detail) + appAskHtml(i, t) + grantAskHtml(i, t) + secretAskHtml(i, t, detail) + reconnectHtml(i, t) : ''}${card ? '' : detailFold}${opts}<div class="ut-meta">${meta}</div>`;
  // ⤢ = THE For-you window ON this item (design-user-inbox-reply §9: long text at full width, reply / done there)
  // lane foryou-honest (the touch scale): every verb carries its WORD in data-label — a touch screen draws it under the icon
  // (style.css's touch block, ::after — never the button's text, so a title / aria / textContent reader is unchanged)
  const view = `<button class="ut-act ut-view" title="${escHtml(t('Open in the For-you window'))}" aria-label="${escHtml(t('Open in the For-you window'))}" data-label="${escHtml(t('Open'))}">⤢</button>`;
  // design 009: a card's Reply / Mark done / Ignore / Copy / Clear content… live behind its ⋯ (two buttons on its face)
  const more = `<button type="button" class="ut-act ut-more" title="${escHtml(t('More'))}" aria-label="${escHtml(t('More'))}" data-label="${escHtml(t('More'))}">⋯</button>`;
  // lane wake-approve-card r2: A DECISION ROW HAS TWO VERBS (foryou-actions closersOf) — its Approve / Deny above, no ✓ / ✕
  // beside them (a generic close was a silent Deny), and no ↺ once decided (a decision is final); r3: A POINTER HIDES — ONE
  // ✕ «Hide» (no ✓: a pointer is never «done»; hiding decides nothing) and no ↺ once hidden (it comes back by itself)
  const closers = closersOf(i, resolved);
  const actions = resolved
    ? `<span class="ut-actions">${view}${closers.includes('reopen') ? `<button class="ut-act ut-reopen" title="${escHtml(t('Reopen'))}" data-label="${escHtml(t('Reopen'))}">↺</button>` : ''}</span>`
    : card ? `<span class="ut-actions">${view}${more}</span>`
    : `<span class="ut-actions">${actionBtnHtml(i, t)}${reauthBtnHtml(i, t)}${takeoverBtnHtml(i, t)}${rs.show ? `<button type="button" class="ut-act ut-reply-btn" title="${escHtml(t('Reply'))}" data-label="${escHtml(t('Reply'))}">${UI_ICONS.reply}</button>` : ''}${view}`
      + (closers.includes('done') ? `<button class="ut-act ut-done" title="${escHtml(i.open && i.open.done ? t(i.open.done) : t('Handled — mark done'))}" data-label="${escHtml(t('Mark done'))}">✓</button>` : '') // lane foryou-plugin-notices: a door's `done` = what this ✓ does (the plugin applies it)
      + (closers.includes('dismiss') ? `<button class="ut-act ut-dismiss" title="${escHtml(t('Dismiss (not going to act on this)'))}" data-label="${escHtml(tc('inbox', 'Dismiss'))}">✕</button>` : '')
      + (closers.includes('hide') ? `<button class="ut-act ut-dismiss ut-hide" title="${escHtml(t('Hide — decides nothing; what it points at stays open in the conversation'))}" data-label="${escHtml(t('Hide'))}">✕</button>` : '') + '</span>';
  // the deadline line's words, accent and state move every second (the ticker's) — the signature reads its facts only
  const sigBody = deadline ? body.replace(deadline, deadline.replace(/>[^<]*<\/div>$/, '></div>').replace(/ ut-deadline-warn| data-state="[^"]*"/g, '')) : body;
  return { cls, dot, body, actions, deadline: !!deadline, sig: cls + '\u0000' + dot + '\u0000' + sigBody + '\u0000' + actions };
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
  for (const n of nodes) {
    const inCode = !!(n.parentElement && n.parentElement.closest('code'));
    let segs = segmentText(inCode ? '`' + n.data + '`' : n.data);
    if (inCode) segs = segs.length > 1 && segs[0].s === '`' && segs[segs.length - 1].s === '`' ? segs.slice(1, -1) : segmentText(n.data);
    if (!segs.some((g) => g.t === 'link')) continue;
    const frag = document.createDocumentFragment();
    for (const g of segs) {
      if (g.t !== 'link') { frag.append(document.createTextNode(g.s)); continue; }
      const a = document.createElement('span');
      a.className = 'fy-link'; a.setAttribute('role', 'link'); a.tabIndex = 0;
      a.dataset.fy = g.kind; a.dataset.ref = g.ref; a.textContent = g.s;
      frag.append(a); made++;
    }
    n.replaceWith(frag);
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

/** A box the user is USING: it has focus or text. Never replaced or removed by a repaint. */
export function boxInUse(box) {
  if (!box) return false;
  const ta = box.querySelector('textarea');
  return box.contains(document.activeElement) || !!(ta && ta.value);
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
    const reachPicked = (el.querySelector('.ut-ak-reach input:checked') || {}).value || null;   // lane key-instance-scope: a re-render keeps the owner's pick
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
    if (reachPicked) { const r = body.querySelector(`.ut-ak-reach input[value="${reachPicked}"]`); if (r) r.checked = true; }
    el.dataset.sig = p.sig;
  }
  if (p.deadline) armDeadlines();
  applyLive(el, entry.item, ctx);
  return el;
}

/** THE KEYED RECONCILER (design-user-inbox-reply D1.9; §9 shares it with the
 *  For-you window's list): bring `container`'s keyed children (after `head`,
 *  when given) to `entries`, in order. A child whose key is still listed is
 *  PATCHED (never replaced — a focused textarea on it keeps focus and text), a
 *  new one is created, a child no longer listed is removed, and a node MOVES
 *  only when it is out of place (never the common case while a layout is
 *  append-only — moving a focused textarea would blur it).
 *  opts = {head, isRow(el), keyOf(el), idOf(entry), create(entry), patch(el, entry)} */
export function reconcileKeyed(container, entries, { head = null, isRow, keyOf = (el) => el.dataset.id, idOf = (e) => e.item.id, create, patch }) {
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
  for (const r of existing.values()) r.remove();
}
