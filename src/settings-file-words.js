'use strict';
/**
 * A PERSON'S OWN SETTINGS FILE AT A CLAUDE START — PURE, imports nothing; CJS so the adapter, the create and the dictionary
 * check share ONE spelling (B-8dcf item two, ruled 2026-11-18 01:19Z).
 *
 * The claude adapter keeps exactly ONE --settings flag. When the person's own extra args carry `--settings <a file>`:
 *   · THE THREE (the output style the person picked, the «Disable model fallback» setting, the Background Work notices'
 *     inbound accept) STAND DOWN — the file is the person's most specific word for that conversation;
 *   · THE BILLING ONE (a subscription pick neutralizes a helper that supplies a paid credential) NEVER does — a
 *     subscription pick is a money choice and a file does not override it: the product's inline settings win and the file is
 *     set aside for that start. A start that resolves to NO subscription (the CLI's own login, an API key): the file governs
 *     like the three. (Amended 2026-11-18 02:39Z, unit «billing pick alive»: the default a person starred in Manage agents is
 *     their standing pick — one conversation never changes who it bills between its first start and a resume.)
 *     ONLY WHEN THAT IS NEEDED (the unit's cure, 主开发 09:09Z): the file is set aside only when the Claude settings of the
 *     machine the CLI runs on really name a key helper (`billing`); where that fact cannot be read (a settings file that does
 *     not parse, a paired machine that does not answer) billing wins and the words say so (`billingUnread`); in every other
 *     start the file applies WHOLE, as on the release — its hooks and permission rules are never lost to a helper that is not
 *     there. (Merging the file and the one override into a file of the conversation's own: backlog B-e7c0.)
 *   · A THIRD-PARTY PROVIDER's start (the meeting with lane lg-providers, 22:14Z) sets the file aside for the billing one's
 *     reason — a helper must never outrank the provider's own key — and SAYS it in its own words (PROVIDER_BILLING_WORDS:
 *     no subscription bills it, no «CLI login» door; the place to take the helper out of instead).
 * Each is SAID by name once per conversation start, where the person looks, with its door (the create's notice).
 * SETTINGS_FILE_WORDS[kind] = the person's words (English t() keys, {name} = the conversation; the page words them).
 * The kinds the file GOVERNS ride the session as `_settingsFileGoverns` (meta settingsFileGoverns): the paths that push a value
 * to a RUNNING CLI (the jobs engine's inbound catch-up, the fallback stop, a live settings change) skip it. A file that governs
 * governs EVERY kind of GOVERNED_KINDS, not only the ones that stood down at the start (batch 21's cure: a switch turned on
 * later must not push over the file).
 */
const SETTINGS_FILE_WORDS = Object.freeze({
  outputStyle: '{name}: your settings file is used as it is — the output style you picked in VibeSpace is not applied; put it into the file, or drop the --settings flag',
  noFallback: '{name}: your settings file is used as it is — «Disable model fallback» from VibeSpace is not applied; put it into the file, or drop the --settings flag',
  jobNotices: '{name}: your settings file is used as it is — VibeSpace does not set crossSessionInbound, so Background Work notices reach it only if the file accepts them; or drop the --settings flag',
  billing: '{name} bills the subscription chosen for it and the Claude settings of its machine name an apiKeyHelper, so your settings file was set aside for this start, all of it — to use the file, set its billing to «CLI login»',
  billingUnread: '{name} bills the subscription chosen for it, and whether the Claude settings of its machine name an apiKeyHelper could not be read, so your settings file was set aside for this start, all of it — to use the file, set its billing to «CLI login»',
});
const SETTINGS_FILE_KINDS = Object.freeze(Object.keys(SETTINGS_FILE_WORDS));
/** THE TWO BILLING KINDS AT A THIRD-PARTY PROVIDER'S START (the meeting with lane lg-providers, 22:14Z): the file is set aside for
 *  the same reason — a helper must never outrank the provider's own key — but no subscription bills it and the «CLI login» door
 *  would move it off the provider: the create says these words for those two kinds instead */
const PROVIDER_BILLING_WORDS = Object.freeze({
  billing: '{name} runs on a third-party provider and a Claude settings file it reads names an apiKeyHelper, so your settings file was set aside for this start, all of it — VibeSpace sets a helper aside so it cannot outrank the provider’s own key; to use your file, take the apiKeyHelper out of the settings that name it (this machine’s, the project’s .claude files, or your file itself)',
  billingUnread: '{name} runs on a third-party provider, and whether a Claude settings file it reads names an apiKeyHelper could not be read, so your settings file was set aside for this start, all of it — VibeSpace sets a helper aside so it cannot outrank the provider’s own key',
});
/** the kinds a governing file covers (the three; the two billing kinds are a set-aside, never a governing) */
const GOVERNED_KINDS = Object.freeze(['outputStyle', 'noFallback', 'jobNotices']);
/** does the person's settings file govern `kind` for this running session? */
const fileGoverns = (session, kind) => !!(session && Array.isArray(session._settingsFileGoverns) && session._settingsFileGoverns.includes(kind));
/** the live settings row a kind stands for (harness-config-sync's push) */
const KIND_OF_ROW = Object.freeze({ disableModelFallback: 'noFallback' });
/** B-e7c0 cure: a settings file MERGED under a subscription pick dropped these names — said once, by name, with the door to the pick */
const MERGE_DROPPED_WORDS = '{name}: under the subscription chosen for it, these entries of your settings file are not applied — {names} — they decide where its requests go or what credential they carry; to use them, set its billing to «CLI login»';
module.exports = { SETTINGS_FILE_WORDS, SETTINGS_FILE_KINDS, PROVIDER_BILLING_WORDS, GOVERNED_KINDS, fileGoverns, KIND_OF_ROW, MERGE_DROPPED_WORDS };
