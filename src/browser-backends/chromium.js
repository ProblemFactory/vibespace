'use strict';
/**
 * CHROMIUM — ONE browser backend, ONE file (lane dc-browser-backends, decoupling wave 2b). PURE: requires nothing;
 * registered by its one line in src/browser-backends/index.js. `row` = its capability cells (src/browser-profiles.js
 * PROVIDERS is derived from the list), `words` = its name / chip / blurb as i18n keys the client words through t()
 * off the /providers rows.
 */
const i18nKey = (s) => s; // extraction marker (scripts/i18n-extract.mjs) — the client words it through t()

module.exports = Object.freeze({
  id: 'chromium',
  row: Object.freeze({ buildChoice: true, automationFlag: true, tier: 1, wired: true, label: 'Chromium (a browser VibeSpace starts)', keyScope: 'none', canSwitchTo: 'in-place', ownsDir: true, leaseKind: 'tab', remote: 'browser-serve', starts: true, headed: null, binary: 'agent-browser', cdp: true, allowedDomains: true, pinTab: true, consent: null }),
  words: Object.freeze({ brand: true, name: 'Chromium', chip: 'Chromium', blurb: i18nKey("VibeSpace's default browser (the open-source version of Chrome).") }),
});
