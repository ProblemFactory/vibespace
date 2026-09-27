// THE CLIENT'S WORDS FOR THE CHANNEL ROUTES' CODES (a3 i18n, 2026-09-18).
//
// The design's rule — THE SERVER SENDS STRUCTURE, THE CLIENT SAYS THE WORDS —
// applied to the last place English still crossed the wire: a route failure.
// Every channel / outbox / integration route answers `{error, code, …}`; the
// `error` is the engine's English contract sentence (the agent CLI prints it
// verbatim) and the `code` is a closed set. A toast on a user's failed action
// used to print `error`. It now words the CODE here, in the device's
// language, and shows the sentence only where it is the vendor's or the
// validator's own detail (the field + rule of a refused value, a vendor's
// refusal) — text no dictionary could hold.
//
// DOM-free; `t` is the real translator so every literal below is a key the
// build's i18n scan finds.
import { t, tc } from './i18n.js';
/** The device's translator — R3's tag words take an injected `t` (the
 *  freshnessText pattern) so the width census can word them in every language
 *  from one process; the literals stay `t('…')` for the extractor. */
const tDevice = t;
import * as chanCaps from '../channel-caps.js';
import * as F from '../channel-filter.js';
import { wakeCount } from './channel-groups-view.js';

// THE VALIDATOR'S REFUSALS IN WORDS (hotfix 2026-09-26 — the owner's toast
// "请求被拒绝: mode 'filtered' needs a filterId"): an assignment / filter /
// pattern refusal answers its CLOSED code (`why`, + the refused rule's kind as
// `rule`), and the toast words the code. A code only a stale client or a
// hand-built call can produce — a value no control of the dialog can pick —
// says exactly that; the English `error` is never the toast.
const staleValueText = () => t('This window sent a value the server does not accept — reload the page and try again');
/** A `validateAssignment` refusal (F.ASSIGN_REFUSALS) in words; null = no code. */
export function assignmentRefusalText(why) {
  switch (String(why || '')) {
    case 'filter-missing': return t('The filter is not saved yet — add its rules, then save again');
    case 'principal': return t('Pick an agent or a group to wake.');
    case 'wake-cap': return t('Wakes per day must be a number of 0 or more');
    case 'digest-cap-zero': return t('A digest is a paced wake — set “Wakes per day” to at least 1, or remove the notification');
    case 'digest': return t('The digest window must be a number of minutes');
    case 'not-an-object': case 'mode': case 'notify': case 'authority': case 'scope': return staleValueText();
    default: return null;
  }
}
/** The rule refusals a user can cause by TYPING (a value, a time, a member
 *  list, the rule count) — `filterProblemText` words each; every other
 *  validateFilter / validatePattern code is structural (a kind or a match no
 *  control offers) ⇒ the stale-client sentence. */
export const RULE_PROBLEM_CODES = Object.freeze(['value-required', 'members-required', 'time-format', 'tz-range', 'no-rules', 'kind-value', 'too-many-rules']);
/** A `bad-filter` / `bad-pattern` refusal in words; null = no code.
 *  `ruleLabel(kind, which)` is the editor's own label for a rule kind. */
export function ruleRefusalText(r, which, ruleLabel = (k) => k) {
  const why = String((r && r.why) || '');
  if (!why) return null;
  if (!RULE_PROBLEM_CODES.includes(why)) return staleValueText();
  const w = F.filterProblemText({ ok: false, code: why, kind: (r && r.rule) || null, error: '' }, { t, ruleLabel: (k) => ruleLabel(k, which) || k });
  return which === 'pattern' ? t('The rule is incomplete: {why}', { why: w }) : t('Filter is incomplete: {why}', { why: w });
}

