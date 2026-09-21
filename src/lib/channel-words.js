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

/** The toast body for a failed channel/outbox/integration request. */
export function routeErrorText(r, { fallback = null } = {}) {
  if (!r) return t('Could not reach the server');
  const code = String(r.code || '');
  const raw = r.error ? String(r.error) : '';
  switch (code) {
    case 'not-found': return t('No such conversation');
    case 'needs-credentials': return t('The application credential is missing — set it up under Integrations first');
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
