'use strict';
/**
 * A SUBSCRIPTION PICK (OR A THIRD-PARTY PROVIDER) SETS THE MACHINE'S KEY HELPER ASIDE — PURE, imports only the PURE src/helper-fact.js and src/claude-route-names.js; CJS so the create, the suites and the
 * dictionary check share ONE spelling (unit «billing pick alive», ruled by 主开发 2026-11-18 01:45Z).
 *
 * A helper named in the Claude settings of the machine the CLI runs on (`apiKeyHelper` in ~/.claude/settings.json) OUTRANKS
 * every OAuth login (2.191.0, read from the binary): the CLI bills the helper's paid credential whatever login it holds.
 * 2.236.0 measured the cure — an inline `--settings {"apiKeyHelper":""}` (the CLI's flag settings) overrides the file's helper
 * (apiKeySource apiKeyHelper → none) — and shipped the adapter's half (buildSessionArgs `neutralizeKeyHelper`), but the create
 * never passed it: from 2.236.0 until this unit an explicit subscription pick on such a machine billed the helper, while the
 * billing switcher and Manage agents said «picking a subscription bypasses the helper».
 *
 * THE LAWS (the ruling):
 *   · ONLY A PICK (or a third-party provider — the law below): the conversation's RESOLVED account is a subscription the person picked (their pick for it, or the default
 *     they starred in Manage agents — their standing pick, ruled 02:39Z: one conversation never changes who it bills between
 *     its first start and a resume) — a named subscription account or a
 *     pool of them (resolveForSpawn kind 'subscription'), or a picked subscription that runs on the machine's own login because
 *     it IS that login (`linked`). Never the bare «whatever the CLI is signed into» case (no account resolved: the CLI-login
 *     entry, no pick and no default, a remote default that cannot reach the host and falls back to the host's own login) —
 *     that spawn passes false, so its argv is the release's byte for byte; never an API-key account (no subscription to bill).
 *   · ONE RULE FOR EVERY ROAD: the create asks this once, after the account is resolved, and hands the answer to the ONE
 *     buildSessionArgs call — the local dtach line, the daemon pipe and every remote builder run those args.
 *   · ONLY A HARNESS WHOSE LOGIN A HELPER OUTRANKS: its descriptor's `creds.keyHelper` row names the setting and the file
 *     (claude). Any other harness: nothing to set aside, nothing said.
 *   · SAID ONCE, where the person looks, when the rule actually set a helper aside (the machine's settings name one), with its
 *     door: the billing switcher's CLI-login entry bills through the helper again (at the next start).
 *   · A RUNNING conversation is never touched: the answer rides a spawn only.
 *   · A THIRD-PARTY PROVIDER TOO (the meeting with lane lg-providers, ruled by 主开发 2026-11-18 22:14Z — ONE variable): a
 *     conversation whose resolved account is a provider (resolveForSpawn kind 'provider': its own key at its own address)
 *     sets the helper aside as a pick does — a helper would outrank the provider's key and hand the machine's credential to
 *     the third party's address (VibeSpace sets it aside so it cannot). Its words are its own (HELPER_SET_ASIDE.provider): paid by use, never «the subscription you
 *     picked», and no «CLI login» door (that door moves it off the provider).
 *   · THE PERSON'S OWN SETTINGS FILE IS SET ASIDE ONLY WHEN THAT IS NEEDED (the cure, 主开发 09:09Z — «as if a must»): the one
 *     inline override cannot ride beside a `--settings <file>` (ONE flag), so a pick used to set the whole file aside at every
 *     start — its hooks and permission rules lost (a lost deny rule is a safety loss). Now the create reads THE FACT the notice
 *     reads (helperFact: does the machine the CLI runs on name a helper?) before it builds such a start: named ⇒ the file is
 *     set aside (said); the fact cannot be read (a settings file that does not parse, a paired machine that does not answer) ⇒
 *     billing wins and the words say so; not named ⇒ the file applies whole, as on the release (nothing is set aside — a
 *     helper the person's own file names is that file's own word). A start without such a file never waits on the fact.
 *   · B-e7c0 (2.369.412): ON THIS MACHINE, under a SUBSCRIPTION pick, where that file would be set aside and the create read it
 *     (and it names no helper itself), it is MERGED instead — a copy with every route / credential name of the tree's own list
 *     and the cloud credential commands dropped (said by name), the override applied last, written to <buffers>/<id>.settings
 *     (0600). A paired machine, a provider's start, a file that is no JSON object or names a helper itself: set aside, as above.
 */