/** The toast body for a failed channel/outbox/integration request. */
export function routeErrorText(r, { fallback = null, ruleLabel = (k) => k } = {}) {
  if (!r) return t('Could not reach the server');
  const code = String(r.code || '');
  const raw = r.error ? String(r.error) : '';
  switch (code) {
    case 'not-found': return t('No such conversation');
    // r4 (design-integrations-per-account): the OAuth client is the ACCOUNT's — the remedy is its own dialog, never the Integrations window
    case 'needs-credentials': return t('No usable OAuth client — pick a preset or enter your own client (Edit or Re-authorize)');
    // the account model (2026-09-22): a key the integration no longer offers / an account that is gone
    case 'unknown-credential': return t('That credential is not one this instance offers — pick another');
    case 'no-such-adapter': return t('That account no longer exists');
    // r4 chunk 2's codes (the account dialogs): the sign-in before the account exists, re-authorize = rebind, duplicate, remove
    case 'invalid-client': return raw ? t('The OAuth client is not valid: {error}', { error: raw }) : t('The OAuth client is not valid');
    case 'own-retired': return t('The Integrations card\'s own client is retired — choose Custom and enter the client in this dialog');
    case 'no-flow': return t('No sign-in is in progress — press the sign-in button again');
    case 'flow-not-done': return t('The sign-in has not finished yet — approve access on the sign-in page (or paste the address back) first');
    case 'flow-failed': return t('The sign-in failed — sign in again');
    case 'flow-client-mismatch': return t('That sign-in ran under another OAuth client — sign in again under the one chosen now');
    case 'flow-kind-mismatch': return t('That sign-in was for another account type — sign in again');
    case 'client-change-needs-reauth': return t('Switching the OAuth client is a re-authorization — use Re-authorize with the new client');
    case 'account-referenced': return t('This account is still referenced — release its assignments, reach grants and pending proposals first');
    case 'legacy-copy-failed': return t('This account\'s old client could not be moved onto the account — edit it and enter the client again');
    case 'custom-undecryptable': return t('This account\'s own client secret cannot be decrypted — edit the account and enter it again');
    case 'builtin': return t('The built-in source cannot be removed or duplicated');
    case 'unknown-option': return raw ? t('The request was refused: {error}', { error: raw }) : t('The request was refused');
    case 'auth-expired': return t('The login expired — re-authorize the channel');
    case 'auth-failed': return raw ? t('The consent flow failed: {error}', { error: raw }) : t('The consent flow failed');
    case 'not-supported': return t('This channel does not support that');
    case 'send-not-available': return t('Sending is not available here: {why}', { why: chanCaps.sendWhyText(r.why || 'unknown', { t }) });
    case 'bad-state': return t('This proposal can no longer be decided');
    case 'reconcile-not-available': return t('This channel cannot be checked by the machine');
    case 'authority-capped': return t('Direct send is not offered here');
    // the account / pattern grains answer the validator's closed code (hotfix 2026-09-26); a route that does not keeps the sentence
    case 'bad-assignment': { const w = assignmentRefusalText(r.why); if (w) return w; return raw ? t('The request was refused: {error}', { error: raw }) : t('The request was refused'); }
    case 'bad-filter': case 'bad-pattern': { const w = ruleRefusalText(r, code === 'bad-pattern' ? 'pattern' : 'filter', ruleLabel); if (w) return w; return raw ? t('The request was refused: {error}', { error: raw }) : t('The request was refused'); }
    case 'bad-proposal': case 'bad-policy': case 'bad-grant': case 'bad-request':
      return raw ? t('The request was refused: {error}', { error: raw }) : t('The request was refused');
    // R4 (2026-09-27): access and notification — two operations, access first
    case 'bad-access': case 'bad-watcher': { const w = assignmentRefusalText(r.why); if (w) return w; return raw ? t('The request was refused: {error}', { error: raw }) : t('The request was refused'); }
    case 'duplicate-principal': return t('{who} is listed twice — one row per agent or group', { who: principalText(r.principal) });
    case 'watcher-needs-access': return t('{who} has no access here — grant access first (Grant access…), then notify', { who: principalText(r.principal) });
    case 'too-many-rows': return t('At most {n} rows per list', { n: Number(r.max) || 16 });
    case 'compose-not-available': return t('This account cannot start a new conversation — reply inside an existing one');
    case 'no-such-filter': return t('That filter no longer exists');
    case 'filter-in-use': return t('That filter is still used by an assignment');
    case 'failed': return raw ? t('The channel refused the send: {error}', { error: raw }) : t('The channel refused the send');
    case 'unknown': return t('The send left but its answer was lost — check the conversation on the platform');
    case 'unavailable': return t('Integrations are not available on this instance');
    case 'unknown-integration': return t('No such integration');
    case 'invalid-values': return raw ? t('Refused: {error}', { error: raw }) : t('Refused: a value is not valid');
    case 'no-such-preset': return t('The cluster provides no preset by that name');
    case 'no-cluster-default': return t('There is no cluster default for this row');
    case 'not-wired': return t('Nothing can test this row yet — its consumer is not wired in');
    case 'no-test-runner': return t('This row declares a test but nothing runs it');
    case 'store-unreadable': return t('The integrations store could not be read — every write is refused until it can be');
    // r3: a channels store file that could not be read AND could not be set aside
    case 'store-blocked': return t('A channels store file could not be read or set aside — changes are refused until it is fixed or moved (see For you)');
    // r3: a send that starts a turn — the echo, and the owner's pace when sign-in is off
    case 'wake-count-mismatch': return t('This send wakes an agent (a billed turn) but the request did not confirm it — reload the window and send again');
    case 'rate-floor': return t('Not sent: this agent was woken less than 30 s ago (sign-in is off, so your sends are paced) — send again in a moment');
    case 'key-unreadable': return t('The secret key file could not be read');
    // r4 (lane R2 verify): a fetch the vendor refused — the owner's Refresh press during a 429 — says the code and the retry instant (the card's own words), never a bare "failed" that invites the next press
    case 'rate-limited': case 'transport': case 'backoff': {
      const what = chanCaps.errorCodeText(code === 'backoff' ? (r.lastCode || 'vendor-error') : code, { t });
      const s = Number(r.retryAfterSec) || 0;
      return s ? t('{code} — retrying in {s} s', { code: what, s }) : t('{code} — retrying at the next pass', { code: what });
    }
    // r5 (lane R2 verify — the refresh request set): the owner's Refresh press refused by the account's minute, the per-conversation floor (the agent's, never the owner's — worded for completeness), the request set's cap, an account that changed while the press waited, the engine stopping
    case 'vendor-budget': return r.share ? t('Agent refreshes have used their share of this account\'s vendor budget for this minute — try again in {s} s', { s: Number(r.retryAfterSec) || 60 }) : t('This account\'s vendor budget for this minute is spent — try again in {s} s', { s: Number(r.retryAfterSec) || 60 });
    case 'refresh-floor': return t('This conversation was refreshed a moment ago — refresh again in {s} s', { s: Number(r.retryAfterSec) || 1 });
    case 'refresh-queue-full': return t('Too many refreshes of this account are waiting — try again in a moment');
    case 'account-changed': return t('The account changed while the refresh waited — refresh again');
    case 'stopped': return t('The server is restarting — refresh again in a moment');
    default: return fallback || raw || t('Request failed');
  }
}

