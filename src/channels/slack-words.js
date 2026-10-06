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
/** design 017: `apps.manifest.create`'s refusals → step 1's closed words (the card says each; the vendor's code rides
 *  `detail.error`). An expired / revoked / unknown setup token is one sentence — Slack's codes do not tell them apart. */
const CREATE_WHY = Object.freeze({
  invalid_auth: 'config-token-expired', not_authed: 'config-token-expired', token_expired: 'config-token-expired', token_revoked: 'config-token-expired', account_inactive: 'config-token-expired',
  missing_scope: 'config-token-scope', not_allowed_token_type: 'config-token-scope',
  ratelimited: 'rate-limited',
});
function createWhyOf(error, { status = 200 } = {}) {
  const f = failureOf(error, { status });
  if (f.code === 'rate-limited' || f.code === 'transport') return f.why;
  return (f.error && CREATE_WHY[f.error]) || 'app-create-refused';
}
/** design 018: `oauth.v2.access`'s refusals → the closed words the landing page and the dialog say (Slack's own code
 *  rides `detail.error`). `invalid_client` after a preset rotated mid-flow is "the app's credentials changed". */
const EXCHANGE_WHY = Object.freeze({
  invalid_code: 'code-invalid', code_already_used: 'code-invalid', code_expired: 'code-invalid',
  bad_redirect_uri: 'redirect-mismatch', invalid_redirect_uri: 'redirect-mismatch',
  invalid_client_id: 'client-invalid', invalid_client: 'client-invalid', bad_client_secret: 'client-invalid',
  ratelimited: 'rate-limited',
});
const exchangeWhyOf = (error) => (typeof error === 'string' && EXCHANGE_WHY[error]) || 'exchange-refused';
const EXCHANGE_SENTENCE = Object.freeze({
  'code-invalid': 'the sign-in code was already used or has expired — sign in again',
  'redirect-mismatch': 'the redirect address does not match the one registered on the Slack app (OAuth & Permissions → Redirect URLs)',
  'client-invalid': 'the workspace app\'s client id or secret was refused (were its credentials changed?) — try again, or ask whoever set the app up',
  'rate-limited': 'Slack asked to slow down — try again in a minute',
  'exchange-refused': 'Slack refused the code',
});
const exchangeSentenceOf = (why, error) => `${EXCHANGE_SENTENCE[why] || EXCHANGE_SENTENCE['exchange-refused']}${error ? ` (${String(error).slice(0, 40).replace(/[^a-z0-9_]/gi, '_')})` : ''}`;
/** The scopes a `missing_scope` answer names (`needed`, a comma list), bounded — what the card's Re-authorize line says. */
function neededScopes(body) {
  const n = body && typeof body.needed === 'string' ? body.needed.slice(0, 1000) : '';
  return [...new Set(n.split(',').map((x) => x.trim()).filter((x) => /^[a-z][a-z0-9_.:-]{1,63}$/.test(x)))].slice(0, 10);
}


/** THE DECLARED EGRESS (test-channels-egress): a PURE module — it constructs no request of its own (slack.js does). */
const EGRESS = Object.freeze([]);
/** design 018: THE LANDING PAGE the member's browser shows after Slack's Allow (src/routes/channels.js), in en / zh /
 *  ja at once (the server has no language of its own). `r` = the engine's `{ok, why, user, error}`; every piece
 *  escaped; the code and the state never appear. 2.369.214: the page is cookie-free (often another browser profile) —
 *  `ok` says it is DONE here and sends the person back to the window where they pressed Connect; no sign-in on it. */
const LANDING = Object.freeze({
  ok: ['Done here — Slack said yes{user}. Go back to the VibeSpace window where you pressed Connect: it finishes by itself. You can close this tab.', '这里已完成——Slack 已同意{user}。回到你按下“连接”的那个 VibeSpace 窗口，它会自己完成。这个标签页可以关掉。', 'ここでの操作は完了です — Slack が許可しました{user}。「接続」を押した VibeSpace のウィンドウに戻ってください。そちらで自動的に完了します。このタブは閉じて構いません。'],
  denied: ['You declined on Slack — nothing was connected.', '你在 Slack 上拒绝了，没有连接任何账号。', 'Slack で拒否されたため、何も接続されていません。'],
  refused: ['This sign-in link is not valid here ({why}). Start again from VibeSpace’s Connect dialog.', '这个登录链接在这里无效（{why}）。请回到 VibeSpace 的连接对话框重新开始。', 'このサインインリンクはここでは無効です（{why}）。VibeSpace の接続ダイアログからやり直してください。'],
  'too-many': ['Too many sign-in pages were opened from this address in the last minute. Wait a minute, then reload this page — the sign-in is still waiting.', '这个地址在一分钟内打开了太多登录页面。请等一分钟后刷新本页——登录仍在等待。', 'このアドレスから直近 1 分間に開かれたサインインページが多すぎます。1 分待ってからこのページを再読み込みしてください — サインインはまだ待機中です。'],
  failed: ['Slack did not finish the sign-in: {error}', 'Slack 没有完成登录：{error}', 'Slack でサインインが完了しませんでした：{error}'],
});
const LANDING_WHY = Object.freeze({ 'bad-shape': 'malformed', 'bad-hmac': 'not signed by this VibeSpace', 'wrong-flow': 'no such sign-in is running', expired: 'expired', used: 'already used' });
const escHtml = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function landingHtml(r = {}) {
  const kind = r.ok ? 'ok' : r.why === 'denied' ? 'denied' : r.why === 'failed' ? 'failed' : r.why === 'too-many' ? 'too-many' : 'refused';   // verify r1: 429 = wait + reload, never "start again"
  const user = r.ok && typeof r.user === 'string' && r.user ? ` (${r.user.slice(0, 200)})` : '';
  const fill = (t) => t.replace('{user}', user).replace('{why}', LANDING_WHY[r.why] || 'refused').replace('{error}', String(r.error || 'no answer').slice(0, 300));
  const lines = LANDING[kind].map((t, i) => `<p lang="${['en', 'zh', 'ja'][i]}">${escHtml(fill(t))}</p>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="referrer" content="no-referrer"><title>VibeSpace · Slack</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:36em;margin:3em auto;padding:0 1em;color:#222}</style></head><body data-landing="${kind}">${lines}</body></html>`;
}
module.exports = { EGRESS, WHY, WHYS, AUTH, NOT_FOUND, FORBIDDEN, TRANSPORT, CREATE_WHY, EXCHANGE_WHY, failureOf, createWhyOf, exchangeWhyOf, exchangeSentenceOf, neededScopes, LANDING, landingHtml };
