'use strict';
/**
 * B-af94: a mount's words BY CODE — the cloud rows (src/mounts.js), the pull rows and every machine-mount refusal
 * (src/machine-mounts.js, src/device-mount.js). ONE table: the hub fills it in English (the row's `error`, a route's
 * `error`, the journal, an older page) and sends the code + params beside the words; the page renders the same code
 * through t() in its own language (src/lib/sidebar-mounts.js mountErrorText / thrownText; the zh / ja rows in
 * src/lib/i18n-zh.js / i18n-ja.js — test-mount-error-words holds every template to a row in each). A code this table
 * does not hold is shown as the hub's English. Text a tool wrote (rclone's stderr, a log tail) rides in {detail}
 * untranslated — only our own sentence around it is worded.
 *
 * PURE: no node API — the browser bundles it (test-architecture EXCEPTIONS); its one require is the liveness verdicts'
 * own en / zh / ja table (src/mount-liveness.js, pure too), so a `liveness_<key>` code is worded from that table.
 */
const LIVENESS = require('./mount-liveness.js');

const i18nKey = (s) => s;   // a declared visible template (scripts/i18n-extract.mjs collects it)

const WORDS = Object.freeze({
  // ── pull mounts and machine-mount refusals (src/machine-mounts.js) ──
  mount_removed: i18nKey('this pull mount was removed while it was being mounted — nothing of it stays mounted'),
  device_unreachable: i18nKey('device unreachable — its daemon is not dialed in'),
  no_dav_path: i18nKey('no path for the remote to reach this instance — the device tunnel needs the machine daemon link; otherwise set agentd.publicUrl (Settings) or deploy with VIBESPACE_PUBLIC_URL'),
  rclone_install_device_failed: i18nKey('rclone install on the device failed: {detail}'),
  rclone_install_host_failed: i18nKey('rclone install on host failed: {detail}'),
  push_mount_timed_out: i18nKey('push mount timed out after {s}s — the device link may be stalled (machine asleep/offline?); wake the machine and retry'),
  pull_mount_timed_out: i18nKey('pull mount timed out after {s}s — the device link may be stalled (machine asleep/offline?); wake the machine and retry'),
  push_loop_own: i18nKey('this folder is the live mirror of {machine}\'s own {remotePath} — it already lives on that machine; open it there directly instead of mounting it back'),
  push_loop_other: i18nKey('this folder is the live mirror of {machine}\'s {remotePath} — sharing a mounted mirror loops through two mount chains; share a real folder on this instance instead'),
  folder_missing: i18nKey('folder does not exist on this instance: {path}'),
  folder_hung: i18nKey('folder is not responding (its backing mount/storage may be stalled): {path} — reconnect that storage first, or share a plain local folder'),
  folder_unreadable: i18nKey('folder is not readable: {path}'),
  net_use_failed: i18nKey('net use failed: {detail}'),
  no_mount_method: i18nKey('no mount method available on this machine'),
  home_unresolved: i18nKey('could not resolve ~ on the machine — use an absolute path'),
  remote_path_relative: i18nKey('remotePath must be absolute (a folder ON the machine)'),
  machine_went_offline: i18nKey('the machine went offline while its folder was being mounted'),
  unknown_mount: i18nKey('unknown machine mount'),
  machine_offline_start: i18nKey('machine is offline — start its daemon first'),
  mount_not_empty: i18nKey('this folder is not empty, so the machine’s folder cannot be mounted over it — move its files out, then press Remount now'),
  mount_point_releasing: i18nKey('a pull just removed from this folder is still being let go — it is tried again by itself'),
  mount_point_unchecked: i18nKey('this folder could not be checked yet (it did not answer) — it is tried again by itself'),
  mount_point_add_unchecked: i18nKey('this folder did not answer when checked — nothing was added; try again, or pick another folder'),
  // ── the machine registry, on the mount roads (src/hosts.js) ──
  host_not_found: i18nKey('host not found'),
  device_link_slow: i18nKey('device link not responding within {s}s — it may be flapping; reconnection keeps retrying in the background, try again shortly'),
  // B-2ca0's two jump-host refusals (jumpArgsOf) run on every ssh road — a machine-mount's too; found by their words
  jump_host_form: i18nKey('"{name}": its jump host is not one [user@]host[:port] — add the machine again'),
  jump_target_chars: i18nKey('"{name}": a machine behind a jump host has an address of plain host characters — add the machine again'),
  // ── the device side of a pull (src/device-mount.js) ──
  unmount_hung: i18nKey('could not release the folder {mountpoint} — its unmount did not answer in {s} s'),
  serve_folder_failed: i18nKey('device serve-folder failed: {detail}'),
  webdav_mount_exited: i18nKey('rclone webdav mount exited: {detail}'),
  webdav_mount_not_up: i18nKey('rclone webdav mount did not come up: {detail}'),
  // ── cloud storage rows (src/mounts.js) ──
  mount_cant_tell: i18nKey('could not tell whether this storage’s previous connection still runs (a process did not answer) — it is tried again by itself'),
  s3_access_denied: i18nKey('the credential can’t access “{target}” (AccessDenied) — check the bucket name (S3 buckets are lowercase letters/digits/hyphens) and the token’s bucket scope'),
  s3_sts_proxy: i18nKey('endpoint proxy rewrites signed headers (Cloudflare?) — temporary-credential (STS) shares need rclone 1.63–1.69, a service-account share, or an un-proxied endpoint'),
  start_hung: i18nKey('rclone made no progress for {s} s and never mounted — stopped it; will retry'),
  start_ceiling: i18nKey('still not mounted after {min} min of starting — stopped it; will retry'),
  start_exited: i18nKey('rclone exited before mounting'),
  start_unanswered: i18nKey('Could not tell whether the storage’s connection started — VibeSpace got no answer; it is tried again by itself'),   // B-323e (lane bl-machines-b)
  share_expired: i18nKey('connected but access denied — this share credential has expired'),
  share_revoked: i18nKey('connected but access denied — the share may have been revoked or its credentials changed'),
  oauth_dead: i18nKey('connected but the sign-in has expired or been revoked — listings come from cache while every file read fails; re-authorize to fix'),
  list_failed: i18nKey('connected but the folder couldn’t be listed — the server may be busy or temporarily unreachable'),
  reads_rejected: i18nKey('connected but file downloads are rejected while listings work — disconnect and reconnect the mount to pick up the updated rclone; if it persists, check the account'),
  reconnecting: i18nKey('storage disconnected — auto-reconnecting (attempt {n})…'),
  cephfs_failed: i18nKey('CephFS mount failed: {detail}'),
  credential_expired: i18nKey('credential expired'),
  root_denied: i18nKey('This token can’t list the account root (it’s bucket-scoped) — add a submount with a specific bucket under it.'),
  storage_not_connected: i18nKey('the storage did not connect'),
  mp_no_permission: i18nKey('No permission to create the mount point {mp} — pick a writable location, or create it yourself first: sudo mkdir -p \'{mp}\' && sudo chown {owner} \'{mp}\''),
  mp_unanswered: i18nKey('The mount point {mp} could not be checked — VibeSpace did not get an answer in time; try again in a moment'),   // B-323e (its mount half): the starter's no answer is no verdict
  mp_move_unanswered: i18nKey('Files written while the storage was disconnected may have been moved from {mp} to {dest} — VibeSpace got no answer; look in {dest}'),   // B-323e follow (r1284 (2))
  mp_not_writable: i18nKey('The mount point {mp} exists but is not writable by VibeSpace — fix ownership: sudo chown {owner} \'{mp}\''),
  mp_not_empty: i18nKey('The mount point {mp} is not empty ({names}) — these were written while the storage was disconnected; move them away, then reconnect'),   // the release's words, byte for byte (主开发 09:24Z: a sentence a person reads is not changed for a test — test-bundle-globals is taught instead)
  mp_not_recreated: i18nKey('Moved stranded files to {dest} but could not recreate the mount point {mp}: {detail}'),
  mp_remake_unanswered: i18nKey('Moved stranded files to {dest}, but VibeSpace got no answer while recreating the mount point {mp} — try again in a moment'),   // B-323e (lane bl-machines-b)
  mp_unreadable: i18nKey('The mount point {mp} could not be read — files written there while the storage was disconnected could be hidden by the mount; check the folder'),   // B-323e (lane bl-machines-b)
  self_mount: i18nKey('this share was minted by this same VibeSpace (self-mount deadlocks the server) — open the shared folder directly instead'),
  // ── a provider's own pre-flight (src/mounts.js _resolveOneDriveDrive) ──
  onedrive_token_unreadable: i18nKey('OneDrive token unreadable — re-run the sign-in'),
  onedrive_token_expired: i18nKey('OneDrive token expired before the drive could be resolved — sign in again ("Re-authorize OneDrive…" in the edit dialog)'),
  onedrive_lookup_failed: i18nKey('OneDrive drive lookup failed (HTTP {status})'),
  onedrive_no_drive: i18nKey('OneDrive drive lookup returned no drive id'),
  // ── the cloud mount DIALOG's refusals (src/mounts.js add / edit / import / children / remove / share, each provider's create()):
  //    found BY THEIR WORDS (codeOfWords) — the producers keep their sentences (test-mount-error-words holds them verbatim there) ──
  token_json_authorize: i18nKey("token must be the JSON printed by rclone authorize"),
  token_required_drive: i18nKey("token required (run: rclone authorize \"drive\")"),
  token_json_gmail: i18nKey("gmail token must be the JSON from the guided flow"),
  token_required_connect: i18nKey("token required — use \"Connect {provider}\" (guided sign-in)"),
  rclone_type_required: i18nKey("rclone backend type required (e.g. dropbox, b2, azureblob)"),
  one_param_required: i18nKey("at least one parameter required"),
  remote_path_required: i18nKey("remote path required (e.g. bucket-name or bucket/prefix)"),
  not_oauth: i18nKey("Not an OAuth cloud connection"),
  bucket_required: i18nKey("bucket required"),
  key_or_pass_required: i18nKey("keyPath or pass required"),
  keypath_absolute: i18nKey("keyPath must be absolute"),
  self_mount_link: i18nKey("This share link was minted by THIS VibeSpace — mounting your own share back onto yourself deadlocks the server. Open the shared folder directly instead."),
  user_or_bearer_required: i18nKey("user/pass or bearerToken required"),
  s3_fields_required: i18nKey("endpoint, bucket and accessKey required"),
  secret_key_required: i18nKey("secretKey required"),
  rclone_binary_failed: i18nKey("installed binary failed to run"),
  name_required: i18nKey("name required"),
  name_taken: i18nKey("A mount with that name exists"),
  custom_path_absolute: i18nKey("Custom path must be absolute"),
  submount_no_nest: i18nKey("Submounts can't nest — add it under the top-level connection"),
  child_no_convert: i18nKey("A mount point under a credential can't be converted"),
  provisioned_no_convert: i18nKey("Deployment-provisioned storage can't be converted"),
  remove_children_first: i18nKey("Remove its mount points first"),
  provisioned_no_delete: i18nKey("This storage is provisioned by your deployment and can't be deleted here — you can rename or edit it, and Unmount disconnects it."),
  credential_has_children: i18nKey("This credential still has mount points under it — remove those first."),
  share_blocks_rename: i18nKey("A shared link points into this mount — revoke it before renaming (the share path would break)."),
  provisioned_no_edit: i18nKey("This storage is provisioned by your deployment — its connection settings can't be edited here (name and mount point can)."),
  mount_not_found: i18nKey("mount not found"),
  not_share_link: i18nKey("Not a VibeSpace share link"),
  not_drive_record: i18nKey("not a Google Drive record"),
  token_required: i18nKey("token required"),
  not_gmail_record: i18nKey("not a Gmail record"),
  client_preset_or_custom: i18nKey("client must name a preset (\"\" = built-in) or a custom id + secret"),
  client_switch_drive_only: i18nKey("Switching the OAuth client with a new sign-in is only for Google Drive records"),
  custom_client_secret: i18nKey("A custom OAuth client needs its client secret too"),
  no_auth_in_progress: i18nKey("no authorization in progress"),
  paste_full_url: i18nKey("paste the full URL from the browser address bar"),
  url_no_code: i18nKey("that URL has no ?code= — paste the address the browser showed AFTER approving"),
  no_share_links: i18nKey("This connection can’t create share links (only your own S3 storage can)."),
  no_ceph_share: i18nKey("Direct CephFS sharing is not available for this storage."),
  bad_ceph_link: i18nKey("malformed cephmount link"),
  share_not_found: i18nKey("share not found"),
  sts_no_credentials: i18nKey("STS response missing credentials"),
  field_required: i18nKey("{field} required"),
  unknown_cloud: i18nKey("unknown cloud provider: {backend}"),
  unknown_mount_type: i18nKey("unknown mount type: {type}"),
  type_no_children: i18nKey("credentials of type \"{type}\" don't support mount points yet"),
  share_link_missing: i18nKey("Share link is missing {field}"),
  mc_no_credential: i18nKey("mc returned no credential: {detail}"),
  sts_failed: i18nKey("STS AssumeRole failed: {detail}"),
  // its read: the Gmail sign-in, the Drive paste-back and picker, the rclone install, the Ceph share's mint, a share's root (src/gmail-sync.js, src/webdav.js)
  gmail_needs_client: i18nKey("Gmail needs an OAuth client — pick a preset or provide a custom client id/secret (there is no built-in fallback client for Gmail)"),
  auth_state_mismatch: i18nKey("state mismatch — restart the flow"),
  auth_no_code: i18nKey("no code in that URL"),
  token_refresh_failed_gmail: i18nKey("token refresh failed: {detail} — re-authorize this Gmail mount"),
  token_refresh_failed: i18nKey("token refresh failed: {detail}"),
  rclone_download_failed: i18nKey("download failed: {detail}"),
  rclone_unzip_failed: i18nKey("unzip failed: {detail}"),
  rclone_unexpected_output: i18nKey("unexpected rclone output"),
  auth_forward_failed: i18nKey("forward failed: {detail}"),
  rclone_no_token: i18nKey("rclone did not return a token: {detail}"),
  mint_service_failed: i18nKey("mint service {status}"),
  share_root_absolute: i18nKey("root must be an absolute path"),
  share_root_missing: i18nKey("root does not exist"),
  share_root_not_dir: i18nKey("root must be a directory"),
});