// ── R4 (2026-09-27): ACCESS and NOTIFICATION in words — the card line
// "访问: A (可发), 组·工作 (起草) · 通知: A 每批唤醒", the dialogs' rows, the toasts.
/** A principal as a row names it: an agent by its name, a Task Group as
 *  "Group · <title>". */
export function principalText(p) {
  if (!p) return '';
  const name = p.name || p.id || '';
  return p.kind === 'group' ? t('Group · {name}', { name }) : String(name);
}
/** An access row's authority in words. */
export function accessAuthorityText(a) {
  return a === 'send' ? t('may send') : t('drafts');
}
/** How a watcher is notified, in words. */
export function watcherHowText(w) {
  if (!w) return '';
  const how = w.notify === 'digest' ? t('digest every {m} min', { m: w.digestMinutes }) : t('wake per batch');
  return w.mode === 'filtered' ? `${how} ${t('on a filter')}` : how;
}
/** The two facts of a grain (or of a conversation, each principal once) on
 *  ONE line: "Access: A (may send), Group · 工作 (drafts) · Notify: A wake per
 *  batch" — "Notify: nobody" when access stands alone. */
export function grainSummaryText({ access = [], watchers = [] } = {}) {
  const acc = access.map((a) => t('{name} ({authority})', { name: principalText(a.principal), authority: accessAuthorityText(a.authority) })).join(', ');
  const wat = watchers.map((w) => `${principalText(w.principal)} ${watcherHowText(w)}`).join(', ');
  const parts = [];
  if (access.length) parts.push(t('Access: {list}', { list: acc }));
  parts.push(watchers.length ? t('Notify: {list}', { list: wat }) : t('Notify: nobody'));
  return parts.join(' · ');
}
/** A number the dialog held to its bound, said where it was typed. */
export function clampNoteText(n, which = 'max') {
  return which === 'min' ? t('kept at the minimum, {n}', { n }) : t('kept at the maximum, {n}', { n });
}

