'use strict';
/**
 * THE PERSON'S OWN SLACK APP, FROM ONE LINK (design 012 F1 / F2, D1, D2). PURE: no I/O.
 *
 * The only connection that works (F1): each person creates an INTERNAL app in their own workspace — a distributed
 * app off the Marketplace reads history at 1 request a minute × 15 messages, and the Marketplace refuses this
 * category. Slack's OAuth needs an https redirect our loopback cannot give (F2), so the person installs the app on
 * its settings page and PASTES the User OAuth Token (`xoxp-…`) back — oauth-loopback's `paste` mode.
 *
 *   manifestFor({ownerName}) → the app manifest (user scopes only: S1 reads, sends as the person, reacts; no bot
 *                              user, no events — the push lane is S2)
 *   createLink(manifest)     → `https://api.slack.com/apps?new_app=1&manifest_json=<…>` — Slack's documented
 *                              share-a-manifest link (app-manifests/configuring-apps-with-app-manifests); the page
 *                              the person's BROWSER opens, never a request this server makes (the egress census
 *                              counts the host because the literal is here, exactly like Lark's consent host)
 *   tokenShapeOf(s)          → 'user' | 'bot' | 'app' | 'other' | 'empty' — judged by its prefix only (the same
 *                              `xox[abprs]-` family src/secret-shapes.js redacts), never logged, never echoed
 *
 * The owner's name rides the app's display name: control and bidi characters dropped, at most OWNER_NAME_MAX
 * characters, the whole name ≤ 35 (Slack's limit for an app name); JSON + URL encoding escape the rest. The link
 * stays under LINK_MAX bytes whatever the name (a verifier control).
 */
const EGRESS = Object.freeze(['api.slack.com']);
const CREATE_URL = 'https://api.slack.com/apps?new_app=1&manifest_json=';
const APP_NAME_MAX = 35;
const OWNER_NAME_MAX = 20;
const LINK_MAX = 2048;
/** S1's user scopes (design §4 Lane S1): read every kind of conversation the person is in, their members and the
 *  workspace, send as the person, read and add / remove reactions, read files, and the workspace's custom emoji. */
const USER_SCOPES = Object.freeze([
  'channels:history', 'groups:history', 'im:history', 'mpim:history',
  'channels:read', 'groups:read', 'im:read', 'mpim:read',
  'users:read', 'team:read', 'chat:write',
  'reactions:read', 'reactions:write', 'files:read', 'emoji:read',
]);
/** The scopes without which the account cannot read at all (`auth.test`'s `x-oauth-scopes` must carry them). */
const READ_SCOPES = Object.freeze(['channels:history', 'channels:read', 'users:read']);
const SEND_SCOPES = Object.freeze(['chat:write']);

const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
function cleanOwner(name) {
  const s = String(name == null ? '' : name).replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
  return [...s].slice(0, OWNER_NAME_MAX).join('');
}
function appNameFor(ownerName) {
  const o = cleanOwner(ownerName);
  const name = o ? `VibeSpace (${o})` : 'VibeSpace';
  return [...name].slice(0, APP_NAME_MAX).join('');
}
function manifestFor({ ownerName = '' } = {}) {
  return {
    display_information: { name: appNameFor(ownerName), description: 'Reads and sends your Slack messages through your own VibeSpace' },
    oauth_config: { scopes: { user: USER_SCOPES.slice() } },
    settings: { org_deploy_enabled: false, socket_mode_enabled: false, token_rotation_enabled: false },
  };
}
function createLink(manifest) {
  const link = CREATE_URL + encodeURIComponent(JSON.stringify(manifest));
  if (Buffer.byteLength(link, 'utf8') > LINK_MAX) throw new Error(`slack-manifest: the app link is ${Buffer.byteLength(link, 'utf8')} bytes (the bound is ${LINK_MAX})`);
  return link;
}
/** The pasted string's kind, by its prefix alone (`xoxp-` = a user token — the one S1 takes). */
function tokenShapeOf(s) {
  if (typeof s !== 'string' || !s.trim()) return 'empty';
  const v = s.trim();
  if (v.length > 512 || /\s/.test(v)) return 'other';
  if (/^xoxp-[A-Za-z0-9-]{10,500}$/.test(v)) return 'user';
  if (/^xoxb-[A-Za-z0-9-]{10,500}$/.test(v)) return 'bot';
  if (/^xapp-[A-Za-z0-9-]{10,500}$/.test(v)) return 'app';
  return 'other';
}
/** The scopes a token holds, from the `x-oauth-scopes` header of any call (a comma list), bounded. */
function scopesOfHeader(h) {
  const s = typeof h === 'string' ? h.slice(0, 4096) : '';
  return [...new Set(s.split(',').map((x) => x.trim()).filter((x) => /^[a-z][a-z0-9_.:-]{1,63}$/.test(x)))].slice(0, 100);
}

module.exports = { EGRESS, CREATE_URL, USER_SCOPES, READ_SCOPES, SEND_SCOPES, APP_NAME_MAX, OWNER_NAME_MAX, LINK_MAX, manifestFor, createLink, appNameFor, tokenShapeOf, scopesOfHeader };