const { namesHelper, helperFactOfText, SETTINGS_READ_MAX } = require('./helper-fact.js');   // B-bc9f: ONE rule with a paired machine's probe
const ROUTE = require('./claude-route-names.js');

/** does this spawn set the machine's key helper aside? `creds` = the harness's creds row, `account` = what
 *  accounts.resolveForSpawn answered (null = the CLI's own login), `linked` = the picked account id that resolved to the
 *  machine's own login (ws-create's linkedAccountId) */
function setsHelperAside({ creds = null, account = null, linked = null } = {}) {
  if (!creds || !creds.keyHelper || typeof creds.keyHelper !== 'object') return false;
  if (typeof linked === 'string' && linked) return true;
  if (!!account && typeof account === 'object' && account.kind === 'provider') return true;   // a third-party provider (the meeting, 22:14Z)
  return !!account && typeof account === 'object' && account.kind === 'subscription';
}

/** the settings FILE whose helper the rule sets aside on THIS machine: the CLI's config dir (its descriptor's `homeEnvVar` in the
 *  spawn's env — CLAUDE_CONFIG_DIR — else ~/.claude) + the row's file. The project's own files and the person's own file are read
 *  beside it (projectSettingsFilesOf). Not read: the machine's managed settings (they outrank the inline flag: a helper there is NOT
 *  set aside, and the notice may then be wrong — named in the unit's line). */
function settingsFileOf(row, { creds = null, env = {}, home = '' } = {}) {
  if (!row || typeof row.file !== 'string' || !row.file) return null;
  const v = creds && typeof creds.homeEnvVar === 'string' && env ? env[creds.homeEnvVar] : '';
  const dir = typeof v === 'string' && v.trim() ? v.trim() : (home ? `${String(home).replace(/\/+$/, '')}/.claude` : '');
  return dir ? `${dir.replace(/\/+$/, '')}/${row.file}` : null;
}

/** THE OTHER FILES THE CLI READS A HELPER FROM on this machine (cure 2, 主开发 11:18Z: «the fact must be the one the CLI will act
 *  on»): the project's own `.claude/settings.json` and `.claude/settings.local.json` in the conversation's cwd, and the person's own
 *  `--settings` file (a relative path is the cwd's, as the CLI opens it). A cwd that is not absolute reads no project file. */
function projectSettingsFilesOf(cwd, ownFile = null) {
  const base = typeof cwd === 'string' && cwd.startsWith('/') ? cwd.replace(/\/+$/, '') : '';
  const out = base ? [`${base}/.claude/settings.json`, `${base}/.claude/settings.local.json`] : [];
  const f = typeof ownFile === 'string' ? ownFile.trim() : '';
  if (f) { if (f.startsWith('/')) out.push(f); else if (base) out.push(`${base}/${f}`); }
  return out;
}
/** B-e7c0: the person's own settings FILE as the CLI reads it — absolute, or under the conversation's cwd (the rule above) — or null */
function ownSettingsPathOf(cwd, ownFile = null) {
  const base = typeof cwd === 'string' && cwd.startsWith('/') ? cwd.replace(/\/+$/, '') : '';
  const f = typeof ownFile === 'string' ? ownFile.trim() : '';
  return !f ? null : f.startsWith('/') ? f : base ? `${base}/${f}` : null;
}
/** B-e7c0 cure: the top-level settings keys that run a cloud credential command (the AWS refresh and export, the Google refresh) */
const MERGE_DROPS_KEYS = Object.freeze(['awsAuthRefresh', 'awsCredentialExport', 'gcpAuthRefresh']);
/** B-e7c0: the person's file text → { settings, dropped } (a plain JSON object), else null — no object is never merged. Under a pick
 *  the pick decides where the turn goes and who bills, so EVERY env name the tree's own rule counts is dropped (src/claude-route-
 *  names.js, the list src/managed-claude-settings.js refuses: the routes and their switches — a switch when present, whatever its
 *  value — the credentials, the proxies and TLS trust, the config folders another login is read from), matched in ANY case, and so
 *  are the cloud credential commands. `dropped` names each (the create says them once, by name, with the door to the pick). */