/** A principal's kind (agent session / Task Group) in words. */
export function principalKindText(kind) {
  return kind === 'group' ? t('group') : kind === 'agent' ? t('agent') : String(kind || '');
}

/** A sending policy mode in words (never the raw enum). Contexted: `review`
 *  is also the code-review status elsewhere in the product (§16 tc rule). */
export function policyModeText(mode) {
  return mode === 'direct' ? tc('policy', 'direct') : mode === 'review' ? tc('policy', 'review') : String(mode || '');
}

/** A Task Group row's display name: the store's `title` (the field it has),
 *  never `name` (the field it does not — the id showed instead, a1 §2.4 A5). */
export function groupTitle(g) {
  return (g && (g.title || g.name)) || (g && g.id) || '';
}

// ── AGENT GROUPS (design §22, g3): the words for the groups routes' codes,
// the four notify modes and the wake echo. The engine's `error` sentence is
// the agent CLI's contract (vibespace-msg prints it); the panel words the CODE.

/** The toast body for a failed `/api/channel-groups*` request. */
export function groupErrorText(r) {
  if (!r) return t('Could not reach the server');
  switch (String(r.code || '')) {
    case 'not-found': return t('No such group');
    case 'unreachable': return t('That agent session is not live (or no longer reachable)');
    case 'ambiguous': return t('Several sessions share that name — pick one by its conversation id');
    case 'too-few-members': return t('A group needs at least two agents');
    case 'too-many-members': return t('A group holds at most 32 members');
    case 'bad-name': return t('A group needs a name (1–80 characters)');
    case 'bad-member': return t('That is not an agent conversation');
    case 'not-member': return t('That agent is not a member of this group');
    case 'not-allowed': return t('Only the group\'s creator or you can do that');
    case 'archived': return t('This group is archived — its log is kept, nothing new can be posted');
    case 'pair-group': return t('A direct conversation takes no third member — create a group instead');
    case 'bad-notify': return t('Unknown notification mode');
    case 'self': return t('An agent cannot do that to itself');
    case 'unavailable': return t('Agent groups are not available on this instance');
    case 'store-blocked': return t('A channels store file could not be read or set aside — changes are refused until it is fixed or moved (see For you)');
    // r3: a 409 that carries the fresh view has already repainted the preview
    case 'wake-count-mismatch': return r.group ? t('The group changed since the preview (a member was renamed, joined, left or changed its notify mode) — the preview is updated; review it and send again.') : t('The group changed since the preview — this would wake {n} agent(s) now. Review and send again.', { n: Number(r.wakes) || 0 });
    case 'bad-request': return r.error ? t('The request was refused: {error}', { error: String(r.error) }) : t('The request was refused');
    default: return (r.error && String(r.error)) || t('Request failed');
  }
}

/** A member's notify mode in words (the dropdown's options). */
export function notifyModeText(mode) {
  switch (mode) {
    case 'next-turn': return t('Next turn — a report, never woken');
    case 'mention': return t('When @mentioned — wakes (billed)');
    case 'always': return t('Every message — wakes (billed)');
    case 'mute': return t('Mute — nothing');
    default: return String(mode || '');
  }
}

/** The echo every group verb answers with: how many agents were WOKEN (each a
 *  billed turn — said at 0 too), how many wakes the spend guard refused (not
 *  billed; the message rides their next report), how many read it next turn. */
export function wakeEchoText(r) {
  const w = wakeCount(r);
  const parts = [w.woke ? t('woke {n} agent(s) = {n} billed turn(s)', { n: w.woke }) : t('woke nobody — no billed turn')];
  if (w.refused) parts.push(t('{n} wake(s) refused by the spend guard (not billed — they get it next turn)', { n: w.refused }));
  if (w.later) parts.push(t('{n} will read it on their next turn', { n: w.later }));
  return parts.join(' · ');
}

// ── R3 (2026-09-26, design §23): THE FIRST SCREEN'S TAG and A PICTURE'S REFUSAL ──

/** The placeholder the agent's name travels through `t()` in (a template may
 *  put the name first or last — zh "{agent} 读过", en "→ {agent}"). */
const WHO = '\u0001';
function around(text, who) {
  const i = text.indexOf(WHO);
  return i < 0 ? { before: text, who: '', after: '' } : { before: text.slice(0, i), who: String(who || ''), after: text.slice(i + WHO.length) };
}