/** The two composed codes' parts (a folder another pull record uses — B-844b / B-6c4f): {who} is worded first */
const PARTS = Object.freeze({
  who_machine: i18nKey('“{machine}”’s {remotePath}'),
  who_removed: i18nKey('a removed machine’s {remotePath}'),
  same_held: i18nKey('this folder is also the mount point of {who} — remove one of the two rows'),
  same: i18nKey('this folder is already the mount point of {who} — pick another folder (one folder holds one machine’s folder)'),
  same_removed: i18nKey('this folder is already the mount point of {who} — remove that row in Mounts, or pick another folder'),
  inside_held: i18nKey('this folder is inside {mountpoint}, the mount point of {who} — unmounting one would take the other with it; remove one of the two rows'),
  inside: i18nKey('this folder is inside {mountpoint}, the mount point of {who} — unmounting one would take the other with it; pick a folder outside it'),
  over_held: i18nKey('this folder holds {mountpoint}, the mount point of {who} — unmounting one would take the other with it; remove one of the two rows'),
  over: i18nKey('this folder holds {mountpoint}, the mount point of {who} — unmounting one would take the other with it; pick a folder outside it'),
});
const COMPOSED = Object.freeze(['mount_point_in_use', 'mount_point_nested']);
const LIVE = 'liveness_';

