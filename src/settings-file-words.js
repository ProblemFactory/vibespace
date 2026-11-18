'use strict';
/**
 * A PERSON'S OWN SETTINGS FILE AT A CLAUDE START — PURE, imports nothing; CJS so the adapter, the create and the dictionary
 * check share ONE spelling (B-8dcf item two, ruled 2026-11-18 01:19Z).
 *
 * The claude adapter keeps exactly ONE --settings flag. When the person's own extra args carry `--settings <a file>`:
 *   · THE THREE (the output style the person picked, the «Disable model fallback» setting, the Background Work notices'
 *     inbound accept) STAND DOWN — the file is the person's most specific word for that conversation;
 *   · THE BILLING ONE (an explicit subscription pick neutralizes a helper that supplies a paid credential) NEVER does — a
 *     subscription pick is a money choice and a file does not override it: the product's inline settings win and the file is
 *     set aside for that start. With no explicit pick the file governs like the three.
 * Each is SAID by name once per conversation start, where the person looks, with its door (the create's notice).
 * SETTINGS_FILE_WORDS[kind] = the person's words (English t() keys, {name} = the conversation; the page words them).
 * The kinds the file GOVERNS (all but billing) ride the session as `_settingsFileGoverns` (meta settingsFileGoverns): the paths
 * that push a value to a RUNNING CLI (the jobs engine's inbound catch-up, the fallback stop, a live settings change) skip it.
 */
const SETTINGS_FILE_WORDS = Object.freeze({
  outputStyle: '{name}: your settings file is used as it is — the output style you picked in VibeSpace is not applied; put it into the file, or drop the --settings flag',
  noFallback: '{name}: your settings file is used as it is — «Disable model fallback» from VibeSpace is not applied; put it into the file, or drop the --settings flag',
  jobNotices: '{name}: your settings file is used as it is — VibeSpace does not set crossSessionInbound, so Background Work notices reach it only if the file accepts them; or drop the --settings flag',
  billing: '{name} is set to bill through the subscription, so your settings file was set aside for this start, all of it — clear the pick to use the file',
});
const SETTINGS_FILE_KINDS = Object.freeze(Object.keys(SETTINGS_FILE_WORDS));
/** does the person's settings file govern `kind` for this running session? */
const fileGoverns = (session, kind) => !!(session && Array.isArray(session._settingsFileGoverns) && session._settingsFileGoverns.includes(kind));
/** the live settings row a kind stands for (harness-config-sync's push) */
const KIND_OF_ROW = Object.freeze({ disableModelFallback: 'noFallback' });
module.exports = { SETTINGS_FILE_WORDS, SETTINGS_FILE_KINDS, fileGoverns, KIND_OF_ROW };