/** An instant's age in the TAG's compact words (the tag's width budget lives in
 *  its words — test-channels-e2e ⑰): just now / Nm ago / Nh ago. */
export function agoText(at, now = Date.now(), opts = {}) { return agoWords(at, now, opts); }
function agoWords(at, now = Date.now(), { t = tDevice } = {}) {
  const s = Math.max(0, Math.round((now - Number(at || 0)) / 1000));
  if (s < 60) return t('just now');
  if (s < 3600) return t('{m}m ago', { m: Math.floor(s / 60) });
  return t('{h}h ago', { h: Math.floor(s / 3600) });
}

/**
 * THE ONE TAG a first-screen row wears (`statusTag`'s structure, src/lib/
 * channel-focus.js) in the device's words: `{before, who, after, tone, icon,
 * title}`. `who` is the agent's name — a DATA part (drawn in its own
 * `.chan-tag-who` span, the part that yields when the tag is tight) — and
 * the words around it are chrome. `tone`: `attn` = it needs YOU (accent
 * outline), `warn` = something did not get through (amber), `neutral` = a fact.
 */
export function statusTagParts(tag, { now = Date.now(), t = tDevice } = {}) {
  if (!tag) return null;
  // never a raw id (r-verify): a principal / a reader that arrived without a display name is worded by its kind
  const who = tag.name || (tag.kind === 'group' ? t('a Task Group') : t('an agent'));
  const agoText = (at) => agoWords(at, now, { t });
  switch (tag.code) {
    case 'awaiting': return { ...around(t('{n} to approve', { n: tag.n || 1 }), ''), tone: 'attn', icon: 'check', title: t('An agent\'s draft here waits for your approval — open the conversation to approve, edit or reject it') };
    case 'unknown': return { ...around(t('send unknown'), ''), tone: 'warn', icon: 'alert', title: t('A send from here lost its answer — open the conversation to check whether it landed') };
    case 'assigned': {
      const grain = tag.grain === 'account' ? t('Handed to {agent} with the whole account', { agent: who }) : tag.grain === 'pattern' ? t('Handed to {agent} by a rule that matches it', { agent: who }) : t('Handed to {agent}', { agent: who });
      return { ...around(t('→ {agent}', { agent: WHO }), who), tone: tag.held ? 'warn' : 'neutral', icon: tag.held ? 'alert' : null, title: tag.held ? `${grain} · ${t('last wake held')}` : grain };
    }
    case 'read': return { ...around(t('{agent} read {ago}', { agent: WHO, ago: agoText(tag.at) }), who), tone: 'neutral', icon: null, title: t('{agent} read this conversation {ago}', { agent: who, ago: agoText(tag.at) }) };
    case 'new-since-read': return { ...around(t('New since {agent}', { agent: WHO }), who), tone: 'attn', icon: null, title: t('New messages arrived after {agent} read this conversation ({ago})', { agent: who, ago: agoText(tag.at) }) };
    case 'held': return { ...around(t('last wake held'), ''), tone: 'warn', icon: 'alert', title: t('A wake for this conversation is held — its messages wait for the agent\'s next turn') };
    case 'replied': return { ...around(t('replied {ago}', { ago: agoText(tag.at) }), ''), tone: 'neutral', icon: null, title: t('You wrote in this conversation {ago}', { ago: agoText(tag.at) }) };
    default: return null;
  }
}

/** The first screen's two switch labels (the header). */
export function viewSwitchText({ focus = 0, all = 0 } = {}, { t = tDevice } = {}) {
  return { focus: t('{n} need attention', { n: focus }), all: t('All {n}', { n: all }) };
}

/** A picture's refusal as the CHIP's one word (R3 §23): why the thumbnail is
 *  a chip. The whole sentence (`routeErrorText`) rides the chip's title. */
export function attachmentReasonText(code, { t = tDevice } = {}) {
  switch (String(code || '')) {
    case 'vendor-budget': return t('budget spent');
    case 'backoff': case 'rate-limited': return t('rate limited');
    case 'not-supported': return t('not cached');
    case 'disabled': return t('account disabled');
    case 'no-preview': return t('no preview');
    case 'unreachable': return t('server unreachable');
    default: return chanCaps.errorCodeText(code || 'vendor-error', { t });
  }
}
