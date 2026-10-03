'use strict';
/**
 * SLACK'S REFUSALS → THE CLOSED FAILURE SET (design 012 §4 Lane S1, `slack-words.js`). PURE: no I/O.
 *
 * Every Web API answer is HTTP 200 with `{ok:false, error:'<code>'}` (a 429 with `Retry-After` is the one HTTP-level
 * refusal). `failureOf(error, {status, needed})` maps the vendor's code onto src/channels/index.js's closed set —
 * `auth-expired` / `rate-limited` / `not-found` / `forbidden` / `too-large` / `transport` / `vendor-error` — and a
 * `why` from the CLOSED list below that the client words (src/channel-caps.js `sendWhyText` / `threadWhyText`, zh /
 * ja in the dictionaries); the vendor's own code rides `detail.error` (a code, never a sentence of the vendor's).
 * An unknown code is `vendor-error` with `why: 'vendor'` — never guessed into a softer class.
 */
const AUTH = new Set(['not_authed', 'invalid_auth', 'account_inactive', 'token_revoked', 'token_expired', 'org_login_required', 'two_factor_setup_required', 'user_removed_from_team', 'team_disabled', 'enterprise_is_restricted']);
const NOT_FOUND = new Set(['channel_not_found', 'thread_not_found', 'message_not_found', 'user_not_found', 'file_not_found', 'file_deleted', 'bot_not_found', 'team_not_found', 'users_not_found']);
const TRANSPORT = new Set(['internal_error', 'fatal_error', 'service_unavailable', 'request_timeout']);
/** code → why (the closed words; a code absent here and in the sets above is `vendor`). */
const WHY = Object.freeze({
  not_in_channel: 'not-a-member',
  is_archived: 'archived',
  channel_is_archived: 'archived',
  restricted_action: 'restricted',
  restricted_action_read_only_channel: 'read-only-channel',
  restricted_action_thread_only_channel: 'thread-only-channel',
  restricted_action_non_threadable_channel: 'no-threads-here',
  team_access_not_granted: 'team-access-not-granted',
  ekm_access_denied: 'ekm',
  missing_scope: 'missing-scope',
  no_permission: 'restricted',
  access_denied: 'restricted',
  not_allowed_token_type: 'wrong-token',
  cant_post_in_channel: 'restricted',
  cannot_reply_to_message: 'cannot-reply',
  msg_too_long: 'too-long',
  too_many_attachments: 'too-long',
  no_reaction: 'reaction-not-mine',
  already_reacted: 'already-reacted',
  too_many_reactions: 'too-many-reactions',
  too_many_emoji: 'too-many-reactions',
  invalid_name: 'bad-emoji',
  token_revoked: 'token-revoked',
  account_inactive: 'token-revoked',
  invalid_auth: 'token-invalid',
  not_authed: 'token-invalid',
  ratelimited: 'rate-limited',
  frozen_channel: 'frozen',
});
const WHYS = Object.freeze([...new Set([...Object.values(WHY), 'vendor', 'rate-limited', 'transport', 'not-found'])]);
const FORBIDDEN = new Set(['not_in_channel', 'is_archived', 'channel_is_archived', 'restricted_action', 'restricted_action_read_only_channel', 'restricted_action_thread_only_channel', 'restricted_action_non_threadable_channel', 'team_access_not_granted', 'ekm_access_denied', 'missing_scope', 'no_permission', 'access_denied', 'not_allowed_token_type', 'cant_post_in_channel', 'cannot_reply_to_message', 'no_reaction', 'frozen_channel']);
const CODE_RE = /^[a-z][a-z0-9_]{0,63}$/;

/** `{code, retryable, why, error}` for ONE refusal. `error` = the vendor's code when it is code-shaped, else null. */
function failureOf(error, { status = 200 } = {}) {
  const e = typeof error === 'string' && CODE_RE.test(error) ? error : null;
  if (status === 429 || e === 'ratelimited') return { code: 'rate-limited', retryable: true, why: 'rate-limited', error: e || 'ratelimited' };
  if (status === 401 || (e && AUTH.has(e))) return { code: 'auth-expired', retryable: false, why: WHY[e] || 'token-invalid', error: e };
  if (e && NOT_FOUND.has(e)) return { code: 'not-found', retryable: false, why: 'not-found', error: e };
  if (e && FORBIDDEN.has(e)) return { code: 'forbidden', retryable: false, why: WHY[e] || 'restricted', error: e };
  if (e === 'msg_too_long' || e === 'too_many_attachments' || status === 413) return { code: 'too-large', retryable: false, why: 'too-long', error: e };
  if ((e && TRANSPORT.has(e)) || status >= 500) return { code: 'transport', retryable: true, why: 'transport', error: e };
  return { code: 'vendor-error', retryable: false, why: (e && WHY[e]) || 'vendor', error: e };
}
/** The scopes a `missing_scope` answer names (`needed`, a comma list), bounded — what the card's Re-authorize line says. */
function neededScopes(body) {
  const n = body && typeof body.needed === 'string' ? body.needed.slice(0, 1000) : '';
  return [...new Set(n.split(',').map((x) => x.trim()).filter((x) => /^[a-z][a-z0-9_.:-]{1,63}$/.test(x)))].slice(0, 10);
}


/** THE DECLARED EGRESS (test-channels-egress): a PURE module — it constructs no request of its own (slack.js does). */
const EGRESS = Object.freeze([]);
module.exports = { EGRESS, WHY, WHYS, AUTH, NOT_FOUND, FORBIDDEN, TRANSPORT, failureOf, neededScopes };