function ownSettingsOf(text) {
  if (typeof text !== 'string') return null;
  let o = null;
  try { o = JSON.parse(text); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const settings = { ...o }, dropped = [];
  for (const k of MERGE_DROPS_KEYS) if (Object.prototype.hasOwnProperty.call(settings, k)) { delete settings[k]; dropped.push(k); }
  if (settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env)) {
    const env = {};
    for (const [k, v] of Object.entries(settings.env)) { if (ROUTE.routeNameAny(k)) dropped.push(k); else env[k] = v; }
    settings.env = env;
  }
  return { settings, dropped };
}
/** ONE start's fact over every file read: a helper named in ANY ⇒ true; else one that cannot be read ⇒ null (billing wins); else false */
const combinedFact = (facts) => (facts.some((f) => f === true) ? true : facts.some((f) => f !== false) ? null : false);


/** THE FACT, on this machine: the CLI's settings file as read (`text`; `missing` = no such file) → true / false / null — the ONE rule
 *  of src/helper-fact.js, which a paired machine's device probe runs too (B-bc9f) */
const localHelperFact = helperFactOfText;
/** THE FACT, on a paired machine: its backend status (hosts.backendStatus — the probe op's facts, or the ssh probe's lines) →
 *  true (`keyHelper: true`) / false (it answered, naming none) / null (`keyHelperUnread: true` — its settings file cannot be read,
 *  by the same rule; or no answer: nothing, or a row that says nothing of the CLI). An agent older than B-bc9f says no third state:
 *  there a file that does not parse still reads as naming none until its signed update (the ssh rung's text reading: helper-fact.js) */
function remoteHelperFact(status, backend) {
  const r = status && typeof status === 'object' && backend ? status[backend] : null;
  if (!r || typeof r !== 'object' || typeof r.installed !== 'boolean') return null;
  if (r.keyHelper === true) return true;
  return r.keyHelperUnread === true ? null : false;
}

/** the person's words (English t() keys; {name} = the conversation, {account} = the picked subscription, {host} = the machine) */
const HELPER_SET_ASIDE = Object.freeze({
  local: '{name} bills {account}, the subscription you picked — the apiKeyHelper in this machine’s Claude settings is not used for it. To bill through the helper, set its billing to «CLI login» (from its next start)',
  remote: '{name} bills {account}, the subscription you picked — the apiKeyHelper in the Claude settings on {host} is not used for it. To bill through the helper, set its billing to «CLI login @ {host}» (from its next start)',
  // a third-party provider (this machine only — the create refuses one elsewhere): paid by use with its own key; no door
  provider: '{name} runs on {account}, a third-party provider paid by use with your own key — the apiKeyHelper named in the Claude settings it reads is not used for it (VibeSpace sets it aside so it cannot outrank the provider’s key)',
});

/** the notice's key: ONE per picked account and machine — the person hears it the first time the rule acts there, not at
 *  every start (the hub's notice channel says a key once while it runs) */
const noticeKey = (accountId, hostId) => `billing-pick-helper-${String(accountId || 'none').slice(0, 60)}-${hostId ? String(hostId).slice(0, 60) : 'local'}`;

/** → { key, words, params, text } for the notice, or null without an account */
function helperNotice({ name, account, accountId, host = null, hostId = null, provider = false } = {}) {
  if (!accountId) return null;
  const words = provider ? HELPER_SET_ASIDE.provider : hostId ? HELPER_SET_ASIDE.remote : HELPER_SET_ASIDE.local;
  const params = { name: String(name || '').slice(0, 80) || 'This conversation', account: String(account || accountId).slice(0, 80), ...(hostId ? { host: String(host || hostId).slice(0, 80) } : {}) };
  const text = words.replace(/\{(name|account|host)\}/g, (m, k) => (params[k] != null ? params[k] : m));
  return { key: noticeKey(accountId, hostId), words, params, text };
}

module.exports = { setsHelperAside, settingsFileOf, projectSettingsFilesOf, ownSettingsPathOf, ownSettingsOf, MERGE_DROPS_KEYS, combinedFact, namesHelper, localHelperFact, remoteHelperFact, SETTINGS_READ_MAX, HELPER_SET_ASIDE, noticeKey, helperNotice };
