'use strict';
/**
 * AN EXISTING BROWSER OVER CDP — ONE browser backend, ONE file (lane dc-browser-backends, decoupling wave 2b). PURE: requires nothing;
 * registered by its one line in src/browser-backends/index.js. `row` = its capability cells (src/browser-profiles.js
 * PROVIDERS is derived from the list), `words` = its name / chip / blurb as i18n keys the client words through t()
 * off the /providers rows; `newProfileName` = what a New profile… row calls it (a profile of it is not a browser VibeSpace starts).
 */
const i18nKey = (s) => s; // extraction marker (scripts/i18n-extract.mjs) — the client words it through t()

module.exports = Object.freeze({
  id: 'cdp',
  row: Object.freeze({ tier: 1, wired: true, label: 'An existing browser over CDP (yours, or one on a paired machine)', keyScope: 'none', canSwitchTo: 'no', ownsDir: false, leaseKind: 'tab', remote: 'tcp-forward', starts: false, headed: null, binary: null, cdp: true, allowedDomains: true, pinTab: true, consent: null }),
  words: Object.freeze({ name: i18nKey('a browser VibeSpace connected to'), chip: i18nKey('connected browser'), blurb: i18nKey("VibeSpace didn't start this browser, only connected to it, so it can't be switched from here."), newProfileName: i18nKey('A browser that is already running') }),
});