const CODE_RE = /^[a-z][a-z0-9_]*$/;
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : m));
const EN = (s, p) => fill(s, p);

/** Is `code` one this table words? */
function known(code) {
  if (typeof code !== 'string') return false;
  // a liveness verdict's key keeps the verdict table's own spelling (`wedgedRetry`) — asked BEFORE the lower-snake rule (its read)
  if (code.startsWith(LIVE) && /^[A-Za-z][A-Za-z0-9]*$/.test(code.slice(LIVE.length))) return Object.prototype.hasOwnProperty.call(LIVENESS.WORDS, code.slice(LIVE.length));
  if (!CODE_RE.test(code)) return false;
  return Object.prototype.hasOwnProperty.call(WORDS, code) || COMPOSED.includes(code);
}

/** The words of `code` + `params` in the language `t` speaks (t(template, params) — the page's own; default English) —
 *  a `liveness_<key>` code in `lang` from the verdicts' table. → the words, or null for a code this table does not word. */
function wordsFor(code, params, { t = EN, lang = 'en' } = {}) {
  if (!known(code)) return null;
  const p = params && typeof params === 'object' ? params : {};
  if (code.startsWith(LIVE) && !Object.prototype.hasOwnProperty.call(WORDS, code)) return LIVENESS.wordsFor(code.slice(LIVE.length), lang || 'en', p);
  if (code === 'mount_point_in_use' || code === 'mount_point_nested') {
    const who = p.removed ? t(PARTS.who_removed, { remotePath: p.remotePath || '' }) : t(PARTS.who_machine, { machine: p.machine || '?', remotePath: p.remotePath || '' });   // 主开发 09:24Z: a missing machine name keeps the release's «?»
    const part = code === 'mount_point_in_use' ? (p.held ? 'same_held' : p.removed ? 'same_removed' : 'same') : (p.kind === 'over' ? 'over' : 'inside') + (p.held ? '_held' : '');
    return t(PARTS[part], { who, mountpoint: p.mountpoint || '' });
  }
  return t(WORDS[code], p);
}

