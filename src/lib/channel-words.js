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
import * as chanCaps from '../channel-caps.js';
import { wakeCount } from './channel-groups-view.js';

/** The toast body for a failed channel/outbox/integration request. */
export function routeErrorText(r, { fallback = null } = {}) {
  if (!r) return t('Could not reach the server');
  const code = String(r.code || '');
  const raw = r.error ? String(r.error) : '';
  switch (code) {
    case 'not-found': return t('No such conversation');
    case 'needs-credentials': return t('The application credential is missing — set it up under Integrations first');
    // the account model (2026-09-22): a key the integration no longer offers / an account that is gone
    case 'unknown-credential': return t('That credential is not one this instance offers — pick another');
    // verifier r1: a HELD token binds its account to the credential it was minted under
    case 'credential-bound': return t('This account is bound to the credential its token was minted under — disconnect it first, or add another account');
    case 'no-such-adapter': return t('That account no longer exists');
    case 'auth-expired': return t('The login expired — re-authorize the channel');
    case 'auth-failed': return raw ? t('The consent flow failed: {error}', { error: raw }) : t('The consent flow failed');
    case 'not-supported': return t('This channel does not support that');
    case 'send-not-available': return t('Sending is not available here: {why}', { why: chanCaps.sendWhyText(r.why || 'unknown', { t }) });
    case 'bad-state': return t('This proposal can no longer be decided');
    case 'reconcile-not-available': return t('This channel cannot be checked by the machine');
    case 'authority-capped': return t('Direct send is not offered here');
    case 'bad-filter': case 'bad-assignment': case 'bad-proposal': case 'bad-policy': case 'bad-grant': case 'bad-request':
      return raw ? t('The request was refused: {error}', { error: raw }) : t('The request was refused');
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
    default: return fallback || raw || t('Request failed');
  }
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