/** A sentence of ours BY ITS WORDS — words that are exactly one template (its holes filled) are worded by that code: a row the
 *  hub set where it had no code at hand, a sentence of a shared module whose error contract is not ours to change (src/hosts.js:
 *  «host not found», the slow device link — other roads branch on their own codes). → { code, params } (the holes' text), or null. */
const BY_WORDS = new Map(Object.entries(WORDS).filter(([, s]) => !/\{\w+\}/.test(s)).map(([k, s]) => [s, k]));
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// a hole read back by its NAME's shape (its read): a field / type / backend is one word — `{field} required` never swallows a tool's
// «…: password required» tail —, a status / count is digits, a provider carries no quote; anything else is any text
const HOLE = Object.freeze({ field: '([A-Za-z][\\w.-]*)', type: '([A-Za-z][\\w.-]*)', backend: '([A-Za-z][\\w.-]*)', status: '(\\d+)', s: '(\\d+)', n: '(\\d+)', N: '(\\d+)', min: '(\\d+)', provider: '([^"\\n]+?)' });
const SHAPES = Object.entries(WORDS).filter(([, s]) => /\{\w+\}/.test(s)).map(([code, s]) => {
  const names = [];
  const body = s.split(/(\{\w+\})/).map((part) => { const m = /^\{(\w+)\}$/.exec(part); if (!m) return esc(part); const i = names.indexOf(m[1]); if (i >= 0) return '\\' + (i + 1); names.push(m[1]); return HOLE[m[1]] || '([\\s\\S]*?)'; }).join('');
  return { code, names, re: new RegExp('^' + body + '$') };
});
function codeOfWords(words) {
  if (words == null) return null;
  const w = String(words), k = BY_WORDS.get(w);
  if (k) return { code: k, params: {} };
  for (const { code, names, re } of SHAPES) { const m = re.exec(w); if (m) return { code, params: Object.fromEntries(names.map((n, i) => [n, m[i + 1]])) }; }
  return null;
}

/** A refusal: an Error whose message is the English words, carrying its code + params (a route's answer — errorBody) */
function refusal(code, params = {}) {
  return Object.assign(new Error(wordsFor(code, params) || code), { code, params });
}

/** A route's answer for a thrown error: its words, and the code + params when the code is a worded one (never a system
 *  code like ENOENT — the page would show the English anyway, and an unknown code is no promise). */
function errorBody(e) {
  const error = String((e && e.message) || e || 'failed');
  if (e && known(e.code)) return { error, code: e.code, params: e.params && typeof e.params === 'object' ? e.params : {} };
  const k = codeOfWords(error);   // a sentence of ours thrown with no code (src/hosts.js's «host not found», the slow link) — found by its words
  return k ? { error, code: k.code, params: k.params } : { error };
}

module.exports = { WORDS, PARTS, COMPOSED, LIVE, CODE_RE, known, wordsFor, codeOfWords, refusal, errorBody, fill };
